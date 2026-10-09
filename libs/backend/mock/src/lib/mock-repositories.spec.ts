import { TestBed } from '@angular/core/testing';
import { ChatEvent, ChatRepository, DirectoryRepository, ScheduleRepository } from '@aura/backend/api';
import { provideTestBackend } from './testing';

describe('mock backend', () => {
  afterEach(() => vi.useRealTimers());

  function setup(replyDelayMs = 0) {
    TestBed.configureTestingModule({ providers: provideTestBackend({ replyDelayMs }) });
    return {
      directory: TestBed.inject(DirectoryRepository),
      schedule: TestBed.inject(ScheduleRepository),
      chat: TestBed.inject(ChatRepository),
    };
  }

  it('seeds five teams of nine players and the demo family', async () => {
    const dir = await setup().directory.load();
    expect(dir.club.name).toBe('Spartans');
    expect(dir.teams.map((t) => t.id)).toEqual(['U10B', 'U12G', 'U14B', 'U16G', 'U18B']);
    for (const t of dir.teams) expect(dir.profiles.filter((p) => p.team === t.id)).toHaveLength(9);
    expect(dir.profiles.filter((p) => p.parentId === 'jordan').map((p) => p.name)).toEqual(['Maya Smith', 'Eli Smith']);
  });

  it('returns copies so callers cannot mutate the database', async () => {
    const { schedule } = setup();
    const events = await schedule.listEvents();
    events[0].location = 'Changed';
    expect((await schedule.listEvents())[0].location).not.toBe('Changed');
  });

  it('sets and clears RSVPs', async () => {
    const { schedule } = setup();
    await schedule.setRsvp('e1', ['maya'], 'out');
    expect((await schedule.listRsvps())['e1']).toEqual({ maya: 'out' });
    await schedule.setRsvp('e1', ['maya'], null);
    expect((await schedule.listRsvps())['e1']).toEqual({});
  });

  it('pushes a simulated reply from another member to subscribers', async () => {
    vi.useFakeTimers();
    const { chat } = setup(500);
    const events: ChatEvent[] = [];
    const unsubscribe = chat.subscribe((e) => events.push(e));

    await chat.sendMessage('carpool', 'jordan', 'Leaving now');
    expect(events).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(500);

    expect(events).toHaveLength(1);
    expect(events[0].threadId).toBe('carpool');
    expect(events[0].message.from).not.toBe('jordan');
    unsubscribe();
  });
});
