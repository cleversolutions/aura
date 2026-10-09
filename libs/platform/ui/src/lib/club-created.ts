import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface ClubCreatedVm {
  name: string;
  logoUrl: string;
  paper: string;
  url: string;
  adminName: string;
  adminEmail: string;
  temporaryPassword: string;
}

/** Confirmation after creating a club: the link and sign-in details to hand to its admin. */
@Component({
  selector: 'aura-club-created',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let c = vm();
    <div class="mx-auto flex max-w-[560px] flex-col gap-3.5 px-3.5 pt-3.5 pb-6 wide:p-6">
      <div
        class="flex h-[140px] items-center justify-center rounded-[10px] border-2 border-ink"
        [style.background]="c.paper"
      >
        <img [src]="c.logoUrl" alt="" class="max-h-24 max-w-[70%] object-contain" />
      </div>
      <div>
        <div class="font-display text-[13px] font-bold tracking-[0.08em]">CLUB CREATED</div>
        <h1 class="font-display text-[32px] leading-[1.05] font-bold uppercase">{{ c.name }}</h1>
      </div>
      <p class="text-[15px] leading-[1.45] text-pretty">
        Share this link with {{ c.adminName }}. They sign in with {{ c.adminEmail }} and the temporary password, then
        choose their own.
      </p>
      <div class="flex h-[50px] items-center overflow-hidden rounded-md border-2 border-ink">
        <span class="min-w-0 flex-1 truncate px-3 font-mono text-[15px] font-medium">{{ c.url }}</span>
        <button
          type="button"
          class="h-full bg-ink px-4 font-display text-[15px] font-bold tracking-[0.05em] text-paper"
          (click)="copied.emit(c.url)"
        >
          COPY LINK
        </button>
      </div>
      <div class="flex items-center justify-between gap-3 rounded-md border-2 border-dashed border-ink px-3 py-2.5">
        <span class="label-caps">TEMPORARY PASSWORD</span>
        <span class="font-mono text-[15px] font-medium">{{ c.temporaryPassword }}</span>
      </div>
      <button type="button" class="btn-outline h-[50px] text-[17px]" (click)="previewed.emit()">
        OPEN APP PREVIEW
      </button>
      <button type="button" class="btn-link h-10 self-center" (click)="back.emit()">Back to clubs</button>
    </div>
  `,
})
export class ClubCreated {
  readonly vm = input.required<ClubCreatedVm>();
  readonly copied = output<string>();
  readonly previewed = output<void>();
  readonly back = output<void>();
}
