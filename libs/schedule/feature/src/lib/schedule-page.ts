import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ClubStore } from '@aura/club/data-access';
import { ScheduleStore } from '@aura/schedule/data-access';
import {
  EVENT_ICON,
  EventCard,
  EventCardVm,
  EventDetail,
  EventDetailVm,
  EventForm,
  RsvpConfirmation,
  ScheduleToolbar,
} from '@aura/schedule/ui';
import { ClubEvent, ClubEventDraft, EventTeam, RsvpStatus } from '@aura/shared/models';
import { AppHeader, Choice } from '@aura/shared/ui';
import {
  RSVP_LABEL,
  Submission,
  Toaster,
  eventTitle,
  firstName,
  formatEventWhen,
  formatResult,
} from '@aura/shared/util';

/** Schedule tab container: maps store state to view models and handles every action. */
@Component({
  selector: 'aura-schedule-page',
  imports: [AppHeader, ScheduleToolbar, EventCard, EventDetail, EventForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-0 flex-col' },
  template: `
    <aura-app-header [clubName]="club.club()?.name ?? ''" [logoUrl]="club.club()?.logoUrl" />

    <main class="min-h-0 flex-1 overflow-y-auto">
      <div class="flex flex-col gap-3 px-3.5 pt-3.5 pb-6">
        <aura-schedule-toolbar
          [segment]="store.segment()"
          [query]="store.query()"
          [canCreate]="store.canCreate()"
          (segmentChange)="store.setSegment($event)"
          (queryChange)="store.setQuery($event)"
          (create)="startEditing('new')"
        />

        @for (vm of cards(); track vm.id) {
          <aura-event-card [vm]="vm" (opened)="openId.set(vm.id)" (rsvp)="quickRsvp(vm.id, $event)" />
        } @empty {
          @if (store.loaded()) {
            <div class="rounded-lg border-2 border-dashed border-ink px-4 py-7 text-center text-[15px] font-medium">
              No events found.
            </div>
          }
        }
      </div>
    </main>

    @if (detail(); as vm) {
      <aura-event-detail
        [vm]="vm"
        (closed)="openId.set(null)"
        (edit)="startEditing(openEvent())"
        (confirmed)="confirmRsvp($event)"
        (scoreSaved)="saveScore($event)"
      />
    }
    @if (editing(); as target) {
      <aura-event-form
        [event]="target === 'new' ? null : target"
        [teamOptions]="teamOptions()"
        [defaultTeam]="defaultTeam()"
        [saving]="save.saving()"
        [error]="save.error()"
        (closed)="editing.set(null)"
        (submitted)="saveEvent($event)"
      />
    }
  `,
})
export class SchedulePage {
  protected readonly store = inject(ScheduleStore);
  protected readonly club = inject(ClubStore);
  private readonly toaster = inject(Toaster);

  protected readonly openId = signal<string | null>(null);
  protected readonly editing = signal<ClubEvent | 'new' | null>(null);
  protected readonly save = new Submission();

  protected readonly openEvent = computed(() => this.store.events().find((e) => e.id === this.openId()) ?? null);

  protected readonly cards = computed<EventCardVm[]>(() =>
    this.store.listed().map((e) => {
      const attendees = this.store.attendeesFor(e);
      const statuses = attendees.map((a) => this.store.statusOf(e.id, a.id));
      const upcoming = this.store.isUpcoming(e);
      const many = attendees.length > 1;
      return {
        id: e.id,
        icon: EVENT_ICON[e.type],
        title: eventTitle(e),
        teamShort: e.team === 'ALL' ? 'CLUB' : e.team,
        when: formatEventWhen(e) + (e.type === 'game' ? ` · ${e.home ? 'Home' : 'Away'}` : ''),
        location: e.location,
        upcoming,
        allGoing: attendees.length > 0 && statuses.every((s) => s === 'going'),
        allOut: attendees.length > 0 && statuses.every((s) => s === 'out'),
        statusLine:
          upcoming && many
            ? attendees
                .map((a, i) => {
                  const s = statuses[i];
                  return `${firstName(a.name)}: ${s ? s[0].toUpperCase() + s.slice(1) : 'Undecided'}`;
                })
                .join(' · ')
            : null,
        pastLeft: e.type === 'game' ? (e.score ? formatResult(e.score) : 'FINAL · SCORE PENDING') : 'COMPLETED',
        pastRight: attendees
          .map((a, i) => {
            const s = statuses[i];
            return (many ? `${firstName(a.name)} ` : '') + (s ? RSVP_LABEL[s].toLowerCase() : 'no RSVP');
          })
          .join(' · '),
      };
    }),
  );

  protected readonly detail = computed<EventDetailVm | null>(() => {
    const e = this.openEvent();
    if (!e) return null;
    const upcoming = this.store.isUpcoming(e);
    const canEdit = this.store.canEdit(e);
    const isParent = this.club.persona() === 'parent';
    const attendees = this.store.attendeesFor(e);
    return {
      type: e.type,
      title: eventTitle(e),
      sheetTitle: `${e.type.toUpperCase()} · ${this.club.teamName(e.team).toUpperCase()}`,
      when: formatEventWhen(e),
      homeAway: e.type === 'game' ? (e.home ? 'Home game' : 'Away game') : null,
      location: e.location,
      notes: e.notes,
      finalScore: !upcoming && !canEdit ? (e.score ?? null) : null,
      scoreEntry:
        !upcoming && e.type === 'game' && canEdit
          ? { clubName: this.club.club()?.name ?? 'Us', opponent: e.opponent ?? 'Them', score: e.score ?? null }
          : null,
      rsvp: upcoming
        ? {
            heading: !isParent ? 'YOUR RSVP' : attendees.length > 1 ? 'RSVP FOR WHICH PLAYERS?' : 'RSVP FOR',
            pickPlayers: isParent,
            attendees: attendees.map((a) => ({ ...a, status: this.store.statusOf(e.id, a.id) })),
          }
        : null,
      canEdit,
    };
  });

  protected readonly teamOptions = computed<Choice<EventTeam>[]>(() => {
    const ids: EventTeam[] = this.club.isClubStaff() ? [...this.club.myTeams(), 'ALL'] : this.club.myTeams();
    return ids.map((id) => ({ value: id, label: this.club.teamName(id) }));
  });
  protected readonly defaultTeam = computed<EventTeam>(() =>
    this.club.isClubStaff() ? 'ALL' : (this.club.myTeams()[0] ?? ''),
  );

  protected startEditing(target: ClubEvent | 'new' | null): void {
    this.save.reset();
    this.editing.set(target);
  }

  /** Names for the toast: the selected players' first names, or "You". */
  private who(e: ClubEvent, attendeeIds: string[]): string {
    if (this.club.persona() !== 'parent') return 'You';
    return this.store
      .attendeesFor(e)
      .filter((a) => attendeeIds.includes(a.id))
      .map((a) => firstName(a.name))
      .join(' & ');
  }

  protected async quickRsvp(eventId: string, status: RsvpStatus): Promise<void> {
    const e = this.store.events().find((x) => x.id === eventId);
    if (!e) return;
    const who = this.who(
      e,
      this.store.attendeesFor(e).map((a) => a.id),
    );
    try {
      const applied = await this.store.quickRsvp(e, status);
      this.toaster.show(
        applied
          ? `${who}: ${RSVP_LABEL[applied].toLowerCase()} · ${eventTitle(e)}`
          : `${who} marked undecided for ${eventTitle(e)}`,
      );
    } catch {
      this.toaster.show('Could not save your RSVP. Try again.');
    }
  }

  protected async confirmRsvp({ attendeeIds, status }: RsvpConfirmation): Promise<void> {
    const e = this.openEvent();
    if (!e) return;
    if (!attendeeIds.length) {
      this.toaster.show('Select at least one player.');
      return;
    }
    try {
      await this.store.setRsvp(e.id, attendeeIds, status);
      this.toaster.show(
        `${this.who(e, attendeeIds)}: ${status ? RSVP_LABEL[status].toLowerCase() : 'undecided'} · ${eventTitle(e)}`,
      );
      this.openId.set(null);
    } catch {
      this.toaster.show('Could not save your RSVP. Try again.');
    }
  }

  protected async saveScore({ us, them }: { us: string; them: string }): Promise<void> {
    const e = this.openEvent();
    if (!e) return;
    if (us === '' || them === '') {
      this.toaster.show('Enter both scores.');
      return;
    }
    try {
      await this.store.saveScore(e.id, { us: Number(us), them: Number(them) });
      this.toaster.show(`Score saved: ${us}–${them}`);
      this.openId.set(null);
    } catch {
      this.toaster.show('Could not save the score. Try again.');
    }
  }

  protected async saveEvent(draft: ClubEventDraft): Promise<void> {
    const isEdit = !!draft.id;
    const ok = await this.save.run(() => this.store.saveEvent(draft), 'Could not save the event. Try again.');
    if (!ok) return;
    this.toaster.show(isEdit ? 'Event updated. Members notified.' : 'Event created. Members notified.');
    this.editing.set(null);
    this.openId.set(null);
  }
}
