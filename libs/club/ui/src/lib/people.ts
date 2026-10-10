import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Avatar, Icon } from '@aura/shared/ui';

export interface PersonRowVm {
  id: string;
  name: string;
  sub: string;
}

export interface PlayerRowVm extends PersonRowVm {
  jersey: string;
  /** The signed-in user's own player; drawn inverted. */
  mine: boolean;
}

/** Team staff member in a roster list. Opens their details. */
@Component({
  selector: 'aura-staff-row',
  imports: [Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'listitem', class: 'card-row p-0' },
  template: `
    <button type="button" class="flex w-full items-center gap-3 px-3 py-2.5 text-left" (click)="opened.emit()">
      <aura-avatar [name]="vm().name" look="solid" />
      <span class="min-w-0 flex-1">
        <span class="block text-base font-semibold">{{ vm().name }}</span>
        <span class="block text-[13px]">{{ vm().sub }}</span>
      </span>
    </button>
  `,
})
export class StaffRow {
  readonly vm = input.required<PersonRowVm>();
  readonly opened = output<void>();
}

/** Player in a roster list, with their jersey number. Opens their details. */
@Component({
  selector: 'aura-player-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'listitem', class: 'card-row p-0' },
  template: `
    <button type="button" class="flex w-full items-center gap-3 px-3 py-2.5 text-left" (click)="opened.emit()">
      <span
        class="flex size-10 shrink-0 items-center justify-center rounded-md border-2 border-ink font-display text-[19px] font-bold"
        [class]="vm().mine ? 'bg-ink text-paper' : 'bg-paper text-ink'"
        >{{ vm().jersey }}</span
      >
      <span class="min-w-0 flex-1">
        <span class="block text-base font-semibold">{{ vm().name }}</span>
        <span class="block text-[13px]">{{ vm().sub }}</span>
      </span>
    </button>
  `,
})
export class PlayerRow {
  readonly vm = input.required<PlayerRowVm>();
  readonly opened = output<void>();
}

/** Someone invited to a team who has not joined yet. Opens their details and invite actions. */
@Component({
  selector: 'aura-invited-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'listitem', class: 'block border-b border-dashed border-ink last:border-b-0' },
  template: `
    <button type="button" class="block w-full px-3 py-2.5 text-left" (click)="opened.emit()">
      <span class="block text-[15px] font-semibold">{{ vm().name }}</span>
      <span class="block text-[13px]">{{ vm().sub }}</span>
    </button>
  `,
})
export class InvitedRow {
  readonly vm = input.required<PersonRowVm>();
  readonly opened = output<void>();
}

export interface ProfileVm {
  name: string;
  info: string;
  email: string;
}

/** Signed-in user's name, role line and email, with an edit button. */
@Component({
  selector: 'aura-profile-header',
  imports: [Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-center gap-4 border-b-2 border-ink px-[18px] py-[22px]' },
  template: `
    <aura-avatar [name]="vm().name" [size]="66" class="[&>span]:border-[2.5px]" />
    <div class="min-w-0 flex-1">
      <h1 class="font-display text-2xl leading-[1.1] font-bold uppercase">{{ vm().name }}</h1>
      <div class="mt-[3px] text-sm font-medium">{{ vm().info }}</div>
      <div class="text-[13px]">{{ vm().email }}</div>
    </div>
    @if (editable()) {
      <button type="button" class="btn-small" (click)="edited.emit()">EDIT PROFILE</button>
    }
  `,
})
export class ProfileHeader {
  readonly vm = input.required<ProfileVm>();
  readonly editable = input(false);
  readonly edited = output<void>();
}

export interface PlayerAccessVm {
  id: string;
  name: string;
  jersey: string;
  teamName: string;
  /** e.g. `Managed by you`, `Pending team staff approval`. */
  access: string;
}

/** A player the user can act for. */
@Component({
  selector: 'aura-player-access-tile',
  imports: [Avatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="tile w-full" (click)="opened.emit()">
      <aura-avatar [name]="vm().name" [size]="46" />
      <span class="min-w-0 flex-1">
        <span class="block font-display text-lg leading-[1.15] font-bold uppercase">{{ vm().name }}</span>
        <span class="block text-[13px] font-medium">Jersey #{{ vm().jersey }} · {{ vm().teamName }}</span>
        <span class="block text-xs">{{ vm().access }}</span>
      </span>
      <aura-icon name="chevron-right" [size]="20" />
    </button>
  `,
})
export class PlayerAccessTile {
  readonly vm = input.required<PlayerAccessVm>();
  readonly opened = output<void>();
}

export interface TeamCardVm {
  id: string;
  name: string;
  /** e.g. `9 players · 11 members`. */
  counts: string;
  staff: string;
}

/** Team summary card on the More tab. */
@Component({
  selector: 'aura-team-card',
  imports: [Avatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="tile w-full" (click)="opened.emit()">
      <aura-avatar [label]="vm().id" look="square-solid" [size]="46" />
      <span class="min-w-0 flex-1">
        <span class="block font-display text-lg leading-[1.15] font-bold uppercase">{{ vm().name }}</span>
        <span class="block text-[13px] font-medium">{{ vm().counts }}</span>
        <span class="block truncate text-xs">{{ vm().staff }}</span>
      </span>
      <aura-icon name="chevron-right" [size]="20" />
    </button>
  `,
})
export class TeamCard {
  readonly vm = input.required<TeamCardVm>();
  readonly opened = output<void>();
}
