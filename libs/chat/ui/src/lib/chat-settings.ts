import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Sheet, Switch } from '@aura/shared/ui';

export interface NotificationSettingVm {
  threadId: string;
  label: string;
  on: boolean;
}

/** Per-thread push notification switches. */
@Component({
  selector: 'aura-chat-settings',
  imports: [Sheet, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aura-sheet title="CHAT NOTIFICATIONS" (closed)="closed.emit()">
      <p class="text-sm leading-snug font-medium">Push notifications are sent only to members of each thread.</p>
      <div class="card">
        @for (s of settings(); track s.threadId) {
          <button
            type="button"
            role="switch"
            class="card-row justify-between p-3"
            [attr.aria-checked]="s.on"
            (click)="toggled.emit({ threadId: s.threadId, on: !s.on })"
          >
            <span class="text-[15px] font-semibold">{{ s.label }}</span>
            <aura-switch [on]="s.on" />
          </button>
        }
      </div>
      <button type="button" class="btn-primary mt-1" (click)="closed.emit()">DONE</button>
    </aura-sheet>
  `,
})
export class ChatSettings {
  readonly settings = input.required<NotificationSettingVm[]>();
  readonly toggled = output<{ threadId: string; on: boolean }>();
  readonly closed = output<void>();
}
