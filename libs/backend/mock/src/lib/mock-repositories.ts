import { Injectable, inject } from '@angular/core';
import {
  AuthRepository,
  ChatEvent,
  ChatRepository,
  DemoAccount,
  Directory,
  DirectoryRepository,
  InviteMemberInput,
  LinkPlayerInput,
  NewThreadInput,
  SaveTeamInput,
  ScheduleRepository,
  UpdateProfileInput,
} from '@aura/backend/api';
import {
  ChatMessage,
  ClubEvent,
  ClubEventDraft,
  PlayerProfile,
  RsvpStatus,
  Score,
  Thread,
  ThreadMembership,
  User,
  UserId,
} from '@aura/shared/models';
import { ALL_GROUPS, effectiveMembers } from '@aura/shared/util';
import { MockDb } from './mock-db';

const REPLIES = ['Sounds good, thanks!', 'Got it.', 'Works for us.', 'See you there.', 'Thanks for the heads up.'];

@Injectable()
export class MockAuthRepository extends AuthRepository {
  private readonly db = inject(MockDb);
  private userId = this.db.options.initialUserId;

  currentUserId(): Promise<UserId> {
    return this.db.respond(this.userId);
  }

  demoAccounts(): DemoAccount[] {
    return [
      { userId: 'jordan', label: 'Parent' },
      { userId: 'eli', label: 'Player' },
      { userId: 'dana', label: 'Team Staff' },
      { userId: 'sam', label: 'Club Staff' },
    ];
  }

  signInAs(userId: UserId): Promise<void> {
    this.userId = userId;
    return this.db.respond(undefined);
  }
}

@Injectable()
export class MockDirectoryRepository extends DirectoryRepository {
  private readonly db = inject(MockDb);

  private snapshot(): Directory {
    const { club, teams, users, profiles } = this.db.data;
    return { club, teams, users, profiles };
  }

  load(): Promise<Directory> {
    return this.db.respond(this.snapshot());
  }

  inviteMember(input: InviteMemberInput): Promise<User> {
    const user: User = {
      id: this.db.nextId('u'),
      name: input.name,
      kind: input.kind,
      teams: [input.team],
      email: input.email,
      invited: true,
    };
    this.db.data.users.push(user);
    return this.db.respond(user);
  }

  saveTeam(input: SaveTeamInput): Promise<Directory> {
    const data = this.db.data;
    let teamId = input.id;
    if (!teamId) {
      const name = input.name ?? '';
      const [age, division] = name.split(' ');
      teamId = age + (division?.[0] ?? '');
      if (data.teams.some((t) => t.id === teamId)) return Promise.reject(new Error(`${name} already exists.`));
      data.teams.push({ id: teamId, name });
      for (const [suffix, channel] of [
        ['ann', '#announcements'],
        ['gen', '#general'],
      ]) {
        data.threads.push({
          id: `${teamId}-${suffix}`,
          name: channel,
          scope: teamId,
          teams: [teamId],
          include: { ...ALL_GROUPS },
          members: [],
          creatorId: null,
          isDefault: true,
          messages: [],
          unread: 0,
        });
      }
    }
    const id = teamId;
    data.users = data.users.map((u) => {
      if (u.kind !== 'staff') return u;
      const want = input.staffIds.includes(u.id);
      const has = u.teams.includes(id);
      if (want && !has) return { ...u, teams: [...u.teams, id] };
      if (!want && has) return { ...u, teams: u.teams.filter((t) => t !== id) };
      return u;
    });
    if (input.newStaff) {
      data.users.push({
        id: this.db.nextId('u'),
        name: input.newStaff.name,
        kind: 'staff',
        teams: [id],
        email: input.newStaff.email,
        invited: true,
      });
    }
    return this.db.respond(this.snapshot());
  }

  updateProfile(input: UpdateProfileInput): Promise<PlayerProfile> {
    const profile = this.db.data.profiles.find((p) => p.id === input.id);
    if (!profile) return Promise.reject(new Error('Player not found.'));
    Object.assign(profile, { name: input.name, jersey: input.jersey, login: input.login });
    return this.db.respond(profile);
  }

  requestPlayerLink(input: LinkPlayerInput): Promise<PlayerProfile> {
    const profile: PlayerProfile = {
      id: this.db.nextId('p'),
      name: input.name,
      jersey: input.jersey || '–',
      team: input.team,
      parentId: input.parentId,
      userId: null,
      login: '',
      pending: true,
    };
    this.db.data.profiles.push(profile);
    return this.db.respond(profile);
  }
}

@Injectable()
export class MockScheduleRepository extends ScheduleRepository {
  private readonly db = inject(MockDb);

  listEvents(): Promise<ClubEvent[]> {
    return this.db.respond(this.db.data.events);
  }

  listRsvps() {
    return this.db.respond(this.db.data.rsvps);
  }

  saveEvent(draft: ClubEventDraft): Promise<ClubEvent> {
    const events = this.db.data.events;
    const existing = draft.id ? events.find((e) => e.id === draft.id) : undefined;
    if (existing) {
      Object.assign(existing, draft);
      return this.db.respond(existing);
    }
    const created: ClubEvent = { ...draft, id: this.db.nextId('e') };
    events.push(created);
    return this.db.respond(created);
  }

  saveScore(eventId: string, score: Score): Promise<ClubEvent> {
    const event = this.db.data.events.find((e) => e.id === eventId);
    if (!event) return Promise.reject(new Error('Event not found.'));
    event.score = score;
    return this.db.respond(event);
  }

  setRsvp(eventId: string, attendeeIds: string[], status: RsvpStatus | null): Promise<void> {
    const forEvent = (this.db.data.rsvps[eventId] ??= {});
    for (const id of attendeeIds) {
      if (status) forEvent[id] = status;
      else delete forEvent[id];
    }
    return this.db.respond(undefined);
  }
}

@Injectable()
export class MockChatRepository extends ChatRepository {
  private readonly db = inject(MockDb);
  private readonly listeners = new Set<(event: ChatEvent) => void>();

  private thread(id: string): Thread {
    const t = this.db.data.threads.find((x) => x.id === id);
    if (!t) throw new Error('Thread not found.');
    return t;
  }

  listThreads(): Promise<Thread[]> {
    return this.db.respond(this.db.data.threads);
  }

  createThread(input: NewThreadInput): Promise<Thread> {
    const thread: Thread = { ...input, id: this.db.nextId('t'), isDefault: false, messages: [], unread: 0 };
    this.db.data.threads.unshift(thread);
    return this.db.respond(thread);
  }

  updateMembership(threadId: string, membership: Omit<ThreadMembership, 'creatorId'>): Promise<Thread> {
    const t = this.thread(threadId);
    Object.assign(t, membership);
    return this.db.respond(t);
  }

  sendMessage(threadId: string, from: UserId, text: string): Promise<ChatMessage> {
    const t = this.thread(threadId);
    const message: ChatMessage = { id: this.db.nextId('m'), from, text, sentAt: this.db.now().toISOString() };
    t.messages.push(message);
    this.simulateReply(t, from);
    return this.db.respond(message);
  }

  markRead(threadId: string): Promise<void> {
    this.thread(threadId).unread = 0;
    return this.db.respond(undefined);
  }

  listMuted(): Promise<string[]> {
    return this.db.respond(this.db.data.muted);
  }

  setMuted(threadId: string, muted: boolean): Promise<void> {
    const set = new Set(this.db.data.muted);
    if (muted) set.add(threadId);
    else set.delete(threadId);
    this.db.data.muted = [...set];
    return this.db.respond(undefined);
  }

  subscribe(listener: (event: ChatEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Someone else in the thread answers after a short pause, to exercise realtime updates. */
  private simulateReply(t: Thread, sender: UserId): void {
    const delay = this.db.options.replyDelayMs;
    if (!delay) return;
    const others = [...effectiveMembers(t, this.db.data.users)].filter((id) => id !== sender);
    if (!others.length) return;
    const from = others[Math.floor(Math.random() * Math.min(others.length, 6))];
    setTimeout(() => {
      const message: ChatMessage = {
        id: this.db.nextId('m'),
        from,
        text: REPLIES[Math.floor(Math.random() * REPLIES.length)],
        sentAt: this.db.now().toISOString(),
      };
      t.messages.push(message);
      t.unread++;
      const event: ChatEvent = { type: 'message', threadId: t.id, message: structuredClone(message) };
      this.listeners.forEach((l) => l(event));
    }, delay);
  }
}
