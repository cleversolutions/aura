import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { ClubEvent, ClubEventDraft, EventTeam, EventType } from '@aura/shared/models';
import { Check, Chips, Choice, Segmented, Sheet } from '@aura/shared/ui';
import { MAX_WEEKS, weeklyDates } from '@aura/shared/util';

/** Returns an error message for an incomplete draft, or null when it can be saved. */
export function validateEventDraft(d: ClubEventDraft): string | null {
  if (d.type === 'game' && !d.opponent?.trim()) return 'Add the opponent.';
  if (d.type === 'special' && !d.title?.trim()) return 'Add a title.';
  if (!d.tbd && (!d.date || !d.time)) return 'Pick a date and time, or mark TBD.';
  if (d.endTime && d.time && d.endTime <= d.time) return 'The end time must be after the start time.';
  if (d.arriveBy && d.time && d.arriveBy > d.time) return 'The arrive-by time can’t be after the start time.';
  if (!d.location.trim()) return 'Add a location.';
  return null;
}

/** Which weeks of a repeating event a change applies to: this one, or this and every later one. */
export type SeriesScope = 'one' | 'following';

export interface EventFormValue {
  draft: ClubEventDraft;
  /** New events only: repeat every week until this date (`YYYY-MM-DD`). */
  repeatUntil?: string;
  /** Editing a repeating event: this week only, or later weeks too. Always `one` otherwise. */
  scope: SeriesScope;
}

const PLURAL: Record<EventType, string> = { practice: 'practices', game: 'games', special: 'events' };

/** Create or edit an event. Emits a validated draft; saving is the container's job. */
@Component({
  selector: 'aura-event-form',
  imports: [Sheet, Segmented, Chips, Check],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aura-sheet [title]="event() ? 'EDIT EVENT' : 'NEW EVENT'" [layer]="30" (closed)="closed.emit()">
      <aura-segmented [options]="typeOptions" [(value)]="type" [height]="42" [fontSize]="15" />

      @if (type() === 'game') {
        <label class="field">
          OPPONENT
          <input
            class="field-input"
            [value]="opponent()"
            (input)="opponent.set(value($event))"
            placeholder="e.g. Riverside Hawks"
          />
        </label>
        <aura-segmented [options]="homeOptions" [(value)]="home" [height]="40" [fontSize]="15" />
      }
      @if (type() === 'special') {
        <label class="field">
          TITLE
          <input
            class="field-input"
            [value]="title()"
            (input)="title.set(value($event))"
            placeholder="e.g. Team Dinner"
          />
        </label>
      }

      <div class="label-caps">TEAM</div>
      <aura-chips [options]="teamOptions()" [(value)]="team" />

      <button
        type="button"
        class="flex items-center gap-2.5 py-1 text-[15px] font-semibold"
        [attr.aria-pressed]="tbd()"
        (click)="tbd.set(!tbd())"
      >
        <aura-check [checked]="tbd()" />
        Date &amp; time TBD
      </button>
      @if (!tbd()) {
        <div class="grid grid-cols-[1.3fr_1fr] gap-2">
          <input
            class="field-input text-[15px]"
            type="date"
            aria-label="Date"
            [value]="date()"
            (input)="date.set(value($event))"
          />
          <input
            class="field-input text-[15px]"
            type="time"
            aria-label="Time"
            [value]="time()"
            (input)="time.set(value($event))"
          />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <label class="field">
            ENDS
            <input
              class="field-input text-[15px]"
              type="time"
              [value]="endTime()"
              (input)="endTime.set(value($event))"
            />
          </label>
          <label class="field">
            ARRIVE BY
            <input
              class="field-input text-[15px]"
              type="time"
              [value]="arriveBy()"
              (input)="arriveBy.set(value($event))"
            />
          </label>
        </div>
        @if (!event()) {
          <button
            type="button"
            class="flex items-center gap-2.5 py-1 text-[15px] font-semibold"
            [attr.aria-pressed]="repeats()"
            (click)="repeats.set(!repeats())"
          >
            <aura-check [checked]="repeats()" />
            Repeats weekly
          </button>
          @if (repeats()) {
            <label class="field">
              UNTIL
              <input
                class="field-input text-[15px]"
                type="date"
                [min]="date()"
                [value]="until()"
                (input)="until.set(value($event))"
              />
            </label>
            @if (repeatSummary(); as summary) {
              <p class="-mt-1 text-[13px] leading-snug">{{ summary }}</p>
            }
          }
        }
      }

      <label class="field">
        LOCATION
        <input
          class="field-input"
          [value]="location()"
          (input)="location.set(value($event))"
          placeholder="Gym, court, or address"
        />
      </label>
      <label class="field">
        NOTES
        <textarea
          class="field-input h-auto resize-none py-2.5 text-[15px] leading-normal font-normal"
          rows="3"
          placeholder="Optional"
          [value]="notes()"
          (input)="notes.set(value($event))"
        ></textarea>
      </label>

      @if (inSeries() && !confirming()) {
        <div class="label-caps">WEEKLY · CHANGE</div>
        <aura-segmented [options]="scopeOptions" [(value)]="scope" [height]="40" [fontSize]="15" />
      }

      @if (shownError()) {
        <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
      }
      @if (confirming(); as action) {
        <div class="flex flex-col gap-2 rounded-md border-2 border-dashed border-ink p-3" role="group">
          <p class="text-[15px] font-medium">
            @if (action === 'cancel') {
              Cancel this event? It stays on the schedule marked CANCELLED, and RSVPs close. You can restore it later.
            } @else if (inSeries()) {
              Delete this week only, or this week and every later week of the series? Their RSVPs go too; it cannot be
              undone.
            } @else {
              Delete this event and its RSVPs? Use this for an event entered by mistake; it cannot be undone.
            }
          </p>
          @if (action === 'delete' && inSeries()) {
            <div class="grid grid-cols-2 gap-2">
              <button type="button" class="btn-primary h-11" [disabled]="saving()" (click)="deleted.emit('one')">
                THIS WEEK
              </button>
              <button type="button" class="btn-primary h-11" [disabled]="saving()" (click)="deleted.emit('following')">
                ALL LATER WEEKS
              </button>
            </div>
            <button type="button" class="btn-link h-10 self-center" (click)="confirming.set(null)">Back</button>
          } @else {
            <div class="grid grid-cols-2 gap-2">
              <button type="button" class="btn-outline h-11" (click)="confirming.set(null)">BACK</button>
              <button
                type="button"
                class="btn-primary h-11"
                [disabled]="saving()"
                (click)="action === 'cancel' ? cancelledChange.emit(true) : deleted.emit('one')"
              >
                {{ action === 'cancel' ? 'CANCEL EVENT' : 'DELETE' }}
              </button>
            </div>
          }
        </div>
      } @else {
        <button type="button" class="btn-primary mt-1" [disabled]="saving()" (click)="submit()">
          {{ submitLabel() }}
        </button>
        @if (event(); as e) {
          <div class="grid grid-cols-2 gap-2">
            @if (e.cancelled) {
              <button
                type="button"
                class="btn-outline h-11"
                [disabled]="saving()"
                (click)="cancelledChange.emit(false)"
              >
                RESTORE EVENT
              </button>
            } @else {
              <button type="button" class="btn-outline h-11" (click)="confirming.set('cancel')">CANCEL EVENT</button>
            }
            <button type="button" class="btn-outline h-11" (click)="confirming.set('delete')">DELETE EVENT</button>
          </div>
        }
      }
    </aura-sheet>
  `,
})
export class EventForm {
  /** The event to edit; null creates a new one. */
  readonly event = input<ClubEvent | null>(null);
  readonly teamOptions = input.required<Choice<EventTeam>[]>();
  /** Team preselected for a new event. */
  readonly defaultTeam = input<EventTeam>('');
  readonly saving = input(false);
  /** Error from the last save attempt. */
  readonly error = input('');

  readonly submitted = output<EventFormValue>();
  readonly closed = output<void>();
  /** Editing only: call the event off (true) or restore it (false); one week of a series at a time. */
  readonly cancelledChange = output<boolean>();
  /** Editing only, after confirming: this event, or (repeating events) this and every later week. */
  readonly deleted = output<SeriesScope>();

  protected readonly typeOptions: Choice<EventType>[] = [
    { value: 'practice', label: 'PRACTICE' },
    { value: 'game', label: 'GAME' },
    { value: 'special', label: 'SPECIAL' },
  ];
  protected readonly scopeOptions: Choice<SeriesScope>[] = [
    { value: 'one', label: 'THIS WEEK' },
    { value: 'following', label: 'LATER WEEKS TOO' },
  ];
  protected readonly homeOptions: Choice<boolean>[] = [
    { value: true, label: 'HOME' },
    { value: false, label: 'AWAY' },
  ];

  protected readonly type = linkedSignal<EventType>(() => this.event()?.type ?? 'practice');
  protected readonly opponent = linkedSignal(() => this.event()?.opponent ?? '');
  protected readonly home = linkedSignal(() => this.event()?.home ?? true);
  protected readonly title = linkedSignal(() => this.event()?.title ?? '');
  protected readonly team = linkedSignal<EventTeam>(() => this.event()?.team ?? this.defaultTeam());
  protected readonly tbd = linkedSignal(() => !!this.event()?.tbd);
  protected readonly date = linkedSignal(() => this.event()?.date ?? '');
  protected readonly time = linkedSignal(() => this.event()?.time ?? '');
  protected readonly endTime = linkedSignal(() => this.event()?.endTime ?? '');
  protected readonly arriveBy = linkedSignal(() => this.event()?.arriveBy ?? '');
  protected readonly repeats = signal(false);
  protected readonly until = signal('');
  /** Back to this week only whenever another event is opened. */
  protected readonly scope = linkedSignal<ClubEvent | null, SeriesScope>({
    source: this.event,
    computation: () => 'one',
  });
  /** Editing one week of a repeating event. */
  protected readonly inSeries = computed(() => !!this.event()?.seriesId && !!this.event()?.date);
  /** e.g. `Every Tuesday: 8 practices.` */
  protected readonly repeatSummary = computed(() => {
    const date = this.date();
    const until = this.until();
    if (!date || !until || until < date) return '';
    const n = weeklyDates(date, until).length;
    const day = new Date(`${date}T12:00`).toLocaleDateString('en-US', { weekday: 'long' });
    const what = n === 1 ? this.type() : PLURAL[this.type()];
    return `Every ${day}: ${n} ${what}` + (n === MAX_WEEKS ? ` (the most at once).` : '.');
  });
  protected readonly location = linkedSignal(() => this.event()?.location ?? '');
  protected readonly notes = linkedSignal(() => this.event()?.notes ?? '');

  protected readonly confirming = signal<'cancel' | 'delete' | null>(null);
  /** Names the team on a new event, so it is not created for the wrong one by accident. */
  protected readonly submitLabel = computed(() => {
    if (this.event()) return 'SAVE CHANGES';
    const team = this.teamOptions().find((o) => o.value === this.team());
    return team ? `CREATE · ${team.label.toUpperCase()}` : 'CREATE EVENT';
  });

  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected submit(): void {
    if (!this.team()) {
      this.validationError.set('Pick a team.');
      return;
    }
    const type = this.type();
    const tbd = this.tbd();
    const repeats = !this.event() && !tbd && this.repeats();
    const scope: SeriesScope = this.inSeries() ? this.scope() : 'one';
    const draft: ClubEventDraft = {
      ...(this.event() ?? {}),
      type,
      team: this.team(),
      opponent: type === 'game' ? this.opponent().trim() : undefined,
      home: type === 'game' ? this.home() : undefined,
      title: type === 'special' ? this.title().trim() : undefined,
      tbd,
      date: tbd ? undefined : this.date(),
      time: tbd ? undefined : this.time(),
      endTime: (!tbd && this.endTime()) || undefined,
      arriveBy: (!tbd && this.arriveBy()) || undefined,
      location: this.location().trim(),
      notes: this.notes().trim(),
    };
    const problem = validateEventDraft(draft) ?? this.seriesProblem(draft, repeats, scope);
    this.validationError.set(problem ?? '');
    if (problem) return;
    this.submitted.emit(repeats ? { draft, repeatUntil: this.until(), scope } : { draft, scope });
  }

  private seriesProblem(draft: ClubEventDraft, repeats: boolean, scope: SeriesScope): string | null {
    if (repeats && (!this.until() || weeklyDates(draft.date ?? '', this.until()).length < 2)) {
      return 'Pick an end date at least a week after the first event.';
    }
    if (scope === 'following' && draft.tbd) return 'Pick a date and time to change later weeks too.';
    return null;
  }
}
