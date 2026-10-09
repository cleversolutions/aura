import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { EventType, RsvpStatus, Score } from '@aura/shared/models';
import { Check, Icon, Sheet } from '@aura/shared/ui';
import { RSVP_LABEL } from '@aura/shared/util';
import { EVENT_ICON } from './event-icon';

export interface RsvpAttendeeVm {
  id: string;
  name: string;
  jersey: string;
  status: RsvpStatus | undefined;
}

export interface EventDetailVm {
  type: EventType;
  title: string;
  /** Sheet title bar, e.g. `GAME · U12 GIRLS`. */
  sheetTitle: string;
  when: string;
  /** `Home game` / `Away game`, games only. */
  homeAway: string | null;
  location: string;
  notes: string;
  /** Read-only final score. */
  finalScore: Score | null;
  /** Score entry for staff on a finished game. */
  scoreEntry: { clubName: string; opponent: string; score: Score | null } | null;
  /** RSVP controls, upcoming events only. `pickPlayers` lets parents choose which players. */
  rsvp: { heading: string; pickPlayers: boolean; attendees: RsvpAttendeeVm[] } | null;
  canEdit: boolean;
}

export interface RsvpConfirmation {
  attendeeIds: string[];
  status: RsvpStatus | null;
}

/** Event details sheet with RSVP, score entry and edit actions. */
@Component({
  selector: 'aura-event-detail',
  imports: [Sheet, Icon, Check],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let e = vm();
    <aura-sheet [title]="e.sheetTitle" [layer]="20" (closed)="closed.emit()">
      <div class="flex items-start gap-3">
        <span class="w-10 shrink-0"><aura-icon [name]="icon()" [size]="40" [strokeWidth]="1.8" /></span>
        <div class="min-w-0 flex-1">
          <div class="font-display text-[26px] leading-[1.05] font-bold text-pretty uppercase">{{ e.title }}</div>
          <div class="mt-1 text-[15px] font-semibold">{{ e.when }}</div>
          @if (e.homeAway) {
            <div class="text-sm font-medium">{{ e.homeAway }}</div>
          }
        </div>
      </div>

      <div class="rounded-md border-2 border-ink px-3 py-2.5">
        <div class="label-caps">LOCATION</div>
        <div class="mt-0.5 text-base font-medium">{{ e.location }}</div>
      </div>
      <div class="min-h-[72px] rounded-md border-2 border-ink px-3 py-2.5">
        <div class="label-caps">NOTES</div>
        <div class="mt-0.5 text-[15px] leading-normal text-pretty">{{ e.notes || 'No notes.' }}</div>
      </div>

      @if (e.finalScore; as score) {
        <div class="flex items-center justify-between rounded-md bg-ink p-3 text-paper">
          <div class="label-caps">FINAL</div>
          <div class="font-display text-[26px] font-bold">{{ score.us }} – {{ score.them }}</div>
        </div>
      }

      @if (e.scoreEntry; as entry) {
        <div class="flex flex-col gap-2.5 rounded-md border-2 border-ink p-3">
          <div class="label-caps">RECORD SCORE</div>
          <div class="grid grid-cols-2 gap-2">
            <label class="flex flex-col gap-1 text-[13px] font-semibold">
              {{ entry.clubName }}
              <input
                class="field-input text-lg"
                type="number"
                inputmode="numeric"
                [value]="scoreUs()"
                (input)="scoreUs.set(value($event))"
              />
            </label>
            <label class="flex flex-col gap-1 text-[13px] font-semibold">
              {{ entry.opponent }}
              <input
                class="field-input text-lg"
                type="number"
                inputmode="numeric"
                [value]="scoreThem()"
                (input)="scoreThem.set(value($event))"
              />
            </label>
          </div>
          <button
            type="button"
            class="h-11 rounded-md bg-ink font-display text-base font-bold tracking-[0.05em] text-paper"
            (click)="scoreSaved.emit({ us: scoreUs(), them: scoreThem() })"
          >
            SAVE SCORE
          </button>
        </div>
      }

      @if (e.rsvp; as rsvp) {
        <div class="mt-1 flex flex-col gap-2">
          <div class="text-center font-display text-lg font-bold tracking-[0.05em]">{{ rsvp.heading }}</div>
          @if (rsvp.pickPlayers) {
            @for (a of rsvp.attendees; track a.id) {
              <button
                type="button"
                class="tile py-2.5"
                [attr.aria-pressed]="selected().includes(a.id)"
                (click)="toggle(a.id)"
              >
                <aura-check [checked]="selected().includes(a.id)" [size]="26" />
                <span class="min-w-0 flex-1">
                  <span class="block text-base font-semibold">{{ a.name }}</span>
                  <span class="block text-[13px]">#{{ a.jersey }}</span>
                </span>
                <span
                  class="rounded border-[1.5px] border-ink px-1.5 py-0.5 font-display text-[13px] font-bold tracking-[0.05em]"
                  [class]="a.status === 'going' ? 'bg-ink text-paper' : 'bg-paper text-ink'"
                  >{{ a.status ? label[a.status] : 'UNDECIDED' }}</span
                >
              </button>
            }
          } @else {
            @let mine = rsvp.attendees[0]?.status;
            <div class="text-center text-sm font-medium">
              Current: <strong>{{ mine ? label[mine] : 'UNDECIDED' }}</strong>
            </div>
          }
          <button type="button" class="btn-primary mt-1 text-xl" (click)="confirm('going')">CONFIRM GOING</button>
          <button type="button" class="btn-outline text-xl" (click)="confirm('out')">CONFIRM OUT</button>
          <button type="button" class="btn-link h-10" (click)="confirm(null)">Mark undecided</button>
        </div>
      }

      @if (e.canEdit) {
        <button
          type="button"
          class="h-11 rounded-lg border-2 border-dashed border-ink bg-paper font-display text-base font-bold tracking-[0.05em]"
          (click)="edit.emit()"
        >
          EDIT EVENT
        </button>
      }
    </aura-sheet>
  `,
})
export class EventDetail {
  readonly vm = input.required<EventDetailVm>();
  readonly closed = output<void>();
  readonly edit = output<void>();
  readonly confirmed = output<RsvpConfirmation>();
  /** Raw field values; the container validates them. */
  readonly scoreSaved = output<{ us: string; them: string }>();

  protected readonly label = RSVP_LABEL;
  protected readonly icon = computed(() => EVENT_ICON[this.vm().type]);
  private readonly attendeeIds = computed(() => this.vm().rsvp?.attendees.map((a) => a.id) ?? [], {
    equal: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
  });
  protected readonly selected = linkedSignal(() => this.attendeeIds());
  protected readonly scoreUs = linkedSignal(() => this.vm().scoreEntry?.score?.us.toString() ?? '');
  protected readonly scoreThem = linkedSignal(() => this.vm().scoreEntry?.score?.them.toString() ?? '');

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected toggle(id: string): void {
    this.selected.update((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  protected confirm(status: RsvpStatus | null): void {
    const rsvp = this.vm().rsvp;
    if (!rsvp) return;
    const attendeeIds = rsvp.pickPlayers ? this.selected() : rsvp.attendees.map((a) => a.id);
    this.confirmed.emit({ attendeeIds, status });
  }
}
