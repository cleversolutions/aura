import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ChatStore } from '@aura/chat/data-access';
import { ClubStore } from '@aura/club/data-access';
import { ScheduleStore } from '@aura/schedule/data-access';
import { Toast } from '@aura/shared/ui';
import { Toaster } from '@aura/shared/util';
import { applyBranding } from './branding';

@Component({
  selector: 'aura-root',
  imports: [RouterOutlet, Toast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'mx-auto flex h-dvh max-w-[480px] flex-col pt-[env(safe-area-inset-top)] sm:border-x-2 sm:border-ink wide:max-w-none wide:border-x-0',
  },
  template: `
    <div class="min-h-0 flex-1"><router-outlet /></div>
    <aura-toast [message]="toaster.message()?.text ?? null" (dismissed)="toaster.dismiss()" />
  `,
})
export class App {
  protected readonly club = inject(ClubStore);
  private readonly chat = inject(ChatStore);
  private readonly schedule = inject(ScheduleStore);
  protected readonly toaster = inject(Toaster);

  constructor() {
    const doc = inject(DOCUMENT);
    // The open club's colours, theme colour and installable app identity.
    effect(() => applyBranding(doc, this.club.club(), this.club.manifestUrl()));
    // Reload per-user data whenever the club or the signed-in user changes.
    effect(() => {
      if (!this.club.sessionKey()) return;
      untracked(() => {
        void this.chat.load();
        void this.schedule.load();
      });
    });
    // Surface messages that arrive in threads you are not looking at.
    effect(() => {
      const notice = this.chat.notice();
      if (!notice) return;
      untracked(() => {
        this.toaster.show(`${notice.senderName} in ${notice.threadName}: new message`);
        this.chat.dismissNotice();
      });
    });
  }
}
