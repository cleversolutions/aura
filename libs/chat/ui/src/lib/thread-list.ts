import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface ThreadListItemVm {
  id: string;
  /** Router link to the conversation. */
  link: string[];
  name: string;
  /** Team code or `CLUB`. */
  badge: string;
  time: string;
  snippet: string;
  unread: number;
  muted: boolean;
}

export interface ManagedThreadVm {
  id: string;
  link: string[];
  name: string;
  badge: string;
  /** e.g. `4 members · created by Jordan Smith`. */
  meta: string;
}

/** A thread in the chat list, linking to the conversation. */
@Component({
  selector: 'aura-thread-list-item',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'listitem', class: 'block' },
  template: `
    @let t = vm();
    <a
      [routerLink]="t.link"
      routerLinkActive="wide:bg-pressed"
      ariaCurrentWhenActive="page"
      class="flex w-full items-center gap-2.5 border-b-[1.5px] border-ink px-3.5 py-[13px] text-ink no-underline active:bg-pressed"
    >
      <span class="min-w-0 flex-1">
        <span class="flex items-center justify-between gap-2">
          <span class="flex min-w-0 items-center gap-[7px]">
            <span class="badge shrink-0 px-1 py-[3px] text-[11px]">{{ t.badge }}</span>
            <span class="truncate text-[17px]" [class]="t.unread ? 'font-bold' : 'font-medium'">{{ t.name }}</span>
          </span>
          <span class="shrink-0 text-xs font-medium">{{ t.time }}</span>
        </span>
        <span class="mt-[3px] flex items-center justify-between gap-2.5">
          <span class="truncate text-sm">{{ t.snippet }}</span>
          @if (t.unread) {
            <span
              class="h-[22px] min-w-[22px] shrink-0 rounded-full bg-ink px-1.5 text-center text-xs leading-[22px] font-bold text-paper"
            >
              <span class="sr-only">Unread: </span>{{ t.unread }}
            </span>
          }
          @if (t.muted) {
            <span class="shrink-0 rounded-[3px] border-[1.5px] border-ink px-1 py-px text-[11px] font-semibold"
              >MUTED</span
            >
          }
        </span>
      </span>
    </a>
  `,
})
export class ThreadListItem {
  readonly vm = input.required<ThreadListItemVm>();
}

/** A thread the user oversees but is not a member of. */
@Component({
  selector: 'aura-managed-thread-item',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'listitem', class: 'block' },
  template: `
    @let t = vm();
    <a
      [routerLink]="t.link"
      routerLinkActive="wide:bg-pressed"
      ariaCurrentWhenActive="page"
      class="flex w-full items-center gap-2.5 border-b-[1.5px] border-ink px-3.5 py-3 text-ink no-underline active:bg-pressed"
    >
      <span class="badge shrink-0 px-1 py-[3px] text-[11px]">{{ t.badge }}</span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-base font-medium">{{ t.name }}</span>
        <span class="block text-[13px]">{{ t.meta }}</span>
      </span>
    </a>
  `,
})
export class ManagedThreadItem {
  readonly vm = input.required<ManagedThreadVm>();
}
