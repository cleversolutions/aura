import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { ChatStore } from '@aura/chat/data-access';
import {
  ChatSettings,
  ManagedThreadItem,
  ManagedThreadVm,
  NotificationSettingVm,
  ThreadForm,
  ThreadFormValue,
  ThreadListItem,
  ThreadListItemVm,
} from '@aura/chat/ui';
import { ClubStore } from '@aura/club/data-access';
import { Thread, ThreadScope } from '@aura/shared/models';
import { AppHeader, Choice, Icon } from '@aura/shared/ui';
import { CLOCK, Submission, Toaster, Viewport, firstName, formatMessageTime } from '@aura/shared/util';

const badge = (t: Thread) => (t.scope === 'club' ? 'CLUB' : t.scope);

/**
 * Chat tab container: thread list, new-thread and notification sheets. The open
 * conversation (child route) replaces the list on compact screens and sits beside it on wide ones.
 */
@Component({
  selector: 'aura-chat-list-page',
  imports: [RouterOutlet, AppHeader, Icon, ThreadListItem, ManagedThreadItem, ThreadForm, ChatSettings],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative flex h-full min-h-0 flex-col' },
  template: `
    @if (showList()) {
      <aura-app-header [clubName]="club.club()?.name ?? ''" [logoUrl]="club.club()?.logoUrl" title="Chat">
        <button
          headerAction
          type="button"
          aria-label="Chat settings"
          class="flex h-[54px] w-full items-center justify-center"
          (click)="settingsOpen.set(true)"
        >
          <aura-icon name="sliders" />
        </button>
        <button
          pageActions
          type="button"
          class="h-10 rounded-md border-2 border-ink bg-paper px-3.5 font-display text-[15px] font-bold tracking-[0.05em]"
          (click)="settingsOpen.set(true)"
        >
          NOTIFICATIONS
        </button>
        <button
          pageActions
          type="button"
          class="h-10 rounded-md bg-ink px-4 font-display text-[15px] font-bold tracking-[0.05em] text-paper"
          (click)="startCreating()"
        >
          + NEW THREAD
        </button>
      </aura-app-header>
    }

    <div class="flex min-h-0 flex-1">
      @if (showList()) {
        <section
          aria-label="Threads"
          class="relative flex min-h-0 w-full flex-col wide:w-[320px] wide:shrink-0 wide:border-r-2 wide:border-ink full:w-[380px]"
        >
          <main class="min-h-0 flex-1 overflow-y-auto pb-[90px] wide:pb-0">
            <div class="flex justify-end px-3.5 pt-3 pb-1 wide:hidden">
              <button type="button" class="btn-small" (click)="startCreating()">NEW THREAD</button>
            </div>
            <div role="list">
              @for (row of rows(); track row.id) {
                <aura-thread-list-item [vm]="row" />
              }
            </div>

            @if (others().length) {
              <h2 class="border-b-2 border-ink px-3.5 pt-5 pb-1.5 font-display text-[13px] font-bold tracking-[0.08em]">
                OTHER THREADS YOU MANAGE
              </h2>
              <div role="list">
                @for (row of others(); track row.id) {
                  <aura-managed-thread-item [vm]="row" />
                }
              </div>
            }
          </main>

          @if (!viewport.wide()) {
            <button
              type="button"
              aria-label="New thread"
              class="absolute right-[18px] bottom-5 z-[5] size-[58px] rounded-full border-2 border-paper bg-ink text-[34px] leading-none text-paper shadow-[0_0_0_2px_var(--color-ink)] transition-transform active:scale-[0.94]"
              (click)="startCreating()"
            >
              +
            </button>
          }
        </section>
      }

      <div class="min-h-0 min-w-0 flex-1" [class.hidden]="!threadOpen() && !viewport.wide()">
        <router-outlet (activate)="threadOpen.set(true)" (deactivate)="threadOpen.set(false)" />
        @if (!threadOpen()) {
          <div class="flex h-full items-center justify-center px-6 text-center text-base font-medium">
            Select a thread to read messages.
          </div>
        }
      </div>
    </div>

    @if (creating()) {
      <aura-thread-form
        [meId]="club.meId() ?? ''"
        [creatorId]="club.meId()"
        [scopeOptions]="scopeOptions()"
        [allTeams]="club.teams()"
        [users]="club.users()"
        [saving]="create.saving()"
        [error]="create.error()"
        (closed)="creating.set(false)"
        (alreadyIncluded)="toaster.show($event.person + ' is included through ' + $event.team + '.')"
        (submitted)="createThread($event)"
      />
    }
    @if (settingsOpen()) {
      <aura-chat-settings
        [settings]="notificationSettings()"
        (toggled)="chat.setMuted($event.threadId, !$event.on)"
        (closed)="settingsOpen.set(false)"
      />
    }
  `,
})
export class ChatListPage {
  protected readonly club = inject(ClubStore);
  protected readonly chat = inject(ChatStore);
  protected readonly toaster = inject(Toaster);
  private readonly router = inject(Router);
  private readonly now = inject(CLOCK);
  protected readonly viewport = inject(Viewport);

  /** A conversation is routed into the outlet. */
  protected readonly threadOpen = signal(false);
  protected readonly showList = computed(() => this.viewport.wide() || !this.threadOpen());
  protected readonly creating = signal(false);
  protected readonly settingsOpen = signal(false);
  protected readonly create = new Submission();

  protected readonly rows = computed<ThreadListItemVm[]>(() => {
    const me = this.club.meId();
    const now = this.now();
    return this.chat.myThreads().map(({ thread: t }) => {
      const last = t.messages.at(-1);
      const sender = last && (last.from === me ? 'You' : firstName(this.club.user(last.from)?.name ?? '?'));
      return {
        id: t.id,
        link: ['/', this.club.slug() ?? '', 'chat', t.id],
        name: t.name,
        badge: badge(t),
        time: last ? formatMessageTime(last.sentAt, now) : '',
        snippet: last ? `${sender}: ${last.text}` : 'No messages yet',
        unread: t.unread,
        muted: this.chat.isMuted(t.id),
      };
    });
  });

  protected readonly others = computed<ManagedThreadVm[]>(() =>
    this.chat.managedElsewhere().map(({ thread: t, members }) => ({
      id: t.id,
      link: ['/', this.club.slug() ?? '', 'chat', t.id],
      name: t.name,
      badge: badge(t),
      meta: `${members.size} members · created by ${this.club.user(t.creatorId)?.name ?? '?'}`,
    })),
  );

  protected readonly notificationSettings = computed<NotificationSettingVm[]>(() =>
    this.chat.myThreads().map(({ thread: t }) => ({
      threadId: t.id,
      label: `${badge(t)} ${t.name}`,
      on: !this.chat.isMuted(t.id),
    })),
  );

  protected readonly scopeOptions = computed<Choice<ThreadScope>[]>(() => {
    const ids: ThreadScope[] = this.club.isClubStaff() ? ['club', ...this.club.myTeams()] : this.club.myTeams();
    return ids.map((id) => ({ value: id, label: this.club.teamName(id) }));
  });

  protected startCreating(): void {
    this.create.reset();
    this.creating.set(true);
  }

  protected async createThread(value: ThreadFormValue): Promise<void> {
    const me = this.club.meId();
    if (!me) return;
    let created: Thread | undefined;
    const ok = await this.create.run(async () => {
      created = await this.chat.createThread({ ...value, creatorId: me });
    }, 'Could not save the thread. Try again.');
    if (!ok || !created) return;
    const count = this.chat.withMembers().find((t) => t.thread.id === created?.id)?.members.size ?? 0;
    this.toaster.show(
      `Thread created with ${count} members.${value.teams.length ? ' New team members join automatically.' : ''}`,
    );
    this.creating.set(false);
    void this.router.navigate(['/', this.club.slug(), 'chat', created.id]);
  }
}
