import {
  ClubEvent,
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

/**
 * Everyone in a thread: the creator, people added individually, and members of the
 * linked teams whose group is included.
 */
export function effectiveMembers(t: ThreadMembership, users: readonly User[]): Set<UserId> {
  const out = new Set<UserId>(t.members);
  if (t.creatorId) out.add(t.creatorId);
  for (const u of users) {
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
 * Whoever could have invited someone manages their invite until they join: club staff, or team
 * staff on one of their teams. Mirrors managesInvite() in supabase/functions/_shared/admin.ts.
 */
export function canManageInvite(me: User, user: User): boolean {
  if (!user.invited) return false;
  if (me.kind === 'club') return true;
  return me.kind === 'staff' && user.teams.some((t) => me.teams.includes(t));
}

export function canEditEvent(e: Pick<ClubEvent, 'team'>, me: User): boolean {
  if (me.kind === 'club') return true;
  return me.kind === 'staff' && e.team !== 'ALL' && me.teams.includes(e.team);
}

/** Age-group number from a team id like `U16G`. */
export function ageOf(teamId: string): number {
  return Number(teamId.slice(1, 3)) || 0;
}
