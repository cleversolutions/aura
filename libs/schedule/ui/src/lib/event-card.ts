import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RsvpStatus } from '@aura/shared/models';
import { Icon, IconName } from '@aura/shared/ui';

export interface EventCardVm {
  id: string;
  icon: IconName;
  title: string;
  teamShort: string;
  when: string;
  location: string;
  upcoming: boolean;
  allGoing: boolean;
  allOut: boolean;
  /** Per-player status line, shown when RSVPing for more than one player. */
  statusLine: string | null;
  pastLeft: string;
  pastRight: string;
  /** Open in the side pane (wide screens); drawn with a ring. */
  selected?: boolean;
}

@Component({
  selector: 'aura-event-card',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let e = vm();
    <article class="card" [class]="e.selected ? 'shadow-[0_0_0_2px_var(--color-ink)]' : ''">
      <button type="button" class="flex w-full gap-3 p-3 text-left active:bg-pressed" (click)="opened.emit()">
        <span class="w-[38px] shrink-0 pt-0.5"><aura-icon [name]="e.icon" [size]="36" [strokeWidth]="1.8" /></span>
        <span class="min-w-0 flex-1">
          <span class="flex items-start justify-between gap-2">
            <span class="font-display text-[21px] leading-[1.1] font-bold text-pretty uppercase">{{ e.title }}</span>
            <span class="badge shrink-0">{{ e.teamShort }}</span>
          </span>
          <span class="mt-1 block text-sm leading-snug font-semibold">{{ e.when }}</span>
          <span class="block text-sm leading-snug">{{ e.location }}</span>
          @if (e.statusLine) {
            <span class="mt-1.5 block border-t border-ink pt-1.5 text-xs leading-tight font-semibold">{{
              e.statusLine
            }}</span>
          }
        </span>
      </button>
      @if (e.upcoming) {
        <div class="grid grid-cols-2 gap-2 px-3 pb-3">
          <button
            type="button"
            class="h-12 rounded-md border-2 border-ink font-display text-lg font-bold tracking-[0.04em] transition-transform active:scale-[0.97]"
            [class]="e.allGoing ? 'bg-ink text-paper' : 'bg-paper text-ink'"
            [attr.aria-pressed]="e.allGoing"
            (click)="rsvp.emit('going')"
          >
            ✓ GOING
          </button>
          <button
            type="button"
            class="h-12 rounded-md border-2 border-ink font-display text-lg font-bold tracking-[0.04em] transition-transform active:scale-[0.97]"
            [class]="e.allOut ? 'bg-ink text-paper' : 'bg-paper text-ink'"
            [attr.aria-pressed]="e.allOut"
            (click)="rsvp.emit('out')"
          >
            ✕ OUT
          </button>
        </div>
      } @else {
        <div class="flex items-center justify-between gap-2 border-t-2 border-ink bg-ink px-3 py-2.5 text-paper">
          <span class="font-display text-base font-bold tracking-[0.04em]">{{ e.pastLeft }}</span>
          <span class="text-[13px] font-semibold">{{ e.pastRight }}</span>
        </div>
      }
    </article>
  `,
})
export class EventCard {
  readonly vm = input.required<EventCardVm>();
  readonly opened = output<void>();
  readonly rsvp = output<RsvpStatus>();
}
