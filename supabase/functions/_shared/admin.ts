// Shared plumbing for Aura's edge functions: the service-role client, caller checks, responses,
// asset uploads and temporary passwords. Only edge functions hold the service-role key.
import { createClient, SupabaseClient, User as AuthUser } from 'npm:@supabase/supabase-js@2';
import { DEFAULT_LOGIN_DOMAIN } from './auth-identity.ts';

export const LOGIN_DOMAIN = Deno.env.get('AURA_LOGIN_DOMAIN') || DEFAULT_LOGIN_DOMAIN;
/** The API URL browsers use; inside the local functions container SUPABASE_URL is internal. */
export const PUBLIC_URL = Deno.env.get('AURA_PUBLIC_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
export const ASSET_BUCKET = 'club-assets';
export const SLUG_PATTERN = /^[a-z0-9-]{4,32}$/;

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** A failure whose message is safe to show the person who made the request. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

/** Wraps a handler with CORS, JSON parsing and error responses (`{ error }`). */
export function serve(handler: (req: Request, body: Record<string, unknown>) => Promise<unknown>): void {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    try {
      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body !== 'object') throw new HttpError(400, 'Expected a JSON body.');
      return json(await handler(req, body));
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Something went wrong. Try again.' }, 500);
    }
  });
}

/** The signed-in caller, verified with the auth server (not just by decoding the JWT). */
export async function caller(req: Request, admin: SupabaseClient): Promise<AuthUser> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in first.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sign in again.');
  return data.user;
}

export async function requirePlatformAdmin(req: Request, admin: SupabaseClient): Promise<AuthUser> {
  const user = await caller(req, admin);
  if (user.app_metadata?.['role'] !== 'platform_admin') throw new HttpError(403, 'Sign in as the platform admin.');
  return user;
}

export function text(body: Record<string, unknown>, key: string, { required = true } = {}): string {
  const value = body[key];
  if (value == null || value === '') {
    if (required) throw new HttpError(400, `Missing ${key}.`);
    return '';
  }
  if (typeof value !== 'string') throw new HttpError(400, `${key} must be text.`);
  return value.trim();
}

const UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz23456789';
const DIGITS = '23456789';

function pick(n: number, chars: string): string {
  return Array.from(crypto.getRandomValues(new Uint32Array(n)), (b) => chars[b % chars.length]).join('');
}

/** Readable one-time password, e.g. `KMRT-a7bq-49` (same shape as temporaryPassword() in shared/util). */
export function temporaryPassword(): string {
  return `${pick(4, UPPER)}-${pick(4, LOWER)}-${pick(2, DIGITS)}`;
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * Uploads a `data:` URL to the club's folder and returns its public URL. Anything else (an
 * existing URL or app-relative path) is returned unchanged. Names are timestamped so a new logo
 * is never served from a stale cache.
 */
export async function storeAsset(
  admin: SupabaseClient,
  clubId: string,
  name: string,
  value: string,
  uploaded: string[],
): Promise<string> {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(value);
  if (!match) return value;
  const [, type, base64, payload] = match;
  const ext = EXTENSIONS[type];
  if (!ext) throw new HttpError(400, 'Use a PNG, SVG, JPEG or WebP image.');
  const bytes = base64
    ? Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  const path = `${clubId}/${name}-${Date.now().toString(36)}.${ext}`;
  const { error } = await admin.storage.from(ASSET_BUCKET).upload(path, bytes, { contentType: type, upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  uploaded.push(path);
  return `${PUBLIC_URL}/storage/v1/object/public/${ASSET_BUCKET}/${path}`;
}

/** Best-effort removal of uploads after a failed request. */
export async function removeAssets(admin: SupabaseClient, paths: string[]): Promise<void> {
  if (paths.length) await admin.storage.from(ASSET_BUCKET).remove(paths);
}

export interface ClubRow {
  id: string;
  slug: string;
  name: string;
  logo_url: string;
  ink: string;
  paper: string;
  logo_ink: string;
  logo_paper: string;
  icon_192_url: string | null;
  icon_512_url: string | null;
  admin_member_id: string | null;
  created_at: string;
}

/** The ClubAccount shape from @aura/shared/models. */
export function clubAccount(row: ClubRow, admin: { name: string; username: string | null }) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    logoUrl: row.logo_url,
    ink: row.ink,
    paper: row.paper,
    ...(row.icon_192_url && row.icon_512_url
      ? { icons: { size192: row.icon_192_url, size512: row.icon_512_url } }
      : {}),
    logoInk: row.logo_ink,
    logoPaper: row.logo_paper,
    adminName: admin.name,
    adminEmail: admin.username ?? '',
    createdAt: row.created_at,
  };
}

/** Throws a generic failure for an unexpected database error, keeping the detail in the logs. */
export function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

/** check() for `.single()`, whose row is always there when there is no error. */
export function checkOne<T>(result: { data: unknown; error: { message: string } | null }, what: string): T {
  const data = check(result, what);
  if (data == null) throw new Error(`${what}: no row`);
  return data as T;
}

export interface MemberRow {
  id: string;
  user_id: string | null;
  username: string | null;
  name: string;
  kind: string;
  title: string | null;
  email: string | null;
  invited: boolean;
  team_members: { team_id: string }[];
}

const MEMBER_COLUMNS = 'id, user_id, username, name, kind, title, email, invited, team_members(team_id)';

/** A member of `clubId` matching `match`, with their teams. */
export async function loadMember(
  admin: SupabaseClient,
  clubId: string,
  match: Record<string, string>,
): Promise<MemberRow | null> {
  if (match['id'] && !/^[0-9a-f-]{36}$/i.test(match['id'])) return null;
  return check(
    await admin.from('members').select(MEMBER_COLUMNS).eq('club_id', clubId).match(match).maybeSingle(),
    'Load member',
  ) as MemberRow | null;
}

/** The caller's club and member record. */
export async function callerMember(admin: SupabaseClient, user: AuthUser): Promise<{ clubId: string; me: MemberRow }> {
  const clubId = user.app_metadata?.['club_id'] as string | undefined;
  const me = clubId ? await loadMember(admin, clubId, { user_id: user.id }) : null;
  if (!clubId || !me) throw new HttpError(403, 'Sign in to your club first.');
  return { clubId, me };
}

/** Who can invite someone can manage their invite: club staff, or staff on one of their teams. */
export function managesInvite(me: MemberRow, target: MemberRow): boolean {
  if (!target.invited) return false;
  if (me.kind === 'club') return true;
  const mine = new Set(me.team_members.map((t) => t.team_id));
  return me.kind === 'staff' && target.team_members.some((t) => mine.has(t.team_id));
}

/** The caller and an invited member whose invite they may manage. */
export async function inviteManager(
  admin: SupabaseClient,
  user: AuthUser,
  id: string,
): Promise<{ clubId: string; me: MemberRow; target: MemberRow }> {
  const { clubId, me } = await callerMember(admin, user);
  const target = await loadMember(admin, clubId, { id });
  if (!target) throw new HttpError(404, 'Member not found.');
  if (target.invited && !managesInvite(me, target)) {
    throw new HttpError(403, 'Only club staff and the team’s staff can manage this invite.');
  }
  return { clubId, me, target };
}
