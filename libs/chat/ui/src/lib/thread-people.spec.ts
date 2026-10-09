import { User } from '@aura/shared/models';
import { ALL_GROUPS } from '@aura/shared/util';
import { threadPeopleRows } from './thread-people';

const users: User[] = [
  { id: 'jordan', name: 'Jordan Smith', kind: 'parent', teams: ['U12G'] },
  { id: 'priya', name: 'Priya Patel', kind: 'parent', teams: ['U12G'] },
  { id: 'dana', name: 'Dana Reyes', kind: 'staff', teams: ['U12G'] },
  { id: 'wei', name: 'Wei Chen', kind: 'parent', teams: ['U12G'] },
  { id: 'mike', name: 'Mike Tran', kind: 'staff', teams: ['U18B'] },
];

const base = { scope: 'U12G', creatorId: 'jordan', meId: 'jordan', locked: false, search: '' };

describe('threadPeopleRows', () => {
  it('lists team members except the creator, explicit first, team-included last', () => {
    const form = {
      teams: ['U12G'],
      include: { staff: true, parents: false, players: false },
      members: ['wei'],
      creatorId: 'jordan',
    };
    const rows = threadPeopleRows(form, users, base);
    expect(rows.map((r) => r.user.id)).toEqual(['wei', 'priya', 'dana']);
    expect(rows.find((r) => r.user.id === 'dana')?.viaTeam).toBe('U12G');
  });

  it('only shows explicit members when locked', () => {
    const form = { teams: [], include: { ...ALL_GROUPS }, members: ['priya'], creatorId: 'jordan' };
    expect(threadPeopleRows(form, users, { ...base, locked: true }).map((r) => r.user.id)).toEqual(['priya']);
  });

  it('filters by search and keeps everyone for club scope', () => {
    const form = { teams: [], include: { ...ALL_GROUPS }, members: [], creatorId: 'jordan' };
    expect(threadPeopleRows(form, users, { ...base, scope: 'club', search: 'tran' }).map((r) => r.user.id)).toEqual([
      'mike',
    ]);
  });
});
