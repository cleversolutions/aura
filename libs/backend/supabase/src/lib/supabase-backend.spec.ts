/**
 * Repository tests against a local, seeded Supabase. Skipped unless SUPABASE_URL is set, so unit
 * runs need no Docker. Run with `npm run test:supabase` (after `npm run db:reset`).
 */
import { webcrypto } from 'node:crypto';
import { TestBed } from '@angular/core/testing';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import {
  AuthRepository,
  ChatEvent,
  ChatRepository,
  DirectoryRepository,
  PlatformRepository,
  ScheduleRepository,
} from '@aura/backend/api';
import { PANTHERS_SLUG, SPARTANS_SLUG } from '@aura/backend/mock';
import { Thread, User } from '@aura/shared/models';
import { DEFAULT_LOGIN_DOMAIN, authEmailFor, effectiveMembers } from '@aura/shared/util';
import { Database } from './database.types';
import { provideSupabaseBackend } from './provide-supabase-backend';
import { SUPABASE_CLIENT_FACTORY } from './supabase-clients';

// jsdom has no SubtleCrypto (sign-in derives the auth email with it); browsers and Node do.
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const url = process.env['SUPABASE_URL'];
const anonKey = process.env['SUPABASE_ANON_KEY'] ?? '';
const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** In-memory session storage shared by the clients of one test, like one browser's localStorage. */
function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  };
}

function setup() {
  const storage = memoryStorage();
  TestBed.configureTestingModule({
    providers: [
      provideSupabaseBackend({ url: url ?? '', anonKey, loginDomain: DEFAULT_LOGIN_DOMAIN, clubManifests: true }),
      {
        provide: SUPABASE_CLIENT_FACTORY,
        useValue: (config: { url: string; anonKey: string }, storageKey: string) =>
          createClient<Database>(config.url, config.anonKey, {
            auth: { storageKey, storage, persistSession: true, autoRefreshToken: false },
          }),
      },
    ],
  });
  return {
    auth: TestBed.inject(AuthRepository),
    directory: TestBed.inject(DirectoryRepository),
    schedule: TestBed.inject(ScheduleRepository),
    chat: TestBed.inject(ChatRepository),
    platform: TestBed.inject(PlatformRepository),
  };
}

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('Timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe.skipIf(!url)('Supabase backend (local)', () => {
  const service: SupabaseClient<Database> = createClient<Database>(url ?? 'http://x', serviceKey || 'x', noSession);
  const cleanups: (() => PromiseLike<unknown>)[] = [];

  afterEach(async () => {
    TestBed.resetTestingModule();
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function memberId(slug: string, username: string): Promise<string> {
    const club = await service.from('clubs').select('id').eq('slug', slug).single();
    const { data } = await service
      .from('members')
      .select('id')
      .eq('club_id', club.data?.id ?? '')
      .eq('username', username)
      .single();
    return data?.id ?? '';
  }

  describe('auth', () => {
    it('finds clubs by link, before signing in', async () => {
      const { directory } = setup();
      expect(await directory.findClub(SPARTANS_SLUG)).toMatchObject({ name: 'Spartans', ink: '#000000' });
      expect(await directory.findClub('nope99')).toBeNull();
      expect(directory.manifestUrl(PANTHERS_SLUG)).toBe(`/${PANTHERS_SLUG}/manifest.webmanifest`);
    });

    it('signs the same username in to two clubs as two people, keeping both sessions', async () => {
      const { auth, directory } = setup();
      const spartans = await auth.signIn({
        clubSlug: SPARTANS_SLUG,
        username: 'Jordan.Smith@email.com ',
        password: 'password',
      });
      const panthers = await auth.signIn({
        clubSlug: PANTHERS_SLUG,
        username: 'jordan.smith@email.com',
        password: 'password',
      });
      expect(spartans.userId).toBe(await memberId(SPARTANS_SLUG, 'jordan.smith@email.com'));
      expect(panthers.userId).toBe(await memberId(PANTHERS_SLUG, 'jordan.smith@email.com'));
      expect(panthers.userId).not.toBe(spartans.userId);

      const dir = await directory.load();
      expect(dir.club.slug).toBe(PANTHERS_SLUG);
      expect(dir.users.map((u) => u.name).sort()).toEqual([
        'Ana Ruiz',
        'Chris Obi',
        'Jordan Smith',
        'Morgan Lee',
        'Pat Kim',
      ]);

      await auth.useClub(SPARTANS_SLUG);
      expect((await auth.session())?.userId).toBe(spartans.userId);
      expect((await directory.load()).users).toHaveLength(66);

      await auth.signOut();
      expect(await auth.session()).toBeNull();
      await auth.useClub(PANTHERS_SLUG);
      expect((await auth.session())?.userId).toBe(panthers.userId);
    });

    it('rejects wrong passwords and accounts from other clubs with the same message', async () => {
      const { auth } = setup();
      const message = 'That username and password don’t match an account at this club.';
      await expect(
        auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'jordan.smith@email.com', password: 'nope' }),
      ).rejects.toThrow(message);
      await expect(
        auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'morgan@panthers.example', password: 'password' }),
      ).rejects.toThrow(message);
      await expect(auth.signIn({ clubSlug: 'nope99', username: 'x', password: 'y' })).rejects.toThrow(
        'No club at this link.',
      );
      expect(auth.demoAccounts()).toEqual([]);
      expect(auth.demoClubs()).toEqual([]);
    });
  });

  describe('schedule', () => {
    it('lets a parent RSVP for their own players only', async () => {
      const { auth, schedule, directory } = setup();
      await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'jordan.smith@email.com', password: 'password' });
      const events = await schedule.listEvents();
      expect(events).toHaveLength(12);
      const practice = events.find((e) => e.type === 'practice' && e.team === 'U12G' && e.notes.startsWith('Bring'));
      const { profiles } = await directory.load();
      const maya = profiles.find((p) => p.name === 'Maya Smith');
      const ava = profiles.find((p) => p.name === 'Ava Chen');
      if (!practice || !maya || !ava) throw new Error('seed missing');
      cleanups.push(() => service.from('rsvps').delete().eq('event_id', practice.id));

      await schedule.setRsvp(practice.id, [maya.id], 'going');
      expect((await schedule.listRsvps())[practice.id]).toEqual({ [maya.id]: 'going' });
      await schedule.setRsvp(practice.id, [maya.id], 'out');
      expect((await schedule.listRsvps())[practice.id]).toEqual({ [maya.id]: 'out' });
      await schedule.setRsvp(practice.id, [maya.id], null);
      expect((await schedule.listRsvps())[practice.id]).toBeUndefined();
      await expect(schedule.setRsvp(practice.id, [ava.id], 'going')).rejects.toThrow(/permission/);
    });

    it('lets team staff edit their own team’s events only', async () => {
      const { auth, schedule } = setup();
      await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'dana@spartans.example', password: 'password' });
      const created = await schedule.saveEvent({
        type: 'practice',
        team: 'U14B',
        date: '2026-12-01',
        time: '18:00',
        location: 'Gym',
        notes: '',
      });
      cleanups.push(() => service.from('events').delete().eq('id', created.id));
      expect(created).toMatchObject({ team: 'U14B', time: '18:00' });
      expect(await schedule.saveScore(created.id, { us: 3, them: 1 })).toMatchObject({ score: { us: 3, them: 1 } });
      await expect(
        schedule.saveEvent({ type: 'special', team: 'ALL', title: 'Gala', location: 'Hall', notes: '' }),
      ).rejects.toThrow(/permission/);
      const u18 = (await schedule.listEvents()).find((e) => e.team === 'U18B');
      await expect(schedule.saveEvent({ ...u18!, location: 'Moved' })).rejects.toThrow();
    });
  });

  describe('chat', () => {
    it('lists my threads with messages and unread counts, and marks them read', async () => {
      const { auth, chat } = setup();
      await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'jordan.smith@email.com', password: 'password' });
      const threads = await chat.listThreads();
      const carpool = threads.find((t) => t.name === 'Carpool · Thursday');
      expect(carpool).toMatchObject({ scope: 'U12G', unread: 2 });
      expect(carpool?.messages.map((m) => m.text)).toEqual([
        'I can drive Thursday. Room for two more.',
        'Ava needs a ride, thanks!',
        'Zoe too if there is space. Pickup 5:30?',
      ]);
      expect(threads.some((t) => t.name === 'Club coaches')).toBe(false);

      const me = (await auth.session())!.userId;
      cleanups.push(() =>
        service
          .from('thread_reads')
          .update({ last_read_at: carpool!.messages[0].sentAt })
          .eq('thread_id', carpool!.id)
          .eq('member_id', me),
      );
      await chat.markRead(carpool!.id);
      expect((await chat.listThreads()).find((t) => t.id === carpool!.id)?.unread).toBe(0);
    });

    it('delivers other people’s messages in realtime, not my own', async () => {
      const { auth, chat } = setup();
      await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'jordan.smith@email.com', password: 'password' });
      const general = (await chat.listThreads()).find((t) => t.name === '#general' && t.scope === 'U12G')!;
      const events: ChatEvent[] = [];
      const stop = chat.subscribe((e) => events.push(e));
      cleanups.push(async () => stop());

      const wei = createClient<Database>(url!, anonKey, noSession);
      const club = await service.from('clubs').select('id').eq('slug', SPARTANS_SLUG).single();
      await wei.auth.signInWithPassword({
        email: await authEmailFor(club.data!.id, 'wei-chen@spartans.example'),
        password: 'password',
      });
      const weiId = await memberId(SPARTANS_SLUG, 'wei-chen@spartans.example');
      await new Promise((r) => setTimeout(r, 3000)); // let the channel join (slower on a cold stack)

      const mine = await chat.sendMessage(general.id, (await auth.session())!.userId, 'From Jordan');
      const theirs = await wei
        .from('messages')
        .insert({ club_id: club.data!.id, thread_id: general.id, from_member_id: weiId, text: 'From Wei' })
        .select('id')
        .single();
      cleanups.push(() => service.from('messages').delete().in('id', [mine.id, theirs.data!.id]));

      await until(() => events.length > 0);
      expect(events.map((e) => e.message.text)).toEqual(['From Wei']);
      expect(events[0]).toMatchObject({ type: 'message', threadId: general.id, message: { from: weiId } });
    }, 15000);

    it('creates threads and updates who is in them', async () => {
      const { auth, chat } = setup();
      const session = await auth.signIn({
        clubSlug: SPARTANS_SLUG,
        username: 'jordan.smith@email.com',
        password: 'password',
      });
      const wei = await memberId(SPARTANS_SLUG, 'wei-chen@spartans.example');
      const priya = await memberId(SPARTANS_SLUG, 'priya-patel@spartans.example');
      const created = await chat.createThread({
        name: 'Snacks',
        scope: 'U12G',
        teams: [],
        include: { staff: false, parents: false, players: false },
        members: [wei],
        creatorId: session.userId,
      });
      cleanups.push(() => service.from('threads').delete().eq('id', created.id));
      expect(created).toMatchObject({ name: 'Snacks', members: [wei], creatorId: session.userId, isDefault: false });

      const updated = await chat.updateMembership(created.id, {
        teams: ['U12G'],
        include: { staff: true, parents: false, players: false },
        members: [priya],
      });
      expect(updated).toMatchObject({ teams: ['U12G'], include: { staff: true }, members: [priya] });

      await chat.setMuted(created.id, true);
      expect(await chat.listMuted()).toContain(created.id);
      await chat.setMuted(created.id, false);
      expect(await chat.listMuted()).not.toContain(created.id);
    });
  });

  describe('directory', () => {
    it('lets club staff create a team with new staff, who signs in with the temporary password', async () => {
      const { auth, directory, chat } = setup();
      await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'sam@spartans.example', password: 'password' });
      const dana = await memberId(SPARTANS_SLUG, 'dana@spartans.example');
      const club = await service.from('clubs').select('id').eq('slug', SPARTANS_SLUG).single();
      cleanups.push(async () => {
        const { data } = await service.from('members').select('user_id').eq('username', 'quinn@x.example');
        for (const m of data ?? []) if (m.user_id) await service.auth.admin.deleteUser(m.user_id);
        await service.from('members').delete().eq('username', 'quinn@x.example');
        await service.from('teams').delete().eq('club_id', club.data!.id).eq('id', 'U9B');
      });

      const { directory: dir, invite } = await directory.saveTeam({
        name: 'U9 Boys',
        staffIds: [dana],
        newStaff: { name: 'Quinn Lam', email: 'quinn@x.example' },
      });
      expect(dir.teams.map((t) => t.id)).toContain('U9B');
      expect(dir.users.find((u) => u.id === dana)?.teams).toContain('U9B');
      expect(invite?.user).toMatchObject({ name: 'Quinn Lam', kind: 'staff', teams: ['U9B'], invited: true });
      await expect(directory.saveTeam({ name: 'U9 Boys', staffIds: [] })).rejects.toThrow('U9 Boys already exists.');
      // Club staff are not auto-included in the new team's default channels.
      expect((await chat.listThreads()).filter((t) => t.scope === 'U9B')).toHaveLength(0);

      await auth.signOut();
      const quinn = await auth.signIn({
        clubSlug: SPARTANS_SLUG,
        username: 'quinn@x.example',
        password: invite!.temporaryPassword,
      });
      expect(quinn).toEqual({ userId: invite!.user.id, mustChangePassword: true });
      await auth.changePassword('quinn-own-password');
      expect((await auth.session())?.mustChangePassword).toBe(false);
      const me = (await directory.load()).users.find((u) => u.id === quinn.userId);
      expect(me?.invited).toBeUndefined();
      expect(
        (await chat.listThreads())
          .filter((t) => t.scope === 'U9B')
          .map((t) => t.name)
          .sort(),
      ).toEqual(['#announcements', '#general']);
    });

    it('lets club staff edit team staff details, moving their sign-in', async () => {
      const { auth, directory } = setup();
      await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'sam@spartans.example', password: 'password' });
      const mike = await memberId(SPARTANS_SLUG, 'mike@spartans.example');
      const restore = () => directory.updateMember({ id: mike, name: 'Mike Tran', email: 'mike@spartans.example' });
      cleanups.push(async () => {
        await auth.useClub(SPARTANS_SLUG);
        await restore();
      });

      const updated = await directory.updateMember({ id: mike, name: 'Mike T.', email: 'mike.t@spartans.example' });
      expect(updated).toMatchObject({ id: mike, name: 'Mike T.', email: 'mike.t@spartans.example', kind: 'staff' });
      await expect(directory.updateMember({ id: mike, name: 'Mike', email: 'dana@spartans.example' })).rejects.toThrow(
        'already has an account',
      );

      await auth.signOut();
      expect(
        (await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'mike.t@spartans.example', password: 'password' }))
          .userId,
      ).toBe(mike);
      await expect(
        directory.updateMember({
          id: await memberId(SPARTANS_SLUG, 'dana@spartans.example'),
          name: 'X',
          email: 'x@x.example',
        }),
      ).rejects.toThrow('Only club staff');
      await auth.signOut();
      await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'sam@spartans.example', password: 'password' });
    });

    it('lets club staff resend and cancel invites', async () => {
      const { auth, directory } = setup();
      await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'sam@spartans.example', password: 'password' });
      const invite = await directory.inviteMember({
        team: 'U12G',
        kind: 'parent',
        name: 'Rae Moss',
        email: 'rae@x.example',
      });
      cleanups.push(async () => {
        const { data } = await service.from('members').select('user_id').eq('id', invite.user.id);
        for (const m of data ?? []) if (m.user_id) await service.auth.admin.deleteUser(m.user_id);
        await service.from('members').delete().eq('id', invite.user.id);
      });
      const resent = await directory.resendInvite(invite.user.id);
      expect(resent).toMatchObject({ username: 'rae@x.example', user: { id: invite.user.id, invited: true } });
      expect(resent.temporaryPassword).not.toBe(invite.temporaryPassword);
      await directory.cancelInvite(invite.user.id);
      expect((await directory.load()).users.some((u) => u.id === invite.user.id)).toBe(false);
      await expect(directory.cancelInvite(await memberId(SPARTANS_SLUG, 'dana@spartans.example'))).rejects.toThrow(
        'already joined',
      );
    });

    it('lets a parent request a player link and edit their own players', async () => {
      const { auth, directory } = setup();
      const session = await auth.signIn({
        clubSlug: SPARTANS_SLUG,
        username: 'jordan.smith@email.com',
        password: 'password',
      });
      const link = await directory.requestPlayerLink({
        name: 'Sky Smith',
        team: 'U10B',
        jersey: '',
        parentId: session.userId,
      });
      cleanups.push(() => service.from('player_profiles').delete().eq('id', link.id));
      expect(link).toMatchObject({
        name: 'Sky Smith',
        jersey: '–',
        pending: true,
        parentId: session.userId,
        userId: null,
      });
      expect(await directory.updateProfile({ id: link.id, name: 'Skye Smith', jersey: '9', login: '' })).toMatchObject({
        name: 'Skye Smith',
        jersey: '9',
      });
      const ava = (await directory.load()).profiles.find((p) => p.name === 'Ava Chen')!;
      await expect(directory.updateProfile({ ...ava, name: 'Hacked' })).rejects.toThrow();
    });
  });

  describe('platform', () => {
    it('lists clubs for the platform admin, and previews with sample data', async () => {
      const { auth, platform, directory, schedule } = setup();
      await expect(auth.signInPlatform('admin@aura.example', 'nope')).rejects.toThrow('Wrong email or password.');
      await expect(auth.signInPlatform('jordan.smith@email.com', 'password')).rejects.toThrow(
        'Wrong email or password.',
      );
      const admin = await auth.signInPlatform('admin@aura.example', 'password');
      expect(admin).toMatchObject({ email: 'admin@aura.example', name: 'Alex Rivera' });
      expect(await auth.platformSession()).toEqual(admin);

      const clubs = await platform.listClubs();
      expect(clubs.find((c) => c.slug === PANTHERS_SLUG)).toMatchObject({
        adminName: 'Morgan Lee',
        adminEmail: 'morgan@panthers.example',
      });

      await auth.usePreview(PANTHERS_SLUG);
      expect(await auth.session()).toEqual({ userId: 'sam', mustChangePassword: false });
      const dir = await directory.load();
      expect(dir.club).toMatchObject({ name: 'Panthers', ink: '#1d2a6b' });
      expect(dir.teams).toHaveLength(5); // sample data, not the Panthers' two teams
      expect((await schedule.listEvents()).length).toBeGreaterThan(5);

      await auth.useClub(PANTHERS_SLUG);
      expect(await auth.session()).toBeNull();
      await auth.signOutPlatform();
      expect(await auth.platformSession()).toBeNull();
    });
  });

  describe('effective thread membership', () => {
    it('is the same in SQL (thread_member_ids) as in TypeScript (effectiveMembers)', async () => {
      for (const slug of [SPARTANS_SLUG, PANTHERS_SLUG]) {
        const club = await service.from('clubs').select('id').eq('slug', slug).single();
        const clubId = club.data!.id;
        const [members, threads, threadMembers] = await Promise.all([
          service.from('members').select('id, kind, team_members(team_id)').eq('club_id', clubId),
          service.from('threads').select().eq('club_id', clubId),
          service.from('thread_members').select().eq('club_id', clubId),
        ]);
        const users = members.data!.map(
          (m) => ({ id: m.id, kind: m.kind, teams: m.team_members.map((t) => t.team_id) }) as unknown as User,
        );
        expect(threads.data!.length).toBeGreaterThan(4);
        for (const t of threads.data!) {
          const membership: Pick<Thread, 'teams' | 'include' | 'members' | 'creatorId'> = {
            teams: t.teams,
            include: { staff: t.include_staff, parents: t.include_parents, players: t.include_players },
            members: threadMembers.data!.filter((m) => m.thread_id === t.id).map((m) => m.member_id),
            creatorId: t.creator_member_id,
          };
          const sql = await service.rpc('thread_member_ids', { p_thread: t.id });
          expect(new Set(sql.data as unknown as string[]), `${slug} ${t.name}`).toEqual(
            effectiveMembers(membership, users),
          );
        }
      }
    });
  });
});
