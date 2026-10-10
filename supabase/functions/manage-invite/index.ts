// Club staff, or team staff for the invited member's teams: cancel an invite, or resend it with a
// new temporary password (the old one stops working). Only while the member has not joined yet.
import {
  HttpError,
  LOGIN_DOMAIN,
  adminClient,
  caller,
  check,
  inviteManager,
  serve,
  temporaryPassword,
  text,
} from '../_shared/admin.ts';
import { authEmailFor } from '../_shared/auth-identity.ts';

serve(async (req, body) => {
  const admin = adminClient();
  const user = await caller(req, admin);
  const id = text(body, 'id');
  const action = text(body, 'action');
  if (action !== 'cancel' && action !== 'resend') throw new HttpError(400, 'Cancel or resend an invite.');

  const { clubId, target } = await inviteManager(admin, user, id);
  if (!target.invited) throw new HttpError(409, `${target.name} has already joined.`);

  if (action === 'cancel') {
    // Deleting the member first means a failure leaves at worst an orphaned sign-in with no club data.
    check(await admin.from('members').delete().eq('id', target.id), 'Cancel invite');
    if (target.user_id) await admin.auth.admin.deleteUser(target.user_id);
    return { cancelled: target.id };
  }

  const password = temporaryPassword();
  const userMetadata = { must_change_password: true };
  if (target.user_id) {
    const reset = await admin.auth.admin.updateUserById(target.user_id, { password, user_metadata: userMetadata });
    if (reset.error) throw new Error(`Reset password: ${reset.error.message}`);
  } else {
    const created = await admin.auth.admin.createUser({
      email: await authEmailFor(clubId, target.username ?? '', LOGIN_DOMAIN),
      password,
      email_confirm: true,
      app_metadata: { club_id: clubId, member_id: target.id },
      user_metadata: userMetadata,
    });
    if (created.error || !created.data.user) throw new Error(`Create sign-in: ${created.error?.message}`);
    check(await admin.from('members').update({ user_id: created.data.user.id }).eq('id', target.id), 'Link sign-in');
  }
  return {
    user: {
      id: target.id,
      name: target.name,
      kind: target.kind,
      teams: target.team_members.map((t) => t.team_id).sort(),
      ...(target.email ? { email: target.email } : {}),
      invited: true,
    },
    username: target.username ?? '',
    temporaryPassword: password,
  };
});
