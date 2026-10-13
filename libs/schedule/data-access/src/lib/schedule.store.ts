import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { ScheduleRepository } from '@aura/backend/api';
import { ClubStore } from '@aura/club/data-access';
import { Attendee, ClubEvent, ClubEventDraft, RsvpMap, RsvpStatus, Score, SeasonId } from '@aura/shared/models';
import { CLOCK, canEditEvent, eventSortKey, eventTitle, isoDate, isUpcoming } from '@aura/shared/util';

export type ScheduleSegment = 'upcoming' | 'past';

interface ScheduleState {
  events: ClubEvent[];
  rsvps: RsvpMap;
  segment: ScheduleSegment;
  query: string;
  /** A past season being browsed (read-only); null for the current season. */
  pastSeason: SeasonId | null;
  loaded: boolean;
}

const initialState: ScheduleState = {
  events: [],
  rsvps: {},
  segment: 'upcoming',
  query: '',
  pastSeason: null,
  loaded: false,
};

export const ScheduleStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store, club = inject(ClubStore), now = inject(CLOCK)) => {
    const today = computed(() => isoDate(now()));
    /** The season shown: the current one, or a past one being browsed. */
    const shownSeason = computed(() => store.pastSeason() ?? club.season()?.id);
    /**
     * This season: events on the user's teams plus club-wide events. A past season: all of its
     * events (memberships of past seasons are not loaded; the schedule was club-readable anyway).
     */
    const visible = computed(() => {
      const mine = club.myTeams();
      const all = club.isClubStaff() || !!store.pastSeason();
      return store
        .events()
        .filter((e) => (e.season ?? club.season()?.id) === shownSeason())
        .filter((e) => all || e.team === 'ALL' || mine.includes(e.team));
    });
    const viewingPast = computed(() => !!store.pastSeason());
    return {
      today,
      /** A past season is shown: nothing can be changed. */
      viewingPast,
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
      canCreate: computed(() => !viewingPast() && (club.isClubStaff() || club.isTeamStaff())),
    };
  }),
  withMethods((store, repo = inject(ScheduleRepository), club = inject(ClubStore)) => {
    /** Events of an ended season are read-only. */
    const isPastSeason = (e: ClubEvent) => !!e.season && e.season !== club.season()?.id;
    return {
      setSegment(segment: ScheduleSegment) {
        patchState(store, { segment });
      },
      setQuery(query: string) {
        patchState(store, { query });
      },
      /** Browse a past season (read-only), or null for the current one. */
      showSeason(pastSeason: SeasonId | null) {
        patchState(store, { pastSeason, segment: pastSeason ? 'past' : 'upcoming' });
      },
      isPastSeason,
      isUpcoming(e: ClubEvent): boolean {
        return isUpcoming(e, store.today());
      },
      canEdit(e: ClubEvent): boolean {
        const me = club.me();
        return !!me && canEditEvent(e, me) && !isPastSeason(e);
      },
      /**
       * Who the user RSVPs for: parents, their players on that team; everyone else, themself, plus
       * any of their children on the team (a coach who is also a parent).
       */
      attendeesFor(e: ClubEvent): Attendee[] {
        const me = club.me();
        if (!me || isPastSeason(e)) return [];
        const children = club.myPlayers().filter((p) => p.userId !== me.id && (e.team === 'ALL' || p.team === e.team));
        if (club.persona() === 'parent') return children;
        return [{ id: me.id, name: me.name, jersey: '' }, ...children];
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
    };
  }),
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
