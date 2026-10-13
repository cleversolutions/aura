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
        title: ' Head Coach ',
      });
      assertEquals(res.status, 200, JSON.stringify(res.data));
      assertEquals(res.data, {
        id: coach.user.id,
        name: 'Kim Coach',
        kind: 'staff',
        teams: ['U12G'],
        title: 'Head Coach',
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

    await t.step('members set, keep and clear their phone number', async () => {
      const phone = (body: Record<string, unknown>) =>
        invoke(parentClient, 'update-member', {
          id: parent.user.id,
          name: 'Pat Parent',
          email: 'parent@test.example',
          ...body,
        });
      const set = await phone({ phone: ' (555) 010-2030 ' });
      assertEquals(set.status, 200, JSON.stringify(set.data));
      assertEquals(set.data['phone'], '(555) 010-2030');
      assertEquals((await phone({})).data['phone'], '(555) 010-2030');
      assertEquals((await phone({ phone: 'call me' })).status, 400);
      assertEquals((await phone({ phone: '' })).data['phone'], undefined);
    });

    await t.step('club staff set any staff member’s title, team staff team staff’s; nobody else does', async () => {
      await clubAdmin.from('teams').insert({ club_id: club.id, id: 'U14B', name: 'U14 Boys' });
      const other = (
        await invoke(clubAdmin, 'invite-member', {
          team: 'U14B',
          kind: 'staff',
          name: 'Lou',
          email: 'lou@test.example',
        })
      ).data as { user: { id: string }; temporaryPassword: string };
      const lou = await signIn(await authEmailFor(club.id, 'lou@test.example'), other.temporaryPassword);
      const title = (who: typeof lou, id: string, value: string) => invoke(who, 'update-member', { id, title: value });

      // Team staff of another team, for team staff but not the club admin; then the admin clears it.
      const set = await title(lou, coach.user.id, 'Assistant Coach');
      assertEquals(set.status, 200, JSON.stringify(set.data));
      assertEquals([set.data['name'], set.data['title']], ['Kim Coach', 'Assistant Coach']);
      assertEquals((await title(lou, adminId, 'Team Manager')).status, 403);
      assertEquals((await title(clubAdmin, coach.user.id, '  ')).data['title'], undefined);

      assertEquals((await title(parentClient, coach.user.id, 'Head Coach')).status, 403);
      assertEquals((await title(lou, parent.user.id, 'Head Coach')).status, 403);
      assertEquals((await title(lou, coach.user.id, 'x'.repeat(61))).status, 400);
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
