import { TestBed } from '@angular/core/testing';
import { provideMockBackend } from '@aura/backend/mock';
import { ClubStore } from '@aura/club/data-access';
import { CLOCK } from '@aura/shared/util';
import { ScheduleStore } from './schedule.store';

async function setup(initialUserId = 'jordan') {
  TestBed.configureTestingModule({
    providers: [
      provideMockBackend({ latencyMs: 0, replyDelayMs: 0, initialUserId }),
      { provide: CLOCK, useValue: () => new Date('2026-10-05T12:00:00') },
    ],
  });
  await TestBed.inject(ClubStore).load();
  const store = TestBed.inject(ScheduleStore);
  await store.load();
  return store;
}

describe('ScheduleStore', () => {
  it('lists upcoming events for my teams in date order with TBD last', async () => {
    const store = await setup();
    const ids = store.listed().map((e) => e.id);
    expect(ids).toEqual(['e1', 'e2', 'e4', 'e3', 'e5']);
  });

  it('lists past events newest first', async () => {
    const store = await setup();
    store.setSegment('past');
    expect(store.listed().map((e) => e.id)).toEqual(['e6', 'e7', 'e8', 'e9']);
  });

  it('searches by title, location and team', async () => {
    const store = await setup();
    store.setQuery('hawks');
    expect(store.listed().map((e) => e.id)).toEqual(['e2']);
    store.setQuery('u12 girls');
    expect(store.listed().map((e) => e.id)).toEqual(['e1', 'e5']);
  });

  it('shows every team to club staff', async () => {
    const store = await setup('sam');
    expect(store.listed()).toHaveLength(8);
    expect(store.canCreate()).toBe(true);
  });

  it('quick RSVP applies to all of a parent’s players and toggles off', async () => {
    const store = await setup();
    const awards = store.events().find((e) => e.id === 'e3');
    if (!awards) throw new Error('missing seed event');
    expect(store.attendeesFor(awards).map((a) => a.id)).toEqual(['maya', 'eli']);

    expect(await store.quickRsvp(awards, 'going')).toBe('going');
    expect(store.rsvps()['e3']).toEqual({ maya: { status: 'going' }, eli: { status: 'going' } });

    expect(await store.quickRsvp(awards, 'going')).toBeNull();
    expect(store.rsvps()['e3']).toEqual({});
  });

  it('players RSVP through their profile, as their parents do', async () => {
    const store = await setup('eli');
    const club = TestBed.inject(ClubStore);
    const game = store.events().find((e) => e.id === 'e2');
    if (!game) throw new Error('missing seed event');
    const profile = club.profiles().find((p) => p.userId === 'eli');
    expect(store.attendeesFor(game)).toEqual([{ id: profile?.id, name: 'Eli Smith', jersey: '1' }]);
  });

  it('refuses RSVPs for other families’ players', async () => {
    const store = await setup();
    await expect(store.setRsvp('e1', ['pf10'], 'going')).rejects.toThrow(/yourself and your players/);
    expect(store.statusOf('e1', 'pf10')).toBe('going');
  });

  it('keeps an RSVP’s note until it is changed', async () => {
    const store = await setup();
    await store.setRsvp('e1', ['maya'], 'out', ' Sick ');
    expect(store.rsvpOf('e1', 'maya')).toEqual({ status: 'out', note: 'Sick' });
    await store.quickRsvp(
      store.events().find((e) => e.id === 'e1')!,
      'going',
    );
    expect(store.rsvpOf('e1', 'maya')).toEqual({ status: 'going', note: 'Sick' });
    await store.load();
    expect(store.rsvpOf('e1', 'maya')).toEqual({ status: 'going', note: 'Sick' });
  });

  it('shows the team’s staff who is coming, with notes; parents see only their own notes', async () => {
    const staff = await setup('kim-alvarez');
    const practice = staff.events().find((e) => e.id === 'e1')!;
    const rows = staff.attendance(practice) ?? [];
    expect(rows).toHaveLength(9);
    expect(rows[0].player.name).toBe('Ava Chen');
    expect(rows.filter((r) => r.rsvp?.status === 'going').map((r) => r.player.name)).toEqual([
      'Ava Chen',
      'Lily Okafor',
    ]);
    expect(rows.find((r) => r.rsvp?.status === 'out')?.rsvp?.note).toBe('Sick, sorry');

    TestBed.resetTestingModule();
    const parent = await setup();
    expect(parent.attendance(practice)).toBeNull();
    expect(parent.rsvpOf('e1', 'pf11')).toEqual({ status: 'out' });
  });

  it('cancels, restores and deletes events', async () => {
    const store = await setup('sam');
    const practice = store.events().find((e) => e.id === 'e1')!;
    await store.setCancelled('e1', true);
    const cancelled = store.events().find((e) => e.id === 'e1')!;
    expect(cancelled.cancelled).toBe(true);
    expect(store.attendeesFor(cancelled)).toEqual([]);
    await store.setCancelled('e1', false);
    expect(store.events().find((e) => e.id === 'e1')?.cancelled).toBeUndefined();

    await store.deleteEvent(practice.id);
    expect(store.events().some((e) => e.id === 'e1')).toBe(false);
    expect(store.rsvps()['e1']).toBeUndefined();
  });

  it('only lets the event’s staff cancel or delete it', async () => {
    const store = await setup('dana');
    await expect(store.deleteEvent('e2')).rejects.toThrow(/staff/);
    await expect(store.setCancelled('e3', true)).rejects.toThrow(/staff/);
    expect(store.events().some((e) => e.id === 'e2')).toBe(true);
  });

  it('creates events and records scores', async () => {
    const store = await setup('dana');
    const created = await store.saveEvent({
      type: 'practice',
      team: 'U14B',
      date: '2026-10-07',
      time: '18:00',
      location: 'Court 4',
      notes: '',
    });
    expect(store.listed().some((e) => e.id === created.id)).toBe(true);
    expect(store.canEdit(created)).toBe(true);

    await store.saveScore(created.id, { us: 3, them: 1 });
    expect(store.events().find((e) => e.id === created.id)?.score).toEqual({ us: 3, them: 1 });
  });

  it('coaches who are parents RSVP for themselves and their players on that team', async () => {
    const store = await setup('dana');
    const club = TestBed.inject(ClubStore);
    await club.addPlayer({ team: 'U12G', name: 'Davis Reyes', jersey: '7', parentIds: ['dana', 'priya-patel'] });
    const practice = store.events().find((e) => e.id === 'e1');
    if (!practice) throw new Error('missing seed event');
    expect(store.attendeesFor(practice).map((a) => a.name)).toEqual(['Dana Reyes', 'Davis Reyes']);
    const u14 = store.events().find((e) => e.id === 'e10');
    expect(store.attendeesFor(u14!).map((a) => a.name)).toEqual(['Dana Reyes']);
  });
});
