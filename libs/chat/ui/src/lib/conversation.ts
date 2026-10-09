import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Avatar, Icon } from '@aura/shared/ui';

/** Title bar of a conversation: back link (compact screens only), thread name, members button. */
@Component({
  selector: 'aura-thread-header',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block shrink-0' },
  template: `
    <header class="grid h-[54px] grid-cols-[54px_1fr_54px] items-center border-b-2 border-ink">
      <a
        [routerLink]="backLink()"
        aria-label="Back"
        class="flex h-[54px] items-center justify-center text-ink wide:invisible"
      >
        <aura-icon name="back" />
      </a>
      <div class="min-w-0 text-center">
        <h1 class="truncate font-display text-xl leading-[1.1] font-bold uppercase">{{ name() }}</h1>
        <div class="text-xs font-medium">{{ memberLabel() }}</div>
      </div>
      <button
        type="button"
        aria-label="Thread members"
        class="flex h-[54px] items-center justify-center"
        (click)="manage.emit()"
      >
        <aura-icon name="person-circle" [size]="28" />
      </button>
    </header>
  `,
})
export class ThreadHeader {
  readonly name = input('');
  readonly memberLabel = input('');
  readonly backLink = input.required<string | string[]>();
  readonly manage = output<void>();
}

export interface MessageVm {
  id: string;
  text: string;
  time: string;
  mine: boolean;
  sender: string;
}

/** One chat message: dark bubble on the right for mine, outlined with avatar for others. */
@Component({
  selector: 'aura-message-bubble',
  imports: [Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @let m = message();
    @if (m.mine) {
      <div class="flex max-w-[76%] flex-col items-end gap-[3px] self-end">
        <div
          class="rounded-[14px_14px_4px_14px] bg-ink px-[13px] py-2.5 text-[15px] leading-[1.35] font-medium text-pretty text-paper"
        >
          {{ m.text }}
        </div>
        <div class="text-[11px] font-medium">{{ m.time }}</div>
      </div>
    } @else {
      <div class="flex max-w-[82%] items-end gap-2 self-start">
        <aura-avatar [name]="m.sender" [size]="30" />
        <div class="flex min-w-0 flex-col gap-[3px]">
          <div class="text-xs font-semibold">{{ m.sender }}</div>
          <div
            class="rounded-[14px_14px_14px_4px] border-2 border-ink bg-paper px-3 py-2 text-[15px] leading-[1.35] font-medium text-pretty"
          >
            {{ m.text }}
          </div>
          <div class="text-[11px] font-medium">{{ m.time }}</div>
        </div>
      </div>
    }
  `,
})
export class MessageBubble {
  readonly message = input.required<MessageVm>();
}

/** Message input and send button. Emits trimmed, non-empty text and clears itself. */
@Component({
  selector: 'aura-message-composer',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block shrink-0' },
  template: `
    <form
      class="flex gap-2 border-t-2 border-ink px-3 pt-2.5 pb-[max(8px,env(safe-area-inset-bottom))]"
      (submit)="submit($event)"
    >
      <input
        class="field-input flex-1"
        aria-label="Message"
        placeholder="Message"
        autocomplete="off"
        [value]="draft()"
        (input)="draft.set(value($event))"
      />
      <button
        type="submit"
        aria-label="Send"
        class="flex size-[46px] shrink-0 items-center justify-center rounded-md bg-ink text-paper transition-transform active:scale-[0.94]"
      >
        <aura-icon name="send" [size]="20" />
      </button>
    </form>
  `,
})
export class MessageComposer {
  readonly send = output<string>();
  protected readonly draft = signal('');

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected submit(e: Event): void {
    e.preventDefault();
    const text = this.draft().trim();
    if (!text) return;
    this.draft.set('');
    // Clear the field even if the typed value never reached the [value] binding.
    (e.target as HTMLFormElement).reset();
    this.send.emit(text);
  }
}
