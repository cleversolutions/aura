import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { EventType, RsvpStatus, Score } from '@aura/shared/models';
import { Check, Icon, Sheet } from '@aura/shared/ui';
import { RSVP_LABEL } from '@aura/shared/util';
import { EVENT_ICON } from './event-icon';

export interface RsvpAttendeeVm {
  id: string;
  name: string;
  /** e.g. `#8`, or `You`. */
  detail: string;
  status: RsvpStatus | undefined;
  note?: string;
}

/** One player in the attendance list. */
export interface AttendancePersonVm {
  id: string;
  name: string;
  /** e.g. `#8`. */
  detail: string;
  note?: string;
}

/** Who is coming, for the event's staff. */
export interface AttendanceVm {
  /** e.g. `8 going · 1 out · 3 undecided`. */
  summary: string;
  groups: { label: string; people: AttendancePersonVm[] }[];
}

export interface EventDetailVm {
  type: EventType;
  title: string;
  /** Sheet title bar, e.g. `GAME · U12 GIRLS`. */
  sheetTitle: string;
  when: string;
  /** `Home game` / `Away game`, games only. */
  homeAway: string | null;
  /** e.g. `Arrive by 5:45 PM`. */
  arriveBy: string | null;
  /** e.g. `Repeats weekly`, for one week of a series. */
  repeats: string | null;
  location: string;
  /** Opens the location in a map (`mapLink`); null without a location. */
  mapUrl: string | null;
  notes: string;
  /** Read-only final score. */
  finalScore: Score | null;
  /** Score entry for staff on a finished game. */
  scoreEntry: { clubName: string; opponent: string; score: Score | null } | null;
  /**
   * RSVP controls, upcoming events only. `pickPlayers` shows a checklist of who the answer is for
   * (parents, and anyone answering for more than one person). `note` prefills the note field.
   */
  rsvp: { heading: string; pickPlayers: boolean; attendees: RsvpAttendeeVm[]; note: string } | null;
  /** Called off: shown CANCELLED, with no RSVP controls. */
  cancelled: boolean;
  attendance: AttendanceVm | null;
  canEdit: boolean;
}

export interface RsvpConfirmation {
  attendeeIds: string[];
  status: RsvpStatus | null;
  note: string;
}

/**
 * Event details with RSVP, score entry and edit actions. Shown as a sheet, or as a
 * docked side pane (`pane`) on wide screens, where it has no close button.
 */
@Component({
  selector: 'aura-event-detail',
  imports: [Sheet, Icon, Check, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let e = vm();
    @if (pane()) {
      <section role="region" [attr.aria-label]="e.sheetTitle" class="flex h-full min-h-0 flex-col">
        <div class="flex h-[46px] shrink-0 items-center bg-ink px-4 text-paper">
          <h2 class="font-display text-[15px] font-bold tracking-[0.08em]">{{ e.sheetTitle }}</h2>
        </div>
        <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-4 pb-7">
          <ng-container *ngTemplateOutlet="body" />
        </div>
      </section>
    } @else {
      <aura-sheet [title]="e.sheetTitle" [layer]="20" (closed)="closed.emit()">
        <ng-container *ngTemplateOutlet="body" />
      </aura-sheet>
    }

    <ng-template #body>
      @if (e.cancelled) {
        <div class="rounded-md bg-ink px-3 py-2.5 text-paper" role="status">
          <div class="font-display text-lg font-bold tracking-[0.05em]">CANCELLED</div>
          <div class="text-[13px]">This event is not happening. It stays on the schedule for the record.</div>
        </div>
      }
      <div class="flex items-start gap-3">
        <span class="w-10 shrink-0"><aura-icon [name]="icon()" [size]="40" [strokeWidth]="1.8" /></span>
        <div class="min-w-0 flex-1">
          <div
            class="font-display text-[26px] leading-[1.05] font-bold text-pretty uppercase"
            [class.line-through]="e.cancelled"
          >
            {{ e.title }}
          </div>
          <div class="mt-1 text-[15px] font-semibold">{{ e.when }}</div>
          @if (e.arriveBy) {
            <div class="text-sm font-semibold">{{ e.arriveBy }}</div>
          }
          @if (e.homeAway) {
            <div class="text-sm font-medium">{{ e.homeAway }}</div>
          }
          @if (e.repeats) {
            <div class="text-sm font-medium">{{ e.repeats }}</div>
          }
        </div>
      </div>

      <div class="rounded-md border-2 border-ink px-3 py-2.5">
        <div class="flex items-baseline justify-between gap-2">
          <div class="label-caps">LOCATION</div>
          @if (e.mapUrl) {
            <a
              class="font-display text-sm font-bold tracking-[0.05em] underline underline-offset-2"
              target="_blank"
              rel="noopener"
              [href]="e.mapUrl"
              [attr.aria-label]="'Map of ' + e.location"
              >OPEN MAP ↗</a
            >
          }
        </div>
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
                  <span class="block text-[13px]">{{ a.detail }}{{ a.note ? ' · ' + a.note : '' }}</span>
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
          <label class="field">
            NOTE (OPTIONAL)
            <input
              class="field-input text-[15px]"
              maxlength="200"
              placeholder="e.g. Late, 15 min"
              [value]="note()"
              (input)="note.set(value($event))"
            />
          </label>
          <button type="button" class="btn-primary mt-1 text-xl" (click)="confirm('going')">CONFIRM GOING</button>
          <button type="button" class="btn-outline text-xl" (click)="confirm('out')">CONFIRM OUT</button>
          <button type="button" class="btn-link h-10" (click)="confirm(null)">Mark undecided</button>
        </div>
      }

      @if (e.attendance; as att) {
        <section class="flex flex-col gap-2 rounded-md border-2 border-ink p-3" aria-label="Attendance">
          <div class="flex items-baseline justify-between gap-2">
            <div class="label-caps">ATTENDANCE</div>
            <div class="text-[13px] font-semibold">{{ att.summary }}</div>
          </div>
          @for (g of att.groups; track g.label) {
            <div>
              <div class="border-b border-ink pb-0.5 font-display text-sm font-bold tracking-[0.05em]">
                {{ g.label }} · {{ g.people.length }}
              </div>
              <ul class="mt-1 flex flex-col gap-0.5">
                @for (p of g.people; track p.id) {
                  <li class="flex items-baseline gap-2 text-sm">
                    <span class="w-8 shrink-0 text-[13px]">{{ p.detail }}</span>
                    <span class="min-w-0 flex-1">
                      <span class="font-semibold">{{ p.name }}</span>
                      @if (p.note) {
                        <span class="block text-[13px] italic">{{ p.note }}</span>
                      }
                    </span>
                  </li>
                }
              </ul>
            </div>
          } @empty {
            <div class="text-sm">No players on this team yet.</div>
          }
        </section>
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
    </ng-template>
  `,
})
export class EventDetail {
  readonly vm = input.required<EventDetailVm>();
  /** Docked side pane instead of a sheet. */
  readonly pane = input(false);
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
  private readonly prefilledNote = computed(() => this.vm().rsvp?.note ?? '');
  protected readonly note = linkedSignal(() => this.prefilledNote());
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
    this.confirmed.emit({ attendeeIds, status, note: this.note().trim() });
  }
}
