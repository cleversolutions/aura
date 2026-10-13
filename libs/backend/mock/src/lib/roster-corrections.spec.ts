import { TestBed } from '@angular/core/testing';
import { AuthRepository, DirectoryRepository } from '@aura/backend/api';
import { provideTestBackend } from './testing';

/** Link requests, moving and removing players, members' teams, own sign-ins and contact details. */
describe('mock backend: roster corrections', () => {
  function setup(initialUserId = 'sam') {
    TestBed.configureTestingModule({ providers: provideTestBackend({ initialUserId }) });
    return TestBed.inject(DirectoryRepository);
  }

  it('lets the team’s staff approve a link request, and nobody else', async () => {
    const directory = setup('wei-chen');
    const auth = TestBed.inject(AuthRepository);
    const request = await directory.requestPlayerLink({
      name: 'Ada Chen',
      team: 'U12G',
      jersey: '',
      parentId: 'wei-chen',
    });
    await expect(directory.approvePlayer(request.id)).rejects.toThrow('approve players');
    await auth.signInAs('mike');
    await expect(directory.approvePlayer(request.id)).rejects.toThrow('approve players');
    await auth.signInAs('dana');
    await expect(directory.approvePlayer(request.id)).resolves.not.toHaveProperty('pending');
  });

  it('approves and rejects link requests', async () => {
    const directory = setup('sam');
    const a = await directory.requestPlayerLink({ name: 'Ada Chen', team: 'U12G', jersey: '', parentId: 'wei-chen' });
    const b = await directory.requestPlayerLink({ name: 'Bo Chen', team: 'U12G', jersey: '', parentId: 'wei-chen' });
    expect(await directory.approvePlayer(a.id)).not.toHaveProperty('pending');
    await directory.removePlayer(b.id);
    const profiles = (await directory.load()).profiles;
    expect(profiles.find((p) => p.id === a.id)?.pending).toBeUndefined();
    expect(profiles.some((p) => p.id === b.id)).toBe(false);
  });

  it('removes a player with their RSVPs; their parents and sign-in stay', async () => {
    const directory = setup('mike');
    await directory.removePlayer('eli');
    const dir = await directory.load();
    expect(dir.profiles.some((p) => p.id === 'eli')).toBe(false);
    expect(dir.users.some((u) => u.id === 'eli')).toBe(true);
    expect(dir.users.some((u) => u.id === 'jordan')).toBe(true);
    await expect(directory.removePlayer('maya')).rejects.toThrow('remove players');
  });

  it('moves a player: parents and their own sign-in follow, for staff of both teams', async () => {
    const directory = setup('dana');
    await expect(directory.movePlayer('maya', 'U18B')).rejects.toThrow('teams you manage');
    const dir = await directory.movePlayer('maya', 'U14B');
    expect(dir.profiles.find((p) => p.id === 'maya')?.team).toBe('U14B');
    // Jordan has no other player on U12G, so leaves it; Dana (staff) keeps her teams.
    expect(dir.users.find((u) => u.id === 'jordan')?.teams).toEqual(['U14B', 'U18B']);
    expect(dir.users.find((u) => u.id === 'dana')?.teams).toEqual(['U12G', 'U14B']);
  });

  it('moves a player who signs in themselves along with their sign-in', async () => {
    const directory = setup('sam');
    const dir = await directory.movePlayer('eli', 'U16G');
    expect(dir.users.find((u) => u.id === 'eli')?.teams).toEqual(['U16G']);
    // Eli was Jordan's only U18B player; Maya keeps Jordan on U12G.
    expect(dir.users.find((u) => u.id === 'jordan')?.teams).toEqual(['U12G', 'U16G']);
  });

  it('changes a member’s teams: club staff for anyone, team staff for families on their teams', async () => {
    const directory = setup('dana');
    expect((await directory.setMemberTeams('wei-chen', ['U12G', 'U14B'])).teams).toEqual(['U12G', 'U14B']);
    await expect(directory.setMemberTeams('wei-chen', ['U12G', 'U14B', 'U18B'])).rejects.toThrow('U18B');
    await expect(directory.setMemberTeams('mike', ['U18B', 'U12G'])).rejects.toThrow('U12G');

    TestBed.resetTestingModule();
    const club = setup('sam');
    expect((await club.setMemberTeams('mike', ['U12G', 'U18B'])).teams).toEqual(['U12G', 'U18B']);
    await expect(club.setMemberTeams('lee', ['U12G'])).rejects.toThrow('U12G');
  });

  it('gives a player on the roster their own sign-in, once', async () => {
    const directory = setup('dana');
    const invite = await directory.givePlayerSignIn('maya', 'maya@email.com');
    expect(invite.user).toMatchObject({ name: 'Maya Smith', kind: 'player', teams: ['U12G'], invited: true });
    expect((await directory.load()).profiles.find((p) => p.id === 'maya')?.userId).toBe(invite.user.id);
    await expect(directory.givePlayerSignIn('maya', 'maya2@email.com')).rejects.toThrow('already has');
    await expect(directory.givePlayerSignIn('eli', 'eli2@email.com')).rejects.toThrow('invite players');
  });

  it('shows emails by the contacts setting', async () => {
    const directory = setup('sam');
    const auth = TestBed.inject(AuthRepository);
    const invite = await directory.inviteMember({ kind: 'parent', team: 'U12G', name: 'Ola', email: 'ola@x.example' });
    const email = (id: string) => directory.load().then((d) => d.users.find((u) => u.id === id)?.email);
    expect(await email(invite.user.id)).toBe('ola@x.example');

    await auth.signInAs('dana');
    expect(await email(invite.user.id)).toBe('ola@x.example');
    await auth.signInAs('mike');
    expect(await email(invite.user.id)).toBeUndefined();
    await auth.signInAs('jordan');
    expect(await email('jordan')).toBe('jordan.smith@email.com');
    expect(await email(invite.user.id)).toBeUndefined();

    await auth.signInAs('sam');
    await directory.saveSettings({ announcements: 'staff', contacts: 'everyone' });
    await auth.signInAs('jordan');
    expect(await email(invite.user.id)).toBe('ola@x.example');
  });
});
