import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { authEmailFor } from '../_shared/auth-identity.ts';
import { cleanup, createClub, invoke, platformAdmin, signIn } from './helpers.ts';

Deno.test('update-member', async (t) => {
  const admin = await platformAdmin();
  try {
    const { input, club } = await createClub(admin);
    const clubAdmin = await signIn(await authEmailFor(club.id, input.adminEmail), input.temporaryPassword);
    await clubAdmin.from('teams').insert({ club_id: club.id, id: 'U12G', name: 'U12 Girls' });
    const invite = async (email: string, kind: string) =>
      (await invoke(clubAdmin, 'invite-member', { team: 'U12G', kind, name: 'Someone', email })).data as {
        user: { id: string };
        temporaryPassword: string;
      };
    const coach = await invite('coach@test.example', 'staff');
    const parent = await invite('parent@test.example', 'parent');
    const adminId = (await clubAdmin.auth.getSession()).data.session!.user.app_metadata['member_id'];

    await t.step('club staff edit team staff, moving their sign-in', async () => {
      const res = await invoke(clubAdmin, 'update-member', {
        id: coach.user.id,
        name: 'Kim Coach',
        email: 'kim@test.example',
        title: 'ignored for team staff',
      });
      assertEquals(res.status, 200, JSON.stringify(res.data));
      assertEquals(res.data, {
        id: coach.user.id,
        name: 'Kim Coach',
        kind: 'staff',
        teams: ['U12G'],
        email: 'kim@test.example',
        invited: true,
      });
      await signIn(await authEmailFor(club.id, 'kim@test.example'), coach.temporaryPassword);
      await assertRejects(async () =>
        signIn(await authEmailFor(club.id, 'coach@test.example'), coach.temporaryPassword),
      );
    });

    await t.step('the club admin edits their own details and title', async () => {
      const res = await invoke(clubAdmin, 'update-member', {
        id: adminId,
        name: 'Ada Lovelace',
        email: input.adminEmail,
        title: 'President',
      });
      assertEquals(res.status, 200, JSON.stringify(res.data));
      assertEquals([res.data['name'], res.data['title']], ['Ada Lovelace', 'President']);
      const { data } = await admin.rpc('platform_clubs');
      const row = (data as { id: string; admin_name: string }[]).find((c) => c.id === club.id);
      assertEquals(row?.admin_name, 'Ada Lovelace');
    });

    const parentClient = await signIn(await authEmailFor(club.id, 'parent@test.example'), parent.temporaryPassword);

    await t.step('members edit themselves but nobody else', async () => {
      const self = await invoke(parentClient, 'update-member', {
        id: parent.user.id,
        name: 'Pat Parent',
        email: 'parent@test.example',
      });
      assertEquals(self.status, 200);
      const other = await invoke(parentClient, 'update-member', {
        id: coach.user.id,
        name: 'X',
        email: 'x@test.example',
      });
      assertEquals(other.status, 403);
    });

    await t.step('rejects an email someone at the club already uses', async () => {
      const res = await invoke(clubAdmin, 'update-member', {
        id: parent.user.id,
        name: 'Pat',
        email: 'KIM@test.example',
      });
      assertEquals(res.status, 409);
    });

    await t.step('404s for members of other clubs', async () => {
      const res = await invoke(clubAdmin, 'update-member', {
        id: crypto.randomUUID(),
        name: 'X',
        email: 'x@test.example',
      });
      assertEquals(res.status, 404);
    });
  } finally {
    await cleanup();
  }
});
