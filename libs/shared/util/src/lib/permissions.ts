import {
  ChatMessage,
  ClubEvent,
  ClubSettings,
  IncludeGroups,
  MemberGroup,
  Persona,
  PlayerProfile,
  Team,
  TeamId,
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

export const DEFAULT_CLUB_SETTINGS: ClubSettings = { announcements: 'staff', contacts: 'staff' };

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

/** Club staff and team staff: the members who have a title (free text, e.g. `Head Coach`). */
export function hasTitle(user: Pick<User, 'kind'>): boolean {
  return user.kind === 'club' || user.kind === 'staff';
}

/**
 * Who sets a staff member's title: any staff (club or team, the club admin included), for any
 * staff, whatever their teams. Mirrors editsTitle() in supabase/functions/_shared/admin.ts.
 */
export function canEditTitle(me: User, user: User): boolean {
  return hasTitle(me) && hasTitle(user);
}

/** Titles are free text up to this many characters. Mirrors TITLE_MAX in supabase/functions/_shared/admin.ts. */
export const TITLE_MAX = 60;

/**
 * Whether `me` sees `user`'s email. Always their own, the club staff's, and their own players'
 * (signing in themselves); with the default setting, club staff see everyone's, team staff their
 * teams' people, and families their teams' staff. Mirrors can_see_contact() in the migrations.
 */
export function canSeeContact(
  me: User,
  user: User,
  settings: ClubSettings,
  profiles: readonly Pick<PlayerProfile, 'userId' | 'parentIds'>[],
): boolean {
  if (me.id === user.id || me.kind === 'club' || user.kind === 'club' || settings.contacts === 'everyone') return true;
  if (profiles.some((p) => p.userId === user.id && p.parentIds.includes(me.id))) return true;
  return (me.kind === 'staff' || user.kind === 'staff') && user.teams.some((t) => me.teams.includes(t));
}

/**
 * Who puts a member on a team, or takes them off it: club staff for anyone but club staff (who join
 * no team), team staff for parents and players on their own teams. Mirrors can_change_member_team().
 */
export function canChangeMemberTeam(me: User, user: User, team: TeamId): boolean {
  if (user.kind === 'club') return false;
  if (me.kind === 'club') return true;
  return me.kind === 'staff' && (user.kind === 'parent' || user.kind === 'player') && me.teams.includes(team);
}

/** Club staff, or staff of `team`: who adds, approves, moves and removes its players. Mirrors can_manage_team(). */
export function canManageTeam(me: User, team: TeamId): boolean {
  return me.kind === 'club' || (me.kind === 'staff' && me.teams.includes(team));
}

/**
 * Who reads and edits a player's emergency contact and medical notes: their parents, the player
 * themself, club staff and the team's staff, whatever the contacts setting. The same people edit the
 * player's profile. Mirrors can_see_player_care().
 */
export function canSeePlayerCare(me: User, profile: Pick<PlayerProfile, 'team' | 'parentIds' | 'userId'>): boolean {
  return profile.parentIds.includes(me.id) || profile.userId === me.id || canManageTeam(me, profile.team);
}

export function canEditEvent(e: Pick<ClubEvent, 'team'>, me: User): boolean {
  if (me.kind === 'club') return true;
  return me.kind === 'staff' && e.team !== 'ALL' && me.teams.includes(e.team);
}

/**
 * The approved players at an event: on its team or, for a club-wide event, on a team of its season
 * (any team when the event has no season yet). Mirrors rsvp_profile_fits().
 */
export function eventPlayers(
  e: Pick<ClubEvent, 'team' | 'season'>,
  profiles: PlayerProfile[],
  teams: Pick<Team, 'id' | 'season'>[],
): PlayerProfile[] {
  const seasonOf = (team: TeamId) => teams.find((t) => t.id === team)?.season;
  return profiles.filter(
    (p) => !p.pending && (p.team === e.team || (e.team === 'ALL' && (!e.season || seasonOf(p.team) === e.season))),
  );
}

/**
 * Players whose RSVP `me` records at an event: their children, and themself as a player. A player's
 * RSVP is always their profile's, whoever records it, so parents and the player see one answer.
 */
export function rsvpPlayers(
  e: Pick<ClubEvent, 'team' | 'season'>,
  me: Pick<User, 'id'>,
  profiles: PlayerProfile[],
  teams: Pick<Team, 'id' | 'season'>[],
): PlayerProfile[] {
  return eventPlayers(e, profiles, teams).filter((p) => p.userId === me.id || p.parentIds.includes(me.id));
}

/** Members RSVP as themselves unless they are a player, who RSVPs through their profile. */
export function rsvpsAsSelf(me: Pick<User, 'id'>, profiles: PlayerProfile[]): boolean {
  return !profiles.some((p) => p.userId === me.id);
}

/** Whether `me` may record `attendeeId`'s RSVP to the event. Mirrors can_rsvp(). */
export function canRsvp(
  e: Pick<ClubEvent, 'team' | 'season'>,
  attendeeId: string,
  me: Pick<User, 'id'>,
  profiles: PlayerProfile[],
  teams: Pick<Team, 'id' | 'season'>[],
): boolean {
  if (attendeeId === me.id) return rsvpsAsSelf(me, profiles);
  return rsvpPlayers(e, me, profiles, teams).some((p) => p.id === attendeeId);
}

/**
 * Who reads an RSVP's note: the event's staff, and whoever RSVPs for the attendee. Mirrors
 * can_see_rsvp_note().
 */
export function canSeeRsvpNote(
  e: Pick<ClubEvent, 'team'>,
  attendeeId: string,
  me: User,
  profiles: PlayerProfile[],
): boolean {
  if (canEditEvent(e, me) || attendeeId === me.id) return true;
  return profiles.some((p) => p.id === attendeeId && (p.userId === me.id || p.parentIds.includes(me.id)));
}
