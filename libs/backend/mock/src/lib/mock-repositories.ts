import { Injectable, inject } from '@angular/core';
import {
  AuthRepository,
  ChatEvent,
  ChatRepository,
  ClubInput,
  ClubSession,
  DemoAccount,
  DemoClub,
  Directory,
  DirectoryRepository,
  InviteMemberInput,
  LinkPlayerInput,
  MemberInvite,
  NewClubInput,
  NewThreadInput,
  PlatformRepository,
  SaveTeamInput,
  SaveTeamResult,
  ScheduleRepository,
  UpdateMemberInput,
  SignInInput,
  UpdateProfileInput,
} from '@aura/backend/api';
import {
  ChatMessage,
  Club,
  ClubAccount,
  ClubEvent,
  ClubEventDraft,
  PlatformAdmin,
  PlayerProfile,
  RsvpStatus,
  Score,
  Thread,
  ThreadMembership,
  User,
  UserId,
} from '@aura/shared/models';
import { ALL_GROUPS, effectiveMembers, temporaryPassword } from '@aura/shared/util';
import { DEMO_PLATFORM_ADMIN, createEmptyClubData } from './clubs';
import { MockDb } from './mock-db';

const REPLIES = ['Sounds good, thanks!', 'Got it.', 'Works for us.', 'See you there.', 'Thanks for the heads up.'];

@Injectable()
export class MockAuthRepository extends AuthRepository {
  private readonly db = inject(MockDb);

  useClub(slug: string): Promise<void> {
    if (!this.db.findClub(slug)) return this.db.fail('No club at this link.');
    this.db.preview = null;
    this.db.activeSlug = slug;
    return this.db.respond(undefined);
  }

  session(): Promise<ClubSession | null> {
    if (this.db.preview) return this.db.respond(this.db.preview.session);
    return this.db.respond(this.db.sessions.get(this.db.activeSlug) ?? null);
  }

  signIn({ clubSlug, username, password }: SignInInput): Promise<ClubSession> {
    const club = this.db.findClub(clubSlug);
    if (!club) return this.db.fail('No club at this link.');
    const name = username.trim().toLowerCase();
    const cred = club.credentials.find((c) => c.username.toLowerCase() === name);
    if (!cred || cred.password !== password) {
      return this.db.fail('That username and password don’t match an account at this club.');
    }
    const session: ClubSession = { userId: cred.userId, mustChangePassword: cred.mustChangePassword };
    this.db.sessions.set(clubSlug, session);
    this.db.preview = null;
    this.db.activeSlug = clubSlug;
    return this.db.respond(session);
  }

  changePassword(newPassword: string): Promise<void> {
    const session = this.db.sessions.get(this.db.activeSlug);
    const cred = session && this.db.club.credentials.find((c) => c.userId === session.userId);
    if (!session || !cred) return this.db.fail('Sign in again to change your password.');
    if (newPassword.length < 8) return this.db.fail('Use at least 8 characters.');
    Object.assign(cred, { password: newPassword, mustChangePassword: false });
    session.mustChangePassword = false;
    const user = this.db.data.users.find((u) => u.id === session.userId);
    if (user) delete user.invited;
    return this.db.respond(undefined);
  }

  signOut(): Promise<void> {
    this.db.sessions.delete(this.db.activeSlug);
    return this.db.respond(undefined);
  }

  demoAccounts(): DemoAccount[] {
    return this.db.preview ? [] : this.db.club.demoAccounts;
  }

  signInAs(userId: UserId): Promise<void> {
    this.db.sessions.set(this.db.activeSlug, { userId, mustChangePassword: false });
    return this.db.respond(undefined);
  }

  demoClubs(): DemoClub[] {
    return this.db.clubs.map((c) => ({ slug: c.account.slug, name: c.account.name }));
  }

  platformSession(): Promise<PlatformAdmin | null> {
    return this.db.respond(this.db.platformAdmin);
  }

  signInPlatform(email: string, password: string): Promise<PlatformAdmin> {
    const { password: expected, ...admin } = DEMO_PLATFORM_ADMIN;
    if (email.trim().toLowerCase() !== admin.email || password !== expected) {
      return this.db.fail('Wrong email or password.');
    }
    this.db.platformAdmin = admin;
    return this.db.respond(admin);
  }

  signOutPlatform(): Promise<void> {
    this.db.platformAdmin = null;
    this.db.preview = null;
    return this.db.respond(undefined);
  }

  usePreview(slug: string): Promise<void> {
    const club = this.db.findClub(slug);
    if (!this.db.platformAdmin) return this.db.fail('Only the platform admin can preview clubs.');
    if (!club) return this.db.fail('No club at this link.');
    this.db.startPreview(club.account);
    return this.db.respond(undefined);
  }
}

/** The public part of a club record. */
function toClub({ id, slug, name, logoUrl, ink, paper, icons }: ClubAccount): Club {
  return { id, slug, name, logoUrl, ink, paper, ...(icons ? { icons } : {}) };
}

@Injectable()
export class MockDirectoryRepository extends DirectoryRepository {
  private readonly db = inject(MockDb);

  private snapshot(): Directory {
    const { teams, users, profiles } = this.db.data;
    return { club: toClub(this.db.club.account), teams, users, profiles };
  }

  findClub(slug: string): Promise<Club | null> {
    const club = this.db.findClub(slug);
    return this.db.respond(club ? toClub(club.account) : null);
  }

  manifestUrl(): string | null {
    // No server to build per-club manifests; the app keeps the static one.
    return null;
  }

  load(): Promise<Directory> {
    return this.db.respond(this.snapshot());
  }

  inviteMember(input: InviteMemberInput): Promise<MemberInvite> {
    const invite = this.invite(input);
    return invite instanceof Error ? this.db.fail(invite.message) : this.db.respond(invite);
  }

  /** Adds an invited member with a sign-in they must replace, like the real invite-member function. */
  private invite({ team, kind, name, email }: InviteMemberInput): MemberInvite | Error {
    const taken = this.db.club.credentials.some((c) => c.username.toLowerCase() === email.trim().toLowerCase());
    if (taken) return new Error(`${email} already has an account at this club.`);
    const user: User = { id: this.db.nextId('u'), name, kind, teams: [team], email, invited: true };
    const password = temporaryPassword();
    this.db.data.users.push(user);
    this.db.club.credentials.push({ userId: user.id, username: email, password, mustChangePassword: true });
    return { user, username: email, temporaryPassword: password };
  }

  saveTeam(input: SaveTeamInput): Promise<SaveTeamResult> {
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
    let invite: MemberInvite | null = null;
    if (input.newStaff) {
      const result = this.invite({ team: id, kind: 'staff', ...input.newStaff });
      if (result instanceof Error) return this.db.fail(result.message);
      invite = result;
    }
    return this.db.respond({ directory: this.snapshot(), invite });
  }

  updateMember({ id, name, email, title }: UpdateMemberInput): Promise<User> {
    const club = this.db.club;
    const meId = this.db.preview?.session.userId ?? this.db.sessions.get(this.db.activeSlug)?.userId;
    const me = club.data.users.find((u) => u.id === meId);
    if (!me || (me.id !== id && me.kind !== 'club'))
      return this.db.fail('Only club staff can edit other people’s details.');
    const user = club.data.users.find((u) => u.id === id);
    if (!user) return this.db.fail('Member not found.');
    const username = email.trim();
    const taken = club.credentials.some((c) => c.userId !== id && c.username.toLowerCase() === username.toLowerCase());
    if (taken) return this.db.fail(`${username} already has an account at this club.`);
    Object.assign(user, { name: name.trim(), email: username });
    if (user.kind === 'club' && title !== undefined) user.title = title.trim();
    const cred = club.credentials.find((c) => c.userId === id);
    if (cred) cred.username = username;
    if (id === club.adminUserId) Object.assign(club.account, { adminName: user.name, adminEmail: username });
    return this.db.respond(user);
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

@Injectable()
export class MockPlatformRepository extends PlatformRepository {
  private readonly db = inject(MockDb);

  private denied(): Promise<never> | null {
    return this.db.platformAdmin ? null : this.db.fail('Sign in as the platform admin.');
  }

  listClubs(): Promise<ClubAccount[]> {
    return this.denied() ?? this.db.respond(this.db.clubs.map((c) => c.account));
  }

  createClub(input: NewClubInput): Promise<ClubAccount> {
    const denied = this.denied();
    if (denied) return denied;
    if (this.db.findClub(input.slug)) return this.db.fail('That link is already taken. Generate a new one.');
    const { temporaryPassword, ...fields } = input;
    const admin: User = {
      id: 'admin',
      name: input.adminName,
      kind: 'club',
      teams: [],
      title: 'Club Admin',
      email: input.adminEmail,
    };
    const account: ClubAccount = { ...fields, id: this.db.nextId('c'), createdAt: this.db.now().toISOString() };
    this.db.clubs.push({
      account,
      data: createEmptyClubData(admin),
      credentials: [
        { userId: admin.id, username: input.adminEmail, password: temporaryPassword, mustChangePassword: true },
      ],
      adminUserId: admin.id,
      demoAccounts: [],
    });
    return this.db.respond(account);
  }

  updateClub(id: string, input: Omit<ClubInput, 'slug'>): Promise<ClubAccount> {
    const denied = this.denied();
    if (denied) return denied;
    const club = this.db.clubs.find((c) => c.account.id === id);
    if (!club) return this.db.fail('Club not found.');
    Object.assign(club.account, input);
    const admin = club.data.users.find((u) => u.id === club.adminUserId);
    if (admin) Object.assign(admin, { name: input.adminName, email: input.adminEmail });
    const cred = club.credentials.find((c) => c.userId === club.adminUserId);
    if (cred) cred.username = input.adminEmail;
    return this.db.respond(club.account);
  }
}
