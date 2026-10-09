import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import {
  AuthRepository,
  ClubSession,
  DemoAccount,
  DemoClub,
  DirectoryRepository,
  InviteMemberInput,
  LinkPlayerInput,
  MemberInvite,
  SaveTeamInput,
  UpdateProfileInput,
} from '@aura/backend/api';
import { Club, PlayerProfile, Team, User, UserId } from '@aura/shared/models';
import { personaOf, teamLabel } from '@aura/shared/util';

interface ClubState {
  /** Slug of the open club; set even when the link turned out not to exist. */
  slug: string | null;
  club: Club | null;
  manifestUrl: string | null;
  teams: Team[];
  users: User[];
  profiles: PlayerProfile[];
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
  teams: [],
  users: [],
  profiles: [],
  meId: null,
  mustChangePassword: false,
  preview: false,
  demoAccounts: [],
  loaded: false,
};

const signedOut = { teams: [], users: [], profiles: [], meId: null, mustChangePassword: false, demoAccounts: [] };

/**
 * The open club: its branding, its directory (teams, people, player profiles) and who is
 * signed in to it. Each club has its own session; people belong to one club only.
 */
export const ClubStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ users, meId }) => ({
    me: computed(() => users().find((u) => u.id === meId()) ?? null),
  })),
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
      /** Player profiles the user can act for: their children (parents) or themself (players). */
      myPlayers: computed(() => {
        const m = me();
        if (!m) return [];
        if (persona() === 'parent') return profiles().filter((p) => p.parentId === m.id);
        if (persona() === 'player') return profiles().filter((p) => p.userId === m.id);
        return [];
      }),
    };
  }),
  withComputed(({ me, persona, teams, myPlayers, slug, meId, preview, mustChangePassword }) => ({
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
        default:
          return `Parent · ${myPlayers().length} linked players`;
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
        ...dir,
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
      teamName(id: string): string {
        return teamLabel(store.teams(), id);
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
        patchState(store, { teams: dir.teams, users: dir.users, profiles: dir.profiles });
        return invite;
      },
      async updateProfile(input: UpdateProfileInput): Promise<void> {
        const updated = await directory.updateProfile(input);
        patchState(store, (s) => ({ profiles: s.profiles.map((p) => (p.id === updated.id ? updated : p)) }));
      },
      async requestPlayerLink(input: LinkPlayerInput): Promise<void> {
        const created = await directory.requestPlayerLink(input);
        patchState(store, (s) => ({ profiles: [...s.profiles, created] }));
      },
    };
  }),
);

export type ClubStore = InstanceType<typeof ClubStore>;
