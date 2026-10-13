// Members who have joined: reset a forgotten password, disable or re-enable them, or remove them
// from the club. Invites are resent or cancelled with manage-invite instead.
//
// - reset-password: a new temporary password they must replace at their next sign-in. Club staff
//   for anyone; team staff for parents and players on their teams. The platform admin resets the
//   club admin's, passing `club` instead of `id`.
// - disable / enable: club staff. A disabled member stays on record but cannot sign in, and
//   row-level security gives them no access.
// - delete: club staff. Their messages stay, shown as from a former member; they are unlinked from
//   players, threads and teams, and their RSVPs and sign-in are deleted.
// - role: makes a parent team staff (`kind: 'staff'`), or team staff a parent again (`kind: 'parent'`),
//   keeping their sign-in, teams and players; invites too. Club staff either way; team staff make
//   parents on their own teams staff (changesRole). A parent again loses their title.
// - remove-player (`profile` instead of `id`): takes a player off the roster (remove_player(), which
//   checks the caller may), with their RSVPs. Their parents, and their own sign-in, leave the team
//   unless another of their players is on it; a player's sign-in left on no team is removed from
//   the club, with its sign-in, as `delete` does.
// Nobody disables or removes themselves or the club admin.
import {
  HttpError,
  MemberRow,
  adminClient,
  caller,
  callerClient,
  callerMember,
  changesRole,
  check,
  loadMember,
  managesMember,
  removesMember,
  serve,
  setTemporaryPassword,
  sqlError,
  text,
  toUser,
} from '../_shared/admin.ts';

const ACTIONS = ['reset-password', 'disable', 'enable', 'delete', 'role', 'remove-player'];
/** Long enough to mean "until re-enabled". */
const BANNED = '876000h';

async function clubAdminId(admin: ReturnType<typeof adminClient>, clubId: string): Promise<string | null> {
  const club = check(
    await admin.from('clubs').select('admin_member_id').eq('id', clubId).maybeSingle(),
    'Load club',
  ) as { admin_member_id: string | null } | null;
  return club?.admin_member_id ?? null;
}

serve(async (req, body) => {
  const admin = adminClient();
  const user = await caller(req, admin);
  const action = text(body, 'action');
  if (!ACTIONS.includes(action)) {
    throw new HttpError(400, 'Reset a password, change a role, or disable, enable or remove a member.');
  }

  // The platform admin resets the club admin's password.
  if (user.app_metadata?.['role'] === 'platform_admin') {
    if (action !== 'reset-password') throw new HttpError(403, 'Club staff manage their club’s members.');
    const clubId = text(body, 'club');
    const adminId = /^[0-9a-f-]{36}$/i.test(clubId) ? await clubAdminId(admin, clubId) : null;
    const target = adminId ? await loadMember(admin, clubId, { id: adminId }) : null;
    if (!target) throw new HttpError(404, 'This club has no admin.');
    return await setTemporaryPassword(admin, clubId, target);
  }

  const { clubId, me } = await callerMember(admin, user);

  if (action === 'remove-player') {
    const profile = text(body, 'profile');
    if (!/^[0-9a-f-]{36}$/i.test(profile)) throw new HttpError(404, 'Player not found.');
    const { data, error } = await callerClient(req).rpc('remove_player', { p_profile: profile });
    if (error) throw sqlError(error);
    const signIn = data ? await loadMember(admin, clubId, { id: data as string }) : null;
    if (signIn) await remove(admin, clubId, signIn);
    return { removed: profile, signInRemoved: !!signIn };
  }

  const target = await loadMember(admin, clubId, { id: text(body, 'id') });
  if (!target) throw new HttpError(404, 'Member not found.');

  if (action === 'role') {
    const kind = text(body, 'kind');
    if (kind !== 'staff' && kind !== 'parent') throw new HttpError(400, 'Make them team staff or a parent.');
    if (!changesRole(me, target, kind)) {
      throw new HttpError(403, 'Only club staff, and team staff for parents on their own teams, change roles.');
    }
    const title = kind === 'parent' ? null : target.title;
    check(await admin.from('members').update({ kind, title }).eq('id', target.id), 'Change role');
    return toUser({ ...target, kind, title }, await clubAdminId(admin, clubId));
  }

  if (target.invited) throw new HttpError(409, `${target.name} hasn’t joined yet. Resend or cancel their invite.`);

  if (action === 'reset-password') {
    if (!managesMember(me, target)) {
      throw new HttpError(403, 'Only club staff, and team staff for their teams’ families, reset passwords.');
    }
    return await setTemporaryPassword(admin, clubId, target);
  }

  const adminId = await clubAdminId(admin, clubId);
  if (!removesMember(me, target, adminId)) {
    if (target.id === me.id) throw new HttpError(403, 'You can’t disable or remove yourself.');
    if (target.id === adminId) throw new HttpError(403, 'The club admin can’t be disabled or removed.');
    throw new HttpError(403, 'Only club staff can disable or remove members.');
  }

  if (action === 'delete') {
    await remove(admin, clubId, target);
    return { removed: target.id };
  }

  const disabled = action === 'disable';
  // The ban stops new sign-ins; the flag stops sessions already open (auth_club_id()).
  if (target.user_id) {
    const banned = await admin.auth.admin.updateUserById(target.user_id, { ban_duration: disabled ? BANNED : 'none' });
    if (banned.error) throw new Error(`${disabled ? 'Ban' : 'Unban'} sign-in: ${banned.error.message}`);
  }
  check(await admin.from('members').update({ disabled }).eq('id', target.id), 'Update member');
  return toUser({ ...target, disabled }, adminId);
});

/**
 * Removes the member. Foreign keys do the unlinking: team, thread and parent links go with the
 * member row, and their messages, threads and own-login player profiles keep going without them.
 */
async function remove(admin: ReturnType<typeof adminClient>, clubId: string, target: MemberRow): Promise<void> {
  // RSVPs are keyed by attendee id, with no foreign key to members.
  check(await admin.from('rsvps').delete().eq('club_id', clubId).eq('attendee_id', target.id), 'Delete RSVPs');
  check(await admin.from('members').delete().eq('id', target.id), 'Remove member');
  // After the member row, so a failure leaves at worst an orphaned sign-in with no club data.
  if (target.user_id) await admin.auth.admin.deleteUser(target.user_id);
}
