import { ChangeDetectionStrategy, Component, input, linkedSignal, output } from '@angular/core';

export interface ClubStaffOptionVm {
  id: string;
  name: string;
  /** e.g. `Registrar · reg@club.com`, or why they can't be the admin yet. */
  sub: string;
  /** Has joined and is not disabled. */
  eligible: boolean;
}

export interface ClubAdminPanelVm {
  adminName: string;
  adminEmail: string;
  /** The club's other staff, who could become the admin. */
  staff: ClubStaffOptionVm[];
  /** Shown once after a reset: the admin's new temporary password. */
  reset: { username: string; temporaryPassword: string } | null;
}

/** An action that asks first: resetting the admin's password, or making someone else admin. */
type Confirming = { action: 'reset' } | { action: 'admin'; id: string; name: string };

/**
 * An existing club's admin, for the platform admin: reset their forgotten password, or make another
 * of the club's staff the admin (club staff invite them from the club's roster first).
 */
@Component({
  selector: 'aura-club-admin-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let v = vm();
    <section class="flex max-w-[560px] flex-col gap-3" aria-labelledby="club-admin-heading">
      <h2 id="club-admin-heading" class="label-caps">ADMIN ACCOUNT</h2>
      <div class="rounded-md border-2 border-ink px-3 py-2.5">
        <div class="text-base font-semibold">{{ v.adminName }}</div>
        <div class="text-[13px] break-all">{{ v.adminEmail }}</div>
      </div>

      @if (v.reset; as r) {
        <p class="text-[15px] leading-[1.45] text-pretty">
          Send {{ v.adminName }} this temporary password. They sign in as {{ r.username }} with it, then choose their
          own. It is shown only now.
        </p>
        <div class="flex h-[50px] items-center overflow-hidden rounded-md border-2 border-dashed border-ink">
          <span class="min-w-0 flex-1 truncate px-3 font-mono text-[15px] font-medium">{{ r.temporaryPassword }}</span>
          <button
            type="button"
            class="h-full bg-ink px-4 font-display text-[15px] font-bold tracking-[0.05em] text-paper"
            aria-label="Copy temporary password"
            (click)="copied.emit(r.temporaryPassword)"
          >
            COPY
          </button>
        </div>
      }

      @if (error()) {
        <div class="error-box" role="alert">⚠ {{ error() }}</div>
      }

      @if (confirming(); as c) {
        <div class="flex flex-col gap-2 rounded-md border-2 border-dashed border-ink p-3" role="group">
          <p class="text-[15px] font-medium">
            @if (c.action === 'reset') {
              Give {{ v.adminName }} a new temporary password? Their current password stops working.
            } @else {
              Make {{ c.name }} the club admin? {{ v.adminName }} stays on the club staff.
            }
          </p>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="btn-outline h-11" (click)="confirming.set(null)">BACK</button>
            <button type="button" class="btn-primary h-11" [disabled]="saving()" (click)="confirm(c)">
              {{ c.action === 'reset' ? 'RESET' : 'MAKE ADMIN' }}
            </button>
          </div>
        </div>
      } @else {
        <button type="button" class="btn-outline h-11" (click)="confirming.set({ action: 'reset' })">
          RESET PASSWORD
        </button>
      }

      <h3 class="label-caps mt-1.5">CHANGE ADMIN</h3>
      @if (v.staff.length) {
        <div class="card" role="list">
          @for (s of v.staff; track s.id) {
            <div class="card-row" role="listitem">
              <span class="min-w-0 flex-1">
                <span class="block text-[15px] font-semibold">{{ s.name }}</span>
                <span class="block text-xs break-all">{{ s.sub }}</span>
              </span>
              @if (s.eligible) {
                <button
                  type="button"
                  class="btn-small shrink-0"
                  [attr.aria-label]="'Make ' + s.name + ' the club admin'"
                  (click)="confirming.set({ action: 'admin', id: s.id, name: s.name })"
                >
                  MAKE ADMIN
                </button>
              }
            </div>
          }
        </div>
      } @else {
        <p class="text-[13px] leading-snug">
          No other club staff yet. The admin invites them from the club’s roster (INVITE MEMBER → Club Staff).
        </p>
      }
    </section>
  `,
})
export class ClubAdminPanel {
  readonly vm = input.required<ClubAdminPanelVm>();
  readonly saving = input(false);
  readonly error = input('');

  readonly resetPassword = output<void>();
  /** The member id to make the club admin. */
  readonly adminChanged = output<string>();
  readonly copied = output<string>();

  /** Cleared whenever the details change (after a reset, or a new admin). */
  protected readonly confirming = linkedSignal<ClubAdminPanelVm, Confirming | null>({
    source: this.vm,
    computation: () => null,
  });

  protected confirm(c: Confirming): void {
    if (c.action === 'reset') this.resetPassword.emit();
    else this.adminChanged.emit(c.id);
  }
}
