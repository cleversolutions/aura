import {
  ChatMessage,
  Club,
  ClubAccount,
  ClubEvent,
  ClubSettings,
  ClubStaffMember,
  ClubEventDraft,
  PlatformAdmin,
  PlayerProfile,
  RsvpMap,
  RsvpStatus,
  Score,
  Team,
  TeamId,
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

export interface Directory {
  club: Club;
  teams: Team[];
  users: User[];
  profiles: PlayerProfile[];
  settings: ClubSettings;
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
  /** Required when creating, e.g. `U13 Girls`. */
  name?: string;
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
  /** Job title; club staff only. */
  title?: string;
}

export interface UpdateProfileInput {
  id: string;
  name: string;
  jersey: string;
  login: string;
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
  /** Creates or updates a team and its staff assignments. Returns the refreshed directory. */
  abstract saveTeam(input: SaveTeamInput): Promise<SaveTeamResult>;
  /**
   * Members edit themselves; club staff edit anyone in the club; team staff edit invites to their
   * teams. Rejects an email already in use.
   */
  abstract updateMember(input: UpdateMemberInput): Promise<User>;
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
   * Club staff remove a member from the club: their sign-in goes, they are unlinked from players,
   * teams and threads, and their messages stay, from a "Former member". Not themselves, and not
   * the club admin.
   */
  abstract removeMember(userId: UserId): Promise<void>;
  abstract updateProfile(input: UpdateProfileInput): Promise<PlayerProfile>;
  abstract requestPlayerLink(input: LinkPlayerInput): Promise<PlayerProfile>;
  /** Club staff, or the team's staff, add a player to the roster. */
  abstract addPlayer(input: AddPlayerInput): Promise<AddPlayerResult>;
  /** Club staff, or the team's staff, change who a player's parents are. */
  abstract setPlayerParents(profileId: string, parentIds: UserId[]): Promise<PlayerProfile>;
  /** Club staff only. */
  abstract saveSettings(settings: ClubSettings): Promise<ClubSettings>;
}

export abstract class ScheduleRepository {
  abstract listEvents(): Promise<ClubEvent[]>;
  abstract listRsvps(): Promise<RsvpMap>;
  abstract saveEvent(draft: ClubEventDraft): Promise<ClubEvent>;
  abstract saveScore(eventId: string, score: Score): Promise<ClubEvent>;
  /** `status: null` clears the RSVP (undecided). */
  abstract setRsvp(eventId: string, attendeeIds: string[], status: RsvpStatus | null): Promise<void>;
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
}
