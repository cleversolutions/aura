import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { ScheduleRepository } from '@aura/backend/api';
import { ClubStore } from '@aura/club/data-access';
import { Attendee, ClubEvent, ClubEventDraft, RsvpMap, RsvpStatus, Score } from '@aura/shared/models';
import { CLOCK, canEditEvent, eventSortKey, eventTitle, isoDate, isUpcoming } from '@aura/shared/util';

export type ScheduleSegment = 'upcoming' | 'past';

interface ScheduleState {
  events: ClubEvent[];
  rsvps: RsvpMap;
  segment: ScheduleSegment;
  query: string;
  loaded: boolean;
}

const initialState: ScheduleState = { events: [], rsvps: {}, segment: 'upcoming', query: '', loaded: false };

export const ScheduleStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store, club = inject(ClubStore), now = inject(CLOCK)) => {
    const today = computed(() => isoDate(now()));
    /** Events on the user's teams plus club-wide events. */
    const visible = computed(() => {
      const mine = club.myTeams();
      const all = club.isClubStaff();
      return store.events().filter((e) => all || e.team === 'ALL' || mine.includes(e.team));
    });
    return {
      today,
      /** Visible events for the current segment, filtered by the search query and sorted. */
      listed: computed(() => {
        const up = store.segment() === 'upcoming';
        const q = store.query().trim().toLowerCase();
        const list = visible()
          .filter((e) => isUpcoming(e, today()) === up)
          .filter((e) => !q || `${eventTitle(e)} ${e.location} ${club.teamName(e.team)}`.toLowerCase().includes(q));
        return list.sort((a, b) =>
          up ? eventSortKey(a).localeCompare(eventSortKey(b)) : eventSortKey(b).localeCompare(eventSortKey(a)),
        );
      }),
      canCreate: computed(() => club.isClubStaff() || club.isTeamStaff()),
    };
  }),
  withMethods((store, repo = inject(ScheduleRepository), club = inject(ClubStore)) => ({
    setSegment(segment: ScheduleSegment) {
      patchState(store, { segment });
    },
    setQuery(query: string) {
      patchState(store, { query });
    },
    isUpcoming(e: ClubEvent): boolean {
      return isUpcoming(e, store.today());
    },
    canEdit(e: ClubEvent): boolean {
      const me = club.me();
      return !!me && canEditEvent(e, me);
    },
    /** Who the user RSVPs for: their players on that team (parents), otherwise themself. */
    attendeesFor(e: ClubEvent): Attendee[] {
      const me = club.me();
      if (!me) return [];
      if (club.persona() === 'parent') {
        return club.myPlayers().filter((p) => e.team === 'ALL' || p.team === e.team);
      }
      return [{ id: me.id, name: me.name, jersey: '' }];
    },
    statusOf(eventId: string, attendeeId: string): RsvpStatus | undefined {
      return store.rsvps()[eventId]?.[attendeeId];
    },
    async load(): Promise<void> {
      const [events, rsvps] = await Promise.all([repo.listEvents(), repo.listRsvps()]);
      patchState(store, { events, rsvps, loaded: true });
    },
    async setRsvp(eventId: string, attendeeIds: string[], status: RsvpStatus | null): Promise<void> {
      const previous = store.rsvps();
      const forEvent = { ...(previous[eventId] ?? {}) };
      for (const id of attendeeIds) {
        if (status) forEvent[id] = status;
        else delete forEvent[id];
      }
      // Optimistic: RSVPs should feel instant on a phone.
      patchState(store, { rsvps: { ...previous, [eventId]: forEvent } });
      try {
        await repo.setRsvp(eventId, attendeeIds, status);
      } catch (e) {
        patchState(store, { rsvps: previous });
        throw e;
      }
    },
    async saveEvent(draft: ClubEventDraft): Promise<ClubEvent> {
      const saved = await repo.saveEvent(draft);
      patchState(store, (s) => ({
        events: s.events.some((e) => e.id === saved.id)
          ? s.events.map((e) => (e.id === saved.id ? saved : e))
          : [...s.events, saved],
      }));
      return saved;
    },
    async saveScore(eventId: string, score: Score): Promise<void> {
      const saved = await repo.saveScore(eventId, score);
      patchState(store, (s) => ({ events: s.events.map((e) => (e.id === saved.id ? saved : e)) }));
    },
  })),
  withMethods((store) => ({
    /**
     * One-tap GOING / OUT from the list. Applies to every attendee; tapping the active
     * choice again clears it. Returns the status that was applied.
     */
    async quickRsvp(e: ClubEvent, status: RsvpStatus): Promise<RsvpStatus | null> {
      const attendees = store.attendeesFor(e);
      const allSet = attendees.every((a) => store.statusOf(e.id, a.id) === status);
      const next = allSet ? null : status;
      await store.setRsvp(
        e.id,
        attendees.map((a) => a.id),
        next,
      );
      return next;
    },
  })),
);

export type ScheduleStore = InstanceType<typeof ScheduleStore>;
