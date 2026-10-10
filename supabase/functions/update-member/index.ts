// A member's own details (name, email, title), or anyone's in the club for club staff.
// The email is also the sign-in username, so changing it moves their derived sign-in address.
import { HttpError, LOGIN_DOMAIN, adminClient, caller, check, serve, text } from '../_shared/admin.ts';
import { authEmailFor, normalizeUsername } from '../_shared/auth-identity.ts';

interface MemberRow {
  id: string;
  user_id: string | null;
  username: string | null;
  name: string;
  kind: string;
  title: string | null;
  email: string | null;
  invited: boolean;
  team_members: { team_id: string }[];
}

const COLUMNS = 'id, user_id, username, name, kind, title, email, invited, team_members(team_id)';

serve(async (req, body) => {
  const admin = adminClient();
  const user = await caller(req, admin);
  const clubId = user.app_metadata?.['club_id'] as string | undefined;
  if (!clubId) throw new HttpError(403, 'Sign in to your club first.');

  const id = text(body, 'id');
  const name = text(body, 'name');
  const email = text(body, 'email');
  const title = typeof body['title'] === 'string' ? (body['title'] as string).trim() : undefined;
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email.');

  const load = async (match: Record<string, string>) =>
    check(
      await admin.from('members').select(COLUMNS).eq('club_id', clubId).match(match).maybeSingle(),
      'Load member',
    ) as MemberRow | null;
  const me = await load({ user_id: user.id });
  if (!me) throw new HttpError(403, 'Sign in to your club first.');
  // Member ids are UUIDs; anything else cannot be a member here.
  const target = /^[0-9a-f-]{36}$/i.test(id) ? await load({ id }) : null;
  if (!target) throw new HttpError(404, 'Member not found.');
  if (me.id !== target.id && me.kind !== 'club') {
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

  const updated = (await load({ id }))!;
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
