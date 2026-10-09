import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, output } from '@angular/core';
import { Icon } from './icon';

/**
 * Bottom sheet with a black title bar; a centred dialog on wide screens. Closes on
 * backdrop tap, the close button, or Escape. Project the body; it is laid out as a vertical stack.
 */
@Component({
  selector: 'aura-sheet',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div
      class="fixed inset-0 flex animate-fade-in items-end justify-center bg-scrim wide:items-center wide:p-8"
      [style.z-index]="layer()"
      (click)="closed.emit()"
    >
      <div
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
        tabindex="-1"
        class="max-h-[92dvh] w-full max-w-[480px] animate-sheet-up overflow-y-auto rounded-t-[20px] bg-paper pb-[env(safe-area-inset-bottom)] outline-none wide:max-h-[88dvh] wide:max-w-[560px] wide:animate-fade-in wide:rounded-xl wide:border-2 wide:border-ink wide:pb-0"
        (click)="$event.stopPropagation()"
      >
        <div class="sticky top-0 z-[1] flex h-[46px] items-center justify-between bg-ink pr-1.5 pl-4 text-paper">
          <h2 class="font-display text-[15px] font-bold tracking-[0.08em]">{{ title() }}</h2>
          <button
            type="button"
            aria-label="Close"
            class="flex size-11 items-center justify-center"
            (click)="closed.emit()"
          >
            <aura-icon name="close" [size]="20" />
          </button>
        </div>
        <div class="flex flex-col gap-3 px-4 pt-4 pb-7">
          <ng-content />
        </div>
      </div>
    </div>
  `,
})
export class Sheet {
  readonly title = input.required<string>();
  /** Stacking order; nested sheets should use a higher layer. */
  readonly layer = input(30);
  readonly closed = output<void>();

  constructor() {
    const host: ElementRef<HTMLElement> = inject(ElementRef);
    afterNextRender(() => host.nativeElement.querySelector<HTMLElement>('[role=dialog]')?.focus());
  }
}
