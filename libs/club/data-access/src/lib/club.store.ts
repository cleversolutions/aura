import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import {
  AuthRepository,
  ClubSession,
  DemoAccount,
  DemoClub,
  Directory,
  DirectoryRepository,
  InviteMemberInput,
  AddPlayerInput,
  LinkPlayerInput,
  MemberInvite,
  SaveTeamInput,
  SeasonRoster,
  StartSeasonInput,
  UpdateMemberInput,
  UpdateProfileInput,
} from '@aura/backend/api';
import { Club, ClubSettings, PlayerProfile, Season, SeasonId, Team, TeamId, User, UserId } from '@aura/shared/models';
import {
  DEFAULT_CLUB_SETTINGS,
  canChangeMemberTeam,
  canManageInvite,
  canSeePlayerCare,
  canManageTeam,
  canRemoveMember,
  canResetPassword,
  currentSeason,
  personaOf,
  teamLabel,
} from '@aura/shared/util';

interface ClubState {
  /** Slug of the open club; set even when the link turned out not to exist. */
  slug: string | null;
  club: Club | null;
  manifestUrl: string | null;
  seasons: Season[];
  /** Every season's teams; `teams()` are the current season's. */
  allTeams: Team[];
  users: User[];
  profiles: PlayerProfile[];
  settings: ClubSettings;
  meId: UserId | null;
  /** Signed in with a temporary password that must be replaced first. */
  mustChangePassword: boolean;
  /** Platform admin viewing the club with sample data. */
  preview: boolean;
  demoAccounts: DemoAccount[];
  loaded: boolean;
}

const initialState: ClubState = {
  slug: null,
  club: null,
  manifestUrl: null,
  seasons: [],
  allTeams: [],
  users: [],
  profiles: [],
  settings: DEFAULT_CLUB_SETTINGS,
  meId: null,
  mustChangePassword: false,
  preview: false,
  demoAccounts: [],
  loaded: false,
};

const signedOut = {
  seasons: [],
  allTeams: [],
  users: [],
  profiles: [],
  settings: DEFAULT_CLUB_SETTINGS,
  meId: null,
  mustChangePassword: false,
  demoAccounts: [],
};

/** The store's share of a directory. People's teams and the profiles are the current season's. */
function fromDirectory(dir: Directory) {
  return { seasons: dir.seasons, allTeams: dir.teams, users: dir.users, profiles: dir.profiles };
}

/**
 * The open club: its branding, its directory (seasons, teams, people, player profiles) and who is
 * signed in to it. Each club has its own session; people belong to one club only.
 */
export const ClubStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ users, meId, seasons, allTeams }) => {
    const season = computed(() => currentSeason(seasons()));
    return {
      me: computed(() => users().find((u) => u.id === meId()) ?? null),
      /** The current season. */
      season,
      /** Ended seasons, newest first. Read-only. */
      pastSeasons: computed(() =>
        seasons()
          .filter((s) => !!s.endedAt)
          .reverse(),
      ),
      /** The current season's teams. */
      teams: computed(() => allTeams().filter((t) => t.season === season()?.id)),
    };
  }),
  withComputed(({ me, teams, profiles }) => {
    const persona = computed(() => {
      const m = me();
      return m ? personaOf(m) : 'parent';
    });
    return {
      persona,
      isClubStaff: computed(() => me()?.kind === 'club'),
      isTeamStaff: computed(() => me()?.kind === 'staff'),
      /** Teams the signed-in user belongs to. Club staff see every team. */
      myTeams: computed(() => {
        const m = me();
        if (!m) return [];
        return m.kind === 'club' ? teams().map((t) => t.id) : m.teams;
      }),
      /**
       * Player profiles the user can act for: their children, whatever their own role (a coach can
       * be a parent too), or themself as a player.
       */
      myPlayers: computed(() => {
        const m = me();
        if (!m) return [];
        return profiles().filter((p) => p.parentIds.includes(m.id) || p.userId === m.id);
      }),
    };
  }),
  withComputed(({ me, persona, teams, myPlayers, slug, meId, preview, mustChangePassword, settings }) => ({
    /** Who sees the INVITED list: staff, or everyone when the club shows everyone's contacts. */
    seesInvites: computed(() => {
      const kind = me()?.kind;
      return kind === 'club' || kind === 'staff' || settings().contacts === 'everyone';
    }),
    /** e.g. `Parent · 2 linked players`, `Team Staff · U12 Girls, U14 Boys`. */
    roleLine: computed(() => {
      const m = me();
      if (!m) return '';
      const name = (id: string) => teamLabel(teams(), id);
      switch (persona()) {
        case 'player':
          return `Player · ${name(m.teams[0] ?? '')}`;
        case 'teamStaff':
          return `Team Staff · ${m.teams.map(name).join(', ')}`;
        case 'clubStaff':
          return `Club Staff · ${m.title ?? ''}`;
        default: {
          const n = myPlayers().length;
          return `Parent · ${n} linked ${n === 1 ? 'player' : 'players'}`;
        }
      }
    }),
    /** Changes whenever the club, the signed-in person or preview mode changes. Null when signed out. */
    sessionKey: computed(() =>
      meId() && !mustChangePassword() ? `${slug()}:${meId()}${preview() ? ':preview' : ''}` : null,
    ),
  })),
  withMethods((store, auth = inject(AuthRepository), directory = inject(DirectoryRepository)) => {
    async function applySession(session: ClubSession | null, preview = false): Promise<void> {
      if (!session || session.mustChangePassword) {
        patchState(store, {
          ...signedOut,
          meId: session?.userId ?? null,
          mustChangePassword: !!session?.mustChangePassword,
          preview: false,
          loaded: true,
        });
        return;
      }
      const dir = await directory.load();
      patchState(store, {
        ...fromDirectory(dir),
        settings: dir.settings,
        meId: session.userId,
        mustChangePassword: false,
        preview,
        demoAccounts: auth.demoAccounts(),
        loaded: true,
      });
    }

    return {
      user(id: UserId | null | undefined): User | undefined {
        return store.users().find((u) => u.id === id);
      },
      /** Any season's team. */
      teamName(id: string): string {
        return teamLabel(store.allTeams(), id);
      },
      team(id: TeamId): Team | undefined {
        return store.allTeams().find((t) => t.id === id);
      },
      /** Seeded clubs to offer on the landing page. Empty for real backends. */
      demoClubs(): DemoClub[] {
        return auth.demoClubs();
      },
      /**
       * Opens the club at `slug`: its branding and, when signed in, its directory.
       * Resolves with null if no club has that link. A club that is already open stays as it is.
       */
      async open(slug: string): Promise<Club | null> {
        if (store.slug() === slug && store.loaded()) return store.club();
        const club = await directory.findClub(slug);
        if (!club) {
          patchState(store, { ...initialState, slug, loaded: true });
          return null;
        }
        await auth.useClub(slug);
        patchState(store, { slug, club, manifestUrl: directory.manifestUrl(slug) });
        await applySession(await auth.session());
        return club;
      },
      /** Reloads the active club's directory and session (the backend's default club in tests). */
      async load(): Promise<void> {
        const session = await auth.session();
        const dir = await directory.load();
        patchState(store, { slug: dir.club.slug, club: dir.club, manifestUrl: directory.manifestUrl(dir.club.slug) });
        await applySession(session);
      },
      /** Rejects with the backend's message when the details are wrong. */
      async signIn(username: string, password: string): Promise<void> {
        const slug = store.slug();
        if (!slug) throw new Error('No club is open.');
        await applySession(await auth.signIn({ clubSlug: slug, username, password }));
      },
      async changePassword(newPassword: string): Promise<void> {
        await auth.changePassword(newPassword);
        await applySession(await auth.session());
      },
      async signOut(): Promise<void> {
        await auth.signOut();
        patchState(store, { ...signedOut, preview: false });
      },
      async switchUser(userId: UserId): Promise<void> {
        await auth.signInAs(userId);
        patchState(store, { meId: userId });
      },
      /** Platform admin: open `slug` with sample data under its branding. */
      async openPreview(slug: string): Promise<void> {
        const club = await directory.findClub(slug);
        if (!club) throw new Error('No club at this link.');
        await auth.usePreview(slug);
        patchState(store, { slug, club, manifestUrl: null });
        await applySession(await auth.session(), true);
      },
      /** Forgets the open club, e.g. when leaving for the platform admin. */
      close(): void {
        patchState(store, initialState);
      },
      /** Resolves with the sign-in to hand the new member. */
      async inviteMember(input: InviteMemberInput): Promise<MemberInvite> {
        const invite = await directory.inviteMember(input);
        patchState(store, (s) => ({ users: [...s.users, invite.user] }));
        return invite;
      },
      /** Resolves with the sign-in for `newStaff`, if any. */
      async saveTeam(input: SaveTeamInput): Promise<MemberInvite | null> {
        const { directory: dir, invite } = await directory.saveTeam(input);
        patchState(store, fromDirectory(dir));
        return invite;
      },
      /** Club staff: a team of this season with no players and no events. */
      async deleteTeam(teamId: TeamId): Promise<void> {
        patchState(store, fromDirectory(await directory.deleteTeam(teamId)));
      },
      /** Club staff: ends the current season, which becomes read-only, and starts `input.name`. */
      async startSeason(input: StartSeasonInput): Promise<void> {
        patchState(store, fromDirectory(await directory.startSeason(input)));
      },
      /** A past season's rosters, read-only. */
      loadSeason(seasonId: SeasonId): Promise<SeasonRoster> {
        return directory.loadSeason(seasonId);
      },
      async updateMember(input: UpdateMemberInput): Promise<void> {
        const updated = await directory.updateMember(input);
        patchState(store, (s) => ({ users: s.users.map((u) => (u.id === updated.id ? updated : u)) }));
      },
      async cancelInvite(userId: UserId): Promise<void> {
        await directory.cancelInvite(userId);
        patchState(store, (s) => ({ users: s.users.filter((u) => u.id !== userId) }));
      },
      /** Resolves with the new sign-in to hand them. */
      resendInvite(userId: UserId): Promise<MemberInvite> {
        return directory.resendInvite(userId);
      },
      /** A forgotten password: resolves with a new temporary one to hand them. */
      resetPassword(userId: UserId): Promise<MemberInvite> {
        return directory.resetPassword(userId);
      },
      async setMemberDisabled(userId: UserId, disabled: boolean): Promise<void> {
        const updated = await directory.setMemberDisabled(userId, disabled);
        patchState(store, (s) => ({ users: s.users.map((u) => (u.id === updated.id ? updated : u)) }));
      },
      /** Their messages stay, from a former member; they are unlinked from their players. */
      async removeMember(userId: UserId): Promise<void> {
        await directory.removeMember(userId);
        patchState(store, (s) => ({
          users: s.users.filter((u) => u.id !== userId),
          profiles: s.profiles.map((p) =>
            p.parentIds.includes(userId) || p.userId === userId
              ? {
                  ...p,
                  parentIds: p.parentIds.filter((id) => id !== userId),
                  userId: p.userId === userId ? null : p.userId,
                }
              : p,
          ),
        }));
      },
      canResetPassword(user: User): boolean {
        const me = store.me();
        return !!me && canResetPassword(me, user);
      },
      /** Disable, re-enable or remove them from the club. */
      canRemoveMember(user: User): boolean {
        const me = store.me();
        return !!me && canRemoveMember(me, user);
      },
      /** Yourself; anyone, for club staff; invites to their teams, for team staff. */
      canEditMember(user: User): boolean {
        const me = store.me();
        return !!me && (me.id === user.id || me.kind === 'club' || canManageInvite(me, user));
      },
      canManageInvite(user: User): boolean {
        const me = store.me();
        return !!me && canManageInvite(me, user);
      },
      /**
       * Club staff, or staff of `team`: who adds, approves, moves and removes players and sets their
       * parents. Only in the current season; past ones are read-only.
       */
      canManageTeam(team: TeamId): boolean {
        const me = store.me();
        return !!me && canManageTeam(me, team) && store.teams().some((t) => t.id === team);
      },
      /** Who puts `user` on `team` or takes them off it. */
      canChangeMemberTeam(user: User, team: TeamId): boolean {
        const me = store.me();
        return !!me && canChangeMemberTeam(me, user, team);
      },
      async setMemberTeams(userId: UserId, teams: TeamId[]): Promise<void> {
        const updated = await directory.setMemberTeams(userId, teams);
        patchState(store, (s) => ({ users: s.users.map((u) => (u.id === updated.id ? updated : u)) }));
      },
      async approvePlayer(profileId: string): Promise<void> {
        const updated = await directory.approvePlayer(profileId);
        patchState(store, (s) => ({ profiles: s.profiles.map((p) => (p.id === updated.id ? updated : p)) }));
      },
      /** Also rejects a link request. */
      async removePlayer(profileId: string): Promise<void> {
        await directory.removePlayer(profileId);
        patchState(store, (s) => ({ profiles: s.profiles.filter((p) => p.id !== profileId) }));
      },
      /** Their parents and own sign-in move with them, so the whole directory is refreshed. */
      async movePlayer(profileId: string, team: TeamId): Promise<void> {
        patchState(store, fromDirectory(await directory.movePlayer(profileId, team)));
      },
      /** Resolves with the player's new sign-in to hand them. */
      async givePlayerSignIn(profileId: string, email: string): Promise<MemberInvite> {
        const invite = await directory.givePlayerSignIn(profileId, email);
        patchState(store, (s) => ({
          users: [...s.users, invite.user],
          profiles: s.profiles.map((p) => (p.id === profileId ? { ...p, userId: invite.user.id } : p)),
        }));
        return invite;
      },
      /**
       * The player's parents, the player themself, club staff and the team's staff: the people who
       * also read and edit the player's care details (`canSeePlayerCare`).
       */
      canEditProfile(profile: PlayerProfile): boolean {
        const me = store.me();
        return !!me && canSeePlayerCare(me, profile);
      },
      /** Resolves with the player's sign-in to hand them, when they were given an email. */
      async addPlayer(input: AddPlayerInput): Promise<MemberInvite | null> {
        const { profile, invite } = await directory.addPlayer(input);
        patchState(store, (s) => ({
          profiles: [...s.profiles, profile],
          users: invite ? [...s.users, invite.user] : s.users,
        }));
        return invite;
      },
      async setPlayerParents(profileId: string, parentIds: UserId[]): Promise<void> {
        const updated = await directory.setPlayerParents(profileId, parentIds);
        patchState(store, (s) => ({ profiles: s.profiles.map((p) => (p.id === updated.id ? updated : p)) }));
      },
      async updateProfile(input: UpdateProfileInput): Promise<void> {
        const updated = await directory.updateProfile(input);
        patchState(store, (s) => ({ profiles: s.profiles.map((p) => (p.id === updated.id ? updated : p)) }));
      },
      /** Club staff only. */
      async saveSettings(settings: ClubSettings): Promise<void> {
        patchState(store, { settings: await directory.saveSettings(settings) });
      },
      async requestPlayerLink(input: LinkPlayerInput): Promise<void> {
        const created = await directory.requestPlayerLink(input);
        patchState(store, (s) => ({ profiles: [...s.profiles, created] }));
      },
    };
  }),
);

export type ClubStore = InstanceType<typeof ClubStore>;
