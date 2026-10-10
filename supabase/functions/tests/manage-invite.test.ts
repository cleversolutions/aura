import { assertEquals, assertNotEquals, assertRejects } from 'jsr:@std/assert@1';
import { authEmailFor } from '../_shared/auth-identity.ts';
import { cleanup, createClub, invoke, platformAdmin, service, signIn } from './helpers.ts';

Deno.test('manage-invite', async (t) => {
  const admin = await platformAdmin();
  try {
    const { input, club } = await createClub(admin);
    const clubAdmin = await signIn(await authEmailFor(club.id, input.adminEmail), input.temporaryPassword);
    for (const [id, name] of [
      ['U12G', 'U12 Girls'],
      ['U14B', 'U14 Boys'],
    ]) {
      await clubAdmin.from('teams').insert({ club_id: club.id, id, name });
    }
    type Invite = { user: { id: string }; username: string; temporaryPassword: string };
    const invite = async (email: string, kind: string, team = 'U12G') =>
      (await invoke(clubAdmin, 'invite-member', { team, kind, name: 'Someone', email })).data as Invite;
    const coach = await invite('coach@test.example', 'staff');
    const coachClient = await signIn(await authEmailFor(club.id, coach.username), coach.temporaryPassword);
    await service.from('members').update({ invited: false }).eq('id', coach.user.id); // the coach has joined
    const parent = await invite('parent@test.example', 'parent');
    const other = await invite('other@test.example', 'parent', 'U14B');
    const signInAs = async (email: string, password: string) => signIn(await authEmailFor(club.id, email), password);

    await t.step('resends with a new temporary password; the old one stops working', async () => {
      const res = await invoke(coachClient, 'manage-invite', { id: parent.user.id, action: 'resend' });
      assertEquals(res.status, 200, JSON.stringify(res.data));
      const resent = res.data as unknown as Invite;
      assertEquals(resent.username, 'parent@test.example');
      assertNotEquals(resent.temporaryPassword, parent.temporaryPassword);
      await assertRejects(() => signInAs('parent@test.example', parent.temporaryPassword));
      const session = (await (await signInAs('parent@test.example', resent.temporaryPassword)).auth.getSession()).data
        .session!;
      assertEquals(session.user.user_metadata['must_change_password'], true);
    });

    await t.step('team staff edit invites to their teams only', async () => {
      const edit = (id: string, email: string) =>
        invoke(coachClient, 'update-member', { id, name: 'Pat Parent', email });
      assertEquals((await edit(parent.user.id, 'pat@test.example')).status, 200);
      assertEquals((await edit(other.user.id, 'x@test.example')).status, 403);
    });

    await t.step('team staff cannot manage invites to other teams', async () => {
      assertEquals((await invoke(coachClient, 'manage-invite', { id: other.user.id, action: 'resend' })).status, 403);
    });

    await t.step('only invites, not members who joined', async () => {
      const res = await invoke(clubAdmin, 'manage-invite', { id: coach.user.id, action: 'cancel' });
      assertEquals(res.status, 409);
    });

    await t.step('cancels an invite: the member and their sign-in are gone', async () => {
      const res = await invoke(clubAdmin, 'manage-invite', { id: other.user.id, action: 'cancel' });
      assertEquals(res.status, 200, JSON.stringify(res.data));
      const { data } = await service.from('members').select('id').eq('id', other.user.id);
      assertEquals(data, []);
      await assertRejects(() => signInAs('other@test.example', other.temporaryPassword));
      assertEquals((await invoke(clubAdmin, 'manage-invite', { id: other.user.id, action: 'cancel' })).status, 404);
    });
  } finally {
    await cleanup();
  }
});
