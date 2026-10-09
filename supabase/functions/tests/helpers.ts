// Helpers for the edge function tests, which run against a local Supabase (`npm run functions:test`).
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { assert } from 'jsr:@std/assert@1';

export const API_URL = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const options = { auth: { persistSession: false, autoRefreshToken: false } };

export const service = createClient(API_URL, SERVICE_KEY, options);

const users: string[] = [];
const clubs: string[] = [];

export function anon(): SupabaseClient {
  return createClient(API_URL, ANON_KEY, options);
}

export function uniqueSlug(): string {
  return `t${crypto
    .randomUUID()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 10)}`;
}

/** A fresh platform admin, signed in. */
export async function platformAdmin(): Promise<SupabaseClient> {
  const email = `admin-${crypto.randomUUID()}@aura.example`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: 'password',
    email_confirm: true,
    app_metadata: { role: 'platform_admin' },
  });
  if (error) throw error;
  users.push(data.user.id);
  return signIn(email, 'password');
}

export async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in as ${email} failed: ${error.message}`);
  return client;
}

/** Calls a function and returns its status and JSON body, whatever the status. */
export async function invoke(
  client: SupabaseClient | null,
  fn: string,
  body: unknown,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const session = client ? (await client.auth.getSession()).data.session : null;
  const res = await fetch(`${API_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

/** 1×1 transparent PNG. */
export const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export function newClubInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Club',
    slug: uniqueSlug(),
    logoUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
    icons: { size192: PNG, size512: PNG },
    ink: '#000000',
    paper: '#ffffff',
    logoInk: '#000000',
    logoPaper: '#ffffff',
    adminName: 'Ada Admin',
    adminEmail: 'ada@test.example',
    temporaryPassword: 'TEMP-pass-42',
    ...overrides,
  };
}

/** Creates a club through the function; it is deleted (with its users) by cleanup(). */
export async function createClub(admin: SupabaseClient, overrides: Record<string, unknown> = {}) {
  const input = newClubInput(overrides);
  const res = await invoke(admin, 'create-club', input);
  assert(res.status === 200, `create-club failed: ${JSON.stringify(res.data)}`);
  clubs.push(res.data['id'] as string);
  return { input, club: res.data as Record<string, unknown> & { id: string; slug: string } };
}

export async function cleanup(): Promise<void> {
  if (clubs.length) {
    const { data } = await service.from('members').select('user_id').in('club_id', clubs);
    for (const m of data ?? []) if (m.user_id) users.push(m.user_id);
    for (const id of clubs) {
      const { data: files } = await service.storage.from('club-assets').list(id);
      if (files?.length) await service.storage.from('club-assets').remove(files.map((f) => `${id}/${f.name}`));
    }
    await service.from('clubs').delete().in('id', clubs);
  }
  for (const id of users) await service.auth.admin.deleteUser(id);
  users.length = 0;
  clubs.length = 0;
}
