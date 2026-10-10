/** Team identifier, e.g. `U12G`. */
export type TeamId = string;
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
}

/** Signs in at `/admin`; creates and edits clubs. The only account that spans clubs. */
export interface PlatformAdmin {
  id: string;
  name: string;
  email: string;
}

export interface Team {
  id: TeamId;
  name: string;
}

export type UserKind = 'club' | 'staff' | 'parent' | 'player';

/** How the signed-in user experiences the app. */
export type Persona = 'parent' | 'player' | 'teamStaff' | 'clubStaff';

export interface User {
  id: UserId;
  name: string;
  kind: UserKind;
  teams: TeamId[];
  /** Job title, used for club staff. */
  title?: string;
  email?: string;
  /** Invited but has not accepted yet. */
  invited?: boolean;
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
  userId: UserId | null;
  login: string;
  /** Link requested by a parent, waiting for team staff approval. */
  pending?: boolean;
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
  /** Title for special events. */
  title?: string;
  /** Opponent for games. */
  opponent?: string;
  home?: boolean;
  /** ISO date `YYYY-MM-DD`. */
  date?: string;
  /** 24h time `HH:mm`. */
  time?: string;
  tbd?: boolean;
  location: string;
  notes: string;
  score?: Score;
}

export type ClubEventDraft = Omit<ClubEvent, 'id'> & { id?: string };

export type RsvpStatus = 'going' | 'out';

/** eventId → attendeeId → status. Missing means undecided. */
export type RsvpMap = Record<string, Record<string, RsvpStatus>>;

/** Someone an RSVP can be recorded for: a player profile (parents) or the user themself. */
export interface Attendee {
  id: string;
  name: string;
  jersey: string;
}

export type MemberGroup = 'staff' | 'parents' | 'players';
export type IncludeGroups = Record<MemberGroup, boolean>;

export interface ChatMessage {
  id: string;
  from: UserId;
  text: string;
  /** ISO timestamp. */
  sentAt: string;
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
  /** Default `#announcements` / `#general` team channels. Membership is fixed. */
  isDefault: boolean;
  messages: ChatMessage[];
  unread: number;
}

/** The parts of a thread that decide who is in it. */
export type ThreadMembership = Pick<Thread, 'teams' | 'include' | 'members' | 'creatorId'>;
