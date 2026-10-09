// Platform admin: creates a club, its admin member and sign-in, and its announcements thread.
// Input is NewClubInput (libs/backend/api); returns a ClubAccount. There is no transaction across
// the database, Storage and Auth, so every step is undone if a later one fails.
import {
  ClubRow,
  HttpError,
  LOGIN_DOMAIN,
  SLUG_PATTERN,
  adminClient,
  check,
  checkOne,
  clubAccount,
  removeAssets,
  requirePlatformAdmin,
  serve,
  storeAsset,
  text,
} from '../_shared/admin.ts';
import { authEmailFor } from '../_shared/auth-identity.ts';

serve(async (req, body) => {
  const admin = adminClient();
  await requirePlatformAdmin(req, admin);

  const slug = text(body, 'slug');
  const name = text(body, 'name');
  const adminName = text(body, 'adminName');
  const adminEmail = text(body, 'adminEmail');
  const password = text(body, 'temporaryPassword');
  if (!SLUG_PATTERN.test(slug)) throw new HttpError(400, 'That link is not valid. Generate a new one.');
  if (password.length < 8) throw new HttpError(400, 'The temporary password needs at least 8 characters.');
  const icons = body['icons'] as { size192?: string; size512?: string } | undefined;

  const taken = check(await admin.from('clubs').select('id').eq('slug', slug).maybeSingle(), 'Slug check');
  if (taken) throw new HttpError(409, 'That link is already taken. Generate a new one.');

  // The database chooses the club id; it is part of every member's sign-in and must never change.
  const inserted = await admin
    .from('clubs')
    .insert({
      slug,
      name,
      ink: text(body, 'ink'),
      paper: text(body, 'paper'),
      logo_ink: text(body, 'logoInk'),
      logo_paper: text(body, 'logoPaper'),
    })
    .select()
    .single();
  if (inserted.error?.code === '23505') throw new HttpError(409, 'That link is already taken. Generate a new one.');
  let club = checkOne<ClubRow>(inserted, 'Create club');

  const uploaded: string[] = [];
  let authUserId: string | null = null;
  try {
    const logoUrl = await storeAsset(admin, club.id, 'logo', text(body, 'logoUrl'), uploaded);
    const icon192 = icons?.size192 ? await storeAsset(admin, club.id, 'icon-192', icons.size192, uploaded) : null;
    const icon512 = icons?.size512 ? await storeAsset(admin, club.id, 'icon-512', icons.size512, uploaded) : null;

    const member = checkOne<{ id: string }>(
      await admin
        .from('members')
        .insert({
          club_id: club.id,
          username: adminEmail,
          email: adminEmail,
          name: adminName,
          kind: 'club',
          title: 'Club Admin',
        })
        .select('id')
        .single(),
      'Create admin member',
    );

    const created = await admin.auth.admin.createUser({
      email: await authEmailFor(club.id, adminEmail, LOGIN_DOMAIN),
      password,
      email_confirm: true,
      app_metadata: { club_id: club.id, member_id: member.id },
      user_metadata: { must_change_password: true },
    });
    if (created.error || !created.data.user) throw new Error(`Create admin sign-in: ${created.error?.message}`);
    authUserId = created.data.user.id;
    if (created.data.user.app_metadata?.['club_id'] !== club.id) throw new Error('Admin sign-in has no club.');

    check(await admin.from('members').update({ user_id: authUserId }).eq('id', member.id), 'Link admin');
    club = checkOne<ClubRow>(
      await admin
        .from('clubs')
        .update({ logo_url: logoUrl, icon_192_url: icon192, icon_512_url: icon512, admin_member_id: member.id })
        .eq('id', club.id)
        .select()
        .single(),
      'Save branding',
    );
    check(
      await admin.from('threads').insert({
        club_id: club.id,
        name: '#club-announcements',
        scope: 'club',
        teams: [],
        creator_member_id: member.id,
      }),
      'Create announcements thread',
    );

    return clubAccount(club, { name: adminName, username: adminEmail });
  } catch (e) {
    if (authUserId) await admin.auth.admin.deleteUser(authUserId);
    await removeAssets(admin, uploaded);
    await admin.from('clubs').delete().eq('id', club.id);
    throw e;
  }
});
