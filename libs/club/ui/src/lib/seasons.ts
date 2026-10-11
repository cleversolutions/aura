import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { TeamId } from '@aura/shared/models';
import { Check, Sheet } from '@aura/shared/ui';
import { agedUp, nextSeasonName } from '@aura/shared/util';

/** A team of the current season, as the start-season form offers it. */
export interface SeasonTeamVm {
  id: TeamId;
  name: string;
  age?: string;
  division?: string;
  /** e.g. `12 players · 2 staff`. */
  counts: string;
}

/** A team carried into the new season. */
export interface CarriedTeamValue {
  from: TeamId;
  name: string;
  age?: string;
  division?: string;
  staff: boolean;
  players: boolean;
}

export interface StartSeasonValue {
  name: string;
  teams: CarriedTeamValue[];
}

interface CarryRow extends CarriedTeamValue {
  oldName: string;
  counts: string;
  carry: boolean;
}

/**
 * Ends the current season and starts the next. Each team can carry over (a year older, renamed),
 * with or without its staff and players; teams left out stay in the old season, read-only.
 */
@Component({
  selector: 'aura-start-season-form',
  imports: [Sheet, Check],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aura-sheet title="START NEW SEASON" (closed)="closed.emit()">
      <p class="text-[13px] leading-snug">
        {{ currentName() }} ends. Its teams, rosters, schedule and team chats are kept, read-only. Everyone stays in the
        club.
      </p>
      <label class="field">
        NEW SEASON
        <input class="field-input" placeholder="e.g. 2027–28" [value]="name()" (input)="name.set(value($event))" />
      </label>

      <div class="label-caps mt-1">CARRY TEAMS OVER</div>
      <p class="-mt-1.5 text-[13px] leading-snug">
        Ticked teams start the new season, a year older. Untick STAFF or PLAYERS to rebuild a team; move single players
        between teams afterwards.
      </p>
      @for (row of rows(); track row.from; let i = $index) {
        <div class="flex flex-col gap-2 rounded-md border-2 border-ink p-2.5">
          <button
            type="button"
            class="flex items-center gap-3 text-left"
            [attr.aria-pressed]="row.carry"
            (click)="update(i, { carry: !row.carry })"
          >
            <aura-check [checked]="row.carry" />
            <span class="min-w-0 flex-1">
              <span class="block text-[15px] font-semibold">{{ row.oldName }}</span>
              <span class="block text-xs">{{ row.carry ? row.counts : 'Ends with ' + currentName() }}</span>
            </span>
          </button>
          @if (row.carry) {
            <input
              class="field-input"
              [attr.aria-label]="'New name for ' + row.oldName"
              [value]="row.name"
              (input)="update(i, { name: value($event) })"
            />
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="flex items-center gap-2 text-sm font-semibold"
                [attr.aria-pressed]="row.staff"
                (click)="update(i, { staff: !row.staff })"
              >
                <aura-check [checked]="row.staff" [size]="20" /> STAFF
              </button>
              <button
                type="button"
                class="flex items-center gap-2 text-sm font-semibold"
                [attr.aria-pressed]="row.players"
                (click)="update(i, { players: !row.players })"
              >
                <aura-check [checked]="row.players" [size]="20" /> PLAYERS
              </button>
            </div>
          }
        </div>
      } @empty {
        <div class="rounded-md border-2 border-dashed border-ink p-3 text-sm">No teams this season.</div>
      }

      @if (shownError()) {
        <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
      }
      @if (confirming()) {
        <div class="flex flex-col gap-2 rounded-md border-2 border-dashed border-ink p-3" role="group">
          <p class="text-[15px] font-medium">
            End {{ currentName() }} and start {{ name().trim() }} with {{ carried().length }}
            {{ carried().length === 1 ? 'team' : 'teams' }}? {{ currentName() }} can’t be changed afterwards.
          </p>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="btn-outline h-11" (click)="confirming.set(false)">BACK</button>
            <button type="button" class="btn-primary h-11" [disabled]="saving()" (click)="submit()">
              START SEASON
            </button>
          </div>
        </div>
      } @else {
        <button type="button" class="btn-primary mt-1" (click)="review()">
          START {{ name().trim().toUpperCase() || 'SEASON' }}
        </button>
      }
    </aura-sheet>
  `,
})
export class StartSeasonForm {
  readonly currentName = input.required<string>();
  readonly teams = input.required<SeasonTeamVm[]>();
  readonly saving = input(false);
  readonly error = input('');

  readonly submitted = output<StartSeasonValue>();
  readonly closed = output<void>();

  protected readonly name = linkedSignal(() => nextSeasonName(this.currentName()));
  protected readonly rows = linkedSignal<CarryRow[]>(() =>
    this.teams().map((t) => ({
      ...agedUp(t),
      from: t.id,
      oldName: t.name,
      counts: t.counts,
      carry: true,
      staff: true,
      players: true,
    })),
  );
  protected readonly carried = computed(() => this.rows().filter((r) => r.carry));
  protected readonly confirming = signal(false);
  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected update(index: number, change: Partial<CarryRow>): void {
    this.rows.update((rows) => rows.map((r, i) => (i === index ? { ...r, ...change } : r)));
    this.validationError.set('');
  }

  protected review(): void {
    if (!this.name().trim()) return this.validationError.set('Name the new season.');
    const names = this.carried().map((r) => r.name.trim().toLowerCase());
    if (names.some((n) => !n)) return this.validationError.set('Name every team you carry over.');
    if (new Set(names).size < names.length) return this.validationError.set('Give each team a different name.');
    this.validationError.set('');
    this.confirming.set(true);
  }

  protected submit(): void {
    this.submitted.emit({
      name: this.name().trim(),
      teams: this.carried().map(({ from, name, age, division, staff, players }) => ({
        from,
        name: name.trim(),
        ...(age ? { age } : {}),
        ...(division ? { division } : {}),
        staff,
        players,
      })),
    });
  }
}

export interface SetupStepVm {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  /** Button label for an open step. */
  action: string;
}

/** First-run guidance for a new club's staff: each step with its state and a button to do it. */
@Component({
  selector: 'aura-setup-checklist',
  imports: [Check],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-2.5 rounded-lg border-2 border-ink p-3.5" aria-labelledby="setup-heading">
      <h2 id="setup-heading" class="label-caps text-[13px]">GET STARTED · {{ doneCount() }} OF {{ steps().length }}</h2>
      <ol class="flex flex-col gap-2.5">
        @for (step of steps(); track step.id) {
          <li class="flex items-center gap-3">
            <aura-check [checked]="step.done" />
            <span class="min-w-0 flex-1">
              <span class="block text-[15px] font-semibold" [class.line-through]="step.done">{{ step.label }}</span>
              <span class="block text-[13px] leading-snug">{{ step.detail }}</span>
            </span>
            @if (!step.done && step.action) {
              <button type="button" class="btn-small shrink-0" (click)="started.emit(step.id)">
                {{ step.action }}
              </button>
            }
          </li>
        }
      </ol>
    </section>
  `,
})
export class SetupChecklist {
  readonly steps = input.required<SetupStepVm[]>();
  readonly started = output<string>();

  protected readonly doneCount = computed(() => this.steps().filter((s) => s.done).length);
}
