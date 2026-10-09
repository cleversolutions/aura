import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Transient message banner at the top of the screen. Tap to dismiss. */
@Component({
  selector: 'aura-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      aria-live="polite"
      class="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+54px)] z-40 flex justify-center px-4"
    >
      @if (message()) {
        <div
          role="status"
          class="pointer-events-auto w-full max-w-[448px] animate-fade-in rounded-xl border-2 border-paper bg-ink px-3.5 py-3 text-sm leading-snug font-semibold text-paper shadow-[0_0_0_2px_var(--color-ink)]"
          (click)="dismissed.emit()"
        >
          {{ message() }}
        </div>
      }
    </div>
  `,
})
export class Toast {
  readonly message = input<string | null>(null);
  readonly dismissed = output<void>();
}
