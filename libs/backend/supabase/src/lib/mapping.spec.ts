import { FunctionsHttpError, PostgrestError } from '@supabase/supabase-js';
import {
  EventRow,
  dbError,
  fromEventDraft,
  functionError,
  messagesByThread,
  toClub,
  toClubAccount,
  toEvent,
  toMessage,
  toRsvpMap,
  toSettings,
  toDirectory,
  toTeam,
  toThread,
  toUser,
} from './mapping';

const eventRow: EventRow = {
  id: 'e1',
  club_id: 'c1',
  type: 'game',
  team: 'U12G',
  title: null,
  opponent: 'Westdale Wolves',
  home: true,
  date: '2026-10-03',
  time: '10:00:00',
  tbd: false,
  location: 'Court 1',
  notes: '',
  score_us: 42,
  score_them: 38,
  season_id: 's1',
  cancelled: false,
  end_time: null,
  arrive_by: null,
  series_id: null,
};

describe('mapping', () => {
  it('maps public club branding, with icons only when both exist', () => {
    const row = {
      id: 'c1',
      slug: 'k3v9qp',
      name: 'Spartans',
      logo_url: 'club-logo.svg',
      ink: '#000000',
      paper: '#ffffff',
      icon_192_url: null,
      icon_512_url: null,
      archived_at: null,
    };
    expect(toClub(row)).toEqual({
      id: 'c1',
      slug: 'k3v9qp',
      name: 'Spartans',
      logoUrl: 'club-logo.svg',
      ink: '#000000',
      paper: '#ffffff',
    });
    expect(toClub({ ...row, icon_192_url: 'a.png', icon_512_url: 'b.png' }).icons).toEqual({
      size192: 'a.png',
      size512: 'b.png',
    });
    expect(toClub({ ...row, archived_at: '2026-10-11T12:00:00Z' }).archivedAt).toBe('2026-10-11T12:00:00Z');
  });

  it('maps the platform admin’s clubs with their counts', () => {
    const account = toClubAccount({
      id: 'c1',
      slug: 'k3v9qp',
      name: 'Spartans',
      logo_url: 'club-logo.svg',
      ink: '#000000',
      paper: '#ffffff',
      logo_ink: '#000000',
      logo_paper: '#ffffff',
      icon_192_url: null,
      icon_512_url: null,
      created_at: '2026-08-01T00:00:00Z',
      archived_at: null,
      admin_name: 'Sam Okoro',
      admin_email: 'sam@spartans.example',
      member_count: 12,
      invited_count: 3,
      team_count: 2,
    });
    expect(account.archivedAt).toBeUndefined();
    expect(account.counts).toEqual({ members: 12, invited: 3, teams: 2 });
    expect(account.adminName).toBe('Sam Okoro');
  });

  it('maps members with their teams and leaves out empty optional fields', () => {
    const user = toUser({
      id: 'm1',
      name: 'Jordan Smith',
      kind: 'parent',
      title: null,
      email: 'jordan.smith@email.com',
      invited: false,
      disabled: false,
      team_members: [{ team_id: 'U18B' }, { team_id: 'U12G' }],
    });
    expect(user).toEqual({
      id: 'm1',
      name: 'Jordan Smith',
      kind: 'parent',
      teams: ['U12G', 'U18B'],
      email: 'jordan.smith@email.com',
    });
  });

  it('marks disabled members and the club admin', () => {
    const row = {
      id: 'm2',
      name: 'Sam Okoro',
      kind: 'club',
      title: 'Director',
      email: 'sam@x.example',
      invited: false,
      disabled: true,
    };
    expect(toUser(row, 'm2')).toMatchObject({ disabled: true, clubAdmin: true });
    expect(toUser({ ...row, disabled: false }, 'm1')).not.toHaveProperty('clubAdmin');
    expect(toUser({ ...row, disabled: false }, 'm1')).not.toHaveProperty('disabled');
  });

  it('maps messages from former members', () => {
    expect(toMessage({ id: 'x', from_member_id: null, text: 'Bye', sent_at: '2026-10-10T10:00:00Z' }).from).toBeNull();
  });

  it('maps events both ways', () => {
    const event = toEvent(eventRow);
    expect(event).toEqual({
      id: 'e1',
      type: 'game',
      team: 'U12G',
      season: 's1',
      opponent: 'Westdale Wolves',
      home: true,
      date: '2026-10-03',
      time: '10:00',
      location: 'Court 1',
      notes: '',
      score: { us: 42, them: 38 },
    });
    const row = fromEventDraft({ ...event, tbd: true, date: undefined, time: undefined, score: undefined }, 'c1');
    expect(row).toMatchObject({ club_id: 'c1', tbd: true, date: null, time: null, score_us: null, title: null });
    expect(row).not.toHaveProperty('id');
    expect(row.cancelled).toBe(false);
    expect(toEvent({ ...eventRow, cancelled: true }).cancelled).toBe(true);
    expect(fromEventDraft({ ...event, cancelled: true }, 'c1').cancelled).toBe(true);
  });

  it('maps end and arrive-by times and series', () => {
    const event = toEvent({ ...eventRow, end_time: '11:30:00', arrive_by: '09:30:00', series_id: 'r1' });
    expect(event).toMatchObject({ endTime: '11:30', arriveBy: '09:30', seriesId: 'r1' });
    expect(fromEventDraft(event, 'c1')).toMatchObject({ end_time: '11:30', arrive_by: '09:30', series_id: 'r1' });
    expect(fromEventDraft(toEvent(eventRow), 'c1')).toMatchObject({ end_time: null, arrive_by: null, series_id: null });
  });

  it('builds the RSVP map', () => {
    expect(
      toRsvpMap([
        { event_id: 'e1', attendee_id: 'p1', status: 'going', note: '' },
        { event_id: 'e1', attendee_id: 'p2', status: 'out', note: 'Sick' },
        { event_id: 'e2', attendee_id: 'p1', status: 'going', note: '' },
      ]),
    ).toEqual({
      e1: { p1: { status: 'going' }, p2: { status: 'out', note: 'Sick' } },
      e2: { p1: { status: 'going' } },
    });
  });

  it('groups messages by thread, oldest first, and maps threads', () => {
    const msg = (id: string, thread: string, at: string) => ({
      id,
      club_id: 'c1',
      thread_id: thread,
      from_member_id: 'm1',
      text: id,
      sent_at: at,
      edited_at: null,
      deleted_at: null,
    });
    const grouped = messagesByThread([
      msg('b', 't1', '2026-10-05T10:00:00+00:00'),
      msg('a', 't1', '2026-10-05T09:00:00+00:00'),
      msg('c', 't2', '2026-10-05T09:30:00+00:00'),
    ]);
    expect(grouped.get('t1')?.map((m) => m.id)).toEqual(['a', 'b']);
    expect(grouped.get('t1')?.[0].sentAt).toBe('2026-10-05T09:00:00.000Z');

    const thread = toThread(
      {
        id: 't1',
        name: 'Carpool',
        scope: 'U12G',
        teams: [],
        include_staff: true,
        include_parents: false,
        include_players: true,
        creator_member_id: null as unknown as string,
        is_default: false,
        announce_only: false,
        created_at: '2026-10-05T09:00:00+00:00',
        members: ['m2'],
        unread: 2,
      },
      grouped.get('t1') ?? [],
    );
    expect(thread).toMatchObject({
      include: { staff: true, parents: false, players: true },
      creatorId: null,
      members: ['m2'],
      unread: 2,
    });
    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[0]).not.toHaveProperty('editedAt');
    expect(thread.messages[0]).not.toHaveProperty('deleted');
  });

  it('maps edited and deleted messages, and club settings with their defaults', () => {
    const row = { id: 'm', from_member_id: 'u', text: '', sent_at: '2026-10-05T09:00:00+00:00' };
    expect(toMessage({ ...row, edited_at: '2026-10-05T09:05:00+00:00', deleted_at: null })).toMatchObject({
      editedAt: '2026-10-05T09:05:00.000Z',
    });
    expect(toMessage({ ...row, deleted_at: '2026-10-05T09:06:00+00:00' })).toMatchObject({ deleted: true });
    expect(toSettings(null)).toEqual({ announcements: 'staff', contacts: 'staff' });
    expect(toSettings({ announcements: 'everyone', contacts: 'everyone' })).toEqual({
      announcements: 'everyone',
      contacts: 'everyone',
    });
  });

  it('maps teams with their season, and keeps profiles to the current season', () => {
    expect(toTeam({ id: 't1', name: 'U11 Boys Red', season_id: 's2', age: 'U11', division: null })).toEqual({
      id: 't1',
      name: 'U11 Boys Red',
      season: 's2',
      age: 'U11',
    });
    const club = { id: 'c1', slug: 'k3v9qp', name: 'Spartans', admin_member_id: null } as Parameters<
      typeof toDirectory
    >[0];
    const profile = {
      id: 'p1',
      club_id: 'c1',
      name: 'Eli',
      jersey: '7',
      pending: false,
      user_member_id: null,
      player_parents: [],
    };
    const dir = toDirectory(
      club,
      [
        { id: 's1', name: '2025–26', started_at: '2025-09-01', ended_at: '2026-08-01' },
        { id: 's2', name: '2026–27', started_at: '2026-08-01', ended_at: null },
      ],
      [
        { id: 'U10B', name: 'U10 Boys', season_id: 's1', age: 'U10', division: 'Boys' },
        { id: 't1', name: 'U11 Boys', season_id: 's2', age: 'U11', division: 'Boys' },
      ],
      [{ id: 'm1', name: 'Pat', kind: 'parent', title: null, invited: false, disabled: false }],
      [{ id: 'm1', email: 'pat@x.example', phone: '555-0101' }],
      [
        { ...profile, team_id: 'U10B' },
        {
          ...profile,
          id: 'p2',
          team_id: 't1',
          player_care: [{ emergency_contact: 'Gran · 555-0100', medical_notes: 'Asthma' }],
        },
      ] as Parameters<typeof toDirectory>[5],
      null,
    );
    expect(dir.seasons).toEqual([
      { id: 's1', name: '2025–26', startedAt: '2025-09-01', endedAt: '2026-08-01' },
      { id: 's2', name: '2026–27', startedAt: '2026-08-01' },
    ]);
    expect(dir.teams.map((t) => t.id)).toEqual(['U10B', 't1']);
    expect(dir.profiles.map((p) => p.id)).toEqual(['p2']);
    expect(dir.profiles[0].care).toEqual({ emergencyContact: 'Gran · 555-0100', medicalNotes: 'Asthma' });
    expect(dir.users[0]).toMatchObject({ email: 'pat@x.example', phone: '555-0101' });
  });

  it('turns errors into messages for people', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const denied = new PostgrestError({ code: '42501', message: 'rls', details: '', hint: '' });
    expect(dbError(denied).message).toMatch(/permission/);
    const ours = new PostgrestError({ code: 'P0001', message: 'That season has ended.', details: '', hint: '' });
    expect(dbError(ours).message).toBe('That season has ended.');
    const response = new Response(JSON.stringify({ error: 'That link is already taken.' }), { status: 409 });
    expect((await functionError(new FunctionsHttpError(response))).message).toBe('That link is already taken.');
    expect((await functionError(new Error('boom'))).message).toBe('Something went wrong. Try again.');
  });
});
