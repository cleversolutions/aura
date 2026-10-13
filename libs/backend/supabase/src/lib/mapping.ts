import { FunctionsHttpError, PostgrestError } from '@supabase/supabase-js';
import { Directory, MemberInvite } from '@aura/backend/api';
import {
  ChatMessage,
  Club,
  ClubAccount,
  ClubEvent,
  ClubEventDraft,
  ClubSettings,
  ClubStaffMember,
  PlayerProfile,
  RsvpMap,
  RsvpStatus,
  Team,
  Thread,
  User,
  UserKind,
} from '@aura/shared/models';
import { DEFAULT_CLUB_SETTINGS } from '@aura/shared/util';
import { Database } from './database.types';

/** Database rows <-> @aura/shared/models types. Pure functions; no client access. */

type Tables = Database['public']['Tables'];
type Row<T extends keyof Tables> = Tables[T]['Row'];
type Functions = Database['public']['Functions'];

export type ClubPublicRow = Database['public']['Views']['club_public']['Row'];
export type ClubRow = Row<'clubs'>;
export type MemberRow = Row<'members'> & { team_members?: { team_id: string }[] };
export type ProfileRow = Row<'player_profiles'> & { player_parents?: { member_id: string }[] };
/** Profile columns with their parents. */
export const PROFILE_SELECT = '*, player_parents(member_id)';
export type EventRow = Row<'events'>;
export type EventInsert = Tables['events']['Insert'];
export type ThreadListRow = Functions['list_my_threads']['Returns'][number];
export type MessageRow = Row<'messages'>;
export type PlatformClubRow = Functions['platform_clubs']['Returns'][number];
export type PlatformClubStaffRow = Functions['platform_club_staff']['Returns'][number];
export type ClubSettingsRow = Row<'club_settings'>;

/** Optional fields are left out rather than set to undefined, matching the mock's objects. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null)) as T;
}

export function toClub(row: ClubPublicRow | ClubRow): Club {
  return {
    id: row.id ?? '',
    slug: row.slug ?? '',
    name: row.name ?? '',
    logoUrl: row.logo_url ?? '',
    ink: row.ink ?? '#000000',
    paper: row.paper ?? '#ffffff',
    ...(row.icon_192_url && row.icon_512_url
      ? { icons: { size192: row.icon_192_url, size512: row.icon_512_url } }
      : {}),
  };
}

export function toClubAccount(row: PlatformClubRow): ClubAccount {
  return {
    ...toClub(row),
    logoInk: row.logo_ink,
    logoPaper: row.logo_paper,
    adminName: row.admin_name ?? '',
    adminEmail: row.admin_email ?? '',
    createdAt: row.created_at,
  };
}

export function toClubStaffMember(row: PlatformClubStaffRow): ClubStaffMember {
  return defined<ClubStaffMember>({
    id: row.id,
    name: row.name,
    email: row.username ?? '',
    title: row.title || undefined,
    invited: row.invited || undefined,
    disabled: row.disabled || undefined,
    admin: row.is_admin,
  });
}

/** `adminId` is the club's admin member (clubs.admin_member_id). */
export function toUser(row: MemberRow, adminId: string | null = null): User {
  return defined<User>({
    id: row.id,
    name: row.name,
    kind: row.kind as UserKind,
    teams: (row.team_members ?? []).map((t) => t.team_id).sort(),
    title: row.title ?? undefined,
    email: row.email ?? undefined,
    invited: row.invited || undefined,
    disabled: row.disabled || undefined,
    clubAdmin: (!!adminId && row.id === adminId) || undefined,
  });
}

export function toProfile(row: ProfileRow): PlayerProfile {
  return {
    id: row.id,
    name: row.name,
    jersey: row.jersey,
    team: row.team_id,
    parentIds: (row.player_parents ?? []).map((p) => p.member_id).sort(),
    userId: row.user_member_id,
    login: row.login,
    ...(row.pending ? { pending: true } : {}),
  };
}

/** A club without a settings row has the defaults. */
export function toSettings(row: Pick<ClubSettingsRow, 'announcements'> | null): ClubSettings {
  return row ? { announcements: row.announcements as ClubSettings['announcements'] } : { ...DEFAULT_CLUB_SETTINGS };
}

export function toDirectory(
  club: ClubRow,
  teams: Team[],
  members: MemberRow[],
  profiles: ProfileRow[],
  settings: ClubSettingsRow | null,
): Directory {
  return {
    club: toClub(club),
    teams,
    users: members.map((m) => toUser(m, club.admin_member_id)),
    profiles: profiles.map(toProfile),
    settings: toSettings(settings),
  };
}

export function toEvent(row: EventRow): ClubEvent {
  return defined<ClubEvent>({
    id: row.id,
    type: row.type as ClubEvent['type'],
    team: row.team,
    title: row.title ?? undefined,
    opponent: row.opponent ?? undefined,
    home: row.home ?? undefined,
    date: row.date ?? undefined,
    time: row.time?.slice(0, 5),
    tbd: row.tbd || undefined,
    location: row.location,
    notes: row.notes,
    score: row.score_us != null && row.score_them != null ? { us: row.score_us, them: row.score_them } : undefined,
  });
}

/** Every column is written, so a field cleared in the form is cleared in the database. */
export function fromEventDraft(draft: ClubEventDraft, clubId: string): EventInsert {
  return {
    club_id: clubId,
    type: draft.type,
    team: draft.team,
    title: draft.title ?? null,
    opponent: draft.opponent ?? null,
    home: draft.home ?? null,
    date: draft.date || null,
    time: draft.time || null,
    tbd: !!draft.tbd,
    location: draft.location,
    notes: draft.notes,
    score_us: draft.score?.us ?? null,
    score_them: draft.score?.them ?? null,
  };
}

export function toRsvpMap(rows: { event_id: string; attendee_id: string; status: string }[]): RsvpMap {
  const map: RsvpMap = {};
  for (const r of rows) (map[r.event_id] ??= {})[r.attendee_id] = r.status as RsvpStatus;
  return map;
}

export function toMessage(
  row: Pick<MessageRow, 'id' | 'from_member_id' | 'text' | 'sent_at'> &
    Partial<Pick<MessageRow, 'edited_at' | 'deleted_at'>>,
): ChatMessage {
  return {
    id: row.id,
    from: row.from_member_id,
    text: row.text,
    sentAt: new Date(row.sent_at).toISOString(),
    ...(row.edited_at ? { editedAt: new Date(row.edited_at).toISOString() } : {}),
    ...(row.deleted_at ? { deleted: true } : {}),
  };
}

export function toThread(row: ThreadListRow, messages: ChatMessage[]): Thread {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    teams: row.teams ?? [],
    include: { staff: row.include_staff, parents: row.include_parents, players: row.include_players },
    members: row.members ?? [],
    creatorId: row.creator_member_id ?? null,
    isDefault: row.is_default,
    announceOnly: row.announce_only,
    messages,
    unread: row.unread ?? 0,
  };
}

/** Groups messages by thread, oldest first. */
export function messagesByThread(rows: MessageRow[]): Map<string, ChatMessage[]> {
  const out = new Map<string, ChatMessage[]>();
  const sorted = [...rows].sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  for (const r of sorted) {
    const list = out.get(r.thread_id) ?? [];
    list.push(toMessage(r));
    out.set(r.thread_id, list);
  }
  return out;
}

/** The team id for a new team name, as the mock does: `U13 Girls` -> `U13G`. */
export function teamIdFor(name: string): string {
  const [age, division] = name.trim().split(/\s+/);
  return (age ?? '') + (division?.[0] ?? '');
}

/** A User as the edge functions return it. */
export function toUserResult(body: unknown): User {
  return defined(body as User);
}

/** The shape the invite-member edge function returns. */
export function toMemberInvite(body: unknown): MemberInvite {
  const { user, username, temporaryPassword } = body as MemberInvite;
  return { user: defined(user), username, temporaryPassword };
}

/** Database errors as messages for people, not developers. */
export function dbError(error: PostgrestError, fallback = 'Something went wrong. Try again.'): Error {
  if (error.code === '42501') return new Error('You don’t have permission to do that.');
  if (error.code === '23505') return new Error('That already exists.');
  if (error.code === 'PGRST116') return new Error('Not found, or you don’t have access to it.');
  console.error(error);
  return new Error(fallback);
}

/** Edge functions answer `{ error }` with a message meant for people. */
export async function functionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    const body = await (error.context as Response)
      .clone()
      .json()
      .catch(() => null);
    if (body && typeof body.error === 'string') return new Error(body.error);
  }
  console.error(error);
  return new Error('Something went wrong. Try again.');
}
