import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { AuthRepository, ClubInput, NewClubInput, PlatformRepository } from '@aura/backend/api';
import { ClubAccount, PlatformAdmin } from '@aura/shared/models';

interface PlatformState {
  admin: PlatformAdmin | null;
  /** The session check has run. */
  checked: boolean;
  clubs: ClubAccount[];
  clubsLoaded: boolean;
  /** The club just created and its admin's temporary password, until its page shows them once. */
  created: { club: ClubAccount; temporaryPassword: string } | null;
}

const initialState: PlatformState = { admin: null, checked: false, clubs: [], clubsLoaded: false, created: null };

/** The platform admin's session and the clubs they manage. */
export const PlatformStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store, auth = inject(AuthRepository), platform = inject(PlatformRepository)) => ({
    club(id: string): ClubAccount | undefined {
      return store.clubs().find((c) => c.id === id);
    },
    /** Resolves with the signed-in platform admin, checking with the backend once. */
    async checkSession(): Promise<PlatformAdmin | null> {
      if (!store.checked()) patchState(store, { admin: await auth.platformSession(), checked: true });
      return store.admin();
    },
    async signIn(email: string, password: string): Promise<void> {
      patchState(store, { admin: await auth.signInPlatform(email, password), checked: true });
    },
    async signOut(): Promise<void> {
      await auth.signOutPlatform();
      patchState(store, { ...initialState, checked: true });
    },
    async loadClubs(): Promise<void> {
      patchState(store, { clubs: await platform.listClubs(), clubsLoaded: true });
    },
    async createClub(input: NewClubInput): Promise<ClubAccount> {
      const club = await platform.createClub(input);
      patchState(store, (s) => ({
        clubs: [...s.clubs, club],
        created: { club, temporaryPassword: input.temporaryPassword },
      }));
      return club;
    },
    /** Hands over (once) the just-created club with this id, for its "club created" panel. */
    takeCreated(id: string): { club: ClubAccount; temporaryPassword: string } | null {
      const created = store.created();
      if (created?.club.id !== id) return null;
      patchState(store, { created: null });
      return created;
    },
    async updateClub(id: string, input: Omit<ClubInput, 'slug'>): Promise<ClubAccount> {
      const club = await platform.updateClub(id, input);
      patchState(store, (s) => ({ clubs: s.clubs.map((c) => (c.id === id ? club : c)) }));
      return club;
    },
  })),
);

export type PlatformStore = InstanceType<typeof PlatformStore>;
