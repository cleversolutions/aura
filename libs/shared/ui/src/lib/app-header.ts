import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Top bar for tab pages. Compact screens show the club logo centred with an optional
 * icon action on the right (project an element with `headerAction`). Wide screens show
 * the page title on the left and page actions on the right (project `pageActions`);
 * the club logo moves to the side nav. The title is not a heading: pages own their `h1`,
 * and the side nav marks the current page.
 */
@Component({
  selector: 'aura-app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block shrink-0' },
  template: `
    <header class="grid h-[54px] grid-cols-[54px_1fr_54px] items-center border-b-2 border-ink wide:hidden">
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
    <header class="hidden h-16 items-center justify-between gap-3 border-b-2 border-ink px-6 wide:flex">
      <div class="font-display text-[30px] leading-none font-bold tracking-[0.02em] uppercase">{{ title() }}</div>
      <div class="flex items-center gap-2"><ng-content select="[pageActions]" /></div>
    </header>
  `,
})
export class AppHeader {
  readonly clubName = input('');
  readonly logoUrl = input<string | null | undefined>(null);
  /** Page name shown in the wide header, e.g. `Schedule`. */
  readonly title = input('');
}
