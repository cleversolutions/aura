import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTestBackend } from '@aura/backend/mock';
import { ClubStore } from '@aura/club/data-access';
import { ScheduleStore } from '@aura/schedule/data-access';
import { Toaster, Viewport } from '@aura/shared/util';
import { SchedulePage } from './schedule-page';

async function render(initialUserId = 'jordan', wide = false) {
  TestBed.configureTestingModule({
    providers: [provideTestBackend({ initialUserId }), { provide: Viewport, useValue: { wide: signal(wide) } }],
  });
  await TestBed.inject(ClubStore).load();
  await TestBed.inject(ScheduleStore).load();
  const fixture = TestBed.createComponent(SchedulePage);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const buttons = (text: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).filter((b) => b.textContent?.includes(text));
  return { fixture, el, buttons };
}

describe('SchedulePage', () => {
  it('lists upcoming events with per-player status for parents', async () => {
    const { el } = await render();
    const cards = el.querySelectorAll('aura-event-card');
    expect(cards).toHaveLength(5);
    expect(cards[0].textContent).toContain('Practice');
    expect(el.textContent).toContain('Maya: Going · Eli: Undecided');
  });

  it('quick RSVP marks the card and shows a toast', async () => {
    const { fixture, el, buttons } = await render();
    const going = buttons('GOING')[0];
    expect(going.getAttribute('aria-pressed')).toBe('false');

    going.click();
    await fixture.whenStable();

    expect(el.querySelector('aura-event-card button[aria-pressed="true"]')?.textContent).toContain('GOING');
    expect(TestBed.inject(Toaster).message()?.text).toBe('Maya: going · Practice');
  });

  it('hides event creation from parents and shows it to staff', async () => {
    expect((await render()).buttons('+ EVENT')).toHaveLength(0);
    TestBed.resetTestingModule();
    expect((await render('dana')).buttons('+ EVENT')).toHaveLength(1);
  });

  it('opens events in a sheet on compact screens', async () => {
    const { fixture, el } = await render();
    expect(el.querySelector('aura-event-detail')).toBeNull();

    el.querySelector<HTMLButtonElement>('aura-event-card button')?.click();
    await fixture.whenStable();
    expect(el.querySelector('aura-event-detail [role=dialog]')).not.toBeNull();
  });

  it('docks the first event in a side pane on wide screens and keeps it open after RSVP', async () => {
    const { fixture, el, buttons } = await render('jordan', true);
    const pane = () => el.querySelector('aside aura-event-detail');
    expect(pane()?.textContent).toContain('PRACTICE · U12 GIRLS');
    expect(el.querySelector('[role=dialog]')).toBeNull();
    expect(el.querySelector('aura-event-card article')?.className).toContain('shadow-');

    el.querySelectorAll<HTMLButtonElement>('aura-event-card button')[3].click();
    await fixture.whenStable();
    expect(pane()?.textContent).not.toContain('PRACTICE · U12 GIRLS');

    buttons('CONFIRM GOING')[0].click();
    await fixture.whenStable();
    expect(TestBed.inject(Toaster).message()?.text).toContain('going');
    expect(pane()).not.toBeNull();
  });

  it('validates the new event form', async () => {
    const { fixture, el, buttons } = await render('dana');
    buttons('+ EVENT')[0].click();
    await fixture.whenStable();
    buttons('CREATE · U12 GIRLS')[0].click();
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Pick a date and time, or mark TBD.');
  });

  it('starts club staff’s new events on a team, not club-wide', async () => {
    const { fixture, buttons } = await render('sam');
    buttons('+ EVENT')[0].click();
    await fixture.whenStable();
    expect(buttons('CREATE · U10 BOYS')).toHaveLength(1);
  });

  it('shows the team’s staff a headcount on the card and who is coming in the event', async () => {
    const { fixture, el } = await render('kim-alvarez');
    const practice = el.querySelectorAll('aura-event-card')[0];
    expect(practice.textContent).toContain('2 going · 1 out · 6 undecided');

    practice.querySelector('button')?.click();
    await fixture.whenStable();
    const attendance = el.querySelector('[aria-label=Attendance]');
    expect(attendance?.textContent).toContain('OUT · 1');
    expect(attendance?.textContent).toContain('Sick, sorry');
  });

  it('gives a coach who is a parent a checklist of who the RSVP is for', async () => {
    const { fixture, el, buttons } = await render('dana');
    await TestBed.inject(ClubStore).addPlayer({ team: 'U12G', name: 'Davis Reyes', jersey: '7', parentIds: ['dana'] });
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('aura-event-card button')?.click();
    await fixture.whenStable();
    expect(el.textContent).toContain('RSVP FOR');

    buttons('Dana Reyes')[0].click(); // untick the coach: only Davis is going
    await fixture.whenStable();
    buttons('CONFIRM GOING')[0].click();
    await fixture.whenStable();
    expect(TestBed.inject(Toaster).message()?.text).toBe('Davis: going · Practice');
    const store = TestBed.inject(ScheduleStore);
    expect(store.statusOf('e1', 'dana')).toBeUndefined();
  });

  it('shows the end time on the card, and when to arrive and a map link in the event', async () => {
    const { fixture, el } = await render('kim-alvarez');
    const practice = el.querySelectorAll('aura-event-card')[0];
    expect(practice.textContent).toContain('6:00 PM – 7:30 PM');
    practice.querySelector('button')?.click();
    await fixture.whenStable();
    const detail = el.querySelector('aura-event-detail');
    expect(detail?.textContent).toContain('Arrive by 5:45 PM');
    expect(detail?.querySelector<HTMLAnchorElement>('a[aria-label^="Map of"]')?.href).toContain(
      'query=Northview%20Middle%20School%20Gym',
    );
  });

  it('changes a weekly practice from one week on', async () => {
    const { fixture, el, buttons } = await render('dana');
    const weekly = Array.from(el.querySelectorAll('aura-event-card')).find((c) => c.textContent?.includes('U14'));
    weekly?.querySelector('button')?.click();
    await fixture.whenStable();
    expect(el.querySelector('aura-event-detail')?.textContent).toContain('Repeats weekly');
    buttons('EDIT EVENT')[0].click();
    await fixture.whenStable();
    const location = el.querySelector<HTMLInputElement>('aura-event-form input[placeholder="Gym, court, or address"]')!;
    location.value = 'Court 5';
    location.dispatchEvent(new Event('input'));
    buttons('LATER WEEKS TOO')[0].click();
    await fixture.whenStable();
    buttons('SAVE CHANGES')[0].click();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(TestBed.inject(Toaster).message()?.text).toBe('3 events updated.');
    const series = TestBed.inject(ScheduleStore)
      .events()
      .filter((e) => e.seriesId === 'r1');
    expect(series.map((e) => e.location)).toEqual(['Court 5', 'Court 5', 'Court 5']);
  });

  it('cancels an event: it stays listed, marked CANCELLED, without RSVP buttons', async () => {
    const { fixture, el, buttons } = await render('kim-alvarez');
    el.querySelector<HTMLButtonElement>('aura-event-card button')?.click();
    await fixture.whenStable();
    buttons('EDIT EVENT')[0].click();
    await fixture.whenStable();
    buttons('CANCEL EVENT')[0].click();
    await fixture.whenStable();
    buttons('CANCEL EVENT')[0].click();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    const card = el.querySelectorAll('aura-event-card')[0];
    expect(card.textContent).toContain('CANCELLED');
    expect(card.textContent).not.toContain('GOING');
    expect(TestBed.inject(Toaster).message()?.text).toBe('Cancelled: Practice');
  });

  it('shows a past season’s events read-only', async () => {
    const { fixture, el, buttons } = await render('sam');
    const club = TestBed.inject(ClubStore);
    const old = club.season()!;
    await club.startSeason({ name: 'Next', teams: [] });
    await fixture.whenStable();
    expect(el.querySelectorAll('aura-event-card')).toHaveLength(0);
    expect(buttons('+ EVENT')).toHaveLength(1);

    Array.from(el.querySelectorAll<HTMLButtonElement>('[role=radio]'))
      .find((b) => b.textContent?.trim() === old.name.toUpperCase())
      ?.click();
    await fixture.whenStable();
    expect(el.textContent).toContain(`${old.name} has ended`);
    expect(buttons('+ EVENT')).toHaveLength(0);
    // Past and still-undated events alike: no RSVP buttons.
    expect(el.querySelectorAll('aura-event-card')).not.toHaveLength(0);
    expect(buttons('GOING')).toHaveLength(0);
    expect(el.querySelector('aura-event-card .badge')?.textContent).toMatch(/^U\d+[BG]$|^CLUB$/);
  });
});
