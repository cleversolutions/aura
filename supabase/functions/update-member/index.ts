// A member's own details (name, email, title, phone); anyone's for club staff; invites to their teams for team staff.
// The email is also the sign-in username, so changing it moves their derived sign-in address.
// `{ id, title }` alone sets a staff member's title: club staff for any staff, team staff for team staff (editsTitle).
import {
  HttpError,
  LOGIN_DOMAIN,
  type MemberRow,
  TITLE_MAX,
  adminClient,
  callerMember,
  caller,
  check,
  editsTitle,
  loadMember,
  managesInvite,
  serve,
  text,
  toUser,
} from '../_shared/admin.ts';
import { authEmailFor, normalizeUsername } from '../_shared/auth-identity.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

serve(async (req, body) => {
  const admin = adminClient();
  const { clubId, me } = await callerMember(admin, await caller(req, admin));

  const id = text(body, 'id');
  const title = typeof body['title'] === 'string' ? (body['title'] as string).trim() : undefined;
  if (title && title.length > TITLE_MAX) throw new HttpError(400, `Keep the title to ${TITLE_MAX} characters.`);
  if (body['name'] === undefined && title !== undefined) return setTitle(admin, clubId, me, id, title);

  const name = text(body, 'name');
  const email = text(body, 'email');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email.');
  // Optional; left out keeps the current one. As isValidPhone() in shared/util.
  const phone = typeof body['phone'] === 'string' ? (body['phone'] as string).trim() : undefined;
  if (phone && (phone.length > 30 || !/^[0-9+().\-\s]+$/.test(phone) || (phone.match(/\d/g) ?? []).length < 7)) {
    throw new HttpError(400, 'Enter a valid phone number.');
  }

  const target = await loadMember(admin, clubId, { id });
  if (!target) throw new HttpError(404, 'Member not found.');
  // Yourself; anyone, for club staff; and team staff fix invites to their teams.
  if (me.id !== target.id && me.kind !== 'club' && !managesInvite(me, target)) {
    throw new HttpError(403, 'Only club staff can edit other people’s details.');
  }

  const saved = await admin
    .from('members')
    .update({
      name,
      email,
      username: email,
      ...(hasTitle(target) && title !== undefined ? { title: title || null } : {}),
      ...(phone !== undefined ? { phone } : {}),
    })
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

  return reload(admin, clubId, id);
});

function hasTitle(m: MemberRow): boolean {
  return m.kind === 'club' || m.kind === 'staff';
}

async function setTitle(admin: SupabaseClient, clubId: string, me: MemberRow, id: string, title: string) {
  const target = await loadMember(admin, clubId, { id });
  if (!target) throw new HttpError(404, 'Member not found.');
  if (!editsTitle(me, target))
    throw new HttpError(403, 'Only club staff, and team staff for team staff, change titles.');
  check(
    await admin
      .from('members')
      .update({ title: title || null })
      .eq('id', id),
    'Update title',
  );
  return reload(admin, clubId, id);
}

async function reload(admin: SupabaseClient, clubId: string, id: string) {
  const updated = (await loadMember(admin, clubId, { id }))!;
  const club = check(await admin.from('clubs').select('admin_member_id').eq('id', clubId).single(), 'Load club') as {
    admin_member_id: string | null;
  };
  return toUser(updated, club.admin_member_id);
}
