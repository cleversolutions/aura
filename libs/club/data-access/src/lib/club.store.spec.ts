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

  it('invites a member who signs in with the temporary password and then accepts', async () => {
    const store = await setup('dana');
    const invite = await store.inviteMember({ team: 'U12G', kind: 'parent', name: 'Rae Moss', email: 'rae@x.example' });
    expect(invite.username).toBe('rae@x.example');
    expect(invite.temporaryPassword).toMatch(/^[A-Z]{4}-[a-z2-9]{4}-[2-9]{2}$/);
    expect(store.user(invite.user.id)?.invited).toBe(true);
    await expect(
      store.inviteMember({ team: 'U12G', kind: 'parent', name: 'Rae', email: 'RAE@x.example' }),
    ).rejects.toThrow('already has an account');

    await store.signOut();
    await store.signIn('rae@x.example', invite.temporaryPassword);
    expect(store.mustChangePassword()).toBe(true);
    await store.changePassword('rae-own-password');
    expect(store.me()?.invited).toBeUndefined();
  });

  it('returns the sign-in for new staff added with a team', async () => {
    const store = await setup('sam');
    const invite = await store.saveTeam({
      name: 'U9 Boys',
      staffIds: [],
      newStaff: { name: 'Ty Cole', email: 'ty@x.example' },
    });
    expect(invite?.user).toMatchObject({ name: 'Ty Cole', kind: 'staff', teams: ['U9B'], invited: true });
    expect(await store.saveTeam({ id: 'U9B', staffIds: [] })).toBeNull();
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

  it('lets members edit themselves and club staff edit anyone, moving the sign-in', async () => {
    const store = await setup('jordan');
    await store.updateMember({ id: 'jordan', name: 'Jordan A. Smith', email: 'jordan@new.example' });
    expect(store.me()).toMatchObject({ name: 'Jordan A. Smith', email: 'jordan@new.example' });
    await expect(store.updateMember({ id: 'dana', name: 'X', email: 'x@x.example' })).rejects.toThrow(
      'Only club staff',
    );

    await store.signOut();
    await store.signIn('sam@spartans.example', 'password');
    await store.updateMember({ id: 'dana', name: 'Dana R.', email: 'dana@new.example', title: 'ignored' });
    expect(store.user('dana')).toMatchObject({ name: 'Dana R.', email: 'dana@new.example' });
    expect(store.user('dana')?.title).toBeUndefined();
    await store.updateMember({ id: 'sam', name: 'Sam Okoro', email: 'sam@spartans.example', title: 'President' });
    expect(store.me()?.title).toBe('President');
    await expect(store.updateMember({ id: 'lee', name: 'Lee', email: 'DANA@new.example' })).rejects.toThrow(
      'already has an account',
    );

    await store.signOut();
    await store.signIn('dana@new.example', 'password');
    expect(store.meId()).toBe('dana');
  });

  it('lets whoever could invite someone resend or cancel their invite until they join', async () => {
    const store = await setup('dana');
    const rae = await store.inviteMember({ team: 'U12G', kind: 'parent', name: 'Rae', email: 'rae@x.example' });
    const ty = await store.inviteMember({ team: 'U14B', kind: 'parent', name: 'Ty', email: 'ty@x.example' });
    expect(store.canManageInvite(rae.user)).toBe(true);
    await store.updateMember({ id: rae.user.id, name: 'Rae Moss', email: 'rae@x.example' });

    const resent = await store.resendInvite(rae.user.id);
    expect(resent.temporaryPassword).not.toBe(rae.temporaryPassword);
    await expect(store.cancelInvite('jordan')).rejects.toThrow('already joined');
    await store.cancelInvite(ty.user.id);
    expect(store.user(ty.user.id)).toBeUndefined();

    await store.signOut();
    await expect(store.signIn('rae@x.example', rae.temporaryPassword)).rejects.toThrow();
    await store.signIn('rae@x.example', resent.temporaryPassword);
    await store.changePassword('rae-own-password');
    expect(store.me()?.name).toBe('Rae Moss');
    await expect(store.resendInvite(store.meId()!)).rejects.toThrow();
    await expect(store.signIn('ty@x.example', ty.temporaryPassword)).rejects.toThrow();
  });
});
