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
  AddPlayerInput,
  AddPlayerResult,
  SignInInput,
  UpdateProfileInput,
} from '@aura/backend/api';
import {
  ChatMessage,
  Club,
  ClubAccount,
  ClubEvent,
  ClubEventDraft,
  ClubSettings,
  ClubStaffMember,
  PlatformAdmin,
  PlayerProfile,
  RsvpStatus,
  Score,
  TeamId,
  Thread,
  ThreadMembership,
  User,
  UserId,
} from '@aura/shared/models';
import {
  ALL_GROUPS,
  canDeleteMessage,
  canEditMessage,
  canChangeMemberTeam,
  canManageInvite,
  canManageTeam,
  canPostInThread,
  canRemoveMember,
  canResetPassword,
  canReadThread,
  canSeeContact,
  effectiveMembers,
  temporaryPassword,
} from '@aura/shared/util';
import { DEMO_PLATFORM_ADMIN, MockClub, createEmptyClubData } from './clubs';
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
    if (club.data.users.find((u) => u.id === cred.userId)?.disabled) {
      return this.db.fail('This account is disabled. Ask your club’s staff.');
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

  /** The directory as the signed-in member may see it: emails only where `canSeeContact`. */
  private snapshot(): Directory {
    const { teams, users, profiles, settings } = this.db.data;
    const me = this.me();
    return {
      club: toClub(this.db.club.account),
      teams,
      users: users.map((u) => {
        const user = this.withAdmin(u);
        if (me && canSeeContact(me, user, settings, profiles)) return user;
        const { email: _hidden, ...rest } = user;
        return rest;
      }),
      profiles,
      settings,
    };
  }

  /** The user as the backend returns them: marked when they are the club admin. */
  private withAdmin(user: User): User {
    return user.id === this.db.club.adminUserId ? { ...user, clubAdmin: true } : user;
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
  private invite(input: InviteMemberInput): MemberInvite | Error {
    const { kind, name, email } = input;
    const me = this.me();
    if (input.kind === 'club' ? me?.kind !== 'club' : !this.managesTeam(input.team)) {
      return new Error(
        input.kind === 'club'
          ? 'Only club staff can invite club staff.'
          : 'Only club staff and this team’s staff can invite members.',
      );
    }
    const taken = this.db.club.credentials.some((c) => c.username.toLowerCase() === email.trim().toLowerCase());
    if (taken) return new Error(`${email} already has an account at this club.`);
    const user: User = {
      id: this.db.nextId('u'),
      name,
      kind,
      teams: input.kind === 'club' ? [] : [input.team],
      ...(input.kind === 'club' && input.title ? { title: input.title } : {}),
      email,
      invited: true,
    };
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
          announceOnly: suffix === 'ann',
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

  private me(): User | undefined {
    return this.db.me();
  }

  /** The invited member `id`, if the signed-in user may manage their invite. */
  private invited(id: UserId): User | Error {
    const user = this.db.data.users.find((u) => u.id === id);
    if (!user) return new Error('Member not found.');
    if (!user.invited) return new Error(`${user.name} has already joined.`);
    const me = this.me();
    if (!me || !canManageInvite(me, user))
      return new Error('Only club staff and the team’s staff can manage this invite.');
    return user;
  }

  cancelInvite(id: UserId): Promise<void> {
    const user = this.invited(id);
    if (user instanceof Error) return this.db.fail(user.message);
    const club = this.db.club;
    club.data.users = club.data.users.filter((u) => u.id !== id);
    club.credentials = club.credentials.filter((c) => c.userId !== id);
    return this.db.respond(undefined);
  }

  resendInvite(id: UserId): Promise<MemberInvite> {
    const user = this.invited(id);
    if (user instanceof Error) return this.db.fail(user.message);
    const password = temporaryPassword();
    const username = user.email ?? '';
    const cred = this.db.club.credentials.find((c) => c.userId === id);
    if (cred) Object.assign(cred, { password, mustChangePassword: true });
    else this.db.club.credentials.push({ userId: id, username, password, mustChangePassword: true });
    return this.db.respond({ user, username: cred?.username ?? username, temporaryPassword: password });
  }

  /** The member `id` who has joined, if the signed-in user passes `allowed`. */
  private member(id: UserId, allowed: (me: User, user: User) => boolean, denied: string): User | Error {
    const user = this.db.data.users.find((u) => u.id === id);
    if (!user) return new Error('Member not found.');
    if (user.invited) return new Error(`${user.name} hasn’t joined yet. Resend or cancel their invite.`);
    const me = this.me();
    return me && allowed(me, this.withAdmin(user)) ? user : new Error(denied);
  }

  resetPassword(id: UserId): Promise<MemberInvite> {
    const user = this.member(
      id,
      canResetPassword,
      'Only club staff, and team staff for their teams’ families, reset passwords.',
    );
    if (user instanceof Error) return this.db.fail(user.message);
    const password = temporaryPassword();
    const cred = this.db.club.credentials.find((c) => c.userId === id);
    if (!cred) return this.db.fail(`${user.name} has no sign-in.`);
    Object.assign(cred, { password, mustChangePassword: true });
    return this.db.respond({ user: this.withAdmin(user), username: cred.username, temporaryPassword: password });
  }

  setMemberDisabled(id: UserId, disabled: boolean): Promise<User> {
    const user = this.member(id, canRemoveMember, 'Only club staff can disable or remove members.');
    if (user instanceof Error) return this.db.fail(user.message);
    if (disabled) user.disabled = true;
    else delete user.disabled;
    return this.db.respond(this.withAdmin(user));
  }

  /** As the database's foreign keys do: unlinks them everywhere and keeps their messages. */
  removeMember(id: UserId): Promise<void> {
    const user = this.member(id, canRemoveMember, 'Only club staff can disable or remove members.');
    if (user instanceof Error) return this.db.fail(user.message);
    const club = this.db.club;
    const data = club.data;
    data.users = data.users.filter((u) => u.id !== id);
    club.credentials = club.credentials.filter((c) => c.userId !== id);
    for (const p of data.profiles) {
      p.parentIds = p.parentIds.filter((x) => x !== id);
      if (p.userId === id) p.userId = null;
    }
    for (const t of data.threads) {
      t.members = t.members.filter((x) => x !== id);
      if (t.creatorId === id) t.creatorId = null;
      for (const m of t.messages) if (m.from === id) m.from = null;
    }
    for (const forEvent of Object.values(data.rsvps)) delete forEvent[id];
    return this.db.respond(undefined);
  }

  updateMember({ id, name, email, title }: UpdateMemberInput): Promise<User> {
    const club = this.db.club;
    const me = this.me();
    const user = club.data.users.find((u) => u.id === id);
    if (!user) return this.db.fail('Member not found.');
    if (!me || (me.id !== id && me.kind !== 'club' && !canManageInvite(me, user))) {
      return this.db.fail('Only club staff can edit other people’s details.');
    }
    const username = email.trim();
    const taken = club.credentials.some((c) => c.userId !== id && c.username.toLowerCase() === username.toLowerCase());
    if (taken) return this.db.fail(`${username} already has an account at this club.`);
    Object.assign(user, { name: name.trim(), email: username });
    if (user.kind === 'club' && title !== undefined) user.title = title.trim();
    const cred = club.credentials.find((c) => c.userId === id);
    if (cred) cred.username = username;
    if (id === club.adminUserId) Object.assign(club.account, { adminName: user.name, adminEmail: username });
    return this.db.respond(this.withAdmin(user));
  }

  updateProfile(input: UpdateProfileInput): Promise<PlayerProfile> {
    const profile = this.db.data.profiles.find((p) => p.id === input.id);
    if (!profile) return this.db.fail('Player not found.');
    const me = this.me();
    const actsFor = !!me && (profile.parentIds.includes(me.id) || profile.userId === me.id);
    if (!actsFor && !this.managesTeam(profile.team)) return this.db.fail('You don’t have permission to do that.');
    Object.assign(profile, { name: input.name, jersey: input.jersey });
    return this.db.respond(profile);
  }

  setMemberTeams(id: UserId, teams: TeamId[]): Promise<User> {
    const user = this.db.data.users.find((u) => u.id === id);
    if (!user) return this.db.fail('Member not found.');
    const me = this.me();
    const wanted = [...new Set(teams)].filter((t) => this.db.data.teams.some((x) => x.id === t));
    const changed = [
      ...wanted.filter((t) => !user.teams.includes(t)),
      ...user.teams.filter((t) => !wanted.includes(t)),
    ];
    const denied = changed.find((t) => !me || !canChangeMemberTeam(me, user, t));
    if (denied) return this.db.fail(`You can’t change who is on ${denied}.`);
    user.teams = wanted.sort();
    return this.db.respond(this.withAdmin(user));
  }

  /** The profile `id`, if the signed-in member manages its team. */
  private managedProfile(id: string, action: string): PlayerProfile | Error {
    const profile = this.db.data.profiles.find((p) => p.id === id);
    if (!profile) return new Error('Player not found.');
    if (!this.managesTeam(profile.team))
      return new Error(`Only club staff and this team’s staff can ${action} players.`);
    return profile;
  }

  approvePlayer(id: string): Promise<PlayerProfile> {
    const profile = this.managedProfile(id, 'approve');
    if (profile instanceof Error) return this.db.fail(profile.message);
    delete profile.pending;
    return this.db.respond(profile);
  }

  removePlayer(id: string): Promise<void> {
    const profile = this.managedProfile(id, 'remove');
    if (profile instanceof Error) return this.db.fail(profile.message);
    const data = this.db.data;
    data.profiles = data.profiles.filter((p) => p.id !== id);
    for (const forEvent of Object.values(data.rsvps)) delete forEvent[id];
    return this.db.respond(undefined);
  }

  /** As move_player() does: parents and the player's own sign-in follow them to the new team. */
  movePlayer(id: string, team: TeamId): Promise<Directory> {
    const profile = this.managedProfile(id, 'move');
    if (profile instanceof Error) return this.db.fail(profile.message);
    const data = this.db.data;
    const old = profile.team;
    if (old === team) return this.db.respond(this.snapshot());
    if (!data.teams.some((t) => t.id === team)) return this.db.fail('Team not found.');
    if (!this.managesTeam(team)) return this.db.fail('You can only move players to teams you manage.');
    profile.team = team;
    for (const e of data.events.filter((e) => e.team === old)) delete data.rsvps[e.id]?.[id];
    for (const u of data.users) {
      const isPlayer = u.id === profile.userId && u.kind === 'player';
      const isParent = u.kind === 'parent' && profile.parentIds.includes(u.id);
      if (!isPlayer && !isParent) continue;
      const stays = isParent && data.profiles.some((p) => p.id !== id && p.team === old && p.parentIds.includes(u.id));
      u.teams = [...new Set([...u.teams.filter((t) => stays || t !== old), team])].sort();
    }
    return this.db.respond(this.snapshot());
  }

  givePlayerSignIn(id: string, email: string): Promise<MemberInvite> {
    const profile = this.managedProfile(id, 'invite');
    if (profile instanceof Error) return this.db.fail(profile.message);
    if (profile.userId) return this.db.fail(`${profile.name} already has their own sign-in.`);
    const invite = this.invite({ team: profile.team, kind: 'player', name: profile.name, email });
    if (invite instanceof Error) return this.db.fail(invite.message);
    profile.userId = invite.user.id;
    return this.db.respond(invite);
  }

  requestPlayerLink(input: LinkPlayerInput): Promise<PlayerProfile> {
    const profile: PlayerProfile = {
      id: this.db.nextId('p'),
      name: input.name,
      jersey: input.jersey || '–',
      team: input.team,
      parentIds: [input.parentId],
      userId: null,
      pending: true,
    };
    this.db.data.profiles.push(profile);
    return this.db.respond(profile);
  }

  /** Club staff, or staff of `team`. */
  private managesTeam(team: string): boolean {
    const me = this.me();
    return !!me && canManageTeam(me, team);
  }

  /** Members of this club only, as the real backend's foreign keys require. */
  private clubMembers(ids: UserId[]): UserId[] {
    return [...new Set(ids)].filter((id) => this.db.data.users.some((u) => u.id === id));
  }

  addPlayer({ team, name, jersey, parentIds, email }: AddPlayerInput): Promise<AddPlayerResult> {
    if (!this.managesTeam(team)) return this.db.fail('Only club staff and this team’s staff can add players.');
    if (!name.trim()) return this.db.fail('Enter the player’s name.');
    let invite: MemberInvite | null = null;
    if (email) {
      const result = this.invite({ team, kind: 'player', name: name.trim(), email });
      if (result instanceof Error) return this.db.fail(result.message);
      invite = result;
    }
    const profile: PlayerProfile = {
      id: this.db.nextId('p'),
      name: name.trim(),
      jersey: jersey.trim() || '–',
      team,
      parentIds: this.clubMembers(parentIds),
      userId: invite?.user.id ?? null,
    };
    this.db.data.profiles.push(profile);
    return this.db.respond({ profile, invite });
  }

  setPlayerParents(profileId: string, parentIds: UserId[]): Promise<PlayerProfile> {
    const profile = this.db.data.profiles.find((p) => p.id === profileId);
    if (!profile) return this.db.fail('Player not found.');
    if (!this.managesTeam(profile.team)) {
      return this.db.fail('Only club staff and this team’s staff can change a player’s parents.');
    }
    profile.parentIds = this.clubMembers(parentIds);
    return this.db.respond(profile);
  }

  saveSettings(settings: ClubSettings): Promise<ClubSettings> {
    if (this.me()?.kind !== 'club') return this.db.fail('Only club staff can change club settings.');
    this.db.data.settings = { ...settings };
    return this.db.respond(this.db.data.settings);
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

  /** Whether `user` may post in `t`, as the messages policy decides. */
  private canPost(t: Thread, user: User | undefined): boolean {
    if (!user) return false;
    return canPostInThread(t, user, this.isMember(t, user), this.db.data.settings);
  }

  private isMember(t: Thread, user: User): boolean {
    return effectiveMembers(t, this.db.data.users).has(user.id);
  }

  private message(t: Thread, id: string): ChatMessage {
    const m = t.messages.find((x) => x.id === id);
    if (!m) throw new Error('Message not found.');
    return m;
  }

  createThread(input: NewThreadInput): Promise<Thread> {
    const thread: Thread = {
      ...input,
      id: this.db.nextId('t'),
      isDefault: false,
      announceOnly: false,
      messages: [],
      unread: 0,
    };
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
    const me = this.db.me();
    if (!me || me.id !== from || !this.canPost(t, me)) {
      return this.db.fail('You don’t have permission to do that.');
    }
    const message: ChatMessage = { id: this.db.nextId('m'), from, text, sentAt: this.db.now().toISOString() };
    t.messages.push(message);
    this.simulateReply(t, from);
    return this.db.respond(message);
  }

  editMessage(threadId: string, messageId: string, text: string): Promise<ChatMessage> {
    const t = this.thread(threadId);
    const m = this.message(t, messageId);
    const me = this.db.me();
    if (!me || !canEditMessage(m, me)) return this.db.fail('You can only edit your own messages.');
    if (!text.trim()) return this.db.fail('Write a message.');
    Object.assign(m, { text: text.trim(), editedAt: this.db.now().toISOString() });
    return this.db.respond(m);
  }

  deleteMessage(threadId: string, messageId: string): Promise<ChatMessage> {
    const t = this.thread(threadId);
    const m = this.message(t, messageId);
    const me = this.db.me();
    const reads = !!me && canReadThread(t, me, this.isMember(t, me));
    if (!me || !canDeleteMessage(m, t, me) || (m.from !== me.id && !reads)) {
      return this.db.fail('Only the sender or staff can delete this message.');
    }
    Object.assign(m, { text: '', deleted: true });
    return this.db.respond(m);
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
    const users = this.db.data.users;
    const others = [...effectiveMembers(t, users)].filter(
      (id) =>
        id !== sender &&
        this.canPost(
          t,
          users.find((u) => u.id === id),
        ),
    );
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

  private club(id: string): MockClub | Error {
    if (!this.db.platformAdmin) return new Error('Sign in as the platform admin.');
    return this.db.clubs.find((c) => c.account.id === id) ?? new Error('Club not found.');
  }

  listClubStaff(clubId: string): Promise<ClubStaffMember[]> {
    const club = this.club(clubId);
    if (club instanceof Error) return this.db.fail(club.message);
    const staff = club.data.users
      .filter((u) => u.kind === 'club')
      .map((u): ClubStaffMember => ({
        id: u.id,
        name: u.name,
        email: club.credentials.find((c) => c.userId === u.id)?.username ?? u.email ?? '',
        ...(u.title ? { title: u.title } : {}),
        ...(u.invited ? { invited: true } : {}),
        ...(u.disabled ? { disabled: true } : {}),
        admin: u.id === club.adminUserId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return this.db.respond(staff);
  }

  setClubAdmin(clubId: string, memberId: UserId): Promise<ClubAccount> {
    const club = this.club(clubId);
    if (club instanceof Error) return this.db.fail(club.message);
    const user = club.data.users.find((u) => u.id === memberId && u.kind === 'club');
    if (!user) return this.db.fail('Choose one of the club’s staff.');
    if (user.invited || user.disabled) {
      return this.db.fail(`${user.name} has to have joined, and not be disabled, to be the club admin.`);
    }
    club.adminUserId = user.id;
    const username = club.credentials.find((c) => c.userId === user.id)?.username ?? user.email ?? '';
    Object.assign(club.account, { adminName: user.name, adminEmail: username });
    return this.db.respond(club.account);
  }

  resetAdminPassword(clubId: string): Promise<MemberInvite> {
    const club = this.club(clubId);
    if (club instanceof Error) return this.db.fail(club.message);
    const user = club.data.users.find((u) => u.id === club.adminUserId);
    const cred = club.credentials.find((c) => c.userId === club.adminUserId);
    if (!user || !cred) return this.db.fail('This club has no admin.');
    const password = temporaryPassword();
    Object.assign(cred, { password, mustChangePassword: true });
    return this.db.respond({
      user: { ...user, clubAdmin: true },
      username: cred.username,
      temporaryPassword: password,
    });
  }
}
