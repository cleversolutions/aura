import { assert, assertEquals, assertNotEquals, assertRejects } from 'jsr:@std/assert@1';
import { authEmailFor } from '../_shared/auth-identity.ts';
import { cleanup, createClub, invoke, platformAdmin, service, signIn } from './helpers.ts';

Deno.test('manage-member', async (t) => {
  const admin = await platformAdmin();
  try {
    const { input, club } = await createClub(admin);
    const signInAs = async (email: string, password: string) => signIn(await authEmailFor(club.id, email), password);
    const clubAdmin = await signInAs(input.adminEmail, input.temporaryPassword);
    const adminId = (await clubAdmin.auth.getSession()).data.session!.user.app_metadata['member_id'] as string;
    for (const [id, name] of [
      ['U12G', 'U12 Girls'],
      ['U14B', 'U14 Boys'],
    ]) {
      await clubAdmin.from('teams').insert({ club_id: club.id, id, name });
    }
    type Invite = { user: { id: string }; username: string; temporaryPassword: string };
    /** Invites someone and has them join, so they are a member rather than an invite. */
    const join = async (email: string, kind: string, team = 'U12G') => {
      const body = kind === 'club' ? { kind, name: email, email } : { team, kind, name: email, email };
      const invite = (await invoke(clubAdmin, 'invite-member', body)).data as Invite;
      await service.from('members').update({ invited: false }).eq('id', invite.user.id);
      return { ...invite, client: await signInAs(email, invite.temporaryPassword) };
    };
    const coach = await join('coach@test.example', 'staff');
    const parent = await join('parent@test.example', 'parent');
    const otherParent = await join('other@test.example', 'parent', 'U14B');
    const registrar = await join('reg@test.example', 'club');
    const manage = (client: typeof clubAdmin, id: string, action: string) =>
      invoke(client, 'manage-member', { id, action });

    await t.step('team staff reset a parent’s password on their team', async () => {
      const res = await manage(coach.client, parent.user.id, 'reset-password');
      assertEquals(res.status, 200, JSON.stringify(res.data));
      const reset = res.data as unknown as Invite;
      assertEquals(reset.username, 'parent@test.example');
      assertNotEquals(reset.temporaryPassword, parent.temporaryPassword);
      await assertRejects(() => signInAs('parent@test.example', parent.temporaryPassword));
      const session = (await (await signInAs('parent@test.example', reset.temporaryPassword)).auth.getSession()).data
        .session!;
      assertEquals(session.user.user_metadata['must_change_password'], true);
      parent.client = await signInAs('parent@test.example', reset.temporaryPassword);
    });

    await t.step('team staff cannot reset other teams’ families, staff, or invites', async () => {
      assertEquals((await manage(coach.client, otherParent.user.id, 'reset-password')).status, 403);
      assertEquals((await manage(coach.client, registrar.user.id, 'reset-password')).status, 403);
      const invited = (
        await invoke(clubAdmin, 'invite-member', { team: 'U12G', kind: 'parent', name: 'I', email: 'i@test.example' })
      ).data as Invite;
      assertEquals((await manage(clubAdmin, invited.user.id, 'reset-password')).status, 409);
    });

    await t.step('parents cannot manage members', async () => {
      assertEquals((await manage(parent.client, coach.user.id, 'reset-password')).status, 403);
      assertEquals((await manage(parent.client, coach.user.id, 'disable')).status, 403);
    });

    await t.step('team staff make a parent on their team team staff; club staff make them a parent again', async () => {
      const joe = await join('joe@test.example', 'parent');
      const role = (client: typeof clubAdmin, id: string, kind: string) =>
        invoke(client, 'manage-member', { id, action: 'role', kind });
      const inviteAsJoe = (email: string) =>
        invoke(joe.client, 'invite-member', { team: 'U12G', kind: 'parent', name: 'Kid’s parent', email });
      assertEquals((await inviteAsJoe('a@test.example')).status, 403);

      // Not parents, not other teams' parents, and team staff never make anyone a parent.
      assertEquals((await role(parent.client, joe.user.id, 'staff')).status, 403);
      assertEquals((await role(coach.client, otherParent.user.id, 'staff')).status, 403);
      assertEquals((await role(coach.client, joe.user.id, 'club')).status, 400);

      const made = await role(coach.client, joe.user.id, 'staff');
      assertEquals(made.status, 200, JSON.stringify(made.data));
      assertEquals([made.data['kind'], made.data['teams']], ['staff', ['U12G']]);
      // Same sign-in, now with team staff's powers.
      assertEquals((await inviteAsJoe('b@test.example')).status, 200);
      await invoke(coach.client, 'update-member', { id: joe.user.id, title: 'Head Coach' });
      assertEquals((await role(coach.client, joe.user.id, 'parent')).status, 403);
      assertEquals((await role(joe.client, joe.user.id, 'parent')).status, 403);

      const back = await role(clubAdmin, joe.user.id, 'parent');
      assertEquals(back.status, 200, JSON.stringify(back.data));
      assertEquals([back.data['kind'], back.data['title']], ['parent', undefined]);
      assertEquals((await inviteAsJoe('c@test.example')).status, 403);

      // Invites too, and never club staff.
      const invited = (
        await invoke(coach.client, 'invite-member', {
          team: 'U12G',
          kind: 'parent',
          name: 'Al',
          email: 'al@test.example',
        })
      ).data as Invite;
      assertEquals((await role(coach.client, invited.user.id, 'staff')).data['kind'], 'staff');
      assertEquals((await role(clubAdmin, registrar.user.id, 'parent')).status, 403);
    });

    await t.step('club staff disable a member: no sign-in and no access; enabling restores both', async () => {
      const before = await coach.client.from('members').select('id');
      assert((before.data ?? []).length > 0);
      const res = await manage(clubAdmin, coach.user.id, 'disable');
      assertEquals(res.status, 200, JSON.stringify(res.data));
      assertEquals(res.data['disabled'], true);
      // The open session reads nothing, and the ban rejects it at the functions.
      assertEquals((await coach.client.from('members').select('id')).data, []);
      assertEquals((await manage(coach.client, parent.user.id, 'reset-password')).status, 401);
      await assertRejects(() => signInAs('coach@test.example', coach.temporaryPassword));

      const enabled = await manage(clubAdmin, coach.user.id, 'enable');
      assertEquals(enabled.status, 200, JSON.stringify(enabled.data));
      assertEquals(enabled.data['disabled'], undefined);
      coach.client = await signInAs('coach@test.example', coach.temporaryPassword);
      assert(((await coach.client.from('members').select('id')).data ?? []).length > 0);
    });

    await t.step('nobody disables or removes themselves or the club admin; team staff not at all', async () => {
      assertEquals((await manage(clubAdmin, adminId, 'disable')).status, 403);
      assertEquals((await manage(registrar.client, adminId, 'delete')).status, 403);
      assertEquals((await manage(registrar.client, registrar.user.id, 'disable')).status, 403);
      assertEquals((await manage(coach.client, parent.user.id, 'disable')).status, 403);
    });

    await t.step('club staff remove a member; their messages stay, from a former member', async () => {
      const thread = (
        await service
          .from('threads')
          .select('id')
          .eq('club_id', club.id)
          .eq('scope', 'U12G')
          .eq('name', '#general')
          .single()
      ).data!;
      const sent = await parent.client
        .from('messages')
        .insert({ club_id: club.id, thread_id: thread.id, from_member_id: parent.user.id, text: 'Bye all' })
        .select('id')
        .single();
      assertEquals(sent.error, null);
      const profile = (
        await clubAdmin.rpc('add_player', {
          p_team: 'U12G',
          p_name: 'Kid',
          p_jersey: '3',
          p_parents: [parent.user.id],
          p_user_member: null,
        })
      ).data as string;

      const res = await manage(clubAdmin, parent.user.id, 'delete');
      assertEquals(res.status, 200, JSON.stringify(res.data));
      assertEquals((await service.from('members').select('id').eq('id', parent.user.id)).data, []);
      const message = (await service.from('messages').select('from_member_id, text').eq('id', sent.data!.id).single())
        .data;
      assertEquals(message, { from_member_id: null, text: 'Bye all' });
      assertEquals((await service.from('player_parents').select('member_id').eq('profile_id', profile)).data, []);
      assertEquals((await service.from('player_profiles').select('id').eq('id', profile)).data?.length, 1);
      await assertRejects(() => signInAs('parent@test.example', parent.temporaryPassword));
      assertEquals((await manage(clubAdmin, parent.user.id, 'delete')).status, 404);
    });

    await t.step('the platform admin resets the club admin’s password', async () => {
      const res = await invoke(admin, 'manage-member', { club: club.id, action: 'reset-password' });
      assertEquals(res.status, 200, JSON.stringify(res.data));
      const reset = res.data as unknown as Invite;
      assertEquals(reset.username, input.adminEmail);
      await signInAs(input.adminEmail, reset.temporaryPassword);
      await assertRejects(() => signInAs(input.adminEmail, input.temporaryPassword));
      // Their open sessions end too.
      assert((await clubAdmin.auth.getUser()).error);
      assertEquals((await invoke(admin, 'manage-member', { club: club.id, action: 'disable' })).status, 403);
    });

    await t.step('the platform admin makes another club staff member the club admin', async () => {
      const res = await invoke(admin, 'update-club', { id: club.id, adminMemberId: registrar.user.id });
      assertEquals(res.status, 200, JSON.stringify(res.data));
      assertEquals(res.data['adminEmail'], 'reg@test.example');
      const { data } = await admin.rpc('platform_club_staff', { p_club: club.id });
      const staff = data as { id: string; is_admin: boolean }[];
      assertEquals(staff.find((s) => s.is_admin)?.id, registrar.user.id);
      assertEquals(staff.length, 2);
      // Only club staff can be the admin.
      assertEquals((await invoke(admin, 'update-club', { id: club.id, adminMemberId: coach.user.id })).status, 404);
      // Club staff don't choose the admin. (The old admin's session ended with the password reset.)
      assertEquals(
        (await invoke(registrar.client, 'update-club', { id: club.id, adminMemberId: adminId })).status,
        403,
      );
    });
  } finally {
    await cleanup();
  }
});
