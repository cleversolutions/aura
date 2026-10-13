import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ChatStore } from '@aura/chat/data-access';
import {
  MessageActions,
  MessageBubble,
  MessageComposer,
  MessageVm,
  ThreadForm,
  ThreadFormValue,
  ThreadHeader,
} from '@aura/chat/ui';
import { ClubStore } from '@aura/club/data-access';
import {
  CLOCK,
  FORMER_MEMBER,
  Submission,
  Toaster,
  errorMessage,
  formatMessageTime,
  isClubWide,
} from '@aura/shared/util';

/** Conversation container: opens the thread, sends, edits and deletes messages, manages membership. */
@Component({
  selector: 'aura-thread-page',
  imports: [ThreadHeader, MessageBubble, MessageComposer, ThreadForm, MessageActions],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-0 flex-col' },
  template: `
    <aura-thread-header
      [name]="thread()?.name ?? ''"
      [memberLabel]="memberLabel()"
      [backLink]="['/', club.slug() ?? '', 'chat']"
      (manage)="startManaging()"
    />

    <div
      #scroller
      class="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-4"
      role="log"
      aria-live="polite"
    >
      @for (m of messages(); track m.id) {
        <aura-message-bubble [message]="m" (actions)="startActions(m.id)" />
      } @empty {
        <div class="m-auto max-w-[240px] text-center text-sm font-medium">No messages yet.</div>
      }
    </div>

    @if (canPost()) {
      <aura-message-composer (send)="send($event)" />
    } @else if (readOnlyNote(); as note) {
      <p class="shrink-0 border-t-2 border-ink px-3.5 py-3 text-center text-sm leading-snug font-medium">
        {{ note }}
      </p>
    }

    @if (acting(); as m) {
      <aura-message-actions
        [text]="m.text"
        [sender]="m.sender"
        [mine]="m.mine"
        [canEdit]="m.canEdit"
        [canDelete]="m.canDelete"
        [saving]="messageAction.saving()"
        [error]="messageAction.error()"
        (edited)="editMessage(m.id, $event)"
        (deleted)="deleteMessage(m.id)"
        (closed)="actingId.set(null)"
      />
    }

    @if (managing() && thread(); as t) {
      <aura-thread-form
        [thread]="t"
        [locked]="locked()"
        [lockNote]="lockNote()"
        [creatorId]="t.creatorId"
        [creatorName]="creatorName()"
        [meId]="club.meId() ?? ''"
        [allTeams]="club.teams()"
        [users]="club.users()"
        [saving]="update.saving()"
        [error]="update.error()"
        (closed)="managing.set(false)"
        (alreadyIncluded)="toaster.show($event.person + ' is included through ' + $event.team + '.')"
        (submitted)="saveMembers($event)"
      />
    }
  `,
})
export class ThreadPage {
  protected readonly chat = inject(ChatStore);
  protected readonly club = inject(ClubStore);
  protected readonly toaster = inject(Toaster);
  private readonly now = inject(CLOCK);

  /** Bound from the `:threadId` route parameter. */
  readonly threadId = input.required<string>();

  protected readonly managing = signal(false);
  protected readonly update = new Submission();
  /** The message whose edit/delete sheet is open. */
  protected readonly actingId = signal<string | null>(null);
  protected readonly messageAction = new Submission();
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  protected readonly thread = computed(() => this.chat.openThread()?.thread ?? null);
  protected readonly canPost = computed(() => {
    const open = this.chat.openThread();
    return !!open && this.chat.canPost(open);
  });
  /** Why there is no composer: an archived club, an announcement channel, or a thread managed from outside. */
  protected readonly readOnlyNote = computed(() => {
    const open = this.chat.openThread();
    if (!open) return '';
    if (this.club.archived()) return 'This club is archived. Nothing can be posted.';
    if (this.chat.canRead(open)) {
      return open.thread.scope === 'club'
        ? 'Only club staff post in club announcements.'
        : `Only club staff and ${this.club.teamName(open.thread.scope)} staff post announcements.`;
    }
    return 'You can manage this thread but you are not a member. Tap the members icon to add yourself.';
  });
  protected readonly memberLabel = computed(() => {
    const open = this.chat.openThread();
    return open ? `${this.club.teamName(open.thread.scope)} · ${open.members.size} members` : '';
  });
  protected readonly messages = computed<(MessageVm & { canEdit: boolean; canDelete: boolean })[]>(() => {
    const me = this.club.meId();
    const now = this.now();
    const t = this.thread();
    if (!t) return [];
    return t.messages.map((m) => {
      const canEdit = this.chat.canEdit(m);
      const canDelete = this.chat.canDelete(m, t);
      return {
        id: m.id,
        text: m.text,
        mine: m.from === me,
        sender: this.club.user(m.from)?.name ?? FORMER_MEMBER,
        time: formatMessageTime(m.sentAt, now),
        edited: !!m.editedAt,
        deleted: !!m.deleted,
        actions: canEdit || canDelete,
        canEdit,
        canDelete,
      };
    });
  });
  protected readonly acting = computed(() => this.messages().find((m) => m.id === this.actingId()) ?? null);

  protected readonly locked = computed(() => {
    const t = this.thread();
    return !!t && !this.chat.canManage(t);
  });
  protected readonly creatorName = computed(() => {
    const t = this.thread();
    if (t?.isDefault) return t.scope === 'club' ? 'Club default' : 'Team default';
    return this.club.user(t?.creatorId)?.name ?? '';
  });
  protected readonly lockNote = computed(() => {
    const t = this.thread();
    if (!t) return '';
    if (isClubWide(t)) {
      return 'Club-wide channel. Everyone in the club is in it, and new members join automatically.';
    }
    if (t.isDefault) {
      return `Default team channel. Everyone on ${this.club.teamName(t.scope)} is in it, and new team members join automatically.`;
    }
    const creator = this.club.user(t.creatorId)?.name ?? 'the creator';
    const staff = t.scope === 'club' ? '' : `, ${this.club.teamName(t.scope)} staff`;
    return `Only ${creator}${staff} or club staff can change who is in this thread.`;
  });

  constructor() {
    // Open the thread (clears unread) whenever the route param changes, and once threads load.
    effect((onCleanup) => {
      const id = this.threadId();
      if (!this.chat.loaded()) return;
      untracked(() => this.chat.open(id));
      onCleanup(() => untracked(() => this.chat.open(null)));
    });
    afterRenderEffect(() => {
      this.messages();
      const el = this.scroller().nativeElement;
      el.scrollTop = el.scrollHeight;
    });
  }

  protected async send(text: string): Promise<void> {
    try {
      await this.chat.send(text);
    } catch (e) {
      this.toaster.show(errorMessage('Could not send the message. Try again.')(e));
    }
  }

  protected startActions(id: string): void {
    this.messageAction.reset();
    this.actingId.set(id);
  }

  protected async editMessage(id: string, text: string): Promise<void> {
    const t = this.thread();
    if (!t) return;
    const ok = await this.messageAction.run(
      () => this.chat.editMessage(t.id, id, text),
      errorMessage('Could not edit the message. Try again.'),
    );
    if (!ok) return;
    this.toaster.show('Message edited.');
    this.actingId.set(null);
  }

  protected async deleteMessage(id: string): Promise<void> {
    const t = this.thread();
    if (!t) return;
    const ok = await this.messageAction.run(
      () => this.chat.deleteMessage(t.id, id),
      errorMessage('Could not delete the message. Try again.'),
    );
    if (!ok) return;
    this.toaster.show('Message deleted.');
    this.actingId.set(null);
  }

  protected startManaging(): void {
    this.update.reset();
    this.managing.set(true);
  }

  protected async saveMembers({ teams, include, members }: ThreadFormValue): Promise<void> {
    const t = this.thread();
    if (!t) return;
    const ok = await this.update.run(
      () => this.chat.updateMembership(t.id, { teams, include, members }),
      'Could not save the thread. Try again.',
    );
    if (!ok) return;
    this.toaster.show(`Membership updated · ${this.chat.openThread()?.members.size ?? 0} members`);
    this.managing.set(false);
  }
}
