import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Top bar for tab pages: club logo centred, optional action on the right
 * (project an element with the `headerAction` attribute).
 */
@Component({
  selector: 'aura-app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block shrink-0' },
  template: `
    <header class="grid h-[54px] grid-cols-[54px_1fr_54px] items-center border-b-2 border-ink">
      <div></div>
      <div class="flex justify-center">
        @if (logoUrl()) {
          <img [src]="logoUrl()" [alt]="clubName()" class="size-[38px] object-contain" />
        } @else {
          <span class="font-display text-xl font-bold tracking-[0.05em] uppercase">{{ clubName() }}</span>
        }
      </div>
      <div class="flex justify-center"><ng-content select="[headerAction]" /></div>
    </header>
  `,
})
export class AppHeader {
  readonly clubName = input('');
  readonly logoUrl = input<string | null | undefined>(null);
}
