import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import {
  AnnouncementsPosting,
  ClubSettings,
  ContactsVisibility,
  PlayerProfile,
  TeamId,
  UserId,
  UserKind,
} from '@aura/shared/models';
import { Check, Chips, Choice, Segmented, Sheet } from '@aura/shared/ui';
import { TEAM_AGES, TEAM_DIVISIONS, suggestedTeamName } from '@aura/shared/util';

/** Who joins a team: everyone but club staff. */
export type InviteKind = Exclude<UserKind, 'club'>;

/** Someone invited to a team, or to the club staff (who belong to no team). */
export type InviteFormValue =
  | { kind: InviteKind; team: TeamId; name: string; email: string }
  | { kind: 'club'; title: string; name: string; email: string };

/** Someone already in the club, put on a team instead of being invited again. */
export interface ExistingMemberValue {
  team: TeamId;
  userId: UserId;
}

type InviteMode = 'new' | 'existing';

/**
 * Invite a parent, player or staff member to a team; club staff may also invite club staff. Someone
 * already in the club (a parent with a child on another team, a coach of two teams) is added to
 * the team instead.
 */
@Component({
  selector: 'aura-invite-form',
  imports: [Sheet, Chips, Segmented, Check],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aura-sheet title="INVITE MEMBER" (closed)="closed.emit()">
      @if (hasExisting()) {
        <aura-segmented aria-label="Who" [options]="modeOptions" [(value)]="mode" [height]="40" [fontSize]="15" />
      }
      @if (teamOptions().length > 1 && (kind() !== 'club' || mode() === 'existing')) {
        <div class="label-caps">TEAM</div>
        <aura-chips [options]="teamOptions()" [(value)]="team" />
      }
      @if (mode() === 'existing') {
        <div class="label-caps">ADD TO {{ teamName().toUpperCase() }}</div>
        <div class="card">
          @for (o of existingForTeam(); track o.id) {
            @let selected = existing() === o.id;
            <button type="button" class="card-row py-[9px]" [attr.aria-pressed]="selected" (click)="pick(o.id)">
              <aura-check [checked]="selected" />
              <span class="min-w-0 flex-1">
                <span class="block text-[15px] font-semibold">{{ o.name }}</span>
                <span class="block text-xs">{{ o.sub }}</span>
              </span>
            </button>
          } @empty {
            <div class="card-row text-sm">Everyone you can add is already on this team.</div>
          }
        </div>
        <p class="text-[13px] leading-snug">They keep their sign-in and join this team’s chat threads.</p>
        @if (shownError()) {
          <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
        }
        <button type="button" class="btn-primary mt-1" [disabled]="saving()" (click)="addExisting()">
          ADD TO TEAM
        </button>
      } @else {
        <div class="label-caps">INVITE AS</div>
        <aura-chips [options]="roleOptions()" [(value)]="kind" />
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
        @if (kind() === 'club') {
          <label class="field">
            TITLE
            <input
              class="field-input"
              [value]="title()"
              (input)="title.set(value($event))"
              placeholder="e.g. Registrar, Treasurer"
            />
          </label>
          <p class="text-[13px] leading-snug">
            Club staff manage every team, the roster and the club’s settings. They will automatically join
            {{ linkedCount() }} chat thread{{ linkedCount() === 1 ? '' : 's' }}, and can post in every team’s channels.
          </p>
        } @else {
          <p class="text-[13px] leading-snug">
            They will be added to {{ teamName() }} and automatically join {{ linkedCount() }} chat thread{{
              linkedCount() === 1 ? '' : 's'
            }}.
          </p>
        }
        @if (shownError()) {
          <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
        }
        <button type="button" class="btn-primary mt-1" [disabled]="saving()" (click)="submit()">SEND INVITE</button>
      }
    </aura-sheet>
  `,
})
export class InviteForm {
  readonly teamOptions = input.required<Choice<TeamId>[]>();
  readonly initialTeam = input.required<TeamId>();
  /** Who is being invited at first, e.g. `staff` when inviting a team's first coach. */
  readonly initialKind = input<UserKind>('parent');
  /** team → invite kind → number of chat threads they would join automatically (club-wide ones too). */
  readonly linkedThreadCounts = input<Record<TeamId, Record<InviteKind, number>>>({});
  /** Offer "Club Staff" (club staff only). */
  readonly canInviteClubStaff = input(false);
  /** Chat threads club staff join automatically (the club-wide ones). */
  readonly clubStaffThreadCount = input(0);
  /** team → people already in the club whom the viewer may add to it. */
  readonly existingByTeam = input<Record<TeamId, ParentOptionVm[]>>({});
  readonly saving = input(false);
  readonly error = input('');

  readonly submitted = output<InviteFormValue>();
  readonly addedExisting = output<ExistingMemberValue>();
  readonly closed = output<void>();

  protected readonly modeOptions: Choice<InviteMode>[] = [
    { value: 'new', label: 'NEW PERSON' },
    { value: 'existing', label: 'ALREADY IN CLUB' },
  ];
  protected readonly mode = signal<InviteMode>('new');
  protected readonly existing = signal<UserId | null>(null);
  protected readonly hasExisting = computed(() => Object.values(this.existingByTeam()).some((o) => o.length));
  protected readonly existingForTeam = computed(() => this.existingByTeam()[this.team()] ?? []);

  protected readonly roleOptions = computed<Choice<UserKind>[]>(() => [
    { value: 'parent', label: 'Parent' },
    { value: 'player', label: 'Player' },
    { value: 'staff', label: 'Team Staff' },
    ...(this.canInviteClubStaff() ? [{ value: 'club' as const, label: 'Club Staff' }] : []),
  ]);

  protected readonly team = linkedSignal(() => this.initialTeam());
  protected readonly kind = linkedSignal(() => this.initialKind());
  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly title = signal('');
  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected readonly teamName = computed(
    () => this.teamOptions().find((o) => o.value === this.team())?.label ?? this.team(),
  );
  protected readonly linkedCount = computed(() => {
    const kind = this.kind();
    return kind === 'club' ? this.clubStaffThreadCount() : (this.linkedThreadCounts()[this.team()]?.[kind] ?? 0);
  });

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected pick(id: UserId): void {
    this.existing.set(id);
    this.validationError.set('');
  }

  protected addExisting(): void {
    const userId = this.existing();
    if (!userId || !this.existingForTeam().some((o) => o.id === userId)) {
      return this.validationError.set('Choose who to add.');
    }
    this.validationError.set('');
    this.addedExisting.emit({ team: this.team(), userId });
  }

  protected submit(): void {
    const name = this.name().trim();
    const email = this.email().trim();
    if (!name) return this.validationError.set('Enter their name.');
    if (!email.includes('@')) return this.validationError.set('Enter a valid email.');
    this.validationError.set('');
    const kind = this.kind();
    this.submitted.emit(
      kind === 'club' ? { kind, title: this.title().trim(), name, email } : { kind, team: this.team(), name, email },
    );
  }
}

export interface PlayerProfileValue {
  name: string;
  jersey: string;
}

/** Edit a linked player's name and jersey. */
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
      @if (!player().userId) {
        <p class="-mt-1 text-[13px] leading-snug">
          Older players can RSVP and chat from their own sign-in. Ask the team staff to give them one; you keep access.
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
  readonly saving = input(false);
  readonly error = input('');

  readonly submitted = output<PlayerProfileValue>();
  readonly closed = output<void>();

  protected readonly name = linkedSignal(() => this.player().name);
  protected readonly jersey = linkedSignal(() => this.player().jersey);
  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected submit(): void {
    if (!this.name().trim()) return this.validationError.set('Enter a name.');
    this.validationError.set('');
    this.submitted.emit({ name: this.name().trim(), jersey: this.jersey().trim() });
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

export interface StaffOptionVm {
  id: UserId;
  name: string;
  /** e.g. `Currently: U12 Girls, U14 Boys`. */
  sub: string;
}

/** A team's details, as the team form edits them. */
export interface TeamDetails {
  name: string;
  age?: string;
  division?: string;
}

export interface TeamFormValue extends TeamDetails {
  /** May be empty: club staff manage a team until it has staff. */
  staffIds: UserId[];
  newStaff?: { name: string; email: string };
}

/**
 * Create a team, or (with `team`) rename it, change its age, division and staff, or delete it.
 * The age and division are optional and suggest the name until it is typed.
 */
@Component({
  selector: 'aura-team-form',
  imports: [Sheet, Chips, Segmented, Check],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aura-sheet [title]="team() ? 'MANAGE TEAM' : 'CREATE TEAM'" (closed)="closed.emit()">
      <div class="label-caps">AGE GROUP</div>
      <aura-chips [options]="ageOptions" [value]="age()" (valueChange)="pickAge($event)" />
      <div class="label-caps">DIVISION</div>
      <aura-segmented
        [options]="divisionOptions"
        [value]="division()"
        (valueChange)="pickDivision($event)"
        [height]="40"
        [fontSize]="15"
      />
      <label class="field">
        TEAM NAME
        <input class="field-input" placeholder="e.g. U11 Boys Red" [value]="name()" (input)="typeName(value($event))" />
      </label>

      <div class="label-caps mt-1">ASSIGN TEAM STAFF</div>
      <p class="-mt-1.5 text-[13px] leading-snug">
        Team staff can add other staff, parents and players to this team. Optional: club staff manage a team until it
        has staff.
      </p>
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
        } @empty {
          <div class="card-row text-sm">No team staff in the club yet. Invite one below.</div>
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
      @if (confirmingDelete()) {
        <div class="flex flex-col gap-2 rounded-md border-2 border-dashed border-ink p-3" role="group">
          <p class="text-[15px] font-medium">
            Delete {{ team()?.name }} and its chat threads? Only a team with no players and no events can be deleted.
          </p>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="btn-outline h-11" (click)="confirmingDelete.set(false)">BACK</button>
            <button type="button" class="btn-primary h-11" [disabled]="saving()" (click)="deleted.emit()">
              DELETE
            </button>
          </div>
        </div>
      } @else {
        <button type="button" class="btn-primary mt-1" [disabled]="saving()" (click)="submit()">
          {{ team() ? 'SAVE TEAM' : 'CREATE TEAM' }}
        </button>
        @if (canDelete()) {
          <button type="button" class="btn-outline h-11" (click)="confirmingDelete.set(true)">DELETE TEAM</button>
        }
      }
    </aura-sheet>
  `,
})
export class TeamForm {
  /** The team being edited; null creates a new team. */
  readonly team = input<TeamDetails | null>(null);
  readonly staffOptions = input.required<StaffOptionVm[]>();
  readonly initialStaff = input<UserId[]>([]);
  /** Offer DELETE TEAM (club staff, editing a team of this season). */
  readonly canDelete = input(false);
  readonly saving = input(false);
  readonly error = input('');

  readonly submitted = output<TeamFormValue>();
  readonly deleted = output<void>();
  readonly closed = output<void>();

  protected readonly ageOptions: Choice<string>[] = [
    { value: '', label: 'NONE' },
    ...TEAM_AGES.map((a) => ({ value: a, label: a.toUpperCase() })),
  ];
  protected readonly divisionOptions: Choice<string>[] = [
    { value: '', label: 'NONE' },
    ...TEAM_DIVISIONS.map((d) => ({ value: d, label: d.toUpperCase() })),
  ];

  protected readonly age = linkedSignal(() => this.team()?.age ?? '');
  protected readonly division = linkedSignal(() => this.team()?.division ?? '');
  protected readonly name = linkedSignal(() => this.team()?.name ?? '');
  /** The name was typed (or the team already has one): age and division no longer change it. */
  private readonly nameTyped = linkedSignal(() => !!this.team());
  protected readonly staff = linkedSignal(() => [...this.initialStaff()]);
  protected readonly newName = signal('');
  protected readonly newEmail = signal('');
  protected readonly confirmingDelete = signal(false);
  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected pickAge(age: string): void {
    this.age.set(age);
    this.suggestName();
  }

  protected pickDivision(division: string): void {
    this.division.set(division);
    this.suggestName();
  }

  protected typeName(name: string): void {
    this.name.set(name);
    this.nameTyped.set(!!name.trim());
  }

  private suggestName(): void {
    if (!this.nameTyped()) this.name.set(suggestedTeamName(this.age(), this.division()));
  }

  protected toggleStaff(id: UserId): void {
    this.staff.update((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    this.validationError.set('');
  }

  protected submit(): void {
    const teamName = this.name().trim();
    if (!teamName) return this.validationError.set('Name the team, or pick its age and division.');
    const name = this.newName().trim();
    const email = this.newEmail().trim();
    const hasNew = !!(name || email);
    if (hasNew && (!name || !email.includes('@'))) {
      return this.validationError.set('Enter a name and valid email for the new staff member.');
    }
    this.validationError.set('');
    this.submitted.emit({
      name: teamName,
      ...(this.age() ? { age: this.age() } : {}),
      ...(this.division() ? { division: this.division() } : {}),
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
  /** A parent who isn't in the club yet, to invite first. */
  newParent?: { name: string; email: string };
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
      <p class="-mt-1.5 text-[13px] leading-snug">They manage the player: RSVPs, profile and team chat.</p>
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
      @if (invitingParent()) {
        <div class="label-caps mt-1">INVITE A PARENT</div>
        <div class="grid grid-cols-2 gap-2">
          <input
            class="field-input"
            aria-label="Parent’s name"
            placeholder="Name"
            [value]="parentName()"
            (input)="parentName.set(value($event))"
          />
          <input
            class="field-input"
            aria-label="Parent’s email"
            type="email"
            placeholder="Email"
            [value]="parentEmail()"
            (input)="parentEmail.set(value($event))"
          />
        </div>
        <p class="-mt-1 text-[13px] leading-snug">They’re invited to the team and get a sign-in to share with them.</p>
      } @else {
        <button type="button" class="btn-link h-10 self-start" (click)="invitingParent.set(true)">
          + Invite a parent who isn’t listed
        </button>
      }

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
  protected readonly invitingParent = signal(false);
  protected readonly parentName = signal('');
  protected readonly parentEmail = signal('');
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
    const parentName = this.parentName().trim();
    const parentEmail = this.parentEmail().trim();
    const newParent = this.invitingParent() && (parentName || parentEmail);
    if (!name) return this.validationError.set('Enter the player’s name.');
    if (newParent && (!parentName || !/^\S+@\S+\.\S+$/.test(parentEmail))) {
      return this.validationError.set('Enter a name and valid email for the new parent.');
    }
    if (this.ownLogin() && !/^\S+@\S+\.\S+$/.test(email)) return this.validationError.set('Enter the player’s email.');
    if (!this.ownLogin() && !this.parents().length && !newParent) {
      return this.validationError.set('Choose a parent, or let the player sign in themselves.');
    }
    this.validationError.set('');
    this.submitted.emit({
      name,
      jersey: this.jersey().trim(),
      parentIds: this.parents(),
      ...(newParent ? { newParent: { name: parentName, email: parentEmail } } : {}),
      ...(this.ownLogin() ? { email } : {}),
    });
  }
}

/** Club-wide choices for club staff: who posts in announcement channels, and who sees contact details. */
@Component({
  selector: 'aura-club-settings-form',
  imports: [Sheet, Segmented],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aura-sheet title="CLUB SETTINGS" (closed)="closed.emit()">
      <div class="label-caps" id="announcements-label">WHO POSTS ANNOUNCEMENTS</div>
      <aura-segmented
        aria-labelledby="announcements-label"
        [options]="announcementOptions"
        [(value)]="announcements"
        [fontSize]="16"
      />
      <p class="text-[13px] leading-snug">
        @if (announcements() === 'staff') {
          Club staff post in #club-announcements, and club staff and each team’s staff in that team’s #announcements.
          Everyone else reads them.
        } @else {
          Everyone in an announcement channel can post in it, like in #general.
        }
      </p>
      <div class="label-caps mt-2" id="contacts-label">WHO SEES CONTACT DETAILS</div>
      <aura-segmented
        aria-labelledby="contacts-label"
        [options]="contactOptions"
        [(value)]="contacts"
        [fontSize]="16"
      />
      <p class="text-[13px] leading-snug">
        @if (contacts() === 'staff') {
          Club staff see everyone’s email; team staff see their teams’ families. Parents and players see their coaches’
          and the club staff’s, and only names for other families. Only staff see who is invited.
        } @else {
          Everyone in the club sees everyone’s email, and who is invited.
        }
      </p>
      @if (error()) {
        <div class="error-box" role="alert">⚠ {{ error() }}</div>
      }
      <button type="button" class="btn-primary mt-1" [disabled]="saving()" (click)="submit()">SAVE</button>
    </aura-sheet>
  `,
})
export class ClubSettingsForm {
  readonly settings = input.required<ClubSettings>();
  readonly saving = input(false);
  readonly error = input('');

  readonly submitted = output<ClubSettings>();
  readonly closed = output<void>();

  protected readonly announcementOptions: Choice<AnnouncementsPosting>[] = [
    { value: 'staff', label: 'STAFF ONLY' },
    { value: 'everyone', label: 'EVERYONE' },
  ];
  protected readonly announcements = linkedSignal(() => this.settings().announcements);
  protected readonly contactOptions: Choice<ContactsVisibility>[] = [
    { value: 'staff', label: 'STAFF' },
    { value: 'everyone', label: 'EVERYONE' },
  ];
  protected readonly contacts = linkedSignal(() => this.settings().contacts);

  protected submit(): void {
    this.submitted.emit({ ...this.settings(), announcements: this.announcements(), contacts: this.contacts() });
  }
}
