import { TestBed } from '@angular/core/testing';
import { PlatformRepository } from '@aura/backend/api';
import { PANTHERS_SLUG, SPARTANS_SLUG, provideMockBackend } from '@aura/backend/mock';
import { CLOCK } from '@aura/shared/util';
import { ClubStore } from './club.store';

async function setup(initialUserId: string | null = 'jordan', platformSignedIn = false) {
  TestBed.configureTestingModule({
    providers: [
      provideMockBackend({ latencyMs: 0, replyDelayMs: 0, initialUserId, platformSignedIn }),
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

  describe('clubs and sign-in', () => {
    it('opens a club by link with its branding, signed out', async () => {
      const store = await setup(null);
      expect(await store.open(PANTHERS_SLUG)).toMatchObject({ name: 'Panthers', ink: '#1d2a6b', paper: '#f6c945' });
      expect(store.meId()).toBeNull();
      expect(store.sessionKey()).toBeNull();
      expect(await store.open('nope42')).toBeNull();
      expect(store.club()).toBeNull();
    });

    it('treats the same username in two clubs as two people', async () => {
      const store = await setup(null);
      await store.open(PANTHERS_SLUG);
      await store.signIn('Jordan.Smith@email.com', 'password');
      expect(store.myPlayers().map((p) => p.name)).toEqual(['Sky Smith']);
      expect(store.sessionKey()).toBe(`${PANTHERS_SLUG}:jordan`);

      await store.open(SPARTANS_SLUG);
      expect(store.meId()).toBeNull();
      await store.signIn('jordan.smith@email.com', 'password');
      expect(store.myPlayers().map((p) => p.name)).toEqual(['Maya Smith', 'Eli Smith']);

      // Each club keeps its own session.
      await store.open(PANTHERS_SLUG);
      expect(store.club()?.name).toBe('Panthers');
      expect(store.myPlayers().map((p) => p.name)).toEqual(['Sky Smith']);
    });

    it('rejects a username from another club', async () => {
      const store = await setup(null);
      await store.open(PANTHERS_SLUG);
      await expect(store.signIn('sam@spartans.example', 'password')).rejects.toThrow('don’t match an account');
      expect(store.meId()).toBeNull();
    });

    it('makes a new club admin replace the temporary password', async () => {
      const store = await setup(null, true);
      await TestBed.inject(PlatformRepository).createClub({
        name: 'Northside Aura',
        slug: 'nrth42',
        logoUrl: 'club-logo.svg',
        ink: '#000000',
        paper: '#ffffff',
        logoInk: '#000000',
        logoPaper: '#ffffff',
        adminName: 'Riley Shaw',
        adminEmail: 'riley@northside.example',
        temporaryPassword: 'TEMP-pass-22',
      });
      await store.open('nrth42');
      await store.signIn('riley@northside.example', 'TEMP-pass-22');
      expect(store.mustChangePassword()).toBe(true);
      expect(store.sessionKey()).toBeNull();

      await store.changePassword('my-own-password');
      expect(store.mustChangePassword()).toBe(false);
      expect(store.me()?.name).toBe('Riley Shaw');
      expect(store.isClubStaff()).toBe(true);
      expect(store.teams()).toEqual([]);

      await store.signOut();
      await expect(store.signIn('riley@northside.example', 'TEMP-pass-22')).rejects.toThrow();
      await store.signIn('riley@northside.example', 'my-own-password');
      expect(store.meId()).toBe('admin');
    });

    it('previews a club with sample data for the platform admin', async () => {
      const store = await setup(null, true);
      await store.openPreview(PANTHERS_SLUG);
      expect(store.club()?.name).toBe('Panthers');
      expect(store.preview()).toBe(true);
      expect(store.me()?.name).toBe('Sam Okoro');
      expect(store.teams()).toHaveLength(5);
      expect(store.demoAccounts()).toEqual([]);
    });
  });
});
