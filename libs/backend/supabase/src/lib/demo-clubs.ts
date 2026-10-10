/**
 * Writes the mock backend's demo clubs into a Supabase database through the service role. Used by
 * `tools/seed-supabase.ts` (the documented demo clubs) and by the repository tests, which seed
 * throwaway copies under random slugs and delete them afterwards. Not exported from the library.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { DEMO_PASSWORD, MockClub } from '@aura/backend/mock';
import { PlatformAdmin } from '@aura/shared/models';
import { authEmailFor, effectiveMembers } from '@aura/shared/util';

function must<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as NonNullable<T>;
}

/** Runs `fn` over `items`, a few at a time. */
async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

async function deleteAuthUser(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.auth.admin.deleteUser(id);
  if (error && !/not found/i.test(error.message)) throw new Error(`Delete user: ${error.message}`);
}

/** A slug no real club uses (clubs' own slugs are six characters, without `-`). */
export function throwawaySlug(prefix = 'tst'): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

/** Deletes clubs, everything in them (by cascade) and their members' sign-ins. */
export async function deleteClubs(db: SupabaseClient, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const members = must(await db.from('members').select('user_id').in('club_id', ids), 'Find members');
  await inBatches(
    members.filter((m) => m.user_id),
    10,
    (m) => deleteAuthUser(db, m.user_id),
  );
  must(await db.from('clubs').delete().in('id', ids), 'Delete clubs');
}

/** Finds the platform admin's sign-in by email. */
export async function findAuthUser(db: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`List users: ${error.message}`);
    const user = data.users.find((u) => u.email === email);
    if (user) return user.id;
    if (data.users.length < 1000) return null;
  }
}

export async function createPlatformAdmin(
  db: SupabaseClient,
  admin: Pick<PlatformAdmin, 'email' | 'name'> & { password: string },
): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email: admin.email,
    password: admin.password,
    email_confirm: true,
    app_metadata: { role: 'platform_admin' },
    user_metadata: { name: admin.name },
  });
  if (error) throw new Error(`Create platform admin: ${error.message}`);
  return data.user.id;
}

export async function deletePlatformAdmin(db: SupabaseClient, email: string): Promise<void> {
  const id = await findAuthUser(db, email);
  if (id) await deleteAuthUser(db, id);
}

export interface SeededClub {
  id: string;
  slug: string;
  name: string;
  members: number;
  signIns: number;
  events: number;
  threads: number;
}

/**
 * Creates one demo club with its members, sign-ins (password `password`), players, events, RSVPs
 * and threads. `slug` defaults to the mock's own.
 */
export async function seedDemoClub(
  db: SupabaseClient,
  { account, data, credentials, adminUserId }: MockClub,
  { loginDomain, slug = account.slug }: { loginDomain: string; slug?: string },
): Promise<SeededClub> {
  const club = must(
    await db
      .from('clubs')
      .insert({
        slug,
        name: account.name,
        logo_url: account.logoUrl,
        ink: account.ink,
        paper: account.paper,
        logo_ink: account.logoInk,
        logo_paper: account.logoPaper,
        created_at: account.createdAt,
      })
      .select('id')
      .single(),
    'Create club',
  );
  const clubId = club.id as string;

  // Teams first: their trigger creates the default #announcements and #general channels.
  must(await db.from('teams').insert(data.teams.map((t) => ({ club_id: clubId, id: t.id, name: t.name }))), 'Teams');

  const memberIds = new Map(data.users.map((u) => [u.id, crypto.randomUUID()]));
  const member = (id: string | null | undefined) => (id ? (memberIds.get(id) ?? null) : null);
  must(
    await db.from('members').insert(
      data.users.map((u) => ({
        id: member(u.id),
        club_id: clubId,
        username: u.email ?? null,
        name: u.name,
        kind: u.kind,
        title: u.title ?? null,
        email: u.email ?? null,
        invited: !!u.invited,
      })),
    ),
    'Members',
  );
  must(
    await db
      .from('team_members')
      .insert(
        data.users.flatMap((u) => u.teams.map((t) => ({ club_id: clubId, member_id: member(u.id), team_id: t }))),
      ),
    'Team members',
  );
  must(
    await db
      .from('clubs')
      .update({ admin_member_id: member(adminUserId) })
      .eq('id', clubId),
    'Club admin',
  );

  // Sign-ins: one auth user per credential, at the identity derived from (club id, username).
  await inBatches(credentials, 8, async (cred) => {
    const memberId = member(cred.userId);
    const { data: created, error } = await db.auth.admin.createUser({
      email: await authEmailFor(clubId, cred.username, loginDomain),
      password: DEMO_PASSWORD,
      email_confirm: true,
      app_metadata: { club_id: clubId, member_id: memberId },
      user_metadata: { must_change_password: cred.mustChangePassword },
    });
    if (error) throw new Error(`Create sign-in for ${cred.username}: ${error.message}`);
    // Without club_id in app_metadata, row-level security hides the whole club from this user.
    if (created.user.app_metadata['club_id'] !== clubId) throw new Error(`${cred.username} has no club_id.`);
    must(await db.from('members').update({ user_id: created.user.id }).eq('id', memberId), 'Link sign-in');
  });

  const profileIds = new Map(data.profiles.map((p) => [p.id, crypto.randomUUID()]));
  if (data.profiles.length) {
    must(
      await db.from('player_profiles').insert(
        data.profiles.map((p) => ({
          id: profileIds.get(p.id),
          club_id: clubId,
          name: p.name,
          jersey: p.jersey,
          team_id: p.team,
          user_member_id: member(p.userId),
          login: p.login,
          pending: !!p.pending,
        })),
      ),
      'Profiles',
    );
    const parents = data.profiles.flatMap((p) =>
      p.parentIds.map((m) => ({ club_id: clubId, profile_id: profileIds.get(p.id), member_id: member(m) })),
    );
    if (parents.length) must(await db.from('player_parents').insert(parents), 'Player parents');
  }

  const eventIds = new Map(data.events.map((e) => [e.id, crypto.randomUUID()]));
  if (data.events.length) {
    must(
      await db.from('events').insert(
        data.events.map((e) => ({
          id: eventIds.get(e.id),
          club_id: clubId,
          type: e.type,
          team: e.team,
          title: e.title ?? null,
          opponent: e.opponent ?? null,
          home: e.home ?? null,
          date: e.date ?? null,
          time: e.time ?? null,
          tbd: !!e.tbd,
          location: e.location,
          notes: e.notes,
          score_us: e.score?.us ?? null,
          score_them: e.score?.them ?? null,
        })),
      ),
      'Events',
    );
  }

  // In the mock a player's profile and user can share an id (`eli`), so one RSVP serves both the
  // parent's view (profile) and the player's (user). Here they are two ids: record both.
  const rsvps = Object.entries(data.rsvps).flatMap(([eventId, byAttendee]) =>
    Object.entries(byAttendee).flatMap(([attendee, status]) =>
      [profileIds.get(attendee), memberIds.get(attendee)]
        .filter((id) => !!id)
        .map((id) => ({ club_id: clubId, event_id: eventIds.get(eventId), attendee_id: id, status })),
    ),
  );
  if (rsvps.length) must(await db.from('rsvps').insert(rsvps), 'RSVPs');

  // Threads: custom ones keep the mock's order (newest first); default ones already exist.
  const defaults = must(
    await db.from('threads').select('id, scope, name').eq('club_id', clubId).eq('is_default', true),
    'Default threads',
  );
  const threadIds = new Map<string, string>();
  const start = Date.now();
  const custom = data.threads.filter((t) => !t.isDefault);
  for (const t of data.threads) {
    if (t.isDefault) {
      const row = defaults.find((d) => d.scope === t.scope && d.name === t.name);
      if (!row) throw new Error(`No default thread ${t.scope} ${t.name}`);
      threadIds.set(t.id, row.id);
    } else {
      threadIds.set(t.id, crypto.randomUUID());
    }
  }
  if (custom.length) {
    must(
      await db.from('threads').insert(
        custom.map((t, i) => ({
          id: threadIds.get(t.id),
          club_id: clubId,
          name: t.name,
          scope: t.scope,
          teams: t.teams,
          include_staff: t.include.staff,
          include_parents: t.include.parents,
          include_players: t.include.players,
          creator_member_id: member(t.creatorId),
          created_at: new Date(start - i * 1000).toISOString(),
        })),
      ),
      'Threads',
    );
  }
  const threadMembers = data.threads.flatMap((t) =>
    t.members.map((m) => ({ club_id: clubId, thread_id: threadIds.get(t.id), member_id: member(m) })),
  );
  if (threadMembers.length) must(await db.from('thread_members').insert(threadMembers), 'Thread members');
  const seededAt = new Date().toISOString();
  const messages = data.threads.flatMap((t) =>
    t.messages.map((m) => ({
      club_id: clubId,
      thread_id: threadIds.get(t.id),
      from_member_id: member(m.from),
      text: m.text,
      // The mock dates today's messages at fixed times; none may be in the future.
      sent_at: m.sentAt < seededAt ? m.sentAt : seededAt,
    })),
  );
  if (messages.length) must(await db.from('messages').insert(messages), 'Messages');

  // The mock keeps one unread count per thread: everyone in it has read all but the last `unread`.
  const reads = data.threads.flatMap((t) => {
    if (!t.messages.length) return [];
    const read = t.messages[t.messages.length - 1 - t.unread]?.sentAt ?? '1970-01-01T00:00:00Z';
    // Capped like the messages, and just before them, so unread counts match the mock.
    const readUpTo = read < seededAt ? read : new Date(Date.parse(seededAt) - 1).toISOString();
    return [...effectiveMembers(t, data.users)].map((m) => ({
      club_id: clubId,
      thread_id: threadIds.get(t.id),
      member_id: member(m),
      last_read_at: readUpTo,
    }));
  });
  if (reads.length) must(await db.from('thread_reads').insert(reads), 'Thread reads');

  return {
    id: clubId,
    slug,
    name: account.name,
    members: data.users.length,
    signIns: credentials.length,
    events: data.events.length,
    threads: data.threads.length,
  };
}
