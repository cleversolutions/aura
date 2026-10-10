// Club or team staff: invites someone to a team (InviteMemberInput, and saveTeam's new staff).
// v1 has no email: it creates the member and their sign-in with a temporary password, and returns
// both for staff to share by hand. The member must choose their own password on first sign-in.
import {
  HttpError,
  LOGIN_DOMAIN,
  adminClient,
  caller,
  check,
  checkOne,
  serve,
  temporaryPassword,
  text,
} from '../_shared/admin.ts';
import { authEmailFor } from '../_shared/auth-identity.ts';

const KINDS = ['staff', 'parent', 'player'];

serve(async (req, body) => {
  const admin = adminClient();
  const user = await caller(req, admin);
  const clubId = user.app_metadata?.['club_id'] as string | undefined;
  if (!clubId) throw new HttpError(403, 'Sign in to your club first.');

  const team = text(body, 'team');
  const kind = text(body, 'kind');
  const name = text(body, 'name');
  const email = text(body, 'email');
  if (!KINDS.includes(kind)) throw new HttpError(400, 'Invite staff, a parent or a player.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email.');

  // Club staff invite to any team; team staff only to their own teams.
  const me = check(
    await admin
      .from('members')
      .select('id, kind, team_members(team_id)')
      .eq('user_id', user.id)
      .eq('club_id', clubId)
      .maybeSingle(),
    'Load caller',
  ) as { id: string; kind: string; team_members: { team_id: string }[] } | null;
  const onTeam = me?.team_members.some((t) => t.team_id === team) ?? false;
  if (!me || !(me.kind === 'club' || (me.kind === 'staff' && onTeam))) {
    throw new HttpError(403, 'Only club staff and this team’s staff can invite members.');
  }
  const teamRow = check(
    await admin.from('teams').select('id').eq('club_id', clubId).eq('id', team).maybeSingle(),
    'Load team',
  );
  if (!teamRow) throw new HttpError(404, 'Team not found.');

  const inserted = await admin
    .from('members')
    .insert({ club_id: clubId, username: email, email, name, kind, invited: true })
    .select('id')
    .single();
  if (inserted.error?.code === '23505') throw new HttpError(409, `${email} already has an account at this club.`);
  const member = checkOne<{ id: string }>(inserted, 'Create member');

  try {
    check(
      await admin.from('team_members').insert({ club_id: clubId, member_id: member.id, team_id: team }),
      'Add to team',
    );
    const password = temporaryPassword();
    const created = await admin.auth.admin.createUser({
      email: await authEmailFor(clubId, email, LOGIN_DOMAIN),
      password,
      email_confirm: true,
      app_metadata: { club_id: clubId, member_id: member.id },
      user_metadata: { must_change_password: true },
    });
    if (created.error || !created.data.user) throw new Error(`Create sign-in: ${created.error?.message}`);
    check(await admin.from('members').update({ user_id: created.data.user.id }).eq('id', member.id), 'Link sign-in');

    return {
      user: { id: member.id, name, kind, teams: [team], email, invited: true },
      username: email,
      temporaryPassword: password,
    };
  } catch (e) {
    await admin.from('members').delete().eq('id', member.id);
    throw e;
  }
});
