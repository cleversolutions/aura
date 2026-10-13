/** Team identifier: stable, never derived from the name (older teams have ids like `U12G`). */
export type TeamId = string;
export type SeasonId = string;
export type UserId = string;

/** Events can target a single team or the whole club. */
export type EventTeam = TeamId | 'ALL';

/** Threads belong to a team, or to the club as a whole. */
export type ThreadScope = TeamId | 'club';

export type ClubId = string;

/**
 * A club's public identity and branding. Each club lives at its own link
 * (`/<slug>`) and installs as its own app. People belong to exactly one club.
 */
export interface Club {
  id: ClubId;
  /** Unguessable path segment of the club's link, e.g. `k3v9qp`. */
  slug: string;
  name: string;
  logoUrl: string;
  /** App colours: `ink` replaces black, `paper` replaces white. */
  ink: string;
  paper: string;
  /** Square PNG app icons (maskable), when generated. */
  icons?: { size192: string; size512: string };
  /** ISO timestamp, when the platform admin archived it. An archived club is read-only. */
  archivedAt?: string;
}

/** A club as the platform admin manages it. */
export interface ClubAccount extends Club {
  /** The colours read from the logo, for "Reset to logo colours". */
  logoInk: string;
  logoPaper: string;
  adminName: string;
  /** The club admin's sign-in username. */
  adminEmail: string;
  /** ISO timestamp. */
  createdAt: string;
  /** Listed clubs only: people who have joined (and are not disabled), open invites, this season's teams. */
  counts?: ClubCounts;
}

export interface ClubCounts {
  members: number;
  invited: number;
  teams: number;
}

/** One of a club's staff, as the platform admin sees them when choosing the club admin. */
export interface ClubStaffMember {
  id: UserId;
  name: string;
  /** Their sign-in username. */
  email: string;
  title?: string;
  invited?: boolean;
  disabled?: boolean;
  /** The current club admin. */
  admin: boolean;
}

/** Signs in at `/admin`; creates and edits clubs. The only account that spans clubs. */
export interface PlatformAdmin {
  id: string;
  name: string;
  email: string;
}

/**
 * A club's season. Teams, rosters and events belong to one; only the current season changes, and
 * past seasons are read-only.
 */
export interface Season {
  id: SeasonId;
  name: string;
  /** ISO date. */
  startedAt: string;
  /** ISO date; absent for the current season. */
  endedAt?: string;
}

export interface Team {
  id: TeamId;
  /** Free text, unique within its season, e.g. `U11 Boys Red`. */
  name: string;
  season: SeasonId;
  /** Optional age group, e.g. `U11` or `Adult` (`TEAM_AGES` in shared/util). */
  age?: string;
  /** Optional division, e.g. `Boys` (`TEAM_DIVISIONS` in shared/util). */
  division?: string;
}

export type UserKind = 'club' | 'staff' | 'parent' | 'player';
/** The roles a member can be moved between after joining: a parent made team staff, and back. */
export type TeamRole = Extract<UserKind, 'staff' | 'parent'>;

/** How the signed-in user experiences the app. */
export type Persona = 'parent' | 'player' | 'teamStaff' | 'clubStaff';

export interface User {
  id: UserId;
  name: string;
  kind: UserKind;
  teams: TeamId[];
  /** Free-text job title for club and team staff, e.g. `Club Director`, `Head Coach`. */
  title?: string;
  /** Also their sign-in username. Left out when the viewer may not see it (`ClubSettings.contacts`). */
  email?: string;
  /** Optional; shown by the same rule as the email. */
  phone?: string;
  /** Invited but has not accepted yet. */
  invited?: boolean;
  /** Disabled by club staff: on record, but cannot sign in or take part until re-enabled. */
  disabled?: boolean;
  /** The club's admin (club staff), whom only the platform admin replaces. */
  clubAdmin?: boolean;
}

/**
 * A player on a roster: managed by their parents (any members, including staff), and/or signing
 * in themselves (`userId`).
 */
export interface PlayerProfile {
  id: string;
  name: string;
  jersey: string;
  team: TeamId;
  parentIds: UserId[];
  /** The player's own sign-in, when they have one. */
  userId: UserId | null;
  /** Link requested by a parent, waiting for team staff approval. */
  pending?: boolean;
  /**
   * Left out when none is recorded, or when the viewer may not see it (`canSeePlayerCare`: the
   * player's family and staff only).
   */
  care?: PlayerCare;
}

/** What staff need in an emergency. Either may be empty. */
export interface PlayerCare {
  /** e.g. `Grandma Lee · 555-0142`. */
  emergencyContact: string;
  /** Allergies, conditions, medication. */
  medicalNotes: string;
}

export type EventType = 'practice' | 'game' | 'special';

export interface Score {
  us: number;
  them: number;
}

export interface ClubEvent {
  id: string;
  type: EventType;
  team: EventTeam;
  /** The season it belongs to (its team's, or the current one for club-wide events). Left out of drafts. */
  season?: SeasonId;
  /** Title for special events. */
  title?: string;
  /** Opponent for games. */
  opponent?: string;
  home?: boolean;
  /** ISO date `YYYY-MM-DD`. */
  date?: string;
  /** 24h time `HH:mm`. */
  time?: string;
  /** 24h time `HH:mm`, after `time`. */
  endTime?: string;
  /** 24h time `HH:mm`, no later than `time`: when players should be there. */
  arriveBy?: string;
  tbd?: boolean;
  location: string;
  notes: string;
  score?: Score;
  /** Called off (weather, a clash): kept on the schedule, shown CANCELLED, closed to RSVPs. */
  cancelled?: boolean;
  /** Weekly events created together share a series, to be changed or deleted from one week on. */
  seriesId?: string;
}

export type ClubEventDraft = Omit<ClubEvent, 'id'> & { id?: string };

export type RsvpStatus = 'going' | 'out';

export interface Rsvp {
  status: RsvpStatus;
  /** e.g. `Late, 15 min`. Empty, or left out, when the viewer may not read it (`canSeeRsvpNote`). */
  note?: string;
}

/** eventId → attendeeId → RSVP. Missing means undecided. */
export type RsvpMap = Record<string, Record<string, Rsvp>>;

/**
 * Someone an RSVP can be recorded for: a player profile (whether a parent or the player answers),
 * or a member without one (staff, parents) for themself.
 */
export interface Attendee {
  id: string;
  name: string;
  jersey: string;
}

export type MemberGroup = 'staff' | 'parents' | 'players';
export type IncludeGroups = Record<MemberGroup, boolean>;

export interface ChatMessage {
  id: string;
  /** Null once the sender has been removed from the club ("Former member"). */
  from: UserId | null;
  /** Empty once deleted. */
  text: string;
  /** ISO timestamp. */
  sentAt: string;
  /** ISO timestamp of the last edit. */
  editedAt?: string;
  /** Deleted by the sender or staff; keeps its place in the conversation. */
  deleted?: boolean;
}

export interface Thread {
  id: string;
  name: string;
  scope: ThreadScope;
  /** Teams whose members (filtered by `include`) belong to the thread automatically. */
  teams: TeamId[];
  include: IncludeGroups;
  /** People added individually. */
  members: UserId[];
  creatorId: UserId | null;
  /**
   * Default channels, whose membership is fixed: a team's `#announcements` and `#general` (everyone
   * on the team), and the club's `#club-announcements` (scope `club`: everyone in the club).
   */
  isDefault: boolean;
  /** Announcement channel: only staff post, unless the club lets everyone (`ClubSettings`). */
  announceOnly: boolean;
  messages: ChatMessage[];
  unread: number;
}

/** The parts of a thread that decide who is in it. */
export type ThreadMembership = Pick<Thread, 'teams' | 'include' | 'members' | 'creatorId'>;

/** Who may post in announcement channels: staff only, or everyone in the channel. */
export type AnnouncementsPosting = 'staff' | 'everyone';

/**
 * Who sees members' contact details (emails): `staff` lets club staff see everyone's, team staff
 * their teams' people, and families their teams' staff and the club staff; `everyone` lets everyone
 * in the club see everyone's.
 */
export type ContactsVisibility = 'staff' | 'everyone';

/** Club-wide choices made by club staff. A club that never changed them has the defaults. */
export interface ClubSettings {
  announcements: AnnouncementsPosting;
  contacts: ContactsVisibility;
}
