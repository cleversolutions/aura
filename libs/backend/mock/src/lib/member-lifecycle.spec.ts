import { TestBed } from '@angular/core/testing';
import { AuthRepository, ChatRepository, DirectoryRepository, PlatformRepository } from '@aura/backend/api';
import { effectiveMembers } from '@aura/shared/util';
import { SPARTANS_SLUG } from './clubs';
import { provideTestBackend } from './testing';

/** Resetting passwords, disabling and removing members, club staff invites and the club admin. */
describe('mock backend: member lifecycle', () => {
  function setup(initialUserId: string | null = 'sam', platformSignedIn = false) {
    TestBed.configureTestingModule({ providers: provideTestBackend({ initialUserId, platformSignedIn }) });
    return {
      auth: TestBed.inject(AuthRepository),
      directory: TestBed.inject(DirectoryRepository),
      chat: TestBed.inject(ChatRepository),
      platform: TestBed.inject(PlatformRepository),
    };
  }
  const signIn = (auth: AuthRepository, username: string, password: string) =>
    auth.signIn({ clubSlug: SPARTANS_SLUG, username, password });

  it('resets a forgotten password: the old one stops working and the new one must be replaced', async () => {
    const { auth, directory } = setup();
    const reset = await directory.resetPassword('jordan');
    expect(reset.username).toBe('jordan.smith@email.com');
    await expect(signIn(auth, 'jordan.smith@email.com', 'password')).rejects.toThrow();
    expect(await signIn(auth, 'jordan.smith@email.com', reset.temporaryPassword)).toEqual({
      userId: 'jordan',
      mustChangePassword: true,
    });
  });

  it('lets team staff reset their teams’ families only', async () => {
    const { directory } = setup('mike');
    await expect(directory.resetPassword('jordan')).resolves.toMatchObject({ user: { id: 'jordan' } });
    await expect(directory.resetPassword('dana')).rejects.toThrow('reset passwords');
    await expect(directory.resetPassword('mike')).rejects.toThrow('reset passwords');
  });

  it('disables a member: no sign-in and no threads, until enabled again', async () => {
    const { auth, directory, chat } = setup();
    expect(await directory.setMemberDisabled('jordan', true)).toMatchObject({ disabled: true });
    await expect(signIn(auth, 'jordan.smith@email.com', 'password')).rejects.toThrow('This account is disabled.');
    const { users } = await directory.load();
    const carpool = (await chat.listThreads()).find((t) => t.id === 'carpool')!;
    expect(effectiveMembers(carpool, users).has('jordan')).toBe(false);

    expect((await directory.setMemberDisabled('jordan', false)).disabled).toBeUndefined();
    await expect(signIn(auth, 'jordan.smith@email.com', 'password')).resolves.toMatchObject({ userId: 'jordan' });
  });

  it('removes a member: unlinked everywhere, their messages kept from a former member', async () => {
    const { auth, directory, chat } = setup();
    await directory.removeMember('jordan');
    const dir = await directory.load();
    expect(dir.users.some((u) => u.id === 'jordan')).toBe(false);
    expect(dir.profiles.some((p) => p.parentIds.includes('jordan'))).toBe(false);
    const carpool = (await chat.listThreads()).find((t) => t.id === 'carpool')!;
    expect(carpool.creatorId).toBeNull();
    expect(carpool.messages.find((m) => m.text.startsWith('I can drive'))?.from).toBeNull();
    await expect(signIn(auth, 'jordan.smith@email.com', 'password')).rejects.toThrow();

    await directory.removeMember('eli');
    expect((await directory.load()).profiles.find((p) => p.name === 'Eli Smith')).toMatchObject({
      userId: null,
      login: '',
    });
  });

  it('never disables or removes yourself or the club admin, and only club staff do it', async () => {
    const { directory } = setup('lee');
    await expect(directory.setMemberDisabled('lee', true)).rejects.toThrow();
    await expect(directory.removeMember('sam')).rejects.toThrow();
    expect((await directory.load()).users.find((u) => u.id === 'sam')?.clubAdmin).toBe(true);
    TestBed.resetTestingModule();
    await expect(setup('dana').directory.setMemberDisabled('jordan', true)).rejects.toThrow('Only club staff');
  });

  it('lets club staff, and only club staff, invite club staff', async () => {
    const { directory } = setup();
    const invite = await directory.inviteMember({
      kind: 'club',
      title: 'Treasurer',
      name: 'Tia Bank',
      email: 't@x.example',
    });
    expect(invite.user).toMatchObject({ kind: 'club', teams: [], title: 'Treasurer', invited: true });
    TestBed.resetTestingModule();
    await expect(
      setup('dana').directory.inviteMember({ kind: 'club', title: '', name: 'X', email: 'x@x.example' }),
    ).rejects.toThrow('Only club staff can invite club staff.');
  });

  it('lets the platform admin list club staff, change the club admin and reset their password', async () => {
    const { auth, platform } = setup(null, true);
    const spartans = (await platform.listClubs()).find((c) => c.slug === SPARTANS_SLUG)!;
    expect((await platform.listClubStaff(spartans.id)).map((m) => [m.id, m.admin])).toEqual([
      ['lee', false],
      ['sam', true],
    ]);
    await expect(platform.setClubAdmin(spartans.id, 'jordan')).rejects.toThrow('Choose one of the club’s staff.');
    expect(await platform.setClubAdmin(spartans.id, 'lee')).toMatchObject({ adminName: 'Lee Fontaine' });

    const reset = await platform.resetAdminPassword(spartans.id);
    expect(reset.username).toBe('lee@spartans.example');
    await expect(signIn(auth, 'lee@spartans.example', reset.temporaryPassword)).resolves.toMatchObject({
      mustChangePassword: true,
    });
  });
});
