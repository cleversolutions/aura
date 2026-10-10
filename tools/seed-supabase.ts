/**
 * Seeds a local Supabase with the mock backend's demo clubs (Spartans and Panthers) and the
 * platform admin, so the Supabase backend shows the same data as `provideMockBackend()`.
 *
 *   npm run db:seed          # after `npm run db:start`; `npm run db:reset` resets and seeds
 *
 * Every account uses the password `password`. Re-running replaces the two demo clubs. Mock string
 * ids become UUIDs; both clubs keep their mock slugs (k3v9qp, p7x2mn) so documented links work.
 * Refuses to run against anything but localhost unless `--allow-remote` is passed.
 */
import { execSync } from 'node:child_process';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { DEMO_PASSWORD, DEMO_PLATFORM_ADMIN, MockClub, createMockClubs } from '../libs/backend/mock/src/lib/clubs';
import { DEFAULT_LOGIN_DOMAIN, authEmailFor } from '../libs/shared/util/src/lib/auth-identity';
import { effectiveMembers } from '../libs/shared/util/src/lib/permissions';

function localEnv(): Record<string, string> {
  const out = execSync('npx supabase status -o env', { encoding: 'utf8' });
  return Object.fromEntries(
    out
      .split('\n')
      .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => [m[1], m[2]]),
  );
}

const env = process.env['SUPABASE_URL'] ? process.env : localEnv();
const url = process.env['SUPABASE_URL'] ?? env['API_URL'];
const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? env['SERVICE_ROLE_KEY'];
const loginDomain = process.env['AURA_LOGIN_DOMAIN'] ?? DEFAULT_LOGIN_DOMAIN;
if (!url || !serviceKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or run `npm run db:start`.');
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url) && !process.argv.includes('--allow-remote')) {
  throw new Error(`Refusing to seed ${url}: demo accounts all use the password "password". Pass --allow-remote.`);
}

const db: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

/** Runs `fn` over `items`, a few at a time. */
async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

async function deleteAuthUser(id: string): Promise<void> {
  const { error } = await db.auth.admin.deleteUser(id);
  if (error && !/not found/i.test(error.message)) throw new Error(`Delete user: ${error.message}`);
}

/** Removes earlier seeded copies of the demo clubs (and their sign-ins) and the platform admin. */
async function clear(slugs: string[]): Promise<void> {
  const clubs = must(await db.from('clubs').select('id').in('slug', slugs), 'Find clubs');
  const ids = clubs.map((c) => c.id as string);
  if (ids.length) {
    const members = must(await db.from('members').select('user_id').in('club_id', ids), 'Find members');
    await inBatches(
      members.filter((m) => m.user_id),
      10,
      (m) => deleteAuthUser(m.user_id),
    );
    must(await db.from('clubs').delete().in('id', ids), 'Delete clubs');
  }
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`List users: ${error.message}`);
    const admin = data.users.find((u) => u.email === DEMO_PLATFORM_ADMIN.email);
    if (admin) await deleteAuthUser(admin.id);
    if (admin || data.users.length < 1000) break;
  }
}

async function seedPlatformAdmin(): Promise<void> {
  const { error } = await db.auth.admin.createUser({
    email: DEMO_PLATFORM_ADMIN.email,
    password: DEMO_PLATFORM_ADMIN.password,
    email_confirm: true,
    app_metadata: { role: 'platform_admin' },
    user_metadata: { name: DEMO_PLATFORM_ADMIN.name },
  });
  if (error) throw new Error(`Create platform admin: ${error.message}`);
}

async function seedClub({ account, data, credentials, adminUserId }: MockClub): Promise<void> {
  const club = must(
    await db
      .from('clubs')
      .insert({
        slug: account.slug,
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

  console.log(
    `  ${account.name} (/${account.slug}): ${data.users.length} members, ${credentials.length} sign-ins, ` +
      `${data.events.length} events, ${data.threads.length} threads`,
  );
}

async function main(): Promise<void> {
  const clubs = createMockClubs(new Date());
  console.log(`Seeding ${url}`);
  await clear(clubs.map((c) => c.account.slug));
  await seedPlatformAdmin();
  console.log(`  Platform admin: ${DEMO_PLATFORM_ADMIN.email}`);
  for (const club of clubs) await seedClub(club);
  console.log(`Done. Every account's password is "${DEMO_PASSWORD}".`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
