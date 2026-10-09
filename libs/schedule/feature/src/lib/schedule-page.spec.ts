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
    buttons('CREATE EVENT')[0].click();
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Pick a date and time, or mark TBD.');
  });
});
