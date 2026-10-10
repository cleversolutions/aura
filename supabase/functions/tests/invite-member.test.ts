import { assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { authEmailFor } from '../_shared/auth-identity.ts';
import { cleanup, createClub, invoke, platformAdmin, service, signIn } from './helpers.ts';

Deno.test('invite-member', async (t) => {
  const admin = await platformAdmin();
  try {
    const { input, club } = await createClub(admin);
    const clubAdmin = await signIn(await authEmailFor(club.id, input.adminEmail), input.temporaryPassword);
    for (const [id, name] of [
      ['U12G', 'U12 Girls'],
      ['U14B', 'U14 Boys'],
    ]) {
      const { error } = await clubAdmin.from('teams').insert({ club_id: club.id, id, name });
      if (error) throw error;
    }

    let coachPassword = '';
    await t.step('club staff invite team staff, who can then sign in', async () => {
      const res = await invoke(clubAdmin, 'invite-member', {
        team: 'U12G',
        kind: 'staff',
        name: 'Kim Coach',
        email: 'kim@test.example',
      });
      assertEquals(res.status, 200, JSON.stringify(res.data));
      const user = res.data['user'] as Record<string, unknown>;
      assertEquals(
        { ...user, id: '' },
        {
          id: '',
          name: 'Kim Coach',
          kind: 'staff',
          teams: ['U12G'],
          email: 'kim@test.example',
          invited: true,
        },
      );
      assertEquals(res.data['username'], 'kim@test.example');
      coachPassword = res.data['temporaryPassword'] as string;
      assertMatch(coachPassword, /^[A-Z]{4}-[a-z2-9]{4}-[2-9]{2}$/);

      const session = (
        await (await signIn(await authEmailFor(club.id, 'kim@test.example'), coachPassword)).auth.getSession()
      ).data.session!;
      assertEquals(session.user.app_metadata['club_id'], club.id);
      assertEquals(session.user.app_metadata['member_id'], user['id']);
      assertEquals(session.user.user_metadata['must_change_password'], true);
    });

    const coach = await signIn(await authEmailFor(club.id, 'kim@test.example'), coachPassword);

    let parentPassword = '';
    await t.step('team staff invite to their own team', async () => {
      const res = await invoke(coach, 'invite-member', {
        team: 'U12G',
        kind: 'parent',
        name: 'Pat Parent',
        email: 'pat@test.example',
      });
      assertEquals(res.status, 200, JSON.stringify(res.data));
      parentPassword = res.data['temporaryPassword'] as string;
      const { data } = await service
        .from('team_members')
        .select('team_id')
        .eq('member_id', (res.data['user'] as { id: string }).id);
      assertEquals(data, [{ team_id: 'U12G' }]);
    });

    await t.step('team staff cannot invite to another team', async () => {
      const res = await invoke(coach, 'invite-member', {
        team: 'U14B',
        kind: 'parent',
        name: 'X',
        email: 'x@test.example',
      });
      assertEquals(res.status, 403);
    });

    await t.step('parents cannot invite', async () => {
      const parent = await signIn(await authEmailFor(club.id, 'pat@test.example'), parentPassword);
      const res = await invoke(parent, 'invite-member', {
        team: 'U12G',
        kind: 'parent',
        name: 'X',
        email: 'x@test.example',
      });
      assertEquals(res.status, 403);
    });

    await t.step('rejects a username already used at the club', async () => {
      const res = await invoke(clubAdmin, 'invite-member', {
        team: 'U14B',
        kind: 'parent',
        name: 'Kim',
        email: 'KIM@test.example',
      });
      assertEquals(res.status, 409);
    });

    await t.step('club staff invite club staff, with a title and no team', async () => {
      const res = await invoke(clubAdmin, 'invite-member', {
        kind: 'club',
        title: 'Registrar',
        name: 'Reg Istrar',
        email: 'reg@test.example',
      });
      assertEquals(res.status, 200, JSON.stringify(res.data));
      const user = res.data['user'] as Record<string, unknown>;
      assertEquals(
        { ...user, id: '' },
        {
          id: '',
          name: 'Reg Istrar',
          kind: 'club',
          teams: [],
          title: 'Registrar',
          email: 'reg@test.example',
          invited: true,
        },
      );
      const { data } = await service
        .from('members')
        .select('kind, title')
        .eq('id', user['id'] as string)
        .single();
      assertEquals(data, { kind: 'club', title: 'Registrar' });
    });

    await t.step('team staff cannot invite club staff', async () => {
      const res = await invoke(coach, 'invite-member', { kind: 'club', name: 'X', email: 'y@test.example' });
      assertEquals(res.status, 403);
    });

    await t.step('team staff give a player on the roster their own sign-in', async () => {
      const added = await coach.rpc('add_player', {
        p_team: 'U12G',
        p_name: 'Ola Player',
        p_jersey: '5',
        p_parents: [],
        p_user_member: null,
      });
      if (added.error) throw added.error;
      const profile = added.data as string;
      const body = { team: 'U12G', kind: 'player', name: 'Ola Player', email: 'ola@test.example', profile };
      const res = await invoke(coach, 'invite-member', body);
      assertEquals(res.status, 200, JSON.stringify(res.data));
      const { data } = await service.from('player_profiles').select('user_member_id').eq('id', profile).single();
      assertEquals(data, { user_member_id: (res.data['user'] as { id: string }).id });

      const again = await invoke(coach, 'invite-member', { ...body, email: 'ola2@test.example' });
      assertEquals(again.status, 409, 'only once');
      const otherTeam = await invoke(clubAdmin, 'invite-member', { ...body, team: 'U14B', email: 'ola3@test.example' });
      assertEquals(otherTeam.status, 404, 'the player must be on the team');
    });

    await t.step('rejects unknown teams', async () => {
      assertEquals(
        (await invoke(clubAdmin, 'invite-member', { team: 'U99X', kind: 'parent', name: 'X', email: 'y@test.example' }))
          .status,
        404,
      );
    });

    await t.step('rejects platform admins, who belong to no club', async () => {
      assertEquals(
        (await invoke(admin, 'invite-member', { team: 'U12G', kind: 'parent', name: 'X', email: 'z@test.example' }))
          .status,
        403,
      );
    });
  } finally {
    await cleanup();
  }
});
