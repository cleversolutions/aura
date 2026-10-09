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
import { MessageBubble, MessageComposer, MessageVm, ThreadForm, ThreadFormValue, ThreadHeader } from '@aura/chat/ui';
import { ClubStore } from '@aura/club/data-access';
import { CLOCK, Submission, Toaster, formatMessageTime } from '@aura/shared/util';

/** Conversation container: opens the thread, sends messages, manages membership. */
@Component({
  selector: 'aura-thread-page',
  imports: [ThreadHeader, MessageBubble, MessageComposer, ThreadForm],
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
        <aura-message-bubble [message]="m" />
      } @empty {
        <div class="m-auto max-w-[240px] text-center text-sm font-medium">No messages yet.</div>
      }
    </div>

    @if (canPost()) {
      <aura-message-composer (send)="chat.send($event)" />
    } @else if (thread()) {
      <p class="shrink-0 border-t-2 border-ink px-3.5 py-3 text-center text-sm leading-snug font-medium">
        You can manage this thread but you are not a member. Tap the members icon to add yourself.
      </p>
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
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  protected readonly thread = computed(() => this.chat.openThread()?.thread ?? null);
  protected readonly canPost = computed(() => {
    const me = this.club.meId();
    return !!me && !!this.chat.openThread()?.members.has(me);
  });
  protected readonly memberLabel = computed(() => {
    const open = this.chat.openThread();
    return open ? `${this.club.teamName(open.thread.scope)} · ${open.members.size} members` : '';
  });
  protected readonly messages = computed<MessageVm[]>(() => {
    const me = this.club.meId();
    const now = this.now();
    return (this.thread()?.messages ?? []).map((m) => ({
      id: m.id,
      text: m.text,
      mine: m.from === me,
      sender: this.club.user(m.from)?.name ?? 'Unknown',
      time: formatMessageTime(m.sentAt, now),
    }));
  });

  protected readonly locked = computed(() => {
    const t = this.thread();
    return !!t && !this.chat.canManage(t);
  });
  protected readonly creatorName = computed(() => {
    const t = this.thread();
    return t?.isDefault ? 'Team default' : (this.club.user(t?.creatorId)?.name ?? '');
  });
  protected readonly lockNote = computed(() => {
    const t = this.thread();
    if (!t) return '';
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
