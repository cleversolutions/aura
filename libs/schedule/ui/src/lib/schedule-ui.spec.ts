import { TestBed } from '@angular/core/testing';
import { ClubEventDraft } from '@aura/shared/models';
import { EventDetail, EventDetailVm, RsvpConfirmation } from './event-detail';
import { EventForm, validateEventDraft } from './event-form';

const click = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
    .find((b) => b.textContent?.includes(text))
    ?.click();

const detailVm: EventDetailVm = {
  type: 'special',
  title: 'Club Awards Night',
  sheetTitle: 'SPECIAL · CLUB-WIDE',
  when: 'Date & time TBD',
  homeAway: null,
  location: 'Spartan Centre Hall',
  notes: '',
  finalScore: null,
  scoreEntry: null,
  rsvp: {
    heading: 'RSVP FOR WHICH PLAYERS?',
    pickPlayers: true,
    attendees: [
      { id: 'maya', name: 'Maya Smith', jersey: '8', status: 'going' },
      { id: 'eli', name: 'Eli Smith', jersey: '1', status: undefined },
    ],
  },
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

  it('shows statuses and emits the selected players', async () => {
    const { fixture, el, confirmed } = await render(detailVm);
    expect(el.textContent).toContain('No notes.');
    expect(el.textContent).toContain('UNDECIDED');

    click(el, 'Maya Smith');
    await fixture.whenStable();
    click(el, 'CONFIRM OUT');
    expect(confirmed).toEqual([{ attendeeIds: ['eli'], status: 'out' }]);
  });

  it('confirms for the user themself without a picker', async () => {
    const self = {
      ...detailVm,
      rsvp: { heading: 'YOUR RSVP', pickPlayers: false, attendees: [detailVm.rsvp!.attendees[1]] },
    };
    const { el, confirmed } = await render(self);
    expect(el.textContent).toContain('Current: UNDECIDED');
    click(el, 'Mark undecided');
    expect(confirmed).toEqual([{ attendeeIds: ['eli'], status: null }]);
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

    click(el, 'CREATE EVENT');
    await fixture.whenStable();
    expect(submitted).not.toHaveBeenCalled();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Pick a date and time, or mark TBD.');

    click(el, 'Date & time TBD');
    const location = el.querySelector<HTMLInputElement>('input[placeholder="Gym, court, or address"]');
    if (!location) throw new Error('location input missing');
    location.value = 'Court 4';
    location.dispatchEvent(new Event('input'));
    click(el, 'CREATE EVENT');
    expect(submitted).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'practice', team: 'U12G', tbd: true, location: 'Court 4' }),
    );
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
  });
});
