import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Sheet } from '@aura/shared/ui';

export interface MemberInvitedVm {
  name: string;
  clubName: string;
  /** The club's link, where they sign in. */
  url: string;
  username: string;
  temporaryPassword: string;
}

/** Something copied to the clipboard, with a label for the confirmation toast. */
export interface CopiedValue {
  label: string;
  value: string;
}

/**
 * After inviting someone: the sign-in details for staff to send them. There is no invite email
 * yet, so staff share these by hand; the member chooses their own password on first sign-in.
 */
@Component({
  selector: 'aura-member-invited',
  imports: [Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let v = vm();
    <aura-sheet title="INVITE READY" (closed)="closed.emit()">
      <p class="text-[15px] leading-[1.45] text-pretty">
        Send {{ v.name }} these details. They sign in at the club link with the temporary password, then choose their
        own. It is shown only now.
      </p>
      @for (row of rows(); track row.label) {
        <div>
          <div class="label-caps mb-1">{{ row.label }}</div>
          <div
            class="flex h-[50px] items-center overflow-hidden rounded-md border-2 border-ink"
            [class.border-dashed]="row.secret"
          >
            <span class="min-w-0 flex-1 truncate px-3 font-mono text-[15px] font-medium">{{ row.value }}</span>
            <button
              type="button"
              class="h-full bg-ink px-4 font-display text-[15px] font-bold tracking-[0.05em] text-paper"
              [attr.aria-label]="'Copy ' + row.label.toLowerCase()"
              (click)="copied.emit({ label: row.name, value: row.value })"
            >
              COPY
            </button>
          </div>
        </div>
      }
      <button
        type="button"
        class="btn-primary mt-1"
        (click)="copied.emit({ label: 'Invite message', value: message() })"
      >
        COPY INVITE MESSAGE
      </button>
      <button type="button" class="btn-link h-10 self-center" (click)="closed.emit()">Done</button>
    </aura-sheet>
  `,
})
export class MemberInvited {
  readonly vm = input.required<MemberInvitedVm>();
  readonly copied = output<CopiedValue>();
  readonly closed = output<void>();

  protected readonly rows = computed(() => {
    const v = this.vm();
    return [
      { label: 'CLUB LINK', name: 'Link', value: v.url, secret: false },
      { label: 'USERNAME', name: 'Username', value: v.username, secret: false },
      { label: 'TEMPORARY PASSWORD', name: 'Password', value: v.temporaryPassword, secret: true },
    ];
  });

  /** Everything in one message, ready to paste into a text or email. */
  protected readonly message = computed(() => {
    const v = this.vm();
    return (
      `You're invited to ${v.clubName} on Aura. Open ${v.url} and sign in as ${v.username} ` +
      `with the temporary password ${v.temporaryPassword}, then choose your own password.`
    );
  });
}
