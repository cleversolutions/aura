import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { IncludeGroups, MemberGroup, Team, Thread, ThreadScope, User, UserId } from '@aura/shared/models';
import { Check, Chips, Choice, Icon, Sheet } from '@aura/shared/ui';
import { ALL_GROUPS, KIND_GROUP, effectiveMembers, teamLabel } from '@aura/shared/util';
import { threadPeopleRows } from './thread-people';

const PEOPLE_LIMIT = 40;

const GROUPS: [MemberGroup, string][] = [
  ['staff', 'Staff'],
  ['parents', 'Parents'],
  ['players', 'Players'],
];

export interface ThreadFormValue {
  name: string;
  scope: ThreadScope;
  teams: string[];
  include: IncludeGroups;
  members: UserId[];
}

/**
 * Create a thread, or view/edit who is in one. People join through whole teams
 * (filtered by group) and individually.
 */
@Component({
  selector: 'aura-thread-form',
  imports: [Sheet, Check, Chips, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aura-sheet [title]="thread() ? 'THREAD MEMBERS' : 'NEW THREAD'" (closed)="closed.emit()">
      @if (!thread()) {
        @if (scopeOptions().length > 1) {
          <div class="label-caps">THREAD FOR</div>
          <aura-chips [options]="scopeOptions()" [value]="scope()" (valueChange)="setScope($event)" />
        }
        <label class="field">
          THREAD NAME
          <input
            class="field-input h-12"
            [value]="name()"
            (input)="name.set(value($event))"
            placeholder="e.g. Saturday carpool"
          />
        </label>
      } @else {
        <div class="grid grid-cols-2 gap-2 rounded-md border-2 border-ink px-3 py-2.5">
          <div>
            <div class="label-caps">THREAD FOR</div>
            <div class="text-[15px] font-medium">{{ teamName(scope()) }}</div>
          </div>
          <div>
            <div class="label-caps">CREATED BY</div>
            <div class="text-[15px] font-medium">{{ creatorName() }}</div>
          </div>
        </div>
      }

      @if (locked()) {
        <div
          class="rounded-md border-2 border-dashed border-ink px-3 py-2.5 text-sm leading-snug font-medium text-pretty"
        >
          🔒 {{ lockNote() }}
        </div>
      }

      @if (teamRows().length) {
        <div class="mt-1 flex items-baseline justify-between">
          <div class="label-caps">WHOLE TEAMS</div>
          @if (!locked() && teamPool().length > 1) {
            <button type="button" class="btn-link text-[13px]" (click)="toggleAllTeams()">
              {{ allTeamsSelected() ? 'Clear all' : 'Select all teams' }}
            </button>
          }
        </div>
        <p class="-mt-1.5 text-[13px] leading-snug">
          People added to these teams later join this thread automatically.
        </p>
        <div class="card">
          @for (row of teamRows(); track row.id) {
            <button
              type="button"
              class="card-row py-[11px]"
              [disabled]="locked()"
              [attr.aria-pressed]="row.selected"
              (click)="toggleTeam(row.id)"
            >
              <aura-check [checked]="row.selected" />
              <span class="min-w-0 flex-1 text-[15px] font-semibold">{{ row.name }}</span>
              <span class="text-[13px] font-medium">{{ row.count }} members</span>
            </button>
          }
        </div>
        @if (teams().length) {
          <div class="label-caps">FROM SELECTED TEAMS, INCLUDE</div>
          <div class="flex flex-wrap gap-1.5">
            @for (g of groups; track g[0]) {
              <button
                type="button"
                class="h-9 rounded-full border-2 border-ink px-3 text-sm font-semibold"
                [class]="include()[g[0]] ? 'bg-ink text-paper' : 'bg-paper text-ink'"
                [attr.aria-pressed]="include()[g[0]]"
                [disabled]="locked()"
                (click)="toggleGroup(g[0])"
              >
                {{ include()[g[0]] ? '✓ ' : '' }}{{ g[1] }}
              </button>
            }
          </div>
        }
      }

      <div class="label-caps mt-1">{{ locked() ? 'ADDED INDIVIDUALLY' : 'INDIVIDUALS' }}</div>
      @if (!locked()) {
        <label class="search-box">
          <aura-icon name="search" [size]="16" />
          <span class="sr-only">Search people</span>
          <input type="search" placeholder="Search people" [value]="search()" (input)="search.set(value($event))" />
        </label>
      }
      <div class="card">
        @for (row of visiblePeople(); track row.user.id) {
          <button
            type="button"
            class="card-row py-[9px]"
            [disabled]="locked()"
            [attr.aria-pressed]="row.explicit"
            (click)="togglePerson(row.user, row.viaTeam, row.explicit)"
          >
            <aura-check [checked]="row.explicit" [implied]="!!row.viaTeam" />
            <span class="min-w-0 flex-1">
              <span class="block text-[15px] font-semibold"
                >{{ row.user.name }}{{ row.user.id === meId() ? ' (you)' : '' }}</span
              >
              <span class="block text-xs">{{
                row.viaTeam && !row.explicit ? 'Included via ' + teamName(row.viaTeam) : kindLabel(row.user)
              }}</span>
            </span>
          </button>
        } @empty {
          <div class="p-3 text-sm font-medium">{{ locked() ? 'No one added individually.' : 'No matches.' }}</div>
        }
      </div>
      @if (people().length > limit) {
        <p class="-mt-1 text-[13px]">Showing {{ limit }} of {{ people().length }}. Search to find others.</p>
      }

      <div class="flex items-center justify-between border-t-2 border-ink pt-2.5 text-[15px] font-semibold">
        <span>Total in thread</span>
        <span class="font-display text-xl font-bold">{{ memberCount() }}</span>
      </div>

      @if (shownError()) {
        <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
      }
      <button type="button" class="btn-primary mt-1" [disabled]="saving()" (click)="submit()">
        {{ !thread() ? 'CREATE THREAD' : locked() ? 'DONE' : 'SAVE MEMBERS' }}
      </button>
    </aura-sheet>
  `,
})
export class ThreadForm {
  /** The thread to edit; null creates a new one. */
  readonly thread = input<Thread | null>(null);
  /** Read-only view (default channels, or threads the user cannot manage). */
  readonly locked = input(false);
  readonly lockNote = input('');
  readonly creatorId = input<UserId | null>(null);
  readonly creatorName = input('');
  readonly meId = input.required<UserId>();
  readonly scopeOptions = input<Choice<ThreadScope>[]>([]);
  readonly allTeams = input.required<Team[]>();
  readonly users = input.required<User[]>();
  readonly saving = input(false);
  readonly error = input('');

  readonly submitted = output<ThreadFormValue>();
  readonly closed = output<void>();
  /** Someone already in the thread through a team was tapped. */
  readonly alreadyIncluded = output<{ person: string; team: string }>();

  protected readonly groups = GROUPS;
  protected readonly limit = PEOPLE_LIMIT;

  protected readonly scope = linkedSignal<ThreadScope>(
    () => this.thread()?.scope ?? this.scopeOptions()[0]?.value ?? '',
  );
  protected readonly name = signal('');
  protected readonly teams = linkedSignal<string[]>(() => [...(this.thread()?.teams ?? [])]);
  protected readonly include = linkedSignal<IncludeGroups>(() => ({ ...(this.thread()?.include ?? ALL_GROUPS) }));
  protected readonly members = linkedSignal<UserId[]>(() => [...(this.thread()?.members ?? [])]);
  protected readonly search = signal('');
  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected readonly teamPool = computed(() =>
    this.scope() === 'club' ? this.allTeams().map((t) => t.id) : [this.scope()],
  );
  protected readonly teamRows = computed(() => {
    const selected = this.teams();
    const pool = this.locked() ? this.teamPool().filter((id) => selected.includes(id)) : this.teamPool();
    const users = this.users();
    return pool.map((id) => ({
      id,
      name: this.teamName(id),
      selected: selected.includes(id),
      count: users.filter((u) => KIND_GROUP[u.kind] && u.teams.includes(id)).length,
    }));
  });
  protected readonly allTeamsSelected = computed(() => this.teamPool().every((id) => this.teams().includes(id)));

  private readonly membership = computed(() => ({
    teams: this.teams(),
    include: this.include(),
    members: this.members(),
    creatorId: this.creatorId(),
  }));
  protected readonly people = computed(() =>
    threadPeopleRows(this.membership(), this.users(), {
      scope: this.scope(),
      creatorId: this.creatorId() ?? '',
      meId: this.meId(),
      locked: this.locked(),
      search: this.search(),
    }),
  );
  protected readonly visiblePeople = computed(() => this.people().slice(0, PEOPLE_LIMIT));
  protected readonly memberCount = computed(() => effectiveMembers(this.membership(), this.users()).size);

  protected teamName(id: string): string {
    return teamLabel(this.allTeams(), id);
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected kindLabel(u: User): string {
    const teams = u.teams.join(', ');
    switch (u.kind) {
      case 'club':
        return `Club Staff · ${u.title ?? ''}`;
      case 'staff':
        return `Team Staff · ${teams}`;
      case 'parent':
        return `Parent · ${teams}`;
      default:
        return `Player · ${teams}`;
    }
  }

  protected setScope(scope: ThreadScope): void {
    this.scope.set(scope);
    this.teams.set([]);
    this.members.set([]);
    this.search.set('');
  }

  protected toggleAllTeams(): void {
    this.teams.set(this.allTeamsSelected() ? [] : [...this.teamPool()]);
    this.validationError.set('');
  }

  protected toggleTeam(id: string): void {
    this.teams.update((ts) => (ts.includes(id) ? ts.filter((x) => x !== id) : [...ts, id]));
    this.validationError.set('');
  }

  protected toggleGroup(group: MemberGroup): void {
    this.include.update((inc) => ({ ...inc, [group]: !inc[group] }));
  }

  protected togglePerson(user: User, viaTeam: string | null, explicit: boolean): void {
    if (viaTeam && !explicit) {
      this.alreadyIncluded.emit({ person: user.name, team: this.teamName(viaTeam) });
      return;
    }
    this.members.update((ms) => (explicit ? ms.filter((x) => x !== user.id) : [...ms, user.id]));
    this.validationError.set('');
  }

  protected submit(): void {
    if (this.thread() && this.locked()) {
      this.closed.emit();
      return;
    }
    if (!this.thread()) {
      if (!this.name().trim()) return this.validationError.set('Give the thread a name.');
      if (this.memberCount() < 2) return this.validationError.set('Add at least one team or person.');
    }
    this.validationError.set('');
    this.submitted.emit({
      name: this.name().trim(),
      scope: this.scope(),
      teams: this.teams(),
      include: this.include(),
      members: this.members(),
    });
  }
}
