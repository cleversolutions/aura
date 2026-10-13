// Club or team staff: invites someone to a team (InviteMemberInput, and saveTeam's new staff).
// Club staff also invite more club staff, who join the club rather than a team. Inviting a player
// with `profile` gives a player already on the roster their own sign-in.
// v1 has no email: it creates the member and their sign-in with a temporary password, and returns
// both for staff to share by hand. The member must choose their own password on first sign-in.
import {
  HttpError,
  LOGIN_DOMAIN,
  adminClient,
  caller,
  callerMember,
  check,
  checkOne,
  serve,
  temporaryPassword,
  text,
} from '../_shared/admin.ts';
import { authEmailFor } from '../_shared/auth-identity.ts';

const KINDS = ['club', 'staff', 'parent', 'player'];

serve(async (req, body) => {
  const admin = adminClient();
  const { clubId, me } = await callerMember(admin, await caller(req, admin));

  const kind = text(body, 'kind');
  const name = text(body, 'name');
  const email = text(body, 'email');
  if (!KINDS.includes(kind)) throw new HttpError(400, 'Invite club staff, team staff, a parent or a player.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email.');

  // Club staff join the club, not a team, and only club staff invite them.
  const team = kind === 'club' ? '' : text(body, 'team');
  const title = kind === 'club' ? text(body, 'title', { required: false }) : '';
  if (kind === 'club') {
    if (me.kind !== 'club') throw new HttpError(403, 'Only club staff can invite club staff.');
  } else {
    // Club staff invite to any team; team staff only to their own teams.
    const onTeam = me.team_members.some((t) => t.team_id === team);
    if (!(me.kind === 'club' || (me.kind === 'staff' && onTeam))) {
      throw new HttpError(403, 'Only club staff and this team’s staff can invite members.');
    }
    const teamRow = check(
      await admin.from('teams').select('id').eq('club_id', clubId).eq('id', team).maybeSingle(),
      'Load team',
    );
    if (!teamRow) throw new HttpError(404, 'Team not found.');
  }

  const profileId = kind === 'player' ? text(body, 'profile', { required: false }) : '';
  if (profileId) {
    const profile = /^[0-9a-f-]{36}$/i.test(profileId)
      ? (check(
          await admin
            .from('player_profiles')
            .select('team_id, user_member_id')
            .eq('club_id', clubId)
            .eq('id', profileId)
            .maybeSingle(),
          'Load player',
        ) as { team_id: string; user_member_id: string | null } | null)
      : null;
    if (!profile || profile.team_id !== team) throw new HttpError(404, 'Player not found on this team.');
    if (profile.user_member_id) throw new HttpError(409, `${name} already has their own sign-in.`);
  }

  const inserted = await admin
    .from('members')
    .insert({ club_id: clubId, username: email, email, name, kind, title: title || null, invited: true })
    .select('id')
    .single();
  if (inserted.error?.code === '23505') throw new HttpError(409, `${email} already has an account at this club.`);
  const member = checkOne<{ id: string }>(inserted, 'Create member');

  try {
    if (team) {
      check(
        await admin.from('team_members').insert({ club_id: clubId, member_id: member.id, team_id: team }),
        'Add to team',
      );
    }
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
    if (profileId) {
      check(
        await admin.from('player_profiles').update({ user_member_id: member.id }).eq('id', profileId),
        'Link player',
      );
    }

    return {
      user: { id: member.id, name, kind, teams: team ? [team] : [], ...(title ? { title } : {}), email, invited: true },
      username: email,
      temporaryPassword: password,
    };
  } catch (e) {
    await admin.from('members').delete().eq('id', member.id);
    throw e;
  }
});
