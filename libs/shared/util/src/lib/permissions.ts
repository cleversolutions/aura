import {
  ChatMessage,
  ClubEvent,
  ClubSettings,
  IncludeGroups,
  MemberGroup,
  Persona,
  Thread,
  ThreadMembership,
  User,
  UserId,
  UserKind,
} from '@aura/shared/models';

/** Which thread "include" group a user kind falls into. Club staff are never auto-included. */
export const KIND_GROUP: Record<UserKind, MemberGroup | null> = {
  club: null,
  staff: 'staff',
  parent: 'parents',
  player: 'players',
};

export const ALL_GROUPS: IncludeGroups = { staff: true, parents: true, players: true };

export function personaOf(user: Pick<User, 'kind'>): Persona {
  switch (user.kind) {
    case 'club':
      return 'clubStaff';
    case 'staff':
      return 'teamStaff';
    case 'player':
      return 'player';
    default:
      return 'parent';
  }
}

export const DEFAULT_CLUB_SETTINGS: ClubSettings = { announcements: 'staff' };

/** The club's default channel (`#club-announcements`): everyone in the club is in it. */
export function isClubWide(t: Partial<Pick<Thread, 'isDefault' | 'scope'>>): boolean {
  return !!t.isDefault && t.scope === 'club';
}

/**
 * Everyone in a thread. The club's default channel has everyone in the club; otherwise the
 * creator, people added individually, and members of the linked teams whose group is included.
 * Disabled members are in no thread. Mirrors thread_member_ids() in the migrations.
 */
export function effectiveMembers(
  t: ThreadMembership & Partial<Pick<Thread, 'isDefault' | 'scope'>>,
  users: readonly User[],
): Set<UserId> {
  const enabled = users.filter((u) => !u.disabled);
  if (isClubWide(t)) return new Set(enabled.map((u) => u.id));
  const disabled = new Set(users.filter((u) => u.disabled).map((u) => u.id));
  const out = new Set<UserId>(t.members.filter((id) => !disabled.has(id)));
  if (t.creatorId && !disabled.has(t.creatorId)) out.add(t.creatorId);
  for (const u of enabled) {
    const group = KIND_GROUP[u.kind];
    if (group && t.include[group] && u.teams.some((id) => t.teams.includes(id))) out.add(u.id);
  }
  return out;
}

/** The team through which a user is automatically in a thread, if any. */
export function includedViaTeam(t: ThreadMembership, user: User): string | null {
  const group = KIND_GROUP[user.kind];
  if (!group || !t.include[group]) return null;
  return user.teams.find((id) => t.teams.includes(id)) ?? null;
}

/**
 * Club staff and the creator can manage any custom thread; team staff can manage
 * custom threads on their own teams. Default team channels are never editable.
 */
export function canManageThread(t: Pick<Thread, 'isDefault' | 'creatorId' | 'scope'>, me: User): boolean {
  if (t.isDefault) return false;
  if (me.kind === 'club' || t.creatorId === me.id) return true;
  return me.kind === 'staff' && t.scope !== 'club' && me.teams.includes(t.scope);
}

/**
 * Members read a thread; club staff also read and post in every default channel without being
 * members, so they can reach any team. Mirrors can_read_thread().
 */
export function canReadThread(t: Pick<Thread, 'isDefault'>, me: User, isMember: boolean): boolean {
  return isMember || (t.isDefault && me.kind === 'club');
}

/** Club staff anywhere; team staff in their own teams' threads. Mirrors can_moderate_thread(). */
export function canModerateThread(t: Pick<Thread, 'scope'>, me: User): boolean {
  if (me.kind === 'club') return true;
  return me.kind === 'staff' && t.scope !== 'club' && me.teams.includes(t.scope);
}

/**
 * Whoever reads a thread posts in it, except that announcement channels take staff only (club
 * staff, and a team's staff in its own) unless the club lets everyone post. Mirrors
 * can_post_in_thread().
 */
export function canPostInThread(
  t: Pick<Thread, 'isDefault' | 'scope' | 'announceOnly'>,
  me: User,
  isMember: boolean,
  settings: ClubSettings,
): boolean {
  if (!canReadThread(t, me, isMember)) return false;
  return !t.announceOnly || settings.announcements === 'everyone' || canModerateThread(t, me);
}

/** Senders edit their own messages. Mirrors edit_message(). */
export function canEditMessage(m: Pick<ChatMessage, 'from' | 'deleted'>, me: User): boolean {
  return !m.deleted && m.from === me.id;
}

/** Senders delete their own messages; moderators delete any they can read. Mirrors delete_message(). */
export function canDeleteMessage(
  m: Pick<ChatMessage, 'from' | 'deleted'>,
  t: Pick<Thread, 'scope'>,
  me: User,
): boolean {
  return !m.deleted && (m.from === me.id || canModerateThread(t, me));
}

/**
 * Whoever could have invited someone manages their invite until they join: club staff, or team
 * staff on one of their teams. Mirrors managesInvite() in supabase/functions/_shared/admin.ts.
 */
export function canManageInvite(me: User, user: User): boolean {
  if (!user.invited) return false;
  if (me.kind === 'club') return true;
  return me.kind === 'staff' && user.teams.some((t) => me.teams.includes(t));
}

/**
 * Who resets a forgotten password: club staff for anyone, team staff for parents and players on
 * their teams. Never their own, and only once someone has joined (invites are resent instead).
 * Mirrors managesMember() in supabase/functions/_shared/admin.ts.
 */
export function canResetPassword(me: User, user: User): boolean {
  if (user.invited || user.id === me.id) return false;
  if (me.kind === 'club') return true;
  return (
    me.kind === 'staff' &&
    (user.kind === 'parent' || user.kind === 'player') &&
    user.teams.some((t) => me.teams.includes(t))
  );
}

/**
 * Who disables, re-enables or removes a member: club staff, for anyone who has joined except
 * themselves and the club admin. Mirrors removesMember() in supabase/functions/_shared/admin.ts.
 */
export function canRemoveMember(me: User, user: User): boolean {
  return me.kind === 'club' && !user.invited && user.id !== me.id && !user.clubAdmin;
}

export function canEditEvent(e: Pick<ClubEvent, 'team'>, me: User): boolean {
  if (me.kind === 'club') return true;
  return me.kind === 'staff' && e.team !== 'ALL' && me.teams.includes(e.team);
}

/** Age-group number from a team id like `U16G`. */
export function ageOf(teamId: string): number {
  return Number(teamId.slice(1, 3)) || 0;
}
