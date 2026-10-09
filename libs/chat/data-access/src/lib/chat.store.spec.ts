import { TestBed } from '@angular/core/testing';
import { provideMockBackend } from '@aura/backend/mock';
import { ClubStore } from '@aura/club/data-access';
import { ALL_GROUPS, CLOCK } from '@aura/shared/util';
import { ChatStore } from './chat.store';

async function setup(initialUserId = 'jordan', replyDelayMs = 0) {
  TestBed.configureTestingModule({
    providers: [
      provideMockBackend({ latencyMs: 0, replyDelayMs, initialUserId }),
      { provide: CLOCK, useValue: () => new Date('2026-10-05T12:00:00') },
    ],
  });
  await TestBed.inject(ClubStore).load();
  const store = TestBed.inject(ChatStore);
  await store.load();
  return store;
}

describe('ChatStore', () => {
  afterEach(() => vi.useRealTimers());

  it('lists only threads I am a member of', async () => {
    const store = await setup();
    const names = store.myThreads().map((t) => t.thread.id);
    expect(names).toContain('carpool');
    expect(names).toContain('U12G-gen');
    expect(names).not.toContain('coaches');
    expect(store.totalUnread()).toBe(6);
  });

  it('shows staff the threads they manage but are not in', async () => {
    const store = await setup('sam');
    expect(store.managedElsewhere().map((t) => t.thread.id)).toEqual(['carpool', 'bake', 'hotel']);
  });

  it('clears unread on open and appends sent messages', async () => {
    const store = await setup();
    store.open('U12G-gen');
    expect(store.openThread()?.thread.unread).toBe(0);
    await store.send('  On my way  ');
    expect(store.openThread()?.thread.messages.at(-1)).toMatchObject({ from: 'jordan', text: 'On my way' });
  });

  it('creates a thread with team-linked members', async () => {
    const store = await setup('dana');
    const t = await store.createThread({
      name: 'Tournament drivers',
      scope: 'U12G',
      teams: ['U12G'],
      include: { ...ALL_GROUPS, players: false },
      members: [],
      creatorId: 'dana',
    });
    expect(store.myThreads()[0].thread.id).toBe(t.id);
    expect(store.myThreads()[0].members.has('jordan')).toBe(true);
  });

  it('receives simulated replies and raises a notice when the thread is closed', async () => {
    vi.useFakeTimers();
    const store = await setup('jordan', 1000);
    store.open('carpool');
    await store.send('Leaving at 5');
    store.open(null);
    await vi.advanceTimersByTimeAsync(1000);

    const carpool = store.myThreads().find((t) => t.thread.id === 'carpool');
    expect(carpool?.thread.unread).toBe(1);
    expect(store.notice()?.threadName).toBe('Carpool · Thursday');
  });

  it('does not notify for muted threads', async () => {
    vi.useFakeTimers();
    const store = await setup('jordan', 1000);
    await store.setMuted('carpool', true);
    store.open('carpool');
    await store.send('Hi');
    store.open(null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.notice()).toBeNull();
  });
});
