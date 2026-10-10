import { Thread, User } from '@aura/shared/models';
import {
  ALL_GROUPS,
  DEFAULT_CLUB_SETTINGS,
  canDeleteMessage,
  canEditEvent,
  canEditMessage,
  canManageThread,
  canPostInThread,
  canReadThread,
  canRemoveMember,
  canResetPassword,
  effectiveMembers,
  includedViaTeam,
} from './permissions';

const users: User[] = [
  { id: 'sam', name: 'Sam Okoro', kind: 'club', teams: [] },
  { id: 'dana', name: 'Dana Reyes', kind: 'staff', teams: ['U12G', 'U14B'] },
  { id: 'jordan', name: 'Jordan Smith', kind: 'parent', teams: ['U12G', 'U18B'] },
  { id: 'eli', name: 'Eli Smith', kind: 'player', teams: ['U18B'] },
];
const [sam, dana, jordan, eli] = users;

function thread(o: Partial<Thread> = {}): Thread {
  return {
    id: 't',
    name: 'Thread',
    scope: 'U12G',
    teams: [],
    include: { ...ALL_GROUPS },
    members: [],
    creatorId: null,
    isDefault: false,
    announceOnly: false,
    messages: [],
    unread: 0,
    ...o,
  };
}

describe('effectiveMembers', () => {
  it('includes creator, individual members and included team groups', () => {
    const t = thread({ creatorId: 'sam', members: ['eli'], teams: ['U12G'] });
    expect([...effectiveMembers(t, users)].sort()).toEqual(['dana', 'eli', 'jordan', 'sam']);
  });

  it('respects excluded groups', () => {
    const t = thread({ teams: ['U12G'], include: { staff: true, parents: false, players: false } });
    expect([...effectiveMembers(t, users)]).toEqual(['dana']);
  });

  it('puts everyone in the club in the club default channel, whatever its teams', () => {
    const t = thread({
      scope: 'club',
      isDefault: true,
      teams: [],
      include: { staff: false, parents: false, players: false },
    });
    expect([...effectiveMembers(t, users)].sort()).toEqual(['dana', 'eli', 'jordan', 'sam']);
    expect([...effectiveMembers({ ...t, isDefault: false }, users)]).toEqual([]);
  });

  it('reports the team someone is included through', () => {
    const t = thread({ teams: ['U18B'] });
    expect(includedViaTeam(t, jordan)).toBe('U18B');
    expect(includedViaTeam(t, dana)).toBeNull();
    expect(includedViaTeam(t, sam)).toBeNull();
  });
});

describe('canManageThread', () => {
  it('never allows editing default channels', () => {
    expect(canManageThread(thread({ isDefault: true }), sam)).toBe(false);
  });

  it('allows club staff, the creator and staff on the scoped team', () => {
    expect(canManageThread(thread(), sam)).toBe(true);
    expect(canManageThread(thread({ creatorId: 'jordan' }), jordan)).toBe(true);
    expect(canManageThread(thread({ scope: 'U12G' }), dana)).toBe(true);
    expect(canManageThread(thread({ scope: 'U18B' }), dana)).toBe(false);
    expect(canManageThread(thread({ scope: 'club' }), dana)).toBe(false);
    expect(canManageThread(thread(), eli)).toBe(false);
  });
});

describe('canEditEvent', () => {
  it('lets club staff edit anything and team staff edit their teams', () => {
    expect(canEditEvent({ team: 'ALL' }, sam)).toBe(true);
    expect(canEditEvent({ team: 'U14B' }, dana)).toBe(true);
    expect(canEditEvent({ team: 'ALL' }, dana)).toBe(false);
    expect(canEditEvent({ team: 'U12G' }, jordan)).toBe(false);
  });
});

describe('reading and posting', () => {
  const everyone = { announcements: 'everyone' as const };
  const teamAnn = thread({ scope: 'U12G', teams: ['U12G'], isDefault: true, announceOnly: true });
  const clubAnn = thread({ scope: 'club', isDefault: true, announceOnly: true });
  const general = thread({ scope: 'U12G', teams: ['U12G'], isDefault: true });

  it('lets club staff read and post in every default channel without being members', () => {
    expect(canReadThread(general, sam, false)).toBe(true);
    expect(canPostInThread(general, sam, false, DEFAULT_CLUB_SETTINGS)).toBe(true);
    expect(canReadThread(thread(), sam, false)).toBe(false);
    expect(canReadThread(general, dana, false)).toBe(false);
  });

  it('keeps announcement channels to staff by default', () => {
    expect(canPostInThread(teamAnn, jordan, true, DEFAULT_CLUB_SETTINGS)).toBe(false);
    expect(canPostInThread(teamAnn, dana, true, DEFAULT_CLUB_SETTINGS)).toBe(true);
    expect(canPostInThread(teamAnn, sam, false, DEFAULT_CLUB_SETTINGS)).toBe(true);
    expect(canPostInThread(clubAnn, dana, true, DEFAULT_CLUB_SETTINGS)).toBe(false);
    expect(canPostInThread(clubAnn, sam, true, DEFAULT_CLUB_SETTINGS)).toBe(true);
    expect(canPostInThread(general, jordan, true, DEFAULT_CLUB_SETTINGS)).toBe(true);
  });

  it('lets everyone in the channel post when the club allows it', () => {
    expect(canPostInThread(teamAnn, jordan, true, everyone)).toBe(true);
    expect(canPostInThread(clubAnn, eli, true, everyone)).toBe(true);
    expect(canPostInThread(teamAnn, eli, false, everyone)).toBe(false);
  });
});

describe('editing and deleting messages', () => {
  const mine = { from: 'jordan' };
  it('lets senders edit and delete their own messages, and staff delete in their threads', () => {
    expect(canEditMessage(mine, jordan)).toBe(true);
    expect(canEditMessage(mine, sam)).toBe(false);
    expect(canEditMessage({ ...mine, deleted: true }, jordan)).toBe(false);
    expect(canDeleteMessage(mine, thread({ scope: 'U12G' }), jordan)).toBe(true);
    expect(canDeleteMessage(mine, thread({ scope: 'U12G' }), dana)).toBe(true);
    expect(canDeleteMessage(mine, thread({ scope: 'U18B' }), dana)).toBe(false);
    expect(canDeleteMessage(mine, thread({ scope: 'club' }), dana)).toBe(false);
    expect(canDeleteMessage(mine, thread({ scope: 'club' }), sam)).toBe(true);
    expect(canDeleteMessage(mine, thread(), eli)).toBe(false);
  });
});

describe('member lifecycle', () => {
  const admin: User = { ...sam, clubAdmin: true };
  const lee: User = { id: 'lee', name: 'Lee Fontaine', kind: 'club', teams: [] };
  const invited: User = { ...jordan, id: 'new', invited: true };

  it('lets club staff reset anyone’s password, and team staff their teams’ families', () => {
    expect(canResetPassword(sam, dana)).toBe(true);
    expect(canResetPassword(dana, jordan)).toBe(true);
    expect(canResetPassword(dana, eli)).toBe(false);
    expect(canResetPassword(dana, sam)).toBe(false);
    expect(canResetPassword(jordan, eli)).toBe(false);
    expect(canResetPassword(sam, sam)).toBe(false);
    expect(canResetPassword(sam, invited)).toBe(false);
  });

  it('lets club staff disable and remove members, except themselves and the club admin', () => {
    expect(canRemoveMember(lee, jordan)).toBe(true);
    expect(canRemoveMember(lee, admin)).toBe(false);
    expect(canRemoveMember(lee, lee)).toBe(false);
    expect(canRemoveMember(lee, invited)).toBe(false);
    expect(canRemoveMember(dana, jordan)).toBe(false);
  });

  it('leaves disabled members out of every thread', () => {
    const withDisabled = users.map((u) => (u.id === 'jordan' ? { ...u, disabled: true } : u));
    const clubWide = thread({ isDefault: true, scope: 'club' });
    expect(effectiveMembers(clubWide, withDisabled).has('jordan')).toBe(false);
    expect(effectiveMembers(thread({ creatorId: 'jordan', members: ['jordan'] }), withDisabled).size).toBe(0);
    expect(effectiveMembers(thread({ teams: ['U12G'] }), withDisabled)).toEqual(new Set(['dana']));
  });
});
