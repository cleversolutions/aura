import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
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

    await t.step('404s for an unknown club', async () => {
      const res = await invoke(admin, 'update-club', { ...update, id: crypto.randomUUID() });
      assertEquals(res.status, 404);
    });
  } finally {
    await cleanup();
  }
});
