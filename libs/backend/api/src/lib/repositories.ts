import {
  ChatMessage,
  Club,
  ClubAccount,
  ClubEvent,
  ClubSettings,
  ClubStaffMember,
  ClubEventDraft,
  PlatformAdmin,
  PlayerCare,
  PlayerProfile,
  RsvpMap,
  RsvpStatus,
  Score,
  Season,
  SeasonId,
  Team,
  TeamId,
  TeamRole,
  Thread,
  ThreadMembership,
  ThreadScope,
  User,
  UserId,
  UserKind,
} from '@aura/shared/models';

/**
 * Backend ports. Feature code depends only on these abstract classes; a provider
 * function (`provideMockBackend()` today, a Supabase one later) binds the implementations.
 */

export interface DemoAccount {
  userId: UserId;
  label: string;
}

export interface DemoClub {
  slug: string;
  name: string;
}

export interface SignInInput {
  /** The club's link slug. Usernames are only unique within a club. */
  clubSlug: string;
  username: string;
  password: string;
}

export interface ClubSession {
  userId: UserId;
  /** Signed in with a temporary password; must choose their own before using the app. */
  mustChangePassword: boolean;
}

/**
 * Sign-in for club members and the platform admin.
 *
 * Club accounts belong to exactly one club: the same username in two clubs is two
 * different people, so signing in always names the club. Sessions are kept per club
 * (installed club apps share browser storage on one origin, so a real implementation
 * keys its stored session by slug), and `useClub` picks the one the app works in.
 * Every other repository is scoped to the active club.
 */
export abstract class AuthRepository {
  /** Makes `slug` the active club. Call before `session()` and before loading club data. */
  abstract useClub(slug: string): Promise<void>;
  /** The active club's session, or null when signed out of it. */
  abstract session(): Promise<ClubSession | null>;
  abstract signIn(input: SignInInput): Promise<ClubSession>;
  /** Replaces a temporary password; an invited member has then accepted their invite. */
  abstract changePassword(newPassword: string): Promise<void>;
  abstract signOut(): Promise<void>;

  /** Accounts in the active club that can be switched to without credentials. Empty for real backends. */
  abstract demoAccounts(): DemoAccount[];
  abstract signInAs(userId: UserId): Promise<void>;
  /** Seeded clubs to offer on the landing page. Empty for real backends. */
  abstract demoClubs(): DemoClub[];

  abstract platformSession(): Promise<PlatformAdmin | null>;
  abstract signInPlatform(email: string, password: string): Promise<PlatformAdmin>;
  abstract signOutPlatform(): Promise<void>;
  /**
   * Platform admin only: makes `slug` the active club, showing sample data under the
   * club's branding and signed in as sample club staff. Ended by `useClub`.
   */
  abstract usePreview(slug: string): Promise<void>;
}

/**
 * The club as the signed-in member sees it. Teams cover every season; people's teams and the player
 * profiles are the current season's (`loadSeason` has a past season's).
 */
export interface Directory {
  club: Club;
  seasons: Season[];
  teams: Team[];
  users: User[];
  profiles: PlayerProfile[];
  settings: ClubSettings;
}

/** A past season's rosters, read-only: who was on each of its teams, and its players. */
export interface SeasonRoster {
  /** Team id → the members who were on it (staff, parents, players), if still in the club. */
  members: Record<TeamId, UserId[]>;
  profiles: PlayerProfile[];
}

/** A team of the current season carried into the next one. */
export interface CarriedTeam {
  /** The current season's team. */
  from: TeamId;
  name: string;
  age?: string;
  division?: string;
  /** Its staff join the new team. */
  staff: boolean;
  /** Its approved players join the new team, with their parents and own sign-ins. */
  players: boolean;
}

export interface StartSeasonInput {
  name: string;
  /** Teams left out end with the current season. */
  teams: CarriedTeam[];
}

/** Someone invited to a team, or (by club staff) to the club staff, who belong to no team. */
export type InviteMemberInput =
  | { kind: Exclude<UserKind, 'club'>; team: TeamId; name: string; email: string }
  | { kind: 'club'; title: string; name: string; email: string };

/**
 * Someone just invited, with the sign-in to hand them. There is no invite email yet: staff share
 * the club link, username and temporary password themselves, and the member chooses their own
 * password on first sign-in.
 */
export interface MemberInvite {
  user: User;
  username: string;
  temporaryPassword: string;
}

export interface SaveTeamInput {
  /** Set when editing an existing team. */
  id?: TeamId;
  /** Free text, e.g. `U11 Boys Red`; unique within the season. */
  name: string;
  age?: string;
  division?: string;
  /** May be empty: club staff manage a team until it has staff. */
  staffIds: UserId[];
  newStaff?: { name: string; email: string };
}

export interface SaveTeamResult {
  directory: Directory;
  /** Set when `newStaff` was invited. */
  invite: MemberInvite | null;
}

/** A member's own details. The email is also their sign-in username at the club. */
export interface UpdateMemberInput {
  id: UserId;
  name: string;
  email: string;
  /** Job title; staff (club or team) only, ignored for others. */
  title?: string;
  /** Optional ('' clears it); left out to keep the current one. */
  phone?: string;
}

export interface UpdateProfileInput {
  id: string;
  name: string;
  jersey: string;
  /** Left out to keep what is recorded. */
  care?: PlayerCare;
}

export interface LinkPlayerInput {
  name: string;
  team: TeamId;
  jersey: string;
  parentId: UserId;
}

export interface AddPlayerInput {
  team: TeamId;
  name: string;
  jersey: string;
  /** Members who manage the player; any kind, e.g. a coach who is also a parent. */
  parentIds: UserId[];
  /** Set when the player signs in themselves: they are invited with this email. */
  email?: string;
}

export interface AddPlayerResult {
  profile: PlayerProfile;
  /** The player's own sign-in, when they were given an email. */
  invite: MemberInvite | null;
}

export abstract class DirectoryRepository {
  /** Public club branding by link slug, readable before signing in. Null if no such club. */
  abstract findClub(slug: string): Promise<Club | null>;
  /**
   * URL of the club's web app manifest, so each club installs as its own app.
   * Served by the backend; null when there is no server to build it (mock).
   */
  abstract manifestUrl(slug: string): string | null;
  /** The active club's directory. */
  abstract load(): Promise<Directory>;
  abstract inviteMember(input: InviteMemberInput): Promise<MemberInvite>;
  /**
   * Club staff create a team in the current season, or rename one and change its staff. Returns the
   * refreshed directory.
   */
  abstract saveTeam(input: SaveTeamInput): Promise<SaveTeamResult>;
  /**
   * Club staff delete a team of the current season that has no players and no events (a mistake),
   * with its chat threads. Teams with a history end with their season instead.
   */
  abstract deleteTeam(teamId: TeamId): Promise<Directory>;
  /**
   * Club staff end the current season and start a new one, carrying teams over (renamed, with or
   * without their staff and players). The ended season becomes read-only. Returns the new directory.
   */
  abstract startSeason(input: StartSeasonInput): Promise<Directory>;
  /** A past season's rosters, read-only. */
  abstract loadSeason(seasonId: SeasonId): Promise<SeasonRoster>;
  /**
   * Members edit themselves; club staff edit anyone in the club; team staff edit invites to their
   * teams. Rejects an email already in use.
   */
  abstract updateMember(input: UpdateMemberInput): Promise<User>;
  /** A staff member's title ('' clears it): club staff for any staff, team staff for team staff (`canEditTitle`). */
  abstract setMemberTitle(userId: UserId, title: string): Promise<User>;
  /** Removes someone invited who has not joined yet. Club staff, or staff of one of their teams. */
  abstract cancelInvite(userId: UserId): Promise<void>;
  /** A new temporary password for someone invited; the previous one stops working. */
  abstract resendInvite(userId: UserId): Promise<MemberInvite>;
  /**
   * A new temporary password for a member who has joined (a forgotten password), which they must
   * replace at their next sign-in. Club staff for anyone; team staff for their teams' parents and
   * players.
   */
  abstract resetPassword(userId: UserId): Promise<MemberInvite>;
  /**
   * Club staff disable a member, who then cannot sign in or take part but stays on record, or
   * enable them again. Not themselves, and not the club admin.
   */
  abstract setMemberDisabled(userId: UserId, disabled: boolean): Promise<User>;
  /**
   * Makes a parent team staff, or team staff a parent again, keeping their sign-in, teams and
   * players (`canChangeRole`). A parent again loses their title.
   */
  abstract setMemberRole(userId: UserId, kind: TeamRole): Promise<User>;
  /**
   * Club staff remove a member from the club: their sign-in goes, they are unlinked from players,
   * teams and threads, and their messages stay, from a "Former member". Not themselves, and not
   * the club admin.
   */
  abstract removeMember(userId: UserId): Promise<void>;
  /**
   * Puts a member on teams, or takes them off: club staff for anyone but club staff, team staff for
   * parents and players on their own teams (`canChangeMemberTeam`). Also how someone already in
   * the club joins another team, instead of being invited again.
   */
  abstract setMemberTeams(userId: UserId, teams: TeamId[]): Promise<User>;
  /**
   * The player's parents, the player, club staff and the team's staff (`canSeePlayerCare`), who are
   * also the only ones who read and write the player's care details.
   */
  abstract updateProfile(input: UpdateProfileInput): Promise<PlayerProfile>;
  /** A parent asks to link a player; the player is pending until the team's staff approve. */
  abstract requestPlayerLink(input: LinkPlayerInput): Promise<PlayerProfile>;
  /** Club staff, or the team's staff, approve a parent's link request. */
  abstract approvePlayer(profileId: string): Promise<PlayerProfile>;
  /**
   * Club staff, or the team's staff, take a player off the roster (or reject a link request), with
   * their RSVPs. Their parents, and their own sign-in if they have one, stay in the club.
   */
  abstract removePlayer(profileId: string): Promise<void>;
  /**
   * Moves a player to another team, for whoever manages both. Their parents and own sign-in join
   * the new team; parents leave the old one unless another of their players is on it. Returns the
   * refreshed directory.
   */
  abstract movePlayer(profileId: string, team: TeamId): Promise<Directory>;
  /** Club staff, or the team's staff, give a player on the roster their own sign-in. */
  abstract givePlayerSignIn(profileId: string, email: string): Promise<MemberInvite>;
  /** Club staff, or the team's staff, add a player to the roster. */
  abstract addPlayer(input: AddPlayerInput): Promise<AddPlayerResult>;
  /** Club staff, or the team's staff, change who a player's parents are. */
  abstract setPlayerParents(profileId: string, parentIds: UserId[]): Promise<PlayerProfile>;
  /** Club staff only. */
  abstract saveSettings(settings: ClubSettings): Promise<ClubSettings>;
}

export abstract class ScheduleRepository {
  abstract listEvents(): Promise<ClubEvent[]>;
  /** Every RSVP in the club; notes only where the viewer may read them (`canSeeRsvpNote`). */
  abstract listRsvps(): Promise<RsvpMap>;
  /** Whoever can edit the event (`canEditEvent`), in the current season. */
  abstract saveEvent(draft: ClubEventDraft): Promise<ClubEvent>;
  abstract saveScore(eventId: string, score: Score): Promise<ClubEvent>;
  /** Calls an event off, keeping it on the schedule with its RSVPs, or restores it. */
  abstract setCancelled(eventId: string, cancelled: boolean): Promise<ClubEvent>;
  /** Deletes an event entered by mistake, with its RSVPs. */
  abstract deleteEvent(eventId: string): Promise<void>;
  /**
   * Creates the draft every week, on the same weekday and time, from its date until `until`
   * (inclusive; at most `MAX_WEEKS` events). The events share a new `seriesId`.
   */
  abstract createWeekly(draft: ClubEventDraft, until: string): Promise<ClubEvent[]>;
  /**
   * Applies an edit of a repeating event to it and every later event of its series: the same
   * fields, with dates moved by as many days as this one's. Each week keeps its score, cancellation
   * and RSVPs. Returns the changed events.
   */
  abstract saveSeries(draft: ClubEventDraft & { id: string }): Promise<ClubEvent[]>;
  /** Deletes a repeating event and every later event of its series, with their RSVPs. Returns their ids. */
  abstract deleteSeries(eventId: string): Promise<string[]>;
  /**
   * Records the RSVP of attendees `canRsvp` allows; `status: null` clears it (undecided). A note is
   * kept unless `note` is given ('' clears it). Cancelled events take no new answers.
   */
  abstract setRsvp(eventId: string, attendeeIds: string[], status: RsvpStatus | null, note?: string): Promise<void>;
}

export interface NewThreadInput extends Omit<ThreadMembership, 'creatorId'> {
  name: string;
  scope: ThreadScope;
  creatorId: UserId;
}

/** A new message from someone else, or an edit or deletion of any message (yours included). */
export type ChatEvent =
  | { type: 'message'; threadId: string; message: ChatMessage }
  | { type: 'updated'; threadId: string; message: ChatMessage };

export abstract class ChatRepository {
  abstract listThreads(): Promise<Thread[]>;
  abstract createThread(input: NewThreadInput): Promise<Thread>;
  abstract updateMembership(threadId: string, membership: Omit<ThreadMembership, 'creatorId'>): Promise<Thread>;
  /** Members post; announcement channels take staff only unless the club lets everyone post. */
  abstract sendMessage(threadId: string, from: UserId, text: string): Promise<ChatMessage>;
  /** Senders edit their own messages. */
  abstract editMessage(threadId: string, messageId: string, text: string): Promise<ChatMessage>;
  /** Senders delete their own messages; staff delete any in threads they moderate. */
  abstract deleteMessage(threadId: string, messageId: string): Promise<ChatMessage>;
  abstract markRead(threadId: string): Promise<void>;
  abstract listMuted(): Promise<string[]>;
  abstract setMuted(threadId: string, muted: boolean): Promise<void>;
  /** Realtime feed of messages from other people. Returns an unsubscribe function. */
  abstract subscribe(listener: (event: ChatEvent) => void): () => void;
}

export interface ClubInput {
  name: string;
  slug: string;
  logoUrl: string;
  icons?: Club['icons'];
  ink: string;
  paper: string;
  logoInk: string;
  logoPaper: string;
  adminName: string;
  adminEmail: string;
}

export interface NewClubInput extends ClubInput {
  /** The club admin signs in with this once, then chooses their own. */
  temporaryPassword: string;
}

/** Club management for the platform admin. */
export abstract class PlatformRepository {
  abstract listClubs(): Promise<ClubAccount[]>;
  /** Creates the club and its admin account. Rejects if the slug is taken. */
  abstract createClub(input: NewClubInput): Promise<ClubAccount>;
  /** The slug is fixed once created; changing it would break installed apps. */
  abstract updateClub(id: string, input: Omit<ClubInput, 'slug'>): Promise<ClubAccount>;
  /** The club's staff, the admin among them. */
  abstract listClubStaff(clubId: string): Promise<ClubStaffMember[]>;
  /** Makes one of the club's staff, who has joined and is not disabled, its admin. */
  abstract setClubAdmin(clubId: string, memberId: UserId): Promise<ClubAccount>;
  /** A new temporary password for the club admin, which they must replace at their next sign-in. */
  abstract resetAdminPassword(clubId: string): Promise<MemberInvite>;
  /**
   * Archives the club, or restores it. An archived club is read-only: its members still sign in
   * and read everything, but cannot change anything.
   */
  abstract setArchived(clubId: string, archived: boolean): Promise<ClubAccount>;
}
