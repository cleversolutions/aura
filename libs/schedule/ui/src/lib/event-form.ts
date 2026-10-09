import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { ClubEvent, ClubEventDraft, EventTeam, EventType } from '@aura/shared/models';
import { Check, Chips, Choice, Segmented, Sheet } from '@aura/shared/ui';

/** Returns an error message for an incomplete draft, or null when it can be saved. */
export function validateEventDraft(d: ClubEventDraft): string | null {
  if (d.type === 'game' && !d.opponent?.trim()) return 'Add the opponent.';
  if (d.type === 'special' && !d.title?.trim()) return 'Add a title.';
  if (!d.tbd && (!d.date || !d.time)) return 'Pick a date and time, or mark TBD.';
  if (!d.location.trim()) return 'Add a location.';
  return null;
}

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

      @if (shownError()) {
        <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
      }
      <button type="button" class="btn-primary mt-1" [disabled]="saving()" (click)="submit()">
        {{ event() ? 'SAVE CHANGES' : 'CREATE EVENT' }}
      </button>
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

  readonly submitted = output<ClubEventDraft>();
  readonly closed = output<void>();

  protected readonly typeOptions: Choice<EventType>[] = [
    { value: 'practice', label: 'PRACTICE' },
    { value: 'game', label: 'GAME' },
    { value: 'special', label: 'SPECIAL' },
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
  protected readonly location = linkedSignal(() => this.event()?.location ?? '');
  protected readonly notes = linkedSignal(() => this.event()?.notes ?? '');

  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected submit(): void {
    const type = this.type();
    const tbd = this.tbd();
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
      location: this.location().trim(),
      notes: this.notes().trim(),
    };
    const problem = validateEventDraft(draft);
    this.validationError.set(problem ?? '');
    if (!problem) this.submitted.emit(draft);
  }
}
