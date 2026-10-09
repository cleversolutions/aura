import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { authEmailFor } from '../_shared/auth-identity.ts';
import { cleanup, createClub, invoke, newClubInput, platformAdmin, service, signIn } from './helpers.ts';

Deno.test('create-club', async (t) => {
  const admin = await platformAdmin();
  try {
    await t.step('rejects callers who are not the platform admin', async () => {
      assertEquals((await invoke(null, 'create-club', newClubInput())).status, 401);
    });

    const { input, club } = await createClub(admin);

    await t.step('returns the club account with uploaded assets', () => {
      assertEquals(club.slug, input.slug);
      assertEquals(club.adminEmail, 'ada@test.example');
      assertMatch(
        club.logoUrl as string,
        new RegExp(`/storage/v1/object/public/club-assets/${club.id}/logo-.+\\.svg$`),
      );
      const icons = club.icons as { size192: string; size512: string };
      assertMatch(icons.size192, /icon-192-.+\.png$/);
    });

    await t.step('creates the admin sign-in from the club id and username', async () => {
      const email = await authEmailFor(club.id, 'ADA@test.example ');
      const session = (await (await signIn(email, input.temporaryPassword)).auth.getSession()).data.session!;
      assertEquals(session.user.app_metadata['club_id'], club.id);
      assertEquals(session.user.user_metadata['must_change_password'], true);
      const { data: member } = await service
        .from('members')
        .select('id, kind, title, user_id')
        .eq('id', session.user.app_metadata['member_id'])
        .single();
      assertEquals(member, { id: member!.id, kind: 'club', title: 'Club Admin', user_id: session.user.id });
    });

    await t.step('creates the club announcements thread', async () => {
      const { data } = await service.from('threads').select('name, scope').eq('club_id', club.id);
      assertEquals(data, [{ name: '#club-announcements', scope: 'club' }]);
    });

    await t.step('rejects a taken slug', async () => {
      const res = await invoke(admin, 'create-club', newClubInput({ slug: input.slug }));
      assertEquals(res.status, 409);
      assertMatch(res.data['error'] as string, /already taken/);
    });

    await t.step('rejects an invalid slug without creating anything', async () => {
      const res = await invoke(admin, 'create-club', newClubInput({ slug: 'Admin!' }));
      assertEquals(res.status, 400);
    });

    await t.step('undoes earlier steps when a later one fails', async () => {
      const slug = `${input.slug}x`;
      const res = await invoke(admin, 'create-club', newClubInput({ slug, logoUrl: 'data:text/html,<p>' }));
      assertEquals(res.status, 400);
      const { data } = await service.from('clubs').select('id').eq('slug', slug);
      assert(data!.length === 0, 'club should be removed');
    });
  } finally {
    await cleanup();
  }
});
