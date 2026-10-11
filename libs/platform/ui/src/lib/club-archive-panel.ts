import { ChangeDetectionStrategy, Component, input, linkedSignal, output } from '@angular/core';

export interface ClubArchivePanelVm {
  name: string;
  /** e.g. `Oct 11, 2026`; null while the club is in use. */
  archivedOn: string | null;
}

/**
 * Archiving a club that has stopped using the app, for the platform admin: its members can still
 * sign in and read everything, but nothing can be changed until it is restored. Archiving asks first.
 */
@Component({
  selector: 'aura-club-archive-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let v = vm();
    <section class="flex max-w-[560px] flex-col gap-3" aria-labelledby="club-archive-heading">
      <h2 id="club-archive-heading" class="label-caps">ARCHIVE</h2>
      @if (v.archivedOn) {
        <p class="text-[15px] leading-[1.45] text-pretty">
          <strong>Archived {{ v.archivedOn }}.</strong> Its members can still sign in and read everything, but nothing
          can be changed. Restore it to use it again.
        </p>
      } @else {
        <p class="text-[15px] leading-[1.45] text-pretty">
          Archive a club that has stopped using the app. Its members can still sign in and read everything, but nothing
          can be changed until you restore it.
        </p>
      }

      @if (error()) {
        <div class="error-box" role="alert">⚠ {{ error() }}</div>
      }

      @if (v.archivedOn) {
        <button type="button" class="btn-outline h-11" [disabled]="saving()" (click)="archivedChange.emit(false)">
          RESTORE CLUB
        </button>
      } @else if (confirming()) {
        <div class="flex flex-col gap-2 rounded-md border-2 border-dashed border-ink p-3" role="group">
          <p class="text-[15px] font-medium">
            Archive {{ v.name }}? Nobody at the club can post, RSVP or change anything until you restore it.
          </p>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="btn-outline h-11" (click)="confirming.set(false)">BACK</button>
            <button type="button" class="btn-primary h-11" [disabled]="saving()" (click)="archivedChange.emit(true)">
              ARCHIVE
            </button>
          </div>
        </div>
      } @else {
        <button type="button" class="btn-outline h-11" (click)="confirming.set(true)">ARCHIVE CLUB</button>
      }
    </section>
  `,
})
export class ClubArchivePanel {
  readonly vm = input.required<ClubArchivePanelVm>();
  readonly saving = input(false);
  readonly error = input('');

  /** True to archive the club, false to restore it. */
  readonly archivedChange = output<boolean>();

  /** Cleared whenever the club changes (after archiving or restoring). */
  protected readonly confirming = linkedSignal<ClubArchivePanelVm, boolean>({
    source: this.vm,
    computation: () => false,
  });
}
