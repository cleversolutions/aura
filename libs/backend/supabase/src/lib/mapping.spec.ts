import { FunctionsHttpError, PostgrestError } from '@supabase/supabase-js';
import {
  EventRow,
  dbError,
  fromEventDraft,
  functionError,
  messagesByThread,
  teamIdFor,
  toClub,
  toEvent,
  toRsvpMap,
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
  });

  it('maps members with their teams and leaves out empty optional fields', () => {
    const user = toUser({
      id: 'm1',
      club_id: 'c1',
      user_id: 'u1',
      username: 'jordan.smith@email.com',
      name: 'Jordan Smith',
      kind: 'parent',
      title: null,
      email: 'jordan.smith@email.com',
      invited: false,
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

  it('maps events both ways', () => {
    const event = toEvent(eventRow);
    expect(event).toEqual({
      id: 'e1',
      type: 'game',
      team: 'U12G',
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
  });

  it('builds the RSVP map', () => {
    expect(
      toRsvpMap([
        { event_id: 'e1', attendee_id: 'p1', status: 'going' },
        { event_id: 'e1', attendee_id: 'p2', status: 'out' },
        { event_id: 'e2', attendee_id: 'p1', status: 'going' },
      ]),
    ).toEqual({ e1: { p1: 'going', p2: 'out' }, e2: { p1: 'going' } });
  });

  it('groups messages by thread, oldest first, and maps threads', () => {
    const msg = (id: string, thread: string, at: string) => ({
      id,
      club_id: 'c1',
      thread_id: thread,
      from_member_id: 'm1',
      text: id,
      sent_at: at,
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
  });

  it('derives team ids from names like the mock', () => {
    expect(teamIdFor('U13 Girls')).toBe('U13G');
    expect(teamIdFor(' U9  Boys ')).toBe('U9B');
  });

  it('turns errors into messages for people', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const denied = new PostgrestError({ code: '42501', message: 'rls', details: '', hint: '' });
    expect(dbError(denied).message).toMatch(/permission/);
    const response = new Response(JSON.stringify({ error: 'That link is already taken.' }), { status: 409 });
    expect((await functionError(new FunctionsHttpError(response))).message).toBe('That link is already taken.');
    expect((await functionError(new Error('boom'))).message).toBe('Something went wrong. Try again.');
  });
});
