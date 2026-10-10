import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { PlayerProfile, TeamId, UserId, UserKind } from '@aura/shared/models';
import { Check, Chips, Choice, Segmented, Sheet } from '@aura/shared/ui';

export type InviteKind = Exclude<UserKind, 'club'>;

export interface InviteFormValue {
  team: TeamId;
  kind: InviteKind;
  name: string;
  email: string;
}

/** Invite a parent, player or staff member to a team. */
@Component({
  selector: 'aura-invite-form',
  imports: [Sheet, Chips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aura-sheet title="INVITE MEMBER" (closed)="closed.emit()">
      @if (teamOptions().length > 1) {
        <div class="label-caps">TEAM</div>
        <aura-chips [options]="teamOptions()" [(value)]="team" />
      }
      <div class="label-caps">INVITE AS</div>
      <aura-chips [options]="roleOptions" [(value)]="kind" />
      <label class="field">
        NAME
        <input
          class="field-input"
          [value]="name()"
          (input)="name.set(value($event))"
          placeholder="First and last name"
        />
      </label>
      <label class="field">
        EMAIL
        <input
          class="field-input"
          type="email"
          [value]="email()"
          (input)="email.set(value($event))"
          placeholder="name@email.com"
        />
      </label>
      <p class="text-[13px] leading-snug">
        They will be added to {{ teamName() }} and automatically join {{ linkedCount() }} team-linked thread{{
          linkedCount() === 1 ? '' : 's'
        }}.
      </p>
      @if (shownError()) {
        <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
      }
      <button type="button" class="btn-primary mt-1" [disabled]="saving()" (click)="submit()">SEND INVITE</button>
    </aura-sheet>
  `,
})
export class InviteForm {
  readonly teamOptions = input.required<Choice<TeamId>[]>();
  readonly initialTeam = input.required<TeamId>();
  /** team → invite kind → number of threads they would join automatically. */
  readonly linkedThreadCounts = input<Record<TeamId, Record<InviteKind, number>>>({});
  readonly saving = input(false);
  readonly error = input('');

  readonly submitted = output<InviteFormValue>();
  readonly closed = output<void>();

  protected readonly roleOptions: Choice<InviteKind>[] = [
    { value: 'parent', label: 'Parent' },
    { value: 'player', label: 'Player' },
    { value: 'staff', label: 'Team Staff' },
  ];

  protected readonly team = linkedSignal(() => this.initialTeam());
  protected readonly kind = signal<InviteKind>('parent');
  protected readonly name = signal('');
  protected readonly email = signal('');
  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected readonly teamName = computed(
    () => this.teamOptions().find((o) => o.value === this.team())?.label ?? this.team(),
  );
  protected readonly linkedCount = computed(() => this.linkedThreadCounts()[this.team()]?.[this.kind()] ?? 0);

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected submit(): void {
    const name = this.name().trim();
    const email = this.email().trim();
    if (!name) return this.validationError.set('Enter their name.');
    if (!email.includes('@')) return this.validationError.set('Enter a valid email.');
    this.validationError.set('');
    this.submitted.emit({ team: this.team(), kind: this.kind(), name, email });
  }
}

export interface PlayerProfileValue {
  name: string;
  jersey: string;
  login: string;
}

/** Edit a linked player's name, jersey and (optionally) their own login. */
@Component({
  selector: 'aura-player-profile-form',
  imports: [Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aura-sheet title="PLAYER PROFILE" (closed)="closed.emit()">
      <label class="field">
        PLAYER NAME
        <input class="field-input" [value]="name()" (input)="name.set(value($event))" />
      </label>
      <label class="field">
        JERSEY NUMBER
        <input class="field-input" inputmode="numeric" [value]="jersey()" (input)="jersey.set(value($event))" />
      </label>
      <div class="rounded-md border-2 border-ink px-3 py-2.5">
        <div class="label-caps">TEAM / AGE GROUP</div>
        <div class="mt-0.5 text-base font-medium">{{ teamName() }}</div>
      </div>
      @if (showLogin()) {
        <label class="field">
          PLAYER'S OWN LOGIN (OPTIONAL)
          <input
            class="field-input"
            type="email"
            placeholder="player@email.com"
            [value]="login()"
            (input)="login.set(value($event))"
          />
        </label>
        <p class="-mt-1 text-[13px] leading-snug">
          Older players can RSVP and chat from their own account. You keep access.
        </p>
      }
      @if (shownError()) {
        <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
      }
      <button type="button" class="btn-primary mt-1" [disabled]="saving()" (click)="submit()">SAVE PLAYER</button>
    </aura-sheet>
  `,
})
export class PlayerProfileForm {
  readonly player = input.required<PlayerProfile>();
  readonly teamName = input('');
  /** Offer a separate login (older players). */
  readonly showLogin = input(false);
  readonly saving = input(false);
  readonly error = input('');

  readonly submitted = output<PlayerProfileValue>();
  readonly closed = output<void>();

  protected readonly name = linkedSignal(() => this.player().name);
  protected readonly jersey = linkedSignal(() => this.player().jersey);
  protected readonly login = linkedSignal(() => this.player().login);
  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected submit(): void {
    const login = this.login().trim();
    if (!this.name().trim()) return this.validationError.set('Enter a name.');
    if (login && !login.includes('@')) return this.validationError.set('Enter a valid email.');
    this.validationError.set('');
    this.submitted.emit({ name: this.name().trim(), jersey: this.jersey().trim(), login });
  }
}

export interface LinkPlayerValue {
  name: string;
  team: TeamId;
  jersey: string;
}

/** A parent asks team staff to link a new player to their account. */
@Component({
  selector: 'aura-link-player-form',
  imports: [Sheet, Chips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aura-sheet title="LINK NEW PLAYER" (closed)="closed.emit()">
      <label class="field">
        PLAYER NAME
        <input
          class="field-input"
          placeholder="First and last name"
          [value]="name()"
          (input)="name.set(value($event))"
        />
      </label>
      <div class="label-caps">TEAM</div>
      <aura-chips [options]="teamOptions()" [(value)]="team" />
      <label class="field">
        JERSEY NUMBER
        <input
          class="field-input"
          inputmode="numeric"
          placeholder="Optional"
          [value]="jersey()"
          (input)="jersey.set(value($event))"
        />
      </label>
      <p class="text-[13px] leading-snug">The team staff confirm new links before the player appears on the roster.</p>
      @if (shownError()) {
        <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
      }
      <button type="button" class="btn-primary mt-1" [disabled]="saving()" (click)="submit()">SEND LINK REQUEST</button>
    </aura-sheet>
  `,
})
export class LinkPlayerForm {
  readonly teamOptions = input.required<Choice<TeamId>[]>();
  readonly initialTeam = input<TeamId>('');
  readonly saving = input(false);
  readonly error = input('');

  readonly submitted = output<LinkPlayerValue>();
  readonly closed = output<void>();

  protected readonly name = signal('');
  protected readonly team = linkedSignal(() => this.initialTeam());
  protected readonly jersey = signal('');
  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected submit(): void {
    if (!this.name().trim()) return this.validationError.set('Enter the player’s name.');
    this.validationError.set('');
    this.submitted.emit({ name: this.name().trim(), team: this.team(), jersey: this.jersey().trim() });
  }
}

const AGES = ['U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'U19'];
type Division = 'Boys' | 'Girls';

export interface StaffOptionVm {
  id: UserId;
  name: string;
  /** e.g. `Currently: U12G, U14B`. */
  sub: string;
}

export interface TeamFormValue {
  /** Set when creating, e.g. `U13 Girls`. */
  name?: string;
  staffIds: UserId[];
  newStaff?: { name: string; email: string };
}

/** Create a team or change who coaches it. Pass `existingName` to edit. */
@Component({
  selector: 'aura-team-form',
  imports: [Sheet, Chips, Segmented, Check],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aura-sheet [title]="existingName() ? 'MANAGE TEAM' : 'CREATE TEAM'" (closed)="closed.emit()">
      @if (!existingName()) {
        <div class="label-caps">AGE GROUP</div>
        <aura-chips [options]="ageOptions" [(value)]="age" />
        <div class="label-caps">DIVISION</div>
        <aura-segmented [options]="divisionOptions" [(value)]="division" [height]="40" [fontSize]="15" />
      }
      <div class="rounded-md border-2 border-ink px-3 py-2.5">
        <div class="label-caps">TEAM NAME</div>
        <div class="mt-0.5 text-lg font-semibold">{{ teamName() }}</div>
      </div>

      <div class="label-caps mt-1">ASSIGN TEAM STAFF</div>
      <p class="-mt-1.5 text-[13px] leading-snug">Team staff can add other staff, parents and players to this team.</p>
      <div class="card">
        @for (s of staffOptions(); track s.id) {
          @let selected = staff().includes(s.id);
          <button type="button" class="card-row py-[9px]" [attr.aria-pressed]="selected" (click)="toggleStaff(s.id)">
            <aura-check [checked]="selected" />
            <span class="min-w-0 flex-1">
              <span class="block text-[15px] font-semibold">{{ s.name }}</span>
              <span class="block text-xs">{{ s.sub }}</span>
            </span>
          </button>
        }
      </div>

      <div class="label-caps mt-1">OR INVITE NEW STAFF</div>
      <div class="grid grid-cols-2 gap-2">
        <input
          class="field-input"
          aria-label="New staff name"
          placeholder="Name"
          [value]="newName()"
          (input)="newName.set(value($event))"
        />
        <input
          class="field-input"
          aria-label="New staff email"
          type="email"
          placeholder="Email"
          [value]="newEmail()"
          (input)="newEmail.set(value($event))"
        />
      </div>

      @if (shownError()) {
        <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
      }
      <button type="button" class="btn-primary mt-1" [disabled]="saving()" (click)="submit()">
        {{ existingName() ? 'SAVE STAFF' : 'CREATE TEAM' }}
      </button>
    </aura-sheet>
  `,
})
export class TeamForm {
  /** Name of the team being edited; null creates a new team. */
  readonly existingName = input<string | null>(null);
  readonly staffOptions = input.required<StaffOptionVm[]>();
  readonly initialStaff = input<UserId[]>([]);
  readonly saving = input(false);
  readonly error = input('');

  readonly submitted = output<TeamFormValue>();
  readonly closed = output<void>();

  protected readonly ageOptions: Choice<string>[] = AGES.map((a) => ({ value: a, label: a }));
  protected readonly divisionOptions: Choice<Division>[] = [
    { value: 'Boys', label: 'BOYS' },
    { value: 'Girls', label: 'GIRLS' },
  ];

  protected readonly age = signal('U13');
  protected readonly division = signal<Division>('Girls');
  protected readonly staff = linkedSignal(() => [...this.initialStaff()]);
  protected readonly newName = signal('');
  protected readonly newEmail = signal('');
  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected readonly teamName = computed(() => this.existingName() ?? `${this.age()} ${this.division()}`);

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected toggleStaff(id: UserId): void {
    this.staff.update((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    this.validationError.set('');
  }

  protected submit(): void {
    const name = this.newName().trim();
    const email = this.newEmail().trim();
    const hasNew = !!(name || email);
    if (hasNew && (!name || !email.includes('@'))) {
      return this.validationError.set('Enter a name and valid email for the new staff member.');
    }
    if (!this.staff().length && !hasNew) return this.validationError.set('Assign at least one team staff member.');
    this.validationError.set('');
    this.submitted.emit({
      name: this.existingName() ? undefined : this.teamName(),
      staffIds: this.staff(),
      newStaff: hasNew ? { name, email } : undefined,
    });
  }
}

export interface MemberFormValue {
  name: string;
  email: string;
  /** Only when `showTitle`. */
  title?: string;
}

/** Edit a member's name, sign-in email and (club staff) title. */
@Component({
  selector: 'aura-member-form',
  imports: [Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aura-sheet [title]="heading()" (closed)="closed.emit()">
      <label class="field">
        NAME
        <input class="field-input" [value]="name()" (input)="name.set(value($event))" />
      </label>
      <label class="field">
        EMAIL
        <input class="field-input" type="email" [value]="email()" (input)="email.set(value($event))" />
      </label>
      <p class="-mt-1.5 text-[13px] leading-snug">This is also the username for signing in to the club.</p>
      @if (showTitle()) {
        <label class="field">
          TITLE
          <input
            class="field-input"
            [value]="title()"
            (input)="title.set(value($event))"
            placeholder="e.g. Club Director"
          />
        </label>
      }
      @if (shownError()) {
        <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
      }
      <button type="button" class="btn-primary mt-1" [disabled]="saving()" (click)="submit()">SAVE</button>
    </aura-sheet>
  `,
})
export class MemberForm {
  readonly heading = input('EDIT PROFILE');
  readonly member = input.required<MemberFormValue>();
  readonly showTitle = input(false);
  readonly saving = input(false);
  readonly error = input('');

  readonly submitted = output<MemberFormValue>();
  readonly closed = output<void>();

  protected readonly name = linkedSignal(() => this.member().name);
  protected readonly email = linkedSignal(() => this.member().email);
  protected readonly title = linkedSignal(() => this.member().title ?? '');
  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected submit(): void {
    const name = this.name().trim();
    const email = this.email().trim();
    if (!name) return this.validationError.set('Enter a name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return this.validationError.set('Enter a valid email.');
    this.validationError.set('');
    this.submitted.emit({ name, email, ...(this.showTitle() ? { title: this.title().trim() } : {}) });
  }
}

export interface ParentOptionVm {
  id: UserId;
  name: string;
  /** e.g. `Parent`, `Team Staff`. */
  sub: string;
}

export interface AddPlayerValue {
  name: string;
  jersey: string;
  parentIds: UserId[];
  /** Set when the player signs in themselves. */
  email?: string;
}

/**
 * Add a player to a team: managed by their parents (any members, including staff), and/or
 * signing in themselves with their own email.
 */
@Component({
  selector: 'aura-add-player-form',
  imports: [Sheet, Check],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aura-sheet title="ADD PLAYER" (closed)="closed.emit()">
      <p class="text-[13px] leading-snug">Adding to {{ teamName() }}.</p>
      <div class="grid grid-cols-[1fr_96px] gap-2">
        <label class="field">
          NAME
          <input
            class="field-input"
            [value]="name()"
            (input)="name.set(value($event))"
            placeholder="First and last name"
          />
        </label>
        <label class="field">
          JERSEY
          <input class="field-input" inputmode="numeric" [value]="jersey()" (input)="jersey.set(value($event))" />
        </label>
      </div>

      <div class="label-caps mt-1">PARENTS</div>
      <p class="-mt-1.5 text-[13px] leading-snug">
        They manage the player: RSVPs, profile and team chat. Invite a parent first if they are not listed.
      </p>
      <div class="card">
        @for (o of parentOptions(); track o.id) {
          @let selected = parents().includes(o.id);
          <button type="button" class="card-row py-[9px]" [attr.aria-pressed]="selected" (click)="toggleParent(o.id)">
            <aura-check [checked]="selected" />
            <span class="min-w-0 flex-1">
              <span class="block text-[15px] font-semibold">{{ o.name }}</span>
              <span class="block text-xs">{{ o.sub }}</span>
            </span>
          </button>
        } @empty {
          <div class="card-row text-sm">No parents or staff on this team yet.</div>
        }
      </div>

      <button
        type="button"
        class="card-row mt-1 rounded-md border-2 border-ink py-[9px]"
        [attr.aria-pressed]="ownLogin()"
        (click)="ownLogin.set(!ownLogin())"
      >
        <aura-check [checked]="ownLogin()" />
        <span class="min-w-0 flex-1">
          <span class="block text-[15px] font-semibold">Signs in themselves</span>
          <span class="block text-xs"
            >For older players with their own email. They get a sign-in to share with them.</span
          >
        </span>
      </button>
      @if (ownLogin()) {
        <label class="field">
          PLAYER’S EMAIL
          <input
            class="field-input"
            type="email"
            [value]="email()"
            (input)="email.set(value($event))"
            placeholder="name@email.com"
          />
        </label>
      }

      @if (shownError()) {
        <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
      }
      <button type="button" class="btn-primary mt-1" [disabled]="saving()" (click)="submit()">ADD PLAYER</button>
    </aura-sheet>
  `,
})
export class AddPlayerForm {
  readonly teamName = input.required<string>();
  readonly parentOptions = input.required<ParentOptionVm[]>();
  readonly saving = input(false);
  readonly error = input('');

  readonly submitted = output<AddPlayerValue>();
  readonly closed = output<void>();

  protected readonly name = signal('');
  protected readonly jersey = signal('');
  protected readonly parents = signal<UserId[]>([]);
  protected readonly ownLogin = signal(false);
  protected readonly email = signal('');
  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected toggleParent(id: UserId): void {
    this.parents.update((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    this.validationError.set('');
  }

  protected submit(): void {
    const name = this.name().trim();
    const email = this.email().trim();
    if (!name) return this.validationError.set('Enter the player’s name.');
    if (this.ownLogin() && !/^\S+@\S+\.\S+$/.test(email)) return this.validationError.set('Enter the player’s email.');
    if (!this.ownLogin() && !this.parents().length) {
      return this.validationError.set('Choose a parent, or let the player sign in themselves.');
    }
    this.validationError.set('');
    this.submitted.emit({
      name,
      jersey: this.jersey().trim(),
      parentIds: this.parents(),
      ...(this.ownLogin() ? { email } : {}),
    });
  }
}
