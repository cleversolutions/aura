import { TestBed } from '@angular/core/testing';
import { provideMockBackend } from '@aura/backend/mock';
import { CLOCK } from '@aura/shared/util';
import { ClubStore } from './club.store';

async function setup(initialUserId = 'jordan') {
  TestBed.configureTestingModule({
    providers: [
      provideMockBackend({ latencyMs: 0, replyDelayMs: 0, initialUserId }),
      { provide: CLOCK, useValue: () => new Date('2026-10-05T12:00:00') },
    ],
  });
  const store = TestBed.inject(ClubStore);
  await store.load();
  return store;
}

describe('ClubStore', () => {
  it('loads the directory and the signed-in parent', async () => {
    const store = await setup();
    expect(store.me()?.name).toBe('Jordan Smith');
    expect(store.persona()).toBe('parent');
    expect(store.myTeams()).toEqual(['U12G', 'U18B']);
    expect(store.myPlayers().map((p) => p.name)).toEqual(['Maya Smith', 'Eli Smith']);
  });

  it('gives club staff every team', async () => {
    const store = await setup('sam');
    expect(store.isClubStaff()).toBe(true);
    expect(store.myTeams()).toEqual(['U10B', 'U12G', 'U14B', 'U16G', 'U18B']);
    expect(store.myPlayers()).toEqual([]);
  });

  it('switches the demo account', async () => {
    const store = await setup();
    await store.switchUser('eli');
    expect(store.persona()).toBe('player');
    expect(store.myPlayers().map((p) => p.id)).toEqual(['eli']);
  });

  it('creates a team with staff', async () => {
    const store = await setup('sam');
    await store.saveTeam({ name: 'U13 Girls', staffIds: ['dana'] });
    expect(store.teamName('U13G')).toBe('U13 Girls');
    expect(store.user('dana')?.teams).toContain('U13G');
    await expect(store.saveTeam({ name: 'U13 Girls', staffIds: [] })).rejects.toThrow('already exists');
  });

  it('records a pending player link', async () => {
    const store = await setup();
    await store.requestPlayerLink({ name: 'Sky Smith', team: 'U10B', jersey: '', parentId: 'jordan' });
    const sky = store.myPlayers().find((p) => p.name === 'Sky Smith');
    expect(sky?.pending).toBe(true);
    expect(sky?.jersey).toBe('–');
  });
});
