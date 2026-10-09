import {
  ChatMessage,
  Club,
  ClubEvent,
  ClubEventDraft,
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

export abstract class AuthRepository {
  abstract currentUserId(): Promise<UserId>;
  /** Accounts that can be switched to without credentials. Empty for real backends. */
  abstract demoAccounts(): DemoAccount[];
  abstract signInAs(userId: UserId): Promise<void>;
}

export interface Directory {
  club: Club;
  teams: Team[];
  users: User[];
  profiles: PlayerProfile[];
}

export interface InviteMemberInput {
  team: TeamId;
  kind: Exclude<UserKind, 'club'>;
  name: string;
  email: string;
}

export interface SaveTeamInput {
  /** Set when editing an existing team. */
  id?: TeamId;
  /** Required when creating, e.g. `U13 Girls`. */
  name?: string;
  staffIds: UserId[];
  newStaff?: { name: string; email: string };
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

export abstract class DirectoryRepository {
  abstract load(): Promise<Directory>;
  abstract inviteMember(input: InviteMemberInput): Promise<User>;
  /** Creates or updates a team and its staff assignments. Returns the refreshed directory. */
  abstract saveTeam(input: SaveTeamInput): Promise<Directory>;
  abstract updateProfile(input: UpdateProfileInput): Promise<PlayerProfile>;
  abstract requestPlayerLink(input: LinkPlayerInput): Promise<PlayerProfile>;
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

export type ChatEvent = { type: 'message'; threadId: string; message: ChatMessage };

export abstract class ChatRepository {
  abstract listThreads(): Promise<Thread[]>;
  abstract createThread(input: NewThreadInput): Promise<Thread>;
  abstract updateMembership(threadId: string, membership: Omit<ThreadMembership, 'creatorId'>): Promise<Thread>;
  abstract sendMessage(threadId: string, from: UserId, text: string): Promise<ChatMessage>;
  abstract markRead(threadId: string): Promise<void>;
  abstract listMuted(): Promise<string[]>;
  abstract setMuted(threadId: string, muted: boolean): Promise<void>;
  /** Realtime feed of messages from other people. Returns an unsubscribe function. */
  abstract subscribe(listener: (event: ChatEvent) => void): () => void;
}
