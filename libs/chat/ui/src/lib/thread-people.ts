import { ThreadMembership, User, UserId } from '@aura/shared/models';
import { includedViaTeam } from '@aura/shared/util';

export interface PersonRow {
  user: User;
  /** Team through which this person is already included, if any. */
  viaTeam: string | null;
  /** Added individually. */
  explicit: boolean;
}

export interface PeopleQuery {
  scope: string;
  creatorId: UserId;
  meId: UserId;
  /** Read-only view: only show people added individually. */
  locked: boolean;
  search: string;
}

/**
 * Candidate people for a thread's individual-member list. Explicit members first,
 * then people not yet included, then those already included via a team; each group
 * alphabetical.
 */
export function threadPeopleRows(form: ThreadMembership, users: readonly User[], q: PeopleQuery): PersonRow[] {
  const search = q.search.trim().toLowerCase();
  return users
    .filter(
      (u) =>
        u.id !== q.creatorId &&
        (q.scope === 'club' || u.teams.includes(q.scope) || u.id === q.meId || form.members.includes(u.id)),
    )
    .map((user) => ({ user, viaTeam: includedViaTeam(form, user), explicit: form.members.includes(user.id) }))
    .filter((r) => !q.locked || r.explicit)
    .filter((r) => !search || r.user.name.toLowerCase().includes(search))
    .sort(
      (a, b) =>
        Number(b.explicit) - Number(a.explicit) ||
        Number(!!a.viaTeam) - Number(!!b.viaTeam) ||
        a.user.name.localeCompare(b.user.name),
    );
}
