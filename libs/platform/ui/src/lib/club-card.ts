import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface ClubCardVm {
  id: string;
  name: string;
  url: string;
  logoUrl: string;
  ink: string;
  paper: string;
  /** e.g. `Sam Okoro · sam@spartans.example`. */
  admin: string;
  /** e.g. `Created Aug 12, 2026`. */
  created: string;
}

/** A club in the platform admin's list: logo on the club's colours, admin and link. */
@Component({
  selector: 'aura-club-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let c = vm();
    <article class="overflow-hidden rounded-[10px] border-2 border-ink bg-paper">
      <button
        type="button"
        class="flex h-[104px] w-full items-center justify-center border-b-2 border-ink"
        [style.background]="c.paper"
        [attr.aria-label]="'Edit ' + c.name"
        (click)="opened.emit()"
      >
        <img [src]="c.logoUrl" alt="" class="max-h-[72px] max-w-[70%] object-contain" />
      </button>
      <div class="flex flex-col gap-[7px] p-3">
        <div class="flex items-center justify-between gap-2">
          <button
            type="button"
            class="text-left font-display text-[22px] leading-[1.1] font-bold uppercase"
            (click)="opened.emit()"
          >
            {{ c.name }}
          </button>
          <span class="flex shrink-0 gap-1" aria-hidden="true">
            <span class="size-5 rounded border-[1.5px] border-ink" [style.background]="c.ink"></span>
            <span class="size-5 rounded border-[1.5px] border-ink" [style.background]="c.paper"></span>
          </span>
        </div>
        <div class="text-[13px]">Admin: {{ c.admin }}</div>
        <div class="flex h-9 items-center overflow-hidden rounded-md border-[1.5px] border-ink">
          <span class="min-w-0 flex-1 truncate px-2.5 font-mono text-[13px] font-medium">{{ c.url }}</span>
          <button
            type="button"
            class="h-full border-l-[1.5px] border-ink bg-paper px-3 font-display text-[13px] font-bold tracking-[0.05em]"
            (click)="copied.emit(c.url)"
          >
            COPY
          </button>
        </div>
        <div class="text-xs">{{ c.created }}</div>
      </div>
    </article>
  `,
})
export class ClubCard {
  readonly vm = input.required<ClubCardVm>();
  readonly opened = output<void>();
  readonly copied = output<string>();
}
