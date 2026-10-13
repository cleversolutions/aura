import { TestBed } from '@angular/core/testing';
import { ClubEventDraft } from '@aura/shared/models';
import { EventDetail, EventDetailVm, RsvpConfirmation } from './event-detail';
import { EventForm, validateEventDraft } from './event-form';

const click = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
    .find((b) => b.textContent?.includes(text))
    ?.click();

const type = (el: HTMLElement, selector: string, value: string) => {
  const input = el.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`${selector} missing`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
};

const detailVm: EventDetailVm = {
  type: 'special',
  title: 'Club Awards Night',
  sheetTitle: 'SPECIAL · CLUB-WIDE',
  when: 'Date & time TBD',
  homeAway: null,
  arriveBy: null,
  repeats: null,
  location: 'Spartan Centre Hall',
  mapUrl: null,
  notes: '',
  finalScore: null,
  scoreEntry: null,
  rsvp: {
    heading: 'RSVP FOR WHICH PLAYERS?',
    pickPlayers: true,
    attendees: [
      { id: 'maya', name: 'Maya Smith', detail: '#8', status: 'going', note: 'Late, 15 min' },
      { id: 'eli', name: 'Eli Smith', detail: '#1', status: undefined },
    ],
    note: 'Late, 15 min',
  },
  cancelled: false,
  attendance: null,
  canEdit: false,
};

describe('EventDetail', () => {
  async function render(vm: EventDetailVm) {
    const fixture = TestBed.createComponent(EventDetail);
    fixture.componentRef.setInput('vm', vm);
    await fixture.whenStable();
    const confirmed: RsvpConfirmation[] = [];
    fixture.componentInstance.confirmed.subscribe((c) => confirmed.push(c));
    return { fixture, el: fixture.nativeElement as HTMLElement, confirmed };
  }

  it('shows the arrive-by time, that it repeats, and a map link', async () => {
    const { el } = await render({
      ...detailVm,
      arriveBy: 'Arrive by 5:45 PM',
      repeats: 'Repeats weekly',
      mapUrl: 'https://maps.example/?q=Hall',
    });
    expect(el.textContent).toContain('Arrive by 5:45 PM');
    expect(el.textContent).toContain('Repeats weekly');
    const map = el.querySelector<HTMLAnchorElement>('a[aria-label="Map of Spartan Centre Hall"]');
    expect(map?.href).toBe('https://maps.example/?q=Hall');
    expect(map?.target).toBe('_blank');
  });

  it('shows statuses and emits the selected players', async () => {
    const { fixture, el, confirmed } = await render(detailVm);
    expect(el.textContent).toContain('No notes.');
    expect(el.textContent).toContain('UNDECIDED');

    expect(el.textContent).toContain('#8 · Late, 15 min');

    click(el, 'Maya Smith');
    await fixture.whenStable();
    const note = el.querySelector<HTMLInputElement>('input[placeholder="e.g. Late, 15 min"]');
    expect(note?.value).toBe('Late, 15 min');
    note!.value = ' Sick ';
    note!.dispatchEvent(new Event('input'));
    click(el, 'CONFIRM OUT');
    expect(confirmed).toEqual([{ attendeeIds: ['eli'], status: 'out', note: 'Sick' }]);
  });

  it('shows a cancelled event without RSVP controls', async () => {
    const { el } = await render({ ...detailVm, cancelled: true, rsvp: null });
    expect(el.textContent).toContain('CANCELLED');
    expect(el.textContent).not.toContain('CONFIRM GOING');
  });

  it('lists attendance by answer, with notes', async () => {
    const { el } = await render({
      ...detailVm,
      rsvp: null,
      attendance: {
        summary: '1 going · 1 out · 0 undecided',
        groups: [
          { label: 'GOING', people: [{ id: 'maya', name: 'Maya Smith', detail: '#8' }] },
          { label: 'OUT', people: [{ id: 'ava', name: 'Ava Chen', detail: '#4', note: 'Sick' }] },
        ],
      },
    });
    const section = el.querySelector('[aria-label=Attendance]');
    expect(section?.textContent).toContain('1 going · 1 out · 0 undecided');
    expect(section?.textContent).toContain('OUT · 1');
    expect(section?.textContent).toContain('Sick');
  });

  it('confirms for the user themself without a picker', async () => {
    const self = {
      ...detailVm,
      rsvp: { heading: 'YOUR RSVP', pickPlayers: false, attendees: [detailVm.rsvp!.attendees[1]], note: '' },
    };
    const { el, confirmed } = await render(self);
    expect(el.textContent).toContain('Current: UNDECIDED');
    click(el, 'Mark undecided');
    expect(confirmed).toEqual([{ attendeeIds: ['eli'], status: null, note: '' }]);
  });

  it('emits raw score values and edit requests', async () => {
    const vm: EventDetailVm = {
      ...detailVm,
      rsvp: null,
      canEdit: true,
      scoreEntry: { clubName: 'Spartans', opponent: 'Hawks', score: { us: 40, them: 30 } },
    };
    const { fixture, el } = await render(vm);
    const scores: unknown[] = [];
    const edits = vi.fn();
    fixture.componentInstance.scoreSaved.subscribe((s) => scores.push(s));
    fixture.componentInstance.edit.subscribe(edits);

    click(el, 'SAVE SCORE');
    click(el, 'EDIT EVENT');
    expect(scores).toEqual([{ us: '40', them: '30' }]);
    expect(edits).toHaveBeenCalled();
  });
});

describe('EventForm', () => {
  it('validates before emitting', async () => {
    const fixture = TestBed.createComponent(EventForm);
    fixture.componentRef.setInput('teamOptions', [{ value: 'U12G', label: 'U12 Girls' }]);
    fixture.componentRef.setInput('defaultTeam', 'U12G');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);

    click(el, 'CREATE · U12 GIRLS');
    await fixture.whenStable();
    expect(submitted).not.toHaveBeenCalled();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Pick a date and time, or mark TBD.');

    click(el, 'Date & time TBD');
    const location = el.querySelector<HTMLInputElement>('input[placeholder="Gym, court, or address"]');
    if (!location) throw new Error('location input missing');
    location.value = 'Court 4';
    location.dispatchEvent(new Event('input'));
    click(el, 'CREATE · U12 GIRLS');
    expect(submitted).toHaveBeenCalledWith({
      draft: expect.objectContaining({ type: 'practice', team: 'U12G', tbd: true, location: 'Court 4' }),
      scope: 'one',
    });
  });

  it('cancels, restores and deletes an event after confirming', async () => {
    const fixture = TestBed.createComponent(EventForm);
    const event = { id: 'e1', type: 'practice' as const, team: 'U12G', tbd: true, location: 'Gym', notes: '' };
    fixture.componentRef.setInput('teamOptions', [{ value: 'U12G', label: 'U12 Girls' }]);
    fixture.componentRef.setInput('event', event);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const cancelled: boolean[] = [];
    const deleted = vi.fn();
    fixture.componentInstance.cancelledChange.subscribe((c) => cancelled.push(c));
    fixture.componentInstance.deleted.subscribe(deleted);

    click(el, 'CANCEL EVENT');
    await fixture.whenStable();
    expect(el.textContent).toContain('stays on the schedule');
    expect(cancelled).toEqual([]);
    click(el, 'CANCEL EVENT');
    expect(cancelled).toEqual([true]);

    click(el, 'BACK');
    await fixture.whenStable();
    click(el, 'DELETE EVENT');
    await fixture.whenStable();
    click(el, 'DELETE');
    expect(deleted).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('event', { ...event, cancelled: true });
    await fixture.whenStable();
    click(el, 'BACK');
    await fixture.whenStable();
    click(el, 'RESTORE EVENT');
    expect(cancelled).toEqual([true, false]);
  });

  it('creates a weekly event until a date, with end and arrive-by times', async () => {
    const fixture = TestBed.createComponent(EventForm);
    fixture.componentRef.setInput('teamOptions', [{ value: 'U12G', label: 'U12 Girls' }]);
    fixture.componentRef.setInput('defaultTeam', 'U12G');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);

    type(el, 'input[aria-label=Date]', '2030-01-08');
    type(el, 'input[aria-label=Time]', '18:00');
    type(el, 'input[placeholder="Gym, court, or address"]', 'Northview');
    const [ends, arrive] = Array.from(el.querySelectorAll<HTMLInputElement>('input[type=time]')).slice(1);
    ends.value = '17:00';
    ends.dispatchEvent(new Event('input'));
    click(el, 'CREATE');
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('The end time must be after the start time.');

    ends.value = '19:30';
    ends.dispatchEvent(new Event('input'));
    arrive.value = '17:45';
    arrive.dispatchEvent(new Event('input'));
    click(el, 'Repeats weekly');
    await fixture.whenStable();
    type(el, 'input[min="2030-01-08"]', '2030-01-08');
    click(el, 'CREATE');
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('at least a week after');

    type(el, 'input[min="2030-01-08"]', '2030-02-26');
    await fixture.whenStable();
    expect(el.textContent).toContain('Every Tuesday: 8 practices.');
    click(el, 'CREATE');
    expect(submitted).toHaveBeenCalledWith({
      draft: expect.objectContaining({ date: '2030-01-08', time: '18:00', endTime: '19:30', arriveBy: '17:45' }),
      repeatUntil: '2030-02-26',
      scope: 'one',
    });
  });

  it('changes or deletes one week of a series, or later weeks too', async () => {
    const fixture = TestBed.createComponent(EventForm);
    const event = {
      id: 'e1',
      type: 'practice' as const,
      team: 'U12G',
      date: '2030-01-15',
      time: '18:00',
      location: 'Gym',
      notes: '',
      seriesId: 'r1',
    };
    fixture.componentRef.setInput('teamOptions', [{ value: 'U12G', label: 'U12 Girls' }]);
    fixture.componentRef.setInput('event', event);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const submitted = vi.fn();
    const deleted: string[] = [];
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.componentInstance.deleted.subscribe((d) => deleted.push(d));
    expect(el.textContent).not.toContain('Repeats weekly');

    click(el, 'LATER WEEKS TOO');
    await fixture.whenStable();
    click(el, 'SAVE CHANGES');
    expect(submitted).toHaveBeenCalledWith({ draft: expect.objectContaining({ id: 'e1' }), scope: 'following' });

    click(el, 'DELETE EVENT');
    await fixture.whenStable();
    expect(el.textContent).toContain('every later week');
    click(el, 'ALL LATER WEEKS');
    click(el, 'THIS WEEK');
    expect(deleted).toEqual(['following', 'one']);
  });

  it('shows the error passed in by the container', async () => {
    const fixture = TestBed.createComponent(EventForm);
    fixture.componentRef.setInput('teamOptions', []);
    fixture.componentRef.setInput('error', 'Could not save the event. Try again.');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role=alert]')?.textContent).toContain(
      'Could not save the event.',
    );
  });

  it('checks required fields per event type', () => {
    const base: ClubEventDraft = { type: 'game', team: 'U12G', tbd: true, location: 'Gym', notes: '' };
    expect(validateEventDraft(base)).toBe('Add the opponent.');
    expect(validateEventDraft({ ...base, type: 'special' })).toBe('Add a title.');
    expect(validateEventDraft({ ...base, opponent: 'Hawks', location: ' ' })).toBe('Add a location.');
    expect(validateEventDraft({ ...base, opponent: 'Hawks' })).toBeNull();
    const timed: ClubEventDraft = { ...base, opponent: 'Hawks', tbd: false, date: '2030-01-08', time: '18:00' };
    expect(validateEventDraft({ ...timed, endTime: '18:00' })).toBe('The end time must be after the start time.');
    expect(validateEventDraft({ ...timed, arriveBy: '18:05' })).toBe(
      'The arrive-by time can’t be after the start time.',
    );
    expect(validateEventDraft({ ...timed, endTime: '19:30', arriveBy: '17:45' })).toBeNull();
  });
});
