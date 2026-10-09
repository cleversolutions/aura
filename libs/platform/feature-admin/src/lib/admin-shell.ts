import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CanActivateFn, Router, RouterOutlet } from '@angular/router';
import { ClubStore } from '@aura/club/data-access';
import { PlatformStore } from '@aura/platform/data-access';
import { Avatar } from '@aura/shared/ui';

/** `/admin`: needs the platform admin to be signed in. */
export const platformAdminGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const admin = await inject(PlatformStore).checkSession();
  return admin ? true : router.createUrlTree(['/admin/sign-in']);
};

/**
 * Platform admin frame: Aura's own black-and-white look (no club is open), with the
 * page below. Leaving a club here also ends any app preview.
 */
@Component({
  selector: 'aura-admin-shell',
  imports: [RouterOutlet, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-0 flex-col' },
  template: `
    <header class="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b-2 border-ink px-5">
      <div class="flex items-baseline gap-2.5">
        <span class="font-display text-[28px] leading-none font-bold tracking-[0.06em]">AURA</span>
        <span class="text-[13px] font-semibold">Platform admin</span>
      </div>
      <div class="flex items-center gap-3">
        <button type="button" class="btn-link text-[13px]" (click)="signOut()">Sign out</button>
        <aura-avatar [name]="platform.admin()?.name ?? ''" [size]="38" />
      </div>
    </header>
    <main class="min-h-0 flex-1 overflow-y-auto"><router-outlet /></main>
  `,
})
export class AdminShell {
  protected readonly platform = inject(PlatformStore);
  private readonly router = inject(Router);

  constructor() {
    inject(ClubStore).close();
  }

  protected async signOut(): Promise<void> {
    await this.platform.signOut();
    void this.router.navigate(['/admin/sign-in']);
  }
}
