import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { ChatEvent, ChatRepository, NewThreadInput } from '@aura/backend/api';
import { ClubStore } from '@aura/club/data-access';
import { ChatMessage, Thread, ThreadMembership } from '@aura/shared/models';
import { canManageThread, effectiveMembers } from '@aura/shared/util';

/** A message from someone else that arrived while its thread was not open. */
export interface IncomingNotice {
  id: string;
  threadName: string;
  senderName: string;
}

interface ChatState {
  threads: Thread[];
  muted: string[];
  openThreadId: string | null;
  notice: IncomingNotice | null;
  loaded: boolean;
}

const initialState: ChatState = { threads: [], muted: [], openThreadId: null, notice: null, loaded: false };

export interface ThreadWithMembers {
  thread: Thread;
  members: Set<string>;
}

export const ChatStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store, club = inject(ClubStore)) => {
    const withMembers = computed<ThreadWithMembers[]>(() => {
      const users = club.users();
      return store.threads().map((thread) => ({ thread, members: effectiveMembers(thread, users) }));
    });
    const myThreads = computed(() => {
      const id = club.meId();
      return withMembers().filter((t) => !!id && t.members.has(id));
    });
    return {
      withMembers,
      myThreads,
      /** Custom threads the user can manage but is not a member of (staff oversight). */
      managedElsewhere: computed(() => {
        const me = club.me();
        if (!me) return [];
        return withMembers().filter((t) => !t.members.has(me.id) && canManageThread(t.thread, me));
      }),
      totalUnread: computed(() => myThreads().reduce((n, t) => n + t.thread.unread, 0)),
      openThread: computed(() => withMembers().find((t) => t.thread.id === store.openThreadId()) ?? null),
    };
  }),
  withMethods((store, repo = inject(ChatRepository), club = inject(ClubStore)) => {
    const updateThread = (id: string, fn: (t: Thread) => Thread) =>
      patchState(store, (s) => ({ threads: s.threads.map((t) => (t.id === id ? fn(t) : t)) }));

    return {
      isMuted(threadId: string): boolean {
        return store.muted().includes(threadId);
      },
      canManage(thread: Thread): boolean {
        const me = club.me();
        return !!me && canManageThread(thread, me);
      },
      /** How many custom/default threads someone joining `team` as `group` would land in. */
      linkedThreadCount(team: string, group: keyof Thread['include']): number {
        return store.threads().filter((t) => t.teams.includes(team) && t.include[group]).length;
      },
      async load(): Promise<void> {
        const [threads, muted] = await Promise.all([repo.listThreads(), repo.listMuted()]);
        patchState(store, { threads, muted, loaded: true });
      },
      open(threadId: string | null): void {
        patchState(store, { openThreadId: threadId });
        if (threadId) {
          updateThread(threadId, (t) => ({ ...t, unread: 0 }));
          void repo.markRead(threadId);
        }
      },
      async send(text: string): Promise<void> {
        const threadId = store.openThreadId();
        const from = club.meId();
        const body = text.trim();
        if (!threadId || !from || !body) return;
        const message = await repo.sendMessage(threadId, from, body);
        updateThread(threadId, (t) => ({ ...t, messages: [...t.messages, message] }));
      },
      async createThread(input: NewThreadInput): Promise<Thread> {
        const thread = await repo.createThread(input);
        patchState(store, (s) => ({ threads: [thread, ...s.threads] }));
        return thread;
      },
      async updateMembership(threadId: string, membership: Omit<ThreadMembership, 'creatorId'>): Promise<void> {
        const updated = await repo.updateMembership(threadId, membership);
        updateThread(threadId, () => updated);
      },
      async setMuted(threadId: string, muted: boolean): Promise<void> {
        patchState(store, (s) => ({
          muted: muted ? [...new Set([...s.muted, threadId])] : s.muted.filter((id) => id !== threadId),
        }));
        await repo.setMuted(threadId, muted);
      },
      dismissNotice(): void {
        patchState(store, { notice: null });
      },
      /** Applies a realtime event from the backend. */
      receive(event: ChatEvent): void {
        const { threadId, message } = event;
        const isOpen = store.openThreadId() === threadId;
        updateThread(threadId, (t) => ({
          ...t,
          messages: appendOnce(t.messages, message),
          unread: isOpen ? 0 : t.unread + 1,
        }));
        if (isOpen) {
          void repo.markRead(threadId);
          return;
        }
        const thread = store.threads().find((t) => t.id === threadId);
        if (thread && !store.muted().includes(threadId)) {
          patchState(store, {
            notice: {
              id: message.id,
              threadName: thread.name,
              senderName: club.user(message.from)?.name ?? 'Someone',
            },
          });
        }
      },
    };
  }),
  withHooks((store, repo = inject(ChatRepository)) => {
    let unsubscribe: (() => void) | undefined;
    return {
      onInit() {
        unsubscribe = repo.subscribe((event) => store.receive(event));
      },
      onDestroy() {
        unsubscribe?.();
      },
    };
  }),
);

export type ChatStore = InstanceType<typeof ChatStore>;

function appendOnce(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  return messages.some((m) => m.id === message.id) ? messages : [...messages, message];
}
