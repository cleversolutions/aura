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

  it('keeps past seasons’ team threads out of the lists', async () => {
    const store = await setup('sam');
    const club = TestBed.inject(ClubStore);
    await club.startSeason({
      name: 'Next',
      teams: [{ from: 'U12G', name: 'U13 Girls', staff: true, players: true }],
    });
    await store.load();
    const ids = store.withMembers().map((t) => t.thread.id);
    expect(ids).not.toContain('U12G-gen');
    expect(ids).toContain('club-ann');
    const u13 = club.teams()[0].id;
    expect(store.teamChannels().map((t) => t.thread.scope)).toEqual([u13, u13]);
  });

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

  it('lets club staff read and post in every team channel without being members', async () => {
    const store = await setup('sam');
    const channels = store.teamChannels();
    expect(channels.map((t) => t.thread.id)).toContain('U18B-gen');
    expect(channels.every((t) => t.thread.isDefault && !t.members.has('sam'))).toBe(true);
    expect(channels.every((t) => store.canPost(t))).toBe(true);
    expect(store.myThreads().map((t) => t.thread.id)).toContain('club-ann');
  });

  it('keeps announcement channels to staff unless the club lets everyone post', async () => {
    const store = await setup('jordan');
    const ann = () => store.withMembers().find((t) => t.thread.id === 'U12G-ann')!;
    expect(store.canRead(ann())).toBe(true);
    expect(store.canPost(ann())).toBe(false);
    store.open('U12G-ann');
    await expect(store.send('Ride Sunday?')).rejects.toThrow(/permission/);

    const club = TestBed.inject(ClubStore);
    await club.switchUser('sam');
    await club.saveSettings({ announcements: 'everyone', contacts: 'staff' });
    await club.switchUser('jordan');
    expect(store.canPost(ann())).toBe(true);
    await store.send('Thanks coach!');
    expect(store.openThread()?.thread.messages.at(-1)?.text).toBe('Thanks coach!');
  });

  it('edits and deletes my messages; staff delete anyone’s in their team’s threads', async () => {
    const store = await setup('jordan');
    store.open('U12G-gen');
    await store.send('Spare shoes?');
    const mine = store.openThread()!.thread.messages.at(-1)!;
    expect(store.canEdit(mine)).toBe(true);
    await store.editMessage('U12G-gen', mine.id, ' Spare shoes, size 6? ');
    expect(store.openThread()!.thread.messages.at(-1)).toMatchObject({ text: 'Spare shoes, size 6?' });
    expect(store.openThread()!.thread.messages.at(-1)?.editedAt).toBeTruthy();

    const theirs = store.openThread()!.thread.messages.find((m) => m.from !== 'jordan')!;
    expect(store.canEdit(theirs)).toBe(false);
    expect(store.canDelete(theirs, store.openThread()!.thread)).toBe(false);
    await expect(store.deleteMessage('U12G-gen', theirs.id)).rejects.toThrow('Only the sender or staff');

    await TestBed.inject(ClubStore).switchUser('dana');
    expect(store.canDelete(mine, store.openThread()!.thread)).toBe(true);
    await store.deleteMessage('U12G-gen', mine.id);
    expect(store.openThread()!.thread.messages.find((m) => m.id === mine.id)).toMatchObject({
      text: '',
      deleted: true,
    });
  });

  it('applies edits and deletions that arrive in realtime', async () => {
    const store = await setup('jordan');
    const first = store.myThreads().find((t) => t.thread.id === 'carpool')!.thread.messages[0];
    store.receive({ type: 'updated', threadId: 'carpool', message: { ...first, text: '', deleted: true } });
    const carpool = store.myThreads().find((t) => t.thread.id === 'carpool')!.thread;
    expect(carpool.messages[0]).toMatchObject({ id: first.id, deleted: true });
    expect(carpool.unread).toBe(2);
    expect(store.notice()).toBeNull();
  });

  it('does not notify club staff about team channels they are not in', async () => {
    const store = await setup('sam');
    store.receive({
      type: 'message',
      threadId: 'U18B-gen',
      message: { id: 'x', from: 'mike', text: 'Bus at 7', sentAt: '2026-10-05T11:00:00Z' },
    });
    expect(store.notice()).toBeNull();
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
