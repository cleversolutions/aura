import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { ChatStore } from '@aura/chat/data-access';
import { ClubStore } from '@aura/club/data-access';
import { Avatar, Icon, IconName } from '@aura/shared/ui';
import { Viewport } from '@aura/shared/util';

interface Tab {
  path: string;
  label: string;
  icon: IconName;
}

/**
 * Page area plus main navigation: a four-tab bar along the bottom on compact screens,
 * a side nav on wide screens (icons only, with labels, club name and the signed-in user
 * from 1200px). Routes with `data.fullscreen` (e.g. a chat conversation) hide the tab bar.
 * While the platform admin previews a club, a pill offers the way back.
 */
@Component({
  selector: 'aura-tab-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-0 flex-col wide:flex-row' },
  template: `
    @if (viewport.wide()) {
      <nav
        aria-label="Main"
        class="flex w-[88px] shrink-0 flex-col gap-1.5 border-r-2 border-ink px-3 py-4 full:w-[232px]"
      >
        <div class="mb-3.5 flex h-12 items-center justify-center gap-2.5 px-1.5 full:justify-start">
          @if (club.club()?.logoUrl; as logo) {
            <img [src]="logo" [alt]="club.club()?.name ?? ''" class="size-10 shrink-0 object-contain" />
          }
          <span
            class="hidden truncate font-display text-[26px] leading-none font-bold tracking-[0.04em] uppercase full:block"
            >{{ club.club()?.name }}</span
          >
        </div>
        @for (tab of tabs; track tab.path) {
          <a
            [routerLink]="tab.path"
            routerLinkActive
            #rla="routerLinkActive"
            ariaCurrentWhenActive="page"
            class="relative flex min-h-[50px] flex-col items-center justify-center gap-[3px] rounded-lg px-1 py-2 no-underline full:flex-row full:justify-start full:gap-3 full:px-3.5 full:py-0"
            [class]="rla.isActive ? 'bg-ink text-paper' : 'bg-paper text-ink'"
          >
            <aura-icon [name]="tab.icon" [size]="22" />
            <span class="text-xs font-semibold full:text-base">{{ tab.label }}</span>
            @if (tab.path === 'chat' && chat.totalUnread()) {
              <span
                class="absolute top-1.5 right-2 h-5 min-w-5 rounded-full px-[5px] text-center text-xs leading-5 font-bold"
                [class]="rla.isActive ? 'bg-paper text-ink' : 'bg-ink text-paper'"
              >
                <span class="sr-only">Unread messages: </span>{{ chat.totalUnread() }}
              </span>
            }
          </a>
        }
        <div class="flex-1"></div>
        @if (club.me(); as me) {
          <div class="flex items-center justify-center gap-2.5 border-t-2 border-ink px-1 pt-3.5 full:justify-start">
            <aura-avatar [name]="me.name" />
            <div class="hidden min-w-0 full:block">
              <div class="truncate text-[15px] font-semibold">{{ me.name }}</div>
              <div class="text-xs leading-tight">{{ club.roleLine() }}</div>
            </div>
          </div>
        }
      </nav>
    }

    <div class="min-h-0 min-w-0 flex-1">
      <router-outlet />
    </div>

    @if (!viewport.wide() && !fullscreen()) {
      <nav aria-label="Main" class="grid shrink-0 grid-cols-4 border-t-2 border-ink pb-[env(safe-area-inset-bottom)]">
        @for (tab of tabs; track tab.path) {
          <a
            [routerLink]="tab.path"
            routerLinkActive
            #rla="routerLinkActive"
            ariaCurrentWhenActive="page"
            class="relative flex h-[60px] flex-col items-center justify-center gap-[3px] no-underline"
            [class]="rla.isActive ? 'bg-ink text-paper' : 'bg-paper text-ink'"
          >
            <aura-icon [name]="tab.icon" [size]="22" />
            <span class="text-xs font-semibold">{{ tab.label }}</span>
            @if (tab.path === 'chat' && chat.totalUnread()) {
              <span
                class="absolute top-1.5 left-1/2 ml-1.5 h-[18px] min-w-[18px] rounded-full px-1 text-center text-[11px] leading-[18px] font-bold"
                [class]="rla.isActive ? 'bg-paper text-ink' : 'bg-ink text-paper'"
              >
                <span class="sr-only">Unread messages: </span>{{ chat.totalUnread() }}
              </span>
            }
          </a>
        }
      </nav>
    }

    @if (club.preview()) {
      <div
        class="fixed bottom-[calc(74px+env(safe-area-inset-bottom))] left-1/2 z-[45] flex -translate-x-1/2 items-center gap-2.5 rounded-3xl border-2 border-paper bg-ink py-[5px] pr-[5px] pl-4 text-[13px] font-semibold whitespace-nowrap text-paper shadow-[0_0_0_2px_var(--color-ink)] wide:bottom-6"
        role="status"
      >
        Preview · sample data
        <button
          type="button"
          class="h-8 rounded-2xl bg-paper px-3.5 font-display text-[13px] font-bold tracking-[0.05em] text-ink"
          (click)="exitPreview()"
        >
          EXIT
        </button>
      </div>
    }
  `,
})
export class TabShell {
  protected readonly chat = inject(ChatStore);
  protected readonly club = inject(ClubStore);
  protected readonly viewport = inject(Viewport);
  private readonly router = inject(Router);

  /** Back to the club's page in the platform admin. */
  protected exitPreview(): void {
    const id = this.club.club()?.id;
    this.club.close();
    void this.router.navigate(id ? ['/admin/clubs', id] : ['/admin']);
  }

  protected readonly fullscreen = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => isFullscreen(this.router.routerState.snapshot.root)),
    ),
    { initialValue: isFullscreen(this.router.routerState.snapshot.root) },
  );
  protected readonly tabs: Tab[] = [
    // Relative to the club's link, e.g. /k3v9qp/schedule.
    { path: 'schedule', label: 'Schedule', icon: 'calendar' },
    { path: 'chat', label: 'Chat', icon: 'chat' },
    { path: 'roster', label: 'Roster', icon: 'roster' },
    { path: 'more', label: 'More', icon: 'menu' },
  ];
}

function isFullscreen(route: ActivatedRouteSnapshot): boolean {
  let r = route;
  while (r.firstChild) r = r.firstChild;
  return !!r.data['fullscreen'];
}
