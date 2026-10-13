import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { AuthRepository, ClubInput, MemberInvite, NewClubInput, PlatformRepository } from '@aura/backend/api';
import { ClubAccount, ClubStaffMember, PlatformAdmin } from '@aura/shared/models';

/** Swaps in a club the backend returned, keeping the counts only the club list has. */
function replaced(clubs: ClubAccount[], club: ClubAccount): ClubAccount[] {
  return clubs.map((c) => (c.id === club.id ? { ...club, counts: club.counts ?? c.counts } : c));
}

interface PlatformState {
  admin: PlatformAdmin | null;
  /** The session check has run. */
  checked: boolean;
  clubs: ClubAccount[];
  clubsLoaded: boolean;
  /** The club just created and its admin's temporary password, until its page shows them once. */
  created: { club: ClubAccount; temporaryPassword: string } | null;
  /** The open club's staff, for choosing its admin. */
  staff: { clubId: string; members: ClubStaffMember[] } | null;
}

const initialState: PlatformState = {
  admin: null,
  checked: false,
  clubs: [],
  clubsLoaded: false,
  created: null,
  staff: null,
};

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
      patchState(store, (s) => ({ clubs: replaced(s.clubs, club) }));
      return club;
    },
    /** The club's staff, the admin among them. */
    clubStaff(id: string): ClubStaffMember[] {
      const staff = store.staff();
      return staff?.clubId === id ? staff.members : [];
    },
    async loadClubStaff(id: string): Promise<void> {
      patchState(store, { staff: { clubId: id, members: await platform.listClubStaff(id) } });
    },
    async setClubAdmin(id: string, memberId: string): Promise<void> {
      const club = await platform.setClubAdmin(id, memberId);
      patchState(store, (s) => ({
        clubs: replaced(s.clubs, club),
        staff:
          s.staff?.clubId === id
            ? { clubId: id, members: s.staff.members.map((m) => ({ ...m, admin: m.id === memberId })) }
            : s.staff,
      }));
    },
    /** Archives the club (read-only for its members), or restores it. */
    async setArchived(id: string, archived: boolean): Promise<void> {
      const club = await platform.setArchived(id, archived);
      patchState(store, (s) => ({ clubs: replaced(s.clubs, club) }));
    },
    /** Resolves with the club admin's new temporary password. */
    resetAdminPassword(id: string): Promise<MemberInvite> {
      return platform.resetAdminPassword(id);
    },
  })),
);

export type PlatformStore = InstanceType<typeof PlatformStore>;
