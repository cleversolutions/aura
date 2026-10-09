import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import {
  AuthRepository,
  DemoAccount,
  DirectoryRepository,
  InviteMemberInput,
  LinkPlayerInput,
  SaveTeamInput,
  UpdateProfileInput,
} from '@aura/backend/api';
import { Club, PlayerProfile, Team, User, UserId } from '@aura/shared/models';
import { personaOf, teamLabel } from '@aura/shared/util';

interface ClubState {
  club: Club | null;
  teams: Team[];
  users: User[];
  profiles: PlayerProfile[];
  meId: UserId | null;
  demoAccounts: DemoAccount[];
  loaded: boolean;
}

const initialState: ClubState = {
  club: null,
  teams: [],
  users: [],
  profiles: [],
  meId: null,
  demoAccounts: [],
  loaded: false,
};

/** The club directory (teams, people, player profiles) and who is signed in. */
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
  withMethods((store, auth = inject(AuthRepository), directory = inject(DirectoryRepository)) => ({
    user(id: UserId | null | undefined): User | undefined {
      return store.users().find((u) => u.id === id);
    },
    teamName(id: string): string {
      return teamLabel(store.teams(), id);
    },
    async load(): Promise<void> {
      const [dir, meId] = await Promise.all([directory.load(), auth.currentUserId()]);
      patchState(store, { ...dir, meId, demoAccounts: auth.demoAccounts(), loaded: true });
    },
    async switchUser(userId: UserId): Promise<void> {
      await auth.signInAs(userId);
      patchState(store, { meId: userId });
    },
    async inviteMember(input: InviteMemberInput): Promise<User> {
      const user = await directory.inviteMember(input);
      patchState(store, (s) => ({ users: [...s.users, user] }));
      return user;
    },
    async saveTeam(input: SaveTeamInput): Promise<void> {
      const dir = await directory.saveTeam(input);
      patchState(store, { teams: dir.teams, users: dir.users, profiles: dir.profiles });
    },
    async updateProfile(input: UpdateProfileInput): Promise<void> {
      const updated = await directory.updateProfile(input);
      patchState(store, (s) => ({ profiles: s.profiles.map((p) => (p.id === updated.id ? updated : p)) }));
    },
    async requestPlayerLink(input: LinkPlayerInput): Promise<void> {
      const created = await directory.requestPlayerLink(input);
      patchState(store, (s) => ({ profiles: [...s.profiles, created] }));
    },
  })),
  withHooks({
    onInit(store) {
      void store.load();
    },
  }),
);

export type ClubStore = InstanceType<typeof ClubStore>;
