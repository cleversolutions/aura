// Platform admin: updates a club's branding and admin. Input is `{ id, ...ClubInput }` without the
// slug, which never changes. A new admin email is a new username, so the admin's derived sign-in
// address changes with it.
import {
  ClubRow,
  HttpError,
  LOGIN_DOMAIN,
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
import { authEmailFor, normalizeUsername } from '../_shared/auth-identity.ts';

serve(async (req, body) => {
  const admin = adminClient();
  await requirePlatformAdmin(req, admin);

  const id = text(body, 'id');
  const adminName = text(body, 'adminName');
  const adminEmail = text(body, 'adminEmail');
  const icons = body['icons'] as { size192?: string; size512?: string } | undefined;

  const existing = check(await admin.from('clubs').select().eq('id', id).maybeSingle(), 'Load club') as ClubRow | null;
  if (!existing) throw new HttpError(404, 'Club not found.');
  const adminMember = existing.admin_member_id
    ? checkOne<{ id: string; user_id: string | null; username: string | null }>(
        await admin.from('members').select('id, user_id, username').eq('id', existing.admin_member_id).single(),
        'Load admin',
      )
    : null;

  const uploaded: string[] = [];
  try {
    const logoUrl = await storeAsset(admin, id, 'logo', text(body, 'logoUrl'), uploaded);
    const icon192 = icons?.size192 ? await storeAsset(admin, id, 'icon-192', icons.size192, uploaded) : null;
    const icon512 = icons?.size512 ? await storeAsset(admin, id, 'icon-512', icons.size512, uploaded) : null;

    if (adminMember) {
      const renamed = normalizeUsername(adminMember.username ?? '') !== normalizeUsername(adminEmail);
      const saved = await admin
        .from('members')
        .update({ name: adminName, username: adminEmail, email: adminEmail })
        .eq('id', adminMember.id);
      if (saved.error?.code === '23505') throw new HttpError(409, 'Someone at this club already uses that email.');
      check(saved, 'Update admin');
      if (renamed && adminMember.user_id) {
        const moved = await admin.auth.admin.updateUserById(adminMember.user_id, {
          email: await authEmailFor(id, adminEmail, LOGIN_DOMAIN),
          email_confirm: true,
        });
        if (moved.error) {
          // Keep the username and the sign-in address in step.
          await admin.from('members').update({ username: adminMember.username }).eq('id', adminMember.id);
          throw new Error(`Move admin sign-in: ${moved.error.message}`);
        }
      }
    }

    const club = checkOne<ClubRow>(
      await admin
        .from('clubs')
        .update({
          name: text(body, 'name'),
          logo_url: logoUrl,
          ink: text(body, 'ink'),
          paper: text(body, 'paper'),
          logo_ink: text(body, 'logoInk'),
          logo_paper: text(body, 'logoPaper'),
          ...(icon192 && icon512 ? { icon_192_url: icon192, icon_512_url: icon512 } : {}),
        })
        .eq('id', id)
        .select()
        .single(),
      'Update club',
    );

    return clubAccount(club, { name: adminName, username: adminEmail });
  } catch (e) {
    await removeAssets(admin, uploaded);
    throw e;
  }
});
