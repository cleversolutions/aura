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
import { Icon, IconName } from '@aura/shared/ui';

interface Tab {
  path: string;
  label: string;
  icon: IconName;
}

/**
 * Page area with the four-tab bar along the bottom. Routes with `data.fullscreen`
 * (e.g. a chat conversation) hide the tab bar.
 */
@Component({
  selector: 'aura-tab-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-0 flex-col' },
  template: `
    <div class="min-h-0 flex-1">
      <router-outlet />
    </div>
    @if (!fullscreen()) {
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
            @if (tab.path === '/chat' && chat.totalUnread()) {
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
  `,
})
export class TabShell {
  protected readonly chat = inject(ChatStore);
  private readonly router = inject(Router);

  protected readonly fullscreen = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => isFullscreen(this.router.routerState.snapshot.root)),
    ),
    { initialValue: isFullscreen(this.router.routerState.snapshot.root) },
  );
  protected readonly tabs: Tab[] = [
    { path: '/schedule', label: 'Schedule', icon: 'calendar' },
    { path: '/chat', label: 'Chat', icon: 'chat' },
    { path: '/roster', label: 'Roster', icon: 'roster' },
    { path: '/more', label: 'More', icon: 'menu' },
  ];
}

function isFullscreen(route: ActivatedRouteSnapshot): boolean {
  let r = route;
  while (r.firstChild) r = r.firstChild;
  return !!r.data['fullscreen'];
}
