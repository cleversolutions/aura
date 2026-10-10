// A member's own details (name, email, title); anyone's for club staff; invites to their teams for team staff.
// The email is also the sign-in username, so changing it moves their derived sign-in address.
import {
  HttpError,
  LOGIN_DOMAIN,
  adminClient,
  callerMember,
  caller,
  check,
  loadMember,
  managesInvite,
  serve,
  text,
} from '../_shared/admin.ts';
import { authEmailFor, normalizeUsername } from '../_shared/auth-identity.ts';

serve(async (req, body) => {
  const admin = adminClient();
  const { clubId, me } = await callerMember(admin, await caller(req, admin));

  const id = text(body, 'id');
  const name = text(body, 'name');
  const email = text(body, 'email');
  const title = typeof body['title'] === 'string' ? (body['title'] as string).trim() : undefined;
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email.');

  const target = await loadMember(admin, clubId, { id });
  if (!target) throw new HttpError(404, 'Member not found.');
  // Yourself; anyone, for club staff; and team staff fix invites to their teams.
  if (me.id !== target.id && me.kind !== 'club' && !managesInvite(me, target)) {
    throw new HttpError(403, 'Only club staff can edit other people’s details.');
  }

  const saved = await admin
    .from('members')
    .update({ name, email, username: email, ...(target.kind === 'club' && title !== undefined ? { title } : {}) })
    .eq('id', id);
  if (saved.error?.code === '23505') throw new HttpError(409, `${email} already has an account at this club.`);
  check(saved, 'Update member');

  if (target.user_id && normalizeUsername(target.username ?? '') !== normalizeUsername(email)) {
    const moved = await admin.auth.admin.updateUserById(target.user_id, {
      email: await authEmailFor(clubId, email, LOGIN_DOMAIN),
      email_confirm: true,
    });
    if (moved.error) {
      // Keep the username and the sign-in address in step.
      await admin.from('members').update({ username: target.username, email: target.email }).eq('id', id);
      throw new Error(`Move sign-in: ${moved.error.message}`);
    }
  }

  const updated = (await loadMember(admin, clubId, { id }))!;
  return {
    id: updated.id,
    name: updated.name,
    kind: updated.kind,
    teams: updated.team_members.map((t) => t.team_id).sort(),
    ...(updated.title ? { title: updated.title } : {}),
    ...(updated.email ? { email: updated.email } : {}),
    ...(updated.invited ? { invited: true } : {}),
  };
});
