import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { authEmailFor } from '../_shared/auth-identity.ts';
import { cleanup, createClub, invoke, platformAdmin, signIn } from './helpers.ts';

Deno.test('update-club', async (t) => {
  const admin = await platformAdmin();
  try {
    const { input, club } = await createClub(admin);
    const update = {
      id: club.id,
      name: 'Renamed Club',
      logoUrl: club.logoUrl,
      ink: '#112233',
      paper: '#fafafa',
      logoInk: '#112233',
      logoPaper: '#fafafa',
      adminName: 'Bo Admin',
      adminEmail: 'bo@test.example',
    };

    await t.step('rejects callers who are not the platform admin', async () => {
      const clubAdmin = await signIn(await authEmailFor(club.id, input.adminEmail), input.temporaryPassword);
      assertEquals((await invoke(clubAdmin, 'update-club', update)).status, 403);
    });

    await t.step('updates branding and the admin', async () => {
      const res = await invoke(admin, 'update-club', update);
      assertEquals(res.status, 200);
      assertEquals(res.data['name'], 'Renamed Club');
      assertEquals(res.data['slug'], input.slug);
      assertEquals(res.data['adminEmail'], 'bo@test.example');
      const { data } = await admin.rpc('platform_clubs');
      const row = (data as { id: string; admin_name: string; ink: string }[]).find((c) => c.id === club.id);
      assertEquals([row?.admin_name, row?.ink], ['Bo Admin', '#112233']);
    });

    await t.step('moves the admin sign-in to the new username', async () => {
      await signIn(await authEmailFor(club.id, 'bo@test.example'), input.temporaryPassword);
      await assertRejects(async () => signIn(await authEmailFor(club.id, input.adminEmail), input.temporaryPassword));
    });

    await t.step('archives a club: its members read it but change nothing, until it is restored', async () => {
      const clubAdmin = await signIn(await authEmailFor(club.id, 'bo@test.example'), input.temporaryPassword);
      assertEquals((await invoke(clubAdmin, 'update-club', { id: club.id, archived: true })).status, 403);

      const archived = await invoke(admin, 'update-club', { id: club.id, archived: true });
      assertEquals(archived.status, 200, JSON.stringify(archived.data));
      const archivedAt = archived.data['archivedAt'];
      assert(typeof archivedAt === 'string');
      assertEquals(
        (await invoke(admin, 'update-club', { id: club.id, archived: true })).data['archivedAt'],
        archivedAt,
      );
      const { data } = await admin.rpc('platform_clubs');
      const row = (data as { id: string; archived_at: string | null; member_count: number }[]).find(
        (c) => c.id === club.id,
      );
      assert(row?.archived_at);
      assertEquals(row?.member_count, 1);

      const invite = await invoke(clubAdmin, 'invite-member', {
        kind: 'club',
        name: 'Someone',
        email: 'someone@test.example',
      });
      assertEquals([invite.status, invite.data['error']], [409, 'This club is archived. It is read-only.']);
      const { error } = await clubAdmin.from('teams').insert({ club_id: club.id, id: 'U12G', name: 'U12 Girls' });
      assertEquals(error?.message, 'This club is archived. It is read-only.');

      const restored = await invoke(admin, 'update-club', { id: club.id, archived: false });
      assertEquals([restored.status, restored.data['archivedAt']], [200, undefined]);
      assertEquals(
        (await clubAdmin.from('teams').insert({ club_id: club.id, id: 'U12G', name: 'U12 Girls' })).error,
        null,
      );
    });

    await t.step('404s for an unknown club', async () => {
      const res = await invoke(admin, 'update-club', { ...update, id: crypto.randomUUID() });
      assertEquals(res.status, 404);
    });
  } finally {
    await cleanup();
  }
});
