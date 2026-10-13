// Club staff, or team staff for the invited member's teams: cancel an invite, or resend it with a
// new temporary password (the old one stops working). Only while the member has not joined yet.
import {
  HttpError,
  adminClient,
  caller,
  check,
  inviteManager,
  serve,
  setTemporaryPassword,
  text,
} from '../_shared/admin.ts';

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

  return await setTemporaryPassword(admin, clubId, target);
});
