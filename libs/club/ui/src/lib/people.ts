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

/** Team staff member in a roster list. */
@Component({
  selector: 'aura-staff-row',
  imports: [Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'listitem', class: 'card-row' },
  template: `
    <aura-avatar [name]="vm().name" look="solid" />
    <div>
      <div class="text-base font-semibold">{{ vm().name }}</div>
      <div class="text-[13px]">{{ vm().sub }}</div>
    </div>
  `,
})
export class StaffRow {
  readonly vm = input.required<PersonRowVm>();
}

/** Player in a roster list, with their jersey number. */
@Component({
  selector: 'aura-player-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'listitem', class: 'card-row' },
  template: `
    <span
      class="flex size-10 shrink-0 items-center justify-center rounded-md border-2 border-ink font-display text-[19px] font-bold"
      [class]="vm().mine ? 'bg-ink text-paper' : 'bg-paper text-ink'"
      >{{ vm().jersey }}</span
    >
    <div class="min-w-0 flex-1">
      <div class="text-base font-semibold">{{ vm().name }}</div>
      <div class="text-[13px]">{{ vm().sub }}</div>
    </div>
  `,
})
export class PlayerRow {
  readonly vm = input.required<PlayerRowVm>();
}

/** Someone invited to a team who has not joined yet. */
@Component({
  selector: 'aura-invited-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'listitem', class: 'block border-b border-dashed border-ink px-3 py-2.5 last:border-b-0' },
  template: `
    <div class="text-[15px] font-semibold">{{ vm().name }}</div>
    <div class="text-[13px]">{{ vm().sub }}</div>
  `,
})
export class InvitedRow {
  readonly vm = input.required<PersonRowVm>();
}

export interface ProfileVm {
  name: string;
  info: string;
  email: string;
}

/** Signed-in user's name, role line and email. */
@Component({
  selector: 'aura-profile-header',
  imports: [Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-center gap-4 border-b-2 border-ink px-[18px] py-[22px]' },
  template: `
    <aura-avatar [name]="vm().name" [size]="66" class="[&>span]:border-[2.5px]" />
    <div>
      <h1 class="font-display text-2xl leading-[1.1] font-bold uppercase">{{ vm().name }}</h1>
      <div class="mt-[3px] text-sm font-medium">{{ vm().info }}</div>
      <div class="text-[13px]">{{ vm().email }}</div>
    </div>
  `,
})
export class ProfileHeader {
  readonly vm = input.required<ProfileVm>();
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
