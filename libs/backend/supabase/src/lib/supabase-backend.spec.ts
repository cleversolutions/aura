/**
 * Repository tests against a local Supabase. Skipped unless SUPABASE_URL is set, so unit runs need
 * no Docker. Run with `npm run test:supabase` (after `npm run db:start`). They seed their own
 * copies of the demo clubs under random slugs, plus their own platform admin, and delete them
 * afterwards: the seeded demo clubs, and anything made by hand, are left alone.
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
import { DEMO_PASSWORD, createMockClubs } from '@aura/backend/mock';
import { Thread, User } from '@aura/shared/models';
import {
  DEFAULT_LOGIN_DOMAIN,
  authEmailFor,
  canRsvp,
  canSeeContact,
  canSeePlayerCare,
  effectiveMembers,
} from '@aura/shared/util';
import { Database } from './database.types';
import { createPlatformAdmin, deleteClubs, deletePlatformAdmin, seedDemoClub, throwawaySlug } from './demo-clubs';
import { provideSupabaseBackend } from './provide-supabase-backend';
import { SUPABASE_CLIENT_FACTORY, SupabaseClients } from './supabase-clients';

// jsdom has no SubtleCrypto (sign-in derives the auth email with it); browsers and Node do.
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const url = process.env['SUPABASE_URL'];
const anonKey = process.env['SUPABASE_ANON_KEY'] ?? '';
const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

// Throwaway copies of the demo clubs and platform admin, made in beforeAll.
const SPARTANS_SLUG = throwawaySlug();
const PANTHERS_SLUG = throwawaySlug();
const ADMIN_EMAIL = `${throwawaySlug('admin')}@aura.example`;

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
  const clubIds: string[] = [];

  beforeAll(async () => {
    const [spartans, panthers] = createMockClubs(new Date());
    for (const [club, slug] of [
      [spartans, SPARTANS_SLUG],
      [panthers, PANTHERS_SLUG],
    ] as const) {
      clubIds.push((await seedDemoClub(service, club, { loginDomain: DEFAULT_LOGIN_DOMAIN, slug })).id);
    }
    await createPlatformAdmin(service, { email: ADMIN_EMAIL, password: DEMO_PASSWORD, name: 'Alex Rivera' });
  }, 120_000);

  afterAll(async () => {
    await deleteClubs(service, clubIds);
    await deletePlatformAdmin(service, ADMIN_EMAIL);
  }, 60_000);

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
      expect(events).toHaveLength(14);
      const practice = events.find((e) => e.type === 'practice' && e.team === 'U12G' && e.notes.startsWith('Bring'));
      const { profiles } = await directory.load();
      const maya = profiles.find((p) => p.name === 'Maya Smith');
      const ava = profiles.find((p) => p.name === 'Ava Chen');
      if (!practice || !maya || !ava) throw new Error('seed missing');
      cleanups.push(() => service.from('rsvps').delete().eq('event_id', practice.id));

      const mine = async () => (await schedule.listRsvps())[practice.id]?.[maya.id];
      await schedule.setRsvp(practice.id, [maya.id], 'going');
      expect(await mine()).toEqual({ status: 'going' });
      await schedule.setRsvp(practice.id, [maya.id], 'out', 'Dentist');
      expect(await mine()).toEqual({ status: 'out', note: 'Dentist' });
      await schedule.setRsvp(practice.id, [maya.id], 'going');
      expect(await mine()).toEqual({ status: 'going', note: 'Dentist' });
      await schedule.setRsvp(practice.id, [maya.id], null);
      expect(await mine()).toBeUndefined();
      await expect(schedule.setRsvp(practice.id, [ava.id], 'going')).rejects.toThrow(/permission/);
      // Other families' notes are hidden; their answers are not.
      expect((await schedule.listRsvps())[practice.id]?.[ava.id]).toEqual({ status: 'going' });
    });

    it('records a player’s RSVP on their profile, whether they or a parent answer', async () => {
      const player = setup();
      await player.auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'eli.smith@email.com', password: 'password' });
      const { profiles } = await player.directory.load();
      const eli = profiles.find((p) => p.name === 'Eli Smith')!;
      const game = (await player.schedule.listEvents()).find(
        (e) => e.team === 'U18B' && e.opponent === 'Riverside Hawks',
      )!;
      cleanups.push(() => service.from('rsvps').delete().eq('event_id', game.id));
      await player.schedule.setRsvp(game.id, [eli.id], 'out', 'Exam');
      await expect(player.schedule.setRsvp(game.id, [eli.userId!], 'going')).rejects.toThrow(/permission/);
      TestBed.resetTestingModule();

      const parent = setup();
      await parent.auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'jordan.smith@email.com', password: 'password' });
      expect((await parent.schedule.listRsvps())[game.id]).toEqual({ [eli.id]: { status: 'out', note: 'Exam' } });
    });

    it('lets the event’s staff cancel, restore and delete it', async () => {
      const { auth, schedule } = setup();
      await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'dana@spartans.example', password: 'password' });
      const created = await schedule.saveEvent({
        type: 'practice',
        team: 'U12G',
        tbd: true,
        location: 'Gym',
        notes: '',
      });
      cleanups.push(() => service.from('events').delete().eq('id', created.id));
      expect(await schedule.setCancelled(created.id, true)).toMatchObject({ cancelled: true });
      expect((await schedule.saveEvent({ ...created, cancelled: true, notes: 'Snow' })).cancelled).toBe(true);
      expect((await schedule.setCancelled(created.id, false)).cancelled).toBeUndefined();

      const clubWide = (await schedule.listEvents()).find((e) => e.team === 'ALL')!;
      await expect(schedule.deleteEvent(clubWide.id)).rejects.toThrow(/staff/);
      await expect(schedule.setCancelled(clubWide.id, true)).rejects.toThrow();
      await schedule.deleteEvent(created.id);
      expect((await schedule.listEvents()).some((e) => e.id === created.id)).toBe(false);
    });

    it('repeats an event weekly, changes it from one week on, and deletes later weeks', async () => {
      const { auth, schedule } = setup();
      await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'dana@spartans.example', password: 'password' });
      const draft = { type: 'practice' as const, team: 'U12G', location: 'Gym', notes: '' };
      const weeks = await schedule.createWeekly(
        { ...draft, date: '2030-01-08', time: '18:00', endTime: '19:30', arriveBy: '17:45' },
        '2030-01-29',
      );
      cleanups.push(() =>
        service
          .from('events')
          .delete()
          .in(
            'id',
            weeks.map((e) => e.id),
          ),
      );
      expect(weeks.map((e) => e.date)).toEqual(['2030-01-08', '2030-01-15', '2030-01-22', '2030-01-29']);
      expect(weeks[0]).toMatchObject({ endTime: '19:30', arriveBy: '17:45', seriesId: weeks[3].seriesId });
      await schedule.setCancelled(weeks[2].id, true);

      const changed = await schedule.saveSeries({ ...weeks[1], date: '2030-01-16', time: '18:30', endTime: undefined });
      expect(changed.map((e) => `${e.date} ${e.time} ${e.endTime ?? '-'} ${e.cancelled ?? false}`).sort()).toEqual([
        '2030-01-16 18:30 - false',
        '2030-01-23 18:30 - true',
        '2030-01-30 18:30 - false',
      ]);
      await expect(schedule.saveEvent({ ...weeks[0], endTime: '17:00' })).rejects.toThrow();

      expect((await schedule.deleteSeries(weeks[2].id)).sort()).toEqual([weeks[2].id, weeks[3].id].sort());
      const left = (await schedule.listEvents()).filter((e) => e.seriesId === weeks[0].seriesId);
      expect(left.map((e) => e.date).sort()).toEqual(['2030-01-08', '2030-01-16']);

      TestBed.resetTestingModule();
      const mike = setup();
      await mike.auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'mike@spartans.example', password: 'password' });
      await expect(mike.schedule.saveSeries({ ...weeks[0], location: 'Elsewhere' })).rejects.toThrow(/staff/);
      await expect(mike.schedule.deleteSeries(weeks[0].id)).rejects.toThrow(/staff/);
      await expect(
        mike.schedule.createWeekly({ ...draft, date: '2030-01-08', time: '18:00' }, '2030-01-29'),
      ).rejects.toThrow();
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

    it('keeps announcement channels to staff, unless club staff let everyone post', async () => {
      const { auth, chat, directory } = setup();
      const jordan = await auth.signIn({
        clubSlug: SPARTANS_SLUG,
        username: 'jordan.smith@email.com',
        password: 'password',
      });
      const threads = await chat.listThreads();
      const ann = threads.find((t) => t.name === '#announcements' && t.scope === 'U12G')!;
      expect(threads.find((t) => t.name === '#club-announcements')).toMatchObject({
        scope: 'club',
        isDefault: true,
        announceOnly: true,
      });
      expect((await directory.load()).settings).toEqual({ announcements: 'staff', contacts: 'staff' });
      await expect(chat.sendMessage(ann.id, jordan.userId, 'Ride Sunday?')).rejects.toThrow(/permission/);
      await expect(directory.saveSettings({ announcements: 'everyone', contacts: 'staff' })).rejects.toThrow(
        /permission/,
      );

      await auth.signOut();
      const sam = await auth.signIn({
        clubSlug: SPARTANS_SLUG,
        username: 'sam@spartans.example',
        password: 'password',
      });
      cleanups.push(() => service.from('club_settings').delete().eq('club_id', clubIds[0]));
      const general = (await chat.listThreads()).find((t) => t.name === '#general' && t.scope === 'U18B')!;
      const fromSam = await chat.sendMessage(general.id, sam.userId, 'Great game, U18B!');
      cleanups.push(() => service.from('messages').delete().eq('id', fromSam.id));
      expect(await directory.saveSettings({ announcements: 'everyone', contacts: 'staff' })).toEqual({
        announcements: 'everyone',
        contacts: 'staff',
      });

      await auth.signOut();
      await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'jordan.smith@email.com', password: 'password' });
      expect((await directory.load()).settings).toEqual({ announcements: 'everyone', contacts: 'staff' });
      const posted = await chat.sendMessage(ann.id, jordan.userId, 'Thanks coach!');
      cleanups.push(() => service.from('messages').delete().eq('id', posted.id));
    });

    it('edits and deletes messages, and delivers both in realtime', async () => {
      const { auth, chat } = setup();
      const jordan = await auth.signIn({
        clubSlug: SPARTANS_SLUG,
        username: 'jordan.smith@email.com',
        password: 'password',
      });
      const general = (await chat.listThreads()).find((t) => t.name === '#general' && t.scope === 'U12G')!;
      const mine = await chat.sendMessage(general.id, jordan.userId, 'Spare shoes?');
      cleanups.push(() => service.from('messages').delete().eq('id', mine.id));
      const events: ChatEvent[] = [];
      const stop = chat.subscribe((e) => events.push(e));
      cleanups.push(async () => stop());
      await new Promise((r) => setTimeout(r, 3000)); // let the channel join

      const edited = await chat.editMessage(general.id, mine.id, ' Spare shoes, size 6? ');
      expect(edited).toMatchObject({ id: mine.id, text: 'Spare shoes, size 6?' });
      expect(edited.editedAt).toBeTruthy();
      const theirs = general.messages.find((m) => m.from !== jordan.userId)!;
      await expect(chat.editMessage(general.id, theirs.id, 'Hacked')).rejects.toThrow(/permission/);
      await expect(chat.deleteMessage(general.id, theirs.id)).rejects.toThrow(/permission/);
      await until(() => events.length > 0);
      expect(events[0]).toMatchObject({
        type: 'updated',
        threadId: general.id,
        message: { text: 'Spare shoes, size 6?' },
      });

      // Dana coaches U12G: she moderates its channels.
      await auth.signOut();
      await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'dana@spartans.example', password: 'password' });
      expect(await chat.deleteMessage(general.id, mine.id)).toMatchObject({ id: mine.id, text: '', deleted: true });
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
      let u9bId = '';
      cleanups.push(async () => {
        const quinn = service.from('members').select('user_id').eq('club_id', club.data!.id);
        const { data } = await quinn.eq('username', 'quinn@x.example');
        for (const m of data ?? []) if (m.user_id) await service.auth.admin.deleteUser(m.user_id);
        await service.from('members').delete().eq('club_id', club.data!.id).eq('username', 'quinn@x.example');
        await service.from('threads').delete().eq('club_id', club.data!.id).eq('scope', u9bId);
        await service.from('teams').delete().eq('club_id', club.data!.id).eq('id', u9bId);
      });

      const { directory: dir, invite } = await directory.saveTeam({
        name: 'U9 Boys',
        age: 'U9',
        division: 'Boys',
        staffIds: [dana],
        newStaff: { name: 'Quinn Lam', email: 'quinn@x.example' },
      });
      const team = dir.teams.find((t) => t.name === 'U9 Boys')!;
      u9bId = team.id;
      expect(team).toMatchObject({ age: 'U9', division: 'Boys', season: dir.seasons.at(-1)?.id });
      expect(u9bId).not.toBe('U9B');
      expect(dir.users.find((u) => u.id === dana)?.teams).toContain(u9bId);
      expect(invite?.user).toMatchObject({ name: 'Quinn Lam', kind: 'staff', teams: [u9bId], invited: true });
      await expect(directory.saveTeam({ name: 'u9 boys', staffIds: [] })).rejects.toThrow(
        'u9 boys already exists this season.',
      );
      const renamed = await directory.saveTeam({
        id: u9bId,
        name: 'U9 Boys Red',
        staffIds: [dana, invite!.user.id],
      });
      expect(renamed.directory.teams.find((t) => t.id === u9bId)).toEqual({
        id: u9bId,
        name: 'U9 Boys Red',
        season: team.season,
      });
      // Club staff read the new team's default channels without being members of them.
      const u9b = (await chat.listThreads()).filter((t) => t.scope === u9bId);
      expect(u9b.map((t) => [t.name, t.announceOnly]).sort()).toEqual([
        ['#announcements', true],
        ['#general', false],
      ]);

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
          .filter((t) => t.scope === u9bId)
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

    it('lets any staff set any staff member’s title', async () => {
      const { auth, directory } = setup();
      const dana = await memberId(SPARTANS_SLUG, 'dana@spartans.example');
      const { data } = await service.from('members').select('title').eq('id', dana).single();
      cleanups.push(() =>
        service
          .from('members')
          .update({ title: data?.title ?? null })
          .eq('id', dana),
      );

      // Mike coaches U18B only, and still titles the U12G/U14B coach.
      await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'mike@spartans.example', password: 'password' });
      expect(await directory.setMemberTitle(dana, ' Assistant Coach ')).toMatchObject({
        id: dana,
        name: 'Dana Reyes',
        title: 'Assistant Coach',
      });
      expect((await directory.setMemberTitle(dana, '')).title).toBeUndefined();
      await auth.signOut();

      await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'jordan.smith@email.com', password: 'password' });
      await expect(directory.setMemberTitle(dana, 'Head Coach')).rejects.toThrow('Only staff');
      await auth.signOut();
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

    it('lets staff reset a member’s password, and club staff disable, enable and remove them', async () => {
      const { auth, directory, chat } = setup();
      await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'sam@spartans.example', password: 'password' });
      const invite = await directory.inviteMember({
        team: 'U12G',
        kind: 'parent',
        name: 'Lee Park',
        email: 'lee@x.example',
      });
      cleanups.push(async () => {
        const { data } = await service.from('members').select('user_id').eq('id', invite.user.id);
        for (const m of data ?? []) if (m.user_id) await service.auth.admin.deleteUser(m.user_id);
        await service.from('members').delete().eq('id', invite.user.id);
      });
      await expect(directory.resetPassword(invite.user.id)).rejects.toThrow('hasn’t joined yet');
      await service.from('members').update({ invited: false }).eq('id', invite.user.id);

      const reset = await directory.resetPassword(invite.user.id);
      expect(reset).toMatchObject({ username: 'lee@x.example', user: { id: invite.user.id } });
      expect(reset.temporaryPassword).not.toBe(invite.temporaryPassword);

      expect(await directory.setMemberDisabled(invite.user.id, true)).toMatchObject({ disabled: true });
      expect((await directory.load()).users.find((u) => u.id === invite.user.id)?.disabled).toBe(true);
      await expect(
        auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'lee@x.example', password: reset.temporaryPassword }),
      ).rejects.toThrow('This account is disabled. Ask your club’s staff.');
      await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'sam@spartans.example', password: 'password' });
      expect((await directory.setMemberDisabled(invite.user.id, false)).disabled).toBeUndefined();

      // Lee posts, then is removed: the message stays, from a former member.
      const general = (await chat.listThreads()).find((t) => t.scope === 'U12G' && t.name === '#general')!;
      const clubId = (await directory.load()).club.id;
      await service
        .from('messages')
        .insert({ club_id: clubId, thread_id: general.id, from_member_id: invite.user.id, text: 'Bye!' });
      await directory.removeMember(invite.user.id);
      expect((await directory.load()).users.some((u) => u.id === invite.user.id)).toBe(false);
      const after = (await chat.listThreads()).find((t) => t.id === general.id)!;
      expect(after.messages.find((m) => m.text === 'Bye!')?.from).toBeNull();
      await service.from('messages').delete().eq('thread_id', general.id).eq('text', 'Bye!');

      const sam = await memberId(SPARTANS_SLUG, 'sam@spartans.example');
      await expect(directory.setMemberDisabled(sam, true)).rejects.toThrow();
    });

    it('lets team staff add players with several parents, or with their own sign-in', async () => {
      const { auth, directory } = setup();
      const dana = await auth.signIn({
        clubSlug: SPARTANS_SLUG,
        username: 'dana@spartans.example',
        password: 'password',
      });
      const wei = await memberId(SPARTANS_SLUG, 'wei-chen@spartans.example');
      const managed = await directory.addPlayer({
        team: 'U12G',
        name: 'Davis Moore',
        jersey: '',
        parentIds: [dana.userId, wei],
      });
      const own = await directory.addPlayer({
        team: 'U12G',
        name: 'Ola Diaz',
        jersey: '3',
        parentIds: [],
        email: 'ola@x.example',
      });
      cleanups.push(async () => {
        await service.from('player_profiles').delete().in('id', [managed.profile.id, own.profile.id]);
        const { data } = await service
          .from('members')
          .select('id, user_id')
          .eq('club_id', clubIds[0])
          .eq('username', 'ola@x.example');
        for (const m of data ?? []) {
          if (m.user_id) await service.auth.admin.deleteUser(m.user_id);
          await service.from('members').delete().eq('id', m.id);
        }
      });

      expect(managed.invite).toBeNull();
      expect(managed.profile).toMatchObject({ name: 'Davis Moore', jersey: '–', userId: null });
      expect(managed.profile.parentIds.sort()).toEqual([dana.userId, wei].sort());
      expect(own.invite?.user).toMatchObject({ kind: 'player', invited: true });
      expect(own.profile).toMatchObject({ userId: own.invite?.user.id, parentIds: [] });

      expect((await directory.setPlayerParents(managed.profile.id, [wei])).parentIds).toEqual([wei]);
      await expect(directory.addPlayer({ team: 'U18B', name: 'X', jersey: '', parentIds: [] })).rejects.toThrow(
        /permission/,
      );

      await auth.signOut();
      await auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'wei-chen@spartans.example', password: 'password' });
      expect((await directory.load()).profiles.find((p) => p.id === managed.profile.id)?.parentIds).toEqual([wei]);
      await expect(directory.setPlayerParents(managed.profile.id, [])).rejects.toThrow(/permission/);
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
        parentIds: [session.userId],
        userId: null,
      });
      expect(await directory.updateProfile({ id: link.id, name: 'Skye Smith', jersey: '9' })).toMatchObject({
        name: 'Skye Smith',
        jersey: '9',
      });
      const ava = (await directory.load()).profiles.find((p) => p.name === 'Ava Chen')!;
      await expect(directory.updateProfile({ ...ava, name: 'Hacked' })).rejects.toThrow();
    });
  });

  describe('roster corrections', () => {
    async function signIn(username: string) {
      const backend = setup();
      await backend.auth.signIn({ clubSlug: SPARTANS_SLUG, username, password: 'password' });
      return backend;
    }

    it('lets the team’s staff approve and reject link requests', async () => {
      const jordan = await signIn('jordan.smith@email.com');
      const me = (await jordan.auth.session())!.userId;
      const keep = await jordan.directory.requestPlayerLink({
        name: 'Ann Smith',
        team: 'U12G',
        jersey: '',
        parentId: me,
      });
      const drop = await jordan.directory.requestPlayerLink({
        name: 'Bo Smith',
        team: 'U12G',
        jersey: '',
        parentId: me,
      });
      cleanups.push(() => service.from('player_profiles').delete().in('id', [keep.id, drop.id]));
      await expect(jordan.directory.approvePlayer(keep.id)).rejects.toThrow(/permission/);
      TestBed.resetTestingModule();

      const dana = await signIn('dana@spartans.example');
      expect(await dana.directory.approvePlayer(keep.id)).not.toHaveProperty('pending');
      await dana.directory.removePlayer(drop.id);
      const profiles = (await dana.directory.load()).profiles;
      expect(profiles.find((p) => p.id === keep.id)?.pending).toBeUndefined();
      expect(profiles.some((p) => p.id === drop.id)).toBe(false);
    });

    it('moves a player between teams the staff manage, taking their parents along', async () => {
      const { directory } = await signIn('dana@spartans.example');
      const wei = await memberId(SPARTANS_SLUG, 'wei-chen@spartans.example');
      const added = await directory.addPlayer({ team: 'U14B', name: 'Cy Chen', jersey: '', parentIds: [wei] });
      cleanups.push(async () => {
        await service.from('player_profiles').delete().eq('id', added.profile.id);
        await service.from('team_members').delete().eq('member_id', wei).eq('team_id', 'U14B');
      });
      await expect(directory.movePlayer(added.profile.id, 'U18B')).rejects.toThrow(/permission/);

      // Wei keeps U12G (Ava is there) and joins U14B.
      const dir = await directory.movePlayer(added.profile.id, 'U12G');
      expect(dir.profiles.find((p) => p.id === added.profile.id)?.team).toBe('U12G');
      await directory.movePlayer(added.profile.id, 'U14B');
      const after = await directory.load();
      expect(after.users.find((u) => u.id === wei)?.teams).toEqual(['U12G', 'U14B']);
    });

    it('changes a member’s teams, by the same rules as canChangeMemberTeam', async () => {
      const { directory } = await signIn('dana@spartans.example');
      const wei = await memberId(SPARTANS_SLUG, 'wei-chen@spartans.example');
      const mike = await memberId(SPARTANS_SLUG, 'mike@spartans.example');
      cleanups.push(() => service.from('team_members').delete().eq('member_id', wei).eq('team_id', 'U14B'));
      expect((await directory.setMemberTeams(wei, ['U12G', 'U14B'])).teams).toEqual(['U12G', 'U14B']);
      await expect(directory.setMemberTeams(wei, ['U12G', 'U14B', 'U18B'])).rejects.toThrow(/permission/);
      await expect(directory.setMemberTeams(mike, ['U18B', 'U12G'])).rejects.toThrow(/permission/);
    });

    it('gives a player on the roster their own sign-in', async () => {
      const { directory } = await signIn('dana@spartans.example');
      const added = await directory.addPlayer({ team: 'U12G', name: 'Di Moss', jersey: '', parentIds: [] });
      const invite = await directory.givePlayerSignIn(added.profile.id, 'di@x.example');
      cleanups.push(async () => {
        await service.from('player_profiles').delete().eq('id', added.profile.id);
        const { data } = await service.from('members').select('user_id').eq('id', invite.user.id).single();
        if (data?.user_id) await service.auth.admin.deleteUser(data.user_id);
        await service.from('members').delete().eq('id', invite.user.id);
      });
      expect(invite.user).toMatchObject({ kind: 'player', teams: ['U12G'], invited: true });
      const profile = (await directory.load()).profiles.find((p) => p.id === added.profile.id);
      expect(profile?.userId).toBe(invite.user.id);
    });

    it('shows emails by the contacts setting, as canSeeContact does', async () => {
      const jordan = await signIn('jordan.smith@email.com');
      const wei = await memberId(SPARTANS_SLUG, 'wei-chen@spartans.example');
      const dana = await memberId(SPARTANS_SLUG, 'dana@spartans.example');
      const email = async (id: string) => (await jordan.directory.load()).users.find((u) => u.id === id)?.email;
      expect(await email(dana)).toBe('dana@spartans.example');
      expect(await email(wei)).toBeUndefined();

      cleanups.push(() => service.from('club_settings').delete().eq('club_id', clubIds[0]));
      await service.from('club_settings').upsert({ club_id: clubIds[0], contacts: 'everyone' });
      expect(await email(wei)).toBe('wei-chen@spartans.example');

      // Nothing leaks around member_contacts().
      const { client } = TestBed.inject(SupabaseClients).active();
      const direct = await client.from('members').select('email').limit(1);
      expect(direct.error).not.toBeNull();
    });
  });

  describe('platform', () => {
    it('lists clubs for the platform admin, and previews with sample data', async () => {
      const { auth, platform, directory, schedule } = setup();
      await expect(auth.signInPlatform(ADMIN_EMAIL, 'nope')).rejects.toThrow('Wrong email or password.');
      await expect(auth.signInPlatform('jordan.smith@email.com', 'password')).rejects.toThrow(
        'Wrong email or password.',
      );
      const admin = await auth.signInPlatform(ADMIN_EMAIL, 'password');
      expect(admin).toMatchObject({ email: ADMIN_EMAIL, name: 'Alex Rivera' });
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

      const panthers = clubs.find((c) => c.slug === PANTHERS_SLUG)!;
      expect(await platform.listClubStaff(panthers.id)).toEqual([
        {
          id: await memberId(PANTHERS_SLUG, 'morgan@panthers.example'),
          name: 'Morgan Lee',
          email: 'morgan@panthers.example',
          title: expect.any(String),
          admin: true,
        },
      ]);
      await expect(
        platform.setClubAdmin(panthers.id, await memberId(PANTHERS_SLUG, 'jordan.smith@email.com')),
      ).rejects.toThrow('Choose one of the club’s staff.');
      const morganUser = (
        await service
          .from('members')
          .select('user_id')
          .eq('id', await memberId(PANTHERS_SLUG, 'morgan@panthers.example'))
          .single()
      ).data!.user_id!;
      cleanups.push(() =>
        service.auth.admin.updateUserById(morganUser, {
          password: 'password',
          user_metadata: { must_change_password: false },
        }),
      );
      const reset = await platform.resetAdminPassword(panthers.id);
      expect(reset.username).toBe('morgan@panthers.example');

      await auth.useClub(PANTHERS_SLUG);
      expect(await auth.session()).toBeNull();
      await auth.signOutPlatform();
      expect(await auth.platformSession()).toBeNull();
    });
    it('counts members, and archives a club so its members read it but change nothing', async () => {
      const { auth, platform, directory, schedule } = setup();
      await auth.signInPlatform(ADMIN_EMAIL, 'password');
      const panthers = (await platform.listClubs()).find((c) => c.slug === PANTHERS_SLUG)!;
      expect(panthers.counts).toEqual({ members: 5, invited: 0, teams: 2 });
      expect(panthers.archivedAt).toBeUndefined();

      cleanups.push(() => service.from('clubs').update({ archived_at: null }).eq('id', panthers.id));
      const archived = await platform.setArchived(panthers.id, true);
      expect(archived.archivedAt).toEqual(expect.any(String));
      expect((await directory.findClub(PANTHERS_SLUG))?.archivedAt).toBe(archived.archivedAt);

      await auth.useClub(PANTHERS_SLUG);
      await auth.signIn({ clubSlug: PANTHERS_SLUG, username: 'jordan.smith@email.com', password: 'password' });
      const dir = await directory.load();
      expect(dir.club.archivedAt).toBe(archived.archivedAt);
      const sky = dir.profiles.find((p) => p.name === 'Sky Smith')!;
      const event = (await schedule.listEvents()).find((e) => e.team === sky.team)!;
      await expect(schedule.setRsvp(event.id, [sky.id], 'going')).rejects.toThrow(
        'This club is archived. It is read-only.',
      );

      expect((await platform.setArchived(panthers.id, false)).archivedAt).toBeUndefined();
      await schedule.setRsvp(event.id, [sky.id], 'going');
      await schedule.setRsvp(event.id, [sky.id], null);
      await auth.signOut();
      await auth.signOutPlatform();
    });
  });

  describe('effective thread membership', () => {
    it('is the same in SQL (thread_member_ids) as in TypeScript (effectiveMembers)', async () => {
      // A disabled member is in no thread, in either.
      const jordan = await memberId(SPARTANS_SLUG, 'jordan.smith@email.com');
      await service.from('members').update({ disabled: true }).eq('id', jordan);
      cleanups.push(() => service.from('members').update({ disabled: false }).eq('id', jordan));
      for (const slug of [SPARTANS_SLUG, PANTHERS_SLUG]) {
        const club = await service.from('clubs').select('id').eq('slug', slug).single();
        const clubId = club.data!.id;
        const [members, threads, threadMembers] = await Promise.all([
          service.from('members').select('id, kind, disabled, team_members(team_id)').eq('club_id', clubId),
          service.from('threads').select().eq('club_id', clubId),
          service.from('thread_members').select().eq('club_id', clubId),
        ]);
        const users = members.data!.map(
          (m) =>
            ({
              id: m.id,
              kind: m.kind,
              disabled: m.disabled,
              teams: m.team_members.map((t) => t.team_id),
            }) as unknown as User,
        );
        expect(threads.data!.length).toBeGreaterThan(4);
        for (const t of threads.data!) {
          const membership: Pick<Thread, 'teams' | 'include' | 'members' | 'creatorId' | 'isDefault' | 'scope'> = {
            isDefault: t.is_default,
            scope: t.scope,
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

  describe('contact visibility', () => {
    it('is the same in SQL (member_contacts) as in TypeScript (canSeeContact)', async () => {
      const club = setup();
      await club.auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'sam@spartans.example', password: 'password' });
      const { users, profiles, settings } = await club.directory.load();
      TestBed.resetTestingModule();
      for (const username of [
        'jordan.smith@email.com',
        'wei-chen@spartans.example',
        'dana@spartans.example',
        'mike@spartans.example',
        'eli.smith@email.com',
      ]) {
        const { auth, directory } = setup();
        const { userId } = await auth.signIn({ clubSlug: SPARTANS_SLUG, username, password: 'password' });
        const me = users.find((u) => u.id === userId)!;
        const seen = (await directory.load()).users.filter((u) => u.email).map((u) => u.id);
        const expected = users.filter((u) => u.email && canSeeContact(me, u, settings, profiles)).map((u) => u.id);
        expect(new Set(seen), username).toEqual(new Set(expected));
        TestBed.resetTestingModule();
      }
    });
  });

  describe('phones and care details', () => {
    it('saves phone numbers and players’ care details, which only the family and staff read', async () => {
      const jordan = setup();
      await jordan.auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'jordan.smith@email.com', password: 'password' });
      const dir = await jordan.directory.load();
      const me = dir.users.find((u) => u.name === 'Jordan Smith')!;
      expect(dir.users.find((u) => u.name === 'Dana Reyes')?.phone).toBe('555-0134');
      const saved = await jordan.directory.updateMember({
        id: me.id,
        name: me.name,
        email: me.email!,
        phone: '555-0199',
      });
      expect(saved.phone).toBe('555-0199');
      const maya = dir.profiles.find((p) => p.name === 'Maya Smith')!;
      expect(maya.care?.medicalNotes).toContain('asthma');
      const care = { emergencyContact: 'Aunt Bea · 555-0111', medicalNotes: 'Peanut allergy' };
      expect((await jordan.directory.updateProfile({ ...maya, care })).care).toEqual(care);
      TestBed.resetTestingModule();

      const priya = setup();
      await priya.auth.signIn({
        clubSlug: SPARTANS_SLUG,
        username: 'priya-patel@spartans.example',
        password: 'password',
      });
      const seen = await priya.directory.load();
      expect(seen.profiles.find((p) => p.id === maya.id)).not.toHaveProperty('care');
      expect(seen.users.find((u) => u.id === me.id)).not.toHaveProperty('phone');
      await expect(priya.directory.updateProfile({ ...maya, care })).rejects.toThrow();
    });

    it('is the same in SQL (can_see_player_care) as in TypeScript (canSeePlayerCare)', async () => {
      const club = setup();
      await club.auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'sam@spartans.example', password: 'password' });
      const { users, profiles } = await club.directory.load();
      const candidates = profiles.filter((p) => ['U12G', 'U14B', 'U18B'].includes(p.team));
      TestBed.resetTestingModule();
      for (const username of [
        'jordan.smith@email.com',
        'dana@spartans.example',
        'mike@spartans.example',
        'eli.smith@email.com',
      ]) {
        const { auth } = setup();
        const { userId } = await auth.signIn({ clubSlug: SPARTANS_SLUG, username, password: 'password' });
        const me = users.find((u) => u.id === userId)!;
        const client = TestBed.inject(SupabaseClients).active().client;
        for (const p of candidates) {
          const { data } = await client.rpc('can_see_player_care', { p_profile: p.id });
          expect(data, `${username} ${p.name}`).toBe(canSeePlayerCare(me, p));
        }
        TestBed.resetTestingModule();
      }
    }, 60_000);
  });

  describe('who RSVPs for whom', () => {
    it('is the same in SQL (can_rsvp) as in TypeScript (canRsvp)', async () => {
      const club = setup();
      await club.auth.signIn({ clubSlug: SPARTANS_SLUG, username: 'sam@spartans.example', password: 'password' });
      const { users, profiles, teams } = await club.directory.load();
      const all = await club.schedule.listEvents();
      const events = ['U12G', 'U18B', 'ALL'].map((team) => all.find((e) => e.team === team)!);
      const candidates = profiles.filter((p) => p.team === 'U12G' || p.team === 'U18B').map((p) => p.id);
      TestBed.resetTestingModule();
      for (const username of ['jordan.smith@email.com', 'dana@spartans.example', 'eli.smith@email.com']) {
        const { auth } = setup();
        const { userId } = await auth.signIn({ clubSlug: SPARTANS_SLUG, username, password: 'password' });
        const me = users.find((u) => u.id === userId)!;
        const client = TestBed.inject(SupabaseClients).active().client;
        for (const e of events) {
          for (const attendee of [me.id, ...candidates]) {
            const { data } = await client.rpc('can_rsvp', { p_event: e.id, p_attendee: attendee });
            expect(data, `${username} ${e.team} ${attendee}`).toBe(canRsvp(e, attendee, me, profiles, teams));
          }
        }
        TestBed.resetTestingModule();
      }
    }, 60_000);
  });

  // Last: it ends the Panthers copy's season.
  describe('seasons', () => {
    it('starts a season, keeps the old one read-only and browsable, and deletes only empty teams', async () => {
      const { auth, directory, schedule } = setup();
      await auth.signIn({ clubSlug: PANTHERS_SLUG, username: 'morgan@panthers.example', password: 'password' });
      const before = await directory.load();
      const old = before.seasons.find((s) => !s.endedAt)!;
      expect(before.teams.every((t) => t.season === old.id)).toBe(true);
      await expect(directory.deleteTeam('U13B')).rejects.toThrow('no players and no events');

      const dir = await directory.startSeason({
        name: 'Next',
        teams: [{ from: 'U13B', name: 'U14 Boys', age: 'U14', division: 'Boys', staff: true, players: true }],
      });
      const u14 = dir.teams.find((t) => t.name === 'U14 Boys')!;
      expect(dir.seasons.find((s) => s.id === old.id)?.endedAt).toBeTruthy();
      expect(u14.season).toBe(dir.seasons.find((s) => !s.endedAt)?.id);
      expect(dir.profiles.map((p) => p.name).sort()).toEqual(
        before.profiles
          .filter((p) => p.team === 'U13B')
          .map((p) => p.name)
          .sort(),
      );
      const pat = before.users.find((u) => u.name === 'Pat Kim')!;
      const chris = before.users.find((u) => u.name === 'Chris Obi')!;
      expect(dir.users.find((u) => u.id === pat.id)?.teams).toEqual([]);
      expect(dir.users.find((u) => u.id === chris.id)?.teams).toEqual([u14.id]);

      const past = await directory.loadSeason(old.id);
      expect(past.members['U11G']).toContain(pat.id);
      expect(past.profiles.filter((p) => p.team === 'U13B')).toHaveLength(3);

      const oldEvent = (await schedule.listEvents()).find((e) => e.team === 'U13B')!;
      expect(oldEvent.season).toBe(old.id);
      await expect(schedule.saveEvent({ ...oldEvent, notes: 'moved' })).rejects.toThrow('That season has ended');
      await expect(directory.saveTeam({ id: 'U11G', name: 'Renamed', staffIds: [] })).rejects.toThrow(
        'That season has ended',
      );

      const { directory: withTeam } = await directory.saveTeam({ name: 'U8 Mixed', staffIds: [] });
      const u8 = withTeam.teams.find((t) => t.name === 'U8 Mixed')!;
      expect((await directory.deleteTeam(u8.id)).teams.some((t) => t.id === u8.id)).toBe(false);
    });
  });
});
