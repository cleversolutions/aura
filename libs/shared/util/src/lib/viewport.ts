import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';

/** Matches `--breakpoint-wide` in shared/ui theme.css. */
export const WIDE_QUERY = '(min-width: 56.25rem)';

/**
 * Layout mode for structural changes CSS cannot make on its own, such as showing a
 * side pane instead of a sheet. Styling-only differences use the `wide:` variant.
 * Without `matchMedia` (tests, SSR) the layout is compact.
 */
@Injectable({ providedIn: 'root' })
export class Viewport {
  /** 900px and up: side nav, side-by-side panes, centred dialogs. */
  readonly wide: Signal<boolean>;

  constructor() {
    const mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(WIDE_QUERY) : null;
    const wide = signal(mql?.matches ?? false);
    if (mql) {
      const onChange = (e: MediaQueryListEvent) => wide.set(e.matches);
      mql.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => mql.removeEventListener('change', onChange));
    }
    this.wide = wide.asReadonly();
  }
}
