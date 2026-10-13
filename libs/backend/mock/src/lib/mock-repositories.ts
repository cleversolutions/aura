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
  SeasonRoster,
  StartSeasonInput,
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
  RsvpMap,
  RsvpStatus,
  Score,
  SeasonId,
  TeamId,
  TeamRole,
  Thread,
  ThreadMembership,
  User,
  UserId,
} from '@aura/shared/models';
import {
  ALL_GROUPS,
  canDeleteMessage,
  canEditEvent,
  canEditMessage,
  canChangeMemberTeam,
  canChangeRole,
  canEditTitle,
  canManageInvite,
  canManageTeam,
  canPostInThread,
  canRemoveMember,
  canResetPassword,
  canReadThread,
  canRsvp,
  canSeeContact,
  canSeePlayerCare,
  canSeeRsvpNote,
  currentSeason,
  daysBetween,
  effectiveMembers,
  hasTitle,
  isValidPhone,
  isoDate,
  shiftDate,
  temporaryPassword,
  TITLE_MAX,
  weeklyDates,
} from '@aura/shared/util';
import { DEMO_PLATFORM_ADMIN, MockClub, createEmptyClubData } from './clubs';
import { MockDb } from './mock-db';
import { MockData } from './seed';

const PAST_SEASON = 'That season has ended. Its teams, rosters and events are read-only.';
/** As guard_archived_club() and the edge functions refuse every member's change to an archived club. */
const ARCHIVED = 'This club is archived. It is read-only.';
const TITLE_TOO_LONG = `Keep the title to ${TITLE_MAX} characters.`;

/** Free text, trimmed; '' clears it. */
function setTitle(user: User, title: string): void {
  if (title.trim()) user.title = title.trim();
  else delete user.title;
}

/** As the events check constraints do: an end after the start, and arriving no later than it. */
function eventTimesProblem(d: ClubEventDraft): string | null {
  if (d.endTime && (!d.time || d.endTime <= d.time)) return 'The end time must be after the start time.';
  if (d.arriveBy && (!d.time || d.arriveBy > d.time)) return 'The arrive-by time can’t be after the start time.';
  return null;
}

/** The current season's teams, as team_members only ever hold them. */
function currentTeamIds(data: MockData): Set<TeamId> {
  const season = currentSeason(data.seasons)?.id;
  return new Set(data.teams.filter((t) => t.season === season).map((t) => t.id));
}

/** A team of an ended season (the database's is_past_team). Club-wide ids are never past. */
function isPastTeam(data: MockData, team: string): boolean {
  const season = data.teams.find((t) => t.id === team)?.season;
  return !!season && !!data.seasons.find((s) => s.id === season)?.endedAt;
}

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
function toClub({ id, slug, name, logoUrl, ink, paper, icons, archivedAt }: ClubAccount): Club {
  return { id, slug, name, logoUrl, ink, paper, ...(icons ? { icons } : {}), ...(archivedAt ? { archivedAt } : {}) };
}

@Injectable()
export class MockDirectoryRepository extends DirectoryRepository {
  private readonly db = inject(MockDb);

  /**
   * The directory as the signed-in member may see it: emails and phones only where `canSeeContact`,
   * players' care details only where `canSeePlayerCare`.
   */
  private snapshot(): Directory {
    const { seasons, teams, users, profiles, settings } = this.db.data;
    const me = this.me();
    const current = currentTeamIds(this.db.data);
    return {
      club: toClub(this.db.club.account),
      seasons,
      teams,
      users: users.map((u) => {
        const user = this.withAdmin(u);
        if (me && canSeeContact(me, user, settings, profiles)) return user;
        const { email: _email, phone: _phone, ...rest } = user;
        return rest;
      }),
      profiles: profiles.filter((p) => current.has(p.team)).map((p) => this.visibleProfile(p)),
      settings,
    };
  }

  /** As the player_care policies allow: only the player's family and staff read their care details. */
  private visibleProfile(p: PlayerProfile): PlayerProfile {
    const me = this.me();
    if (me && canSeePlayerCare(me, p)) return p;
    const { care: _hidden, ...rest } = p;
    return rest;
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
    if (this.db.archived) return this.db.fail(ARCHIVED);
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
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const data = this.db.data;
    if (this.me()?.kind !== 'club') return this.db.fail('Only club staff can create and edit teams.');
    const name = input.name.trim();
    if (!name) return this.db.fail('Name the team.');
    const current = currentTeamIds(data);
    if (input.id && !current.has(input.id))
      return this.db.fail(isPastTeam(data, input.id) ? PAST_SEASON : 'Team not found.');
    const taken = data.teams.some(
      (t) => t.id !== input.id && current.has(t.id) && t.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) return this.db.fail(`${name} already exists this season.`);
    const details = {
      name,
      ...(input.age ? { age: input.age } : {}),
      ...(input.division ? { division: input.division } : {}),
    };
    let id = input.id;
    if (id) {
      data.teams = data.teams.map((t) => (t.id === id ? { id: t.id, season: t.season, ...details } : t));
    } else {
      id = this.db.nextId('t');
      this.createTeam(id, details);
    }
    const teamId = id;
    data.users = data.users.map((u) => {
      if (u.kind !== 'staff') return u;
      const want = input.staffIds.includes(u.id);
      const has = u.teams.includes(teamId);
      if (want && !has) return { ...u, teams: [...u.teams, teamId] };
      if (!want && has) return { ...u, teams: u.teams.filter((t) => t !== teamId) };
      return u;
    });
    let invite: MemberInvite | null = null;
    if (input.newStaff) {
      const result = this.invite({ team: teamId, kind: 'staff', ...input.newStaff });
      if (result instanceof Error) return this.db.fail(result.message);
      invite = result;
    }
    return this.db.respond({ directory: this.snapshot(), invite });
  }

  /** A team in the current season, with its default channels (the teams_default_threads trigger). */
  private createTeam(id: TeamId, details: { name: string; age?: string; division?: string }): void {
    const data = this.db.data;
    const season = currentSeason(data.seasons)?.id ?? '';
    data.teams.push({ id, season, ...details });
    for (const [suffix, channel] of [
      ['ann', '#announcements'],
      ['gen', '#general'],
    ]) {
      data.threads.push({
        id: `${id}-${suffix}`,
        name: channel,
        scope: id,
        teams: [id],
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

  /** As delete_team() does: only a team with no players and no events. */
  deleteTeam(teamId: TeamId): Promise<Directory> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const data = this.db.data;
    if (this.me()?.kind !== 'club') return this.db.fail('Only club staff can delete teams.');
    if (!data.teams.some((t) => t.id === teamId)) return this.db.fail('Team not found.');
    if (isPastTeam(data, teamId)) return this.db.fail(PAST_SEASON);
    if (data.profiles.some((p) => p.team === teamId && !p.pending) || data.events.some((e) => e.team === teamId)) {
      return this.db.fail(
        'Only a team with no players and no events can be deleted. Move its players and events first, or leave it out of the next season.',
      );
    }
    data.teams = data.teams.filter((t) => t.id !== teamId);
    data.profiles = data.profiles.filter((p) => p.team !== teamId);
    data.threads = data.threads
      .filter((t) => t.scope !== teamId)
      .map((t) => (t.teams.includes(teamId) ? { ...t, teams: t.teams.filter((x) => x !== teamId) } : t));
    for (const u of data.users) u.teams = u.teams.filter((t) => t !== teamId);
    return this.db.respond(this.snapshot());
  }

  /** As start_season() does. */
  startSeason({ name, teams }: StartSeasonInput): Promise<Directory> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const data = this.db.data;
    if (this.me()?.kind !== 'club') return this.db.fail('Only club staff can start a season.');
    const seasonName = name.trim();
    if (!seasonName) return this.db.fail('Name the new season.');
    if (data.seasons.some((s) => s.name.toLowerCase() === seasonName.toLowerCase())) {
      return this.db.fail(`There is already a season called ${seasonName}.`);
    }
    const current = currentTeamIds(data);
    if (teams.some((t) => !current.has(t.from))) return this.db.fail('Only this season’s teams carry over.');
    if (teams.some((t) => !t.name.trim())) return this.db.fail('Name every team you carry over.');
    if (new Set(teams.map((t) => t.name.trim().toLowerCase())).size < teams.length) {
      return this.db.fail('Give each team a different name.');
    }

    // The old season's rosters become history.
    const old = data.users.flatMap((u) => u.teams.map((team) => ({ team, userId: u.id })));
    data.pastMembers.push(...old);
    for (const u of data.users) u.teams = [];
    const today = isoDate(this.db.now());
    data.seasons = data.seasons.map((s) => (s.endedAt ? s : { ...s, endedAt: today }));
    data.seasons.push({ id: this.db.nextId('s'), name: seasonName, startedAt: today });

    const join = (userId: UserId, team: TeamId) => {
      const u = data.users.find((x) => x.id === userId);
      if (u && !u.teams.includes(team)) u.teams = [...u.teams, team].sort();
    };
    for (const spec of teams) {
      const id = this.db.nextId('t');
      this.createTeam(id, {
        name: spec.name.trim(),
        ...(spec.age ? { age: spec.age } : {}),
        ...(spec.division ? { division: spec.division } : {}),
      });
      const was = old.filter((m) => m.team === spec.from).map((m) => m.userId);
      if (spec.staff) {
        for (const userId of was) if (data.users.find((u) => u.id === userId)?.kind === 'staff') join(userId, id);
      }
      if (spec.players) {
        for (const p of data.profiles.filter((x) => x.team === spec.from && !x.pending)) {
          data.profiles.push({
            ...p,
            id: this.db.nextId('p'),
            team: id,
            parentIds: [...p.parentIds],
            ...(p.care ? { care: { ...p.care } } : {}),
          });
          for (const u of data.users) {
            if ((u.id === p.userId && u.kind === 'player') || (u.kind === 'parent' && p.parentIds.includes(u.id))) {
              join(u.id, id);
            }
          }
        }
      }
    }
    return this.db.respond(this.snapshot());
  }

  loadSeason(seasonId: SeasonId): Promise<SeasonRoster> {
    const data = this.db.data;
    const ids = data.teams.filter((t) => t.season === seasonId).map((t) => t.id);
    const members: SeasonRoster['members'] = Object.fromEntries(ids.map((id) => [id, [] as UserId[]]));
    for (const m of data.pastMembers) {
      if (members[m.team] && data.users.some((u) => u.id === m.userId)) members[m.team].push(m.userId);
    }
    const profiles = data.profiles.filter((p) => ids.includes(p.team) && !p.pending).map((p) => this.visibleProfile(p));
    return this.db.respond({ members, profiles });
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
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const user = this.invited(id);
    if (user instanceof Error) return this.db.fail(user.message);
    const club = this.db.club;
    club.data.users = club.data.users.filter((u) => u.id !== id);
    club.credentials = club.credentials.filter((c) => c.userId !== id);
    return this.db.respond(undefined);
  }

  resendInvite(id: UserId): Promise<MemberInvite> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
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
    if (this.db.archived) return this.db.fail(ARCHIVED);
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
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const user = this.member(id, canRemoveMember, 'Only club staff can disable or remove members.');
    if (user instanceof Error) return this.db.fail(user.message);
    if (disabled) user.disabled = true;
    else delete user.disabled;
    return this.db.respond(this.withAdmin(user));
  }

  /** Invites too: someone invited as a parent who is really the coach. */
  setMemberRole(id: UserId, kind: TeamRole): Promise<User> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const user = this.db.data.users.find((u) => u.id === id);
    if (!user) return this.db.fail('Member not found.');
    const me = this.me();
    if (!me || !canChangeRole(me, user, kind)) {
      return this.db.fail('Only club staff, and team staff for parents on their own teams, change roles.');
    }
    user.kind = kind;
    if (kind === 'parent') delete user.title;
    return this.db.respond(this.withAdmin(user));
  }

  removeMember(id: UserId): Promise<void> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const user = this.member(id, canRemoveMember, 'Only club staff can disable or remove members.');
    if (user instanceof Error) return this.db.fail(user.message);
    this.deleteMember(id);
    return this.db.respond(undefined);
  }

  /** As the database's foreign keys do: unlinks them everywhere and keeps their messages. */
  private deleteMember(id: UserId): void {
    const club = this.db.club;
    const data = club.data;
    data.users = data.users.filter((u) => u.id !== id);
    data.pastMembers = data.pastMembers.filter((m) => m.userId !== id);
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
  }

  updateMember({ id, name, email, title, phone }: UpdateMemberInput): Promise<User> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const club = this.db.club;
    const me = this.me();
    const user = club.data.users.find((u) => u.id === id);
    if (!user) return this.db.fail('Member not found.');
    if (!me || (me.id !== id && me.kind !== 'club' && !canManageInvite(me, user))) {
      return this.db.fail('Only club staff can edit other people’s details.');
    }
    if (phone !== undefined && !isValidPhone(phone)) return this.db.fail('Enter a valid phone number.');
    if (title && title.trim().length > TITLE_MAX) return this.db.fail(TITLE_TOO_LONG);
    const username = email.trim();
    const taken = club.credentials.some((c) => c.userId !== id && c.username.toLowerCase() === username.toLowerCase());
    if (taken) return this.db.fail(`${username} already has an account at this club.`);
    Object.assign(user, { name: name.trim(), email: username });
    if (hasTitle(user) && title !== undefined) setTitle(user, title);
    if (phone?.trim()) user.phone = phone.trim();
    else if (phone !== undefined) delete user.phone;
    const cred = club.credentials.find((c) => c.userId === id);
    if (cred) cred.username = username;
    if (id === club.adminUserId) Object.assign(club.account, { adminName: user.name, adminEmail: username });
    return this.db.respond(this.withAdmin(user));
  }

  setMemberTitle(userId: UserId, title: string): Promise<User> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const user = this.db.club.data.users.find((u) => u.id === userId);
    if (!user) return this.db.fail('Member not found.');
    const me = this.me();
    if (!me || !canEditTitle(me, user))
      return this.db.fail('Only club staff, and team staff for team staff, change titles.');
    if (title.trim().length > TITLE_MAX) return this.db.fail(TITLE_TOO_LONG);
    setTitle(user, title);
    return this.db.respond(this.withAdmin(user));
  }

  updateProfile(input: UpdateProfileInput): Promise<PlayerProfile> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const profile = this.db.data.profiles.find((p) => p.id === input.id);
    if (!profile) return this.db.fail('Player not found.');
    const me = this.me();
    if (isPastTeam(this.db.data, profile.team)) return this.db.fail(PAST_SEASON);
    const actsFor = !!me && (profile.parentIds.includes(me.id) || profile.userId === me.id);
    if (!actsFor && !this.managesTeam(profile.team)) return this.db.fail('You don’t have permission to do that.');
    Object.assign(profile, { name: input.name, jersey: input.jersey });
    if (input.care) {
      const care = {
        emergencyContact: input.care.emergencyContact.trim(),
        medicalNotes: input.care.medicalNotes.trim(),
      };
      if (care.emergencyContact.length > 200 || care.medicalNotes.length > 1000) {
        return this.db.fail('Keep the emergency contact under 200 characters and the medical notes under 1000.');
      }
      profile.care = care;
    }
    return this.db.respond(profile);
  }

  setMemberTeams(id: UserId, teams: TeamId[]): Promise<User> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const user = this.db.data.users.find((u) => u.id === id);
    if (!user) return this.db.fail('Member not found.');
    const me = this.me();
    const current = currentTeamIds(this.db.data);
    const wanted = [...new Set(teams)].filter((t) => current.has(t));
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
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const profile = this.managedProfile(id, 'approve');
    if (profile instanceof Error) return this.db.fail(profile.message);
    delete profile.pending;
    return this.db.respond(profile);
  }

  /** As remove_player() and manage-member do. */
  removePlayer(id: string): Promise<Directory> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const profile = this.managedProfile(id, 'remove');
    if (profile instanceof Error) return this.db.fail(profile.message);
    const data = this.db.data;
    const team = profile.team;
    data.profiles = data.profiles.filter((p) => p.id !== id);
    for (const forEvent of Object.values(data.rsvps)) delete forEvent[id];
    // Whoever is no longer tied to the team by a player on it leaves it.
    const tied = (u: User) =>
      data.profiles.some((p) => p.team === team && (p.userId === u.id || p.parentIds.includes(u.id)));
    for (const u of data.users) {
      const theirs =
        (u.kind === 'parent' && profile.parentIds.includes(u.id)) || (u.kind === 'player' && u.id === profile.userId);
      if (theirs && !tied(u)) u.teams = u.teams.filter((t) => t !== team);
    }
    // A player's own sign-in on no team any more goes from the club.
    const player = data.users.find((u) => u.id === profile.userId && u.kind === 'player');
    if (player && !player.teams.length) this.deleteMember(player.id);
    return this.db.respond(this.snapshot());
  }

  /** As move_player() does: parents and the player's own sign-in follow them to the new team. */
  movePlayer(id: string, team: TeamId): Promise<Directory> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
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
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const profile = this.managedProfile(id, 'invite');
    if (profile instanceof Error) return this.db.fail(profile.message);
    if (profile.userId) return this.db.fail(`${profile.name} already has their own sign-in.`);
    const invite = this.invite({ team: profile.team, kind: 'player', name: profile.name, email });
    if (invite instanceof Error) return this.db.fail(invite.message);
    profile.userId = invite.user.id;
    return this.db.respond(invite);
  }

  requestPlayerLink(input: LinkPlayerInput): Promise<PlayerProfile> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    if (!currentTeamIds(this.db.data).has(input.team)) return this.db.fail('Team not found.');
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

  /** Club staff, or staff of `team`, in the current season (past seasons are read-only). */
  private managesTeam(team: string): boolean {
    const me = this.me();
    return !!me && canManageTeam(me, team) && !isPastTeam(this.db.data, team);
  }

  /** Members of this club only, as the real backend's foreign keys require. */
  private clubMembers(ids: UserId[]): UserId[] {
    return [...new Set(ids)].filter((id) => this.db.data.users.some((u) => u.id === id));
  }

  addPlayer({ team, name, jersey, parentIds, email }: AddPlayerInput): Promise<AddPlayerResult> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
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
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const profile = this.db.data.profiles.find((p) => p.id === profileId);
    if (!profile) return this.db.fail('Player not found.');
    if (!this.managesTeam(profile.team)) {
      return this.db.fail('Only club staff and this team’s staff can change a player’s parents.');
    }
    profile.parentIds = this.clubMembers(parentIds);
    return this.db.respond(profile);
  }

  saveSettings(settings: ClubSettings): Promise<ClubSettings> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
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

  /** As list_rsvps does: notes only where the viewer may read them. */
  listRsvps(): Promise<RsvpMap> {
    const data = this.db.data;
    const me = this.db.me();
    const map: RsvpMap = {};
    for (const [eventId, forEvent] of Object.entries(data.rsvps)) {
      const event = data.events.find((e) => e.id === eventId);
      map[eventId] = Object.fromEntries(
        Object.entries(forEvent).map(([id, r]) => [
          id,
          event && me && canSeeRsvpNote(event, id, me, data.profiles) ? r : { status: r.status },
        ]),
      );
    }
    return this.db.respond(map);
  }

  /** Whether the event belongs to an ended season (read-only). */
  private isPast(season: string | undefined): boolean {
    return !!this.db.data.seasons.find((s) => s.id === season)?.endedAt;
  }

  /** As the events_season trigger does: the team's season, or the current one for club-wide events. */
  private seasonFor(team: string): string {
    const data = this.db.data;
    return data.teams.find((t) => t.id === team)?.season ?? currentSeason(data.seasons)?.id ?? '';
  }

  /** An event the signed-in member may change, as the events policies and guard_past_event allow. */
  private editable(eventId: string): ClubEvent | string {
    const event = this.db.data.events.find((e) => e.id === eventId);
    const me = this.db.me();
    if (!event) return 'Event not found.';
    if (!me || !canEditEvent(event, me)) return 'Only club staff and the team’s staff can change this event.';
    if (this.isPast(event.season)) return PAST_SEASON;
    return event;
  }

  saveEvent(draft: ClubEventDraft): Promise<ClubEvent> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const events = this.db.data.events;
    const me = this.db.me();
    const existing = draft.id ? events.find((e) => e.id === draft.id) : undefined;
    if (draft.id && !existing) return this.db.fail('Event not found.');
    if (!me || !canEditEvent(draft, me) || (existing && !canEditEvent(existing, me))) {
      return this.db.fail('Only club staff and the team’s staff can change this event.');
    }
    const season = this.seasonFor(draft.team);
    if (this.isPast(season) || this.isPast(existing?.season)) return this.db.fail(PAST_SEASON);
    const problem = eventTimesProblem(draft);
    if (problem) return this.db.fail(problem);
    if (existing) {
      Object.assign(existing, draft, { season });
      return this.db.respond(existing);
    }
    const created: ClubEvent = { ...draft, id: this.db.nextId('e'), season };
    events.push(created);
    return this.db.respond(created);
  }

  saveScore(eventId: string, score: Score): Promise<ClubEvent> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const event = this.editable(eventId);
    if (typeof event === 'string') return this.db.fail(event);
    event.score = score;
    return this.db.respond(event);
  }

  setCancelled(eventId: string, cancelled: boolean): Promise<ClubEvent> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const event = this.editable(eventId);
    if (typeof event === 'string') return this.db.fail(event);
    if (cancelled) event.cancelled = true;
    else delete event.cancelled;
    return this.db.respond(event);
  }

  deleteEvent(eventId: string): Promise<void> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const event = this.editable(eventId);
    if (typeof event === 'string') return this.db.fail(event);
    const data = this.db.data;
    data.events = data.events.filter((e) => e.id !== eventId);
    delete data.rsvps[eventId];
    return this.db.respond(undefined);
  }

  createWeekly(draft: ClubEventDraft, until: string): Promise<ClubEvent[]> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const me = this.db.me();
    if (!me || !canEditEvent(draft, me))
      return this.db.fail('Only club staff and the team’s staff can change this event.');
    const season = this.seasonFor(draft.team);
    if (this.isPast(season)) return this.db.fail(PAST_SEASON);
    const problem = eventTimesProblem(draft);
    if (problem) return this.db.fail(problem);
    if (draft.tbd || !draft.date || !draft.time) return this.db.fail('Pick a date and time for a weekly event.');
    const seriesId = this.db.nextId('r');
    const { id: _id, ...fields } = draft;
    const created = weeklyDates(draft.date, until).map((date): ClubEvent => ({
      ...fields,
      id: this.db.nextId('e'),
      date,
      season,
      seriesId,
    }));
    if (!created.length) return this.db.fail('Repeat until a date after the first event.');
    this.db.data.events.push(...created);
    return this.db.respond(created);
  }

  /** As save_event_series does, row by row under the events policies and the past-season guard. */
  saveSeries(draft: ClubEventDraft & { id: string }): Promise<ClubEvent[]> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const event = this.editable(draft.id);
    if (typeof event === 'string') return this.db.fail(event);
    if (!event.seriesId || !event.date) return this.db.fail('This event does not repeat.');
    if (draft.tbd || !draft.date || !draft.time) return this.db.fail('Pick a date and time for the series.');
    const problem = eventTimesProblem(draft);
    if (problem) return this.db.fail(problem);
    const me = this.db.me();
    if (!me || !canEditEvent(draft, me))
      return this.db.fail('Only club staff and the team’s staff can change this event.');
    const season = this.seasonFor(draft.team);
    if (this.isPast(season)) return this.db.fail(PAST_SEASON);
    const shift = daysBetween(event.date, draft.date);
    const from = event.date;
    const weeks = this.db.data.events.filter(
      (e) => e.seriesId === event.seriesId && (e.id === event.id || (!!e.date && e.date >= from)),
    );
    // Like the update statement: all weeks or none.
    if (weeks.some((e) => !canEditEvent(e, me) || this.isPast(e.season))) {
      return this.db.fail('Only club staff and the team’s staff can change this event.');
    }
    for (const e of weeks) {
      Object.assign(e, {
        type: draft.type,
        team: draft.team,
        title: draft.title,
        opponent: draft.opponent,
        home: draft.home,
        date: shiftDate(e.date ?? from, shift),
        time: draft.time,
        endTime: draft.endTime,
        arriveBy: draft.arriveBy,
        tbd: undefined,
        location: draft.location,
        notes: draft.notes,
        season,
      });
    }
    return this.db.respond(weeks);
  }

  deleteSeries(eventId: string): Promise<string[]> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const event = this.editable(eventId);
    if (typeof event === 'string') return this.db.fail(event);
    if (!event.seriesId) return this.db.fail('This event does not repeat.');
    const me = this.db.me();
    const data = this.db.data;
    const ids = data.events
      .filter(
        (e) =>
          e.seriesId === event.seriesId &&
          (e.id === event.id || !e.date || (!!event.date && e.date >= event.date)) &&
          !!me &&
          canEditEvent(e, me) &&
          !this.isPast(e.season),
      )
      .map((e) => e.id);
    data.events = data.events.filter((e) => !ids.includes(e.id));
    for (const id of ids) delete data.rsvps[id];
    return this.db.respond(ids);
  }

  setRsvp(eventId: string, attendeeIds: string[], status: RsvpStatus | null, note?: string): Promise<void> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const data = this.db.data;
    const event = data.events.find((e) => e.id === eventId);
    const me = this.db.me();
    if (!event) return this.db.fail('Event not found.');
    if (this.isPast(event.season)) return this.db.fail(PAST_SEASON);
    if (!me || !attendeeIds.every((id) => canRsvp(event, id, me, data.profiles, data.teams))) {
      return this.db.fail('You can only RSVP for yourself and your players.');
    }
    if (status && event.cancelled) return this.db.fail('This event is cancelled.');
    const forEvent = (data.rsvps[eventId] ??= {});
    for (const id of attendeeIds) {
      if (status) forEvent[id] = { status, note: note?.trim() ?? forEvent[id]?.note ?? '' };
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

  /** Whether `user` may post in `t`, as the messages policy decides. Past seasons' team chats are read-only. */
  private canPost(t: Thread, user: User | undefined): boolean {
    if (!user || isPastTeam(this.db.data, t.scope)) return false;
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
    if (this.db.archived) return this.db.fail(ARCHIVED);
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
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const t = this.thread(threadId);
    if (isPastTeam(this.db.data, t.scope)) return this.db.fail('That season has ended. Its team chats are read-only.');
    Object.assign(t, membership);
    return this.db.respond(t);
  }

  sendMessage(threadId: string, from: UserId, text: string): Promise<ChatMessage> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
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
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const t = this.thread(threadId);
    const m = this.message(t, messageId);
    const me = this.db.me();
    if (isPastTeam(this.db.data, t.scope)) return this.db.fail('That season has ended. Its team chats are read-only.');
    if (!me || !canEditMessage(m, me)) return this.db.fail('You can only edit your own messages.');
    if (!text.trim()) return this.db.fail('Write a message.');
    Object.assign(m, { text: text.trim(), editedAt: this.db.now().toISOString() });
    return this.db.respond(m);
  }

  deleteMessage(threadId: string, messageId: string): Promise<ChatMessage> {
    if (this.db.archived) return this.db.fail(ARCHIVED);
    const t = this.thread(threadId);
    const m = this.message(t, messageId);
    const me = this.db.me();
    if (isPastTeam(this.db.data, t.scope)) return this.db.fail('That season has ended. Its team chats are read-only.');
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
    return (
      this.denied() ??
      this.db.respond(
        this.db.clubs.map(({ account, data }) => ({
          ...account,
          counts: {
            members: data.users.filter((u) => !u.invited && !u.disabled).length,
            invited: data.users.filter((u) => u.invited).length,
            teams: currentTeamIds(data).size,
          },
        })),
      )
    );
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
      data: createEmptyClubData(admin, this.db.now()),
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

  setArchived(clubId: string, archived: boolean): Promise<ClubAccount> {
    const club = this.club(clubId);
    if (club instanceof Error) return this.db.fail(club.message);
    if (!archived) delete club.account.archivedAt;
    // Archiving again keeps the original date.
    else club.account.archivedAt ??= this.db.now().toISOString();
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
