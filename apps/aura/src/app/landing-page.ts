import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClubStore } from '@aura/club/data-access';

/** Shown at `/` when this browser has not opened a club yet, or after an unknown club link. */
@Component({
  selector: 'aura-landing-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-full items-center justify-center px-6 py-10' },
  template: `
    <div class="flex w-full max-w-[400px] flex-col gap-3 text-center">
      <div class="font-display text-[40px] leading-none font-bold tracking-[0.06em]">AURA</div>
      @if (missing()) {
        <p class="error-box text-left" role="alert">
          ⚠ There is no club at /{{ missing() }}. Check the link you were sent.
        </p>
      }
      <p class="text-[15px] leading-snug font-medium text-pretty">
        Open the link your club sent you to sign in. Each club has its own link and installs as its own app.
      </p>
      @if (demoClubs.length) {
        <div class="mt-2 label-caps">DEMO CLUBS</div>
        @for (c of demoClubs; track c.slug) {
          <a
            [routerLink]="['/', c.slug]"
            class="tile justify-center font-display text-lg font-bold uppercase no-underline"
          >
            {{ c.name }}
          </a>
        }
      }
      <a routerLink="/admin" class="btn-link mt-3 self-center">Platform admin</a>
    </div>
  `,
})
export class LandingPage {
  /** Slug of an unknown club link (`?missing=`). */
  readonly missing = input<string>();
  protected readonly demoClubs = inject(ClubStore).demoClubs();
}
