import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** App-wide transient message. Containers call `show()`; the root renders it with `<aura-toast>`. */
@Injectable({ providedIn: 'root' })
export class Toaster {
  private readonly current = signal<{ id: number; text: string } | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private seq = 0;

  readonly message = this.current.asReadonly();

  show(text: string, durationMs = 2800): void {
    clearTimeout(this.timer);
    this.current.set({ id: ++this.seq, text });
    this.timer = setTimeout(() => this.current.set(null), durationMs);
  }

  dismiss(): void {
    clearTimeout(this.timer);
    this.current.set(null);
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }
}
