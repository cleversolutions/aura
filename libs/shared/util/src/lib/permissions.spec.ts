import { Thread, User } from '@aura/shared/models';
import { ALL_GROUPS, canEditEvent, canManageThread, effectiveMembers, includedViaTeam } from './permissions';

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
