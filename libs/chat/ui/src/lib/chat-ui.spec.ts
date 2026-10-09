import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Team, Thread, User } from '@aura/shared/models';
import { ChatSettings } from './chat-settings';
import { MessageComposer } from './conversation';
import { ThreadForm, ThreadFormValue } from './thread-form';

const teams: Team[] = [
  { id: 'U12G', name: 'U12 Girls' },
  { id: 'U14B', name: 'U14 Boys' },
];
const users: User[] = [
  { id: 'dana', name: 'Dana Reyes', kind: 'staff', teams: ['U12G', 'U14B'] },
  { id: 'jordan', name: 'Jordan Smith', kind: 'parent', teams: ['U12G'] },
  { id: 'priya', name: 'Priya Patel', kind: 'parent', teams: ['U12G'] },
];

const buttons = (el: HTMLElement, selector = 'button') => Array.from(el.querySelectorAll<HTMLButtonElement>(selector));
const click = (el: HTMLElement, text: string, selector = 'button') =>
  buttons(el, selector)
    .find((b) => b.textContent?.includes(text))
    ?.click();

describe('ThreadForm', () => {
  async function render(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(ThreadForm);
    const ref = fixture.componentRef;
    ref.setInput('meId', 'dana');
    ref.setInput('creatorId', 'dana');
    ref.setInput('allTeams', teams);
    ref.setInput('users', users);
    ref.setInput('scopeOptions', [
      { value: 'U12G', label: 'U12 Girls' },
      { value: 'U14B', label: 'U14 Boys' },
    ]);
    for (const [k, v] of Object.entries(inputs)) ref.setInput(k, v);
    await fixture.whenStable();
    const submitted: ThreadFormValue[] = [];
    fixture.componentInstance.submitted.subscribe((v) => submitted.push(v));
    return { fixture, el: fixture.nativeElement as HTMLElement, submitted };
  }

  it('requires a name and members before creating', async () => {
    const { fixture, el, submitted } = await render();
    click(el, 'CREATE THREAD');
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Give the thread a name.');

    const name = el.querySelector<HTMLInputElement>('input[placeholder="e.g. Saturday carpool"]');
    if (!name) throw new Error('name input missing');
    name.value = 'Drivers';
    name.dispatchEvent(new Event('input'));
    click(el, 'CREATE THREAD');
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Add at least one team or person.');
    expect(submitted).toEqual([]);
  });

  it('emits the chosen teams and individuals', async () => {
    const { fixture, el, submitted } = await render();
    const name = el.querySelector<HTMLInputElement>('input[placeholder="e.g. Saturday carpool"]');
    if (!name) throw new Error('name input missing');
    name.value = 'Drivers';
    name.dispatchEvent(new Event('input'));
    click(el, 'U12 Girls', 'button.card-row');
    await fixture.whenStable();
    expect(el.textContent).toContain('Total in thread3');

    click(el, 'CREATE THREAD');
    expect(submitted).toEqual([
      {
        name: 'Drivers',
        scope: 'U12G',
        teams: ['U12G'],
        include: { staff: true, parents: true, players: true },
        members: [],
      },
    ]);
  });

  it('reports people already included through a team', async () => {
    const thread: Thread = {
      id: 't',
      name: 'Carpool',
      scope: 'U12G',
      teams: ['U12G'],
      include: { staff: false, parents: true, players: false },
      members: [],
      creatorId: 'dana',
      isDefault: false,
      messages: [],
      unread: 0,
    };
    const { fixture, el } = await render({ thread });
    const notices: unknown[] = [];
    fixture.componentInstance.alreadyIncluded.subscribe((n) => notices.push(n));
    click(el, 'Priya Patel', 'button.card-row');
    expect(notices).toEqual([{ person: 'Priya Patel', team: 'U12 Girls' }]);
  });

  it('closes instead of saving when locked', async () => {
    const { fixture, el, submitted } = await render({
      thread: {
        ...({} as Thread),
        id: 'g',
        name: '#general',
        scope: 'U12G',
        teams: ['U12G'],
        include: { staff: true, parents: true, players: true },
        members: [],
        creatorId: null,
        isDefault: true,
        messages: [],
        unread: 0,
      },
      locked: true,
      lockNote: 'Default team channel.',
    });
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    expect(el.textContent).toContain('ADDED INDIVIDUALLY');
    click(el, 'DONE');
    expect(closed).toHaveBeenCalled();
    expect(submitted).toEqual([]);
  });
});

describe('MessageComposer', () => {
  it('emits trimmed text and clears the field', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(MessageComposer);
    await fixture.whenStable();
    const sent: string[] = [];
    fixture.componentInstance.send.subscribe((t) => sent.push(t));
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input') as HTMLInputElement;
    const form = el.querySelector('form') as HTMLFormElement;

    form.dispatchEvent(new Event('submit'));
    input.value = '  On my way ';
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(sent).toEqual(['On my way']);
    expect(input.value).toBe('');
  });
});

describe('ChatSettings', () => {
  it('emits the toggled state', async () => {
    const fixture = TestBed.createComponent(ChatSettings);
    fixture.componentRef.setInput('settings', [{ threadId: 'carpool', label: 'U12G Carpool', on: true }]);
    await fixture.whenStable();
    const toggles: unknown[] = [];
    fixture.componentInstance.toggled.subscribe((t) => toggles.push(t));
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[role=switch]')?.click();
    expect(toggles).toEqual([{ threadId: 'carpool', on: false }]);
  });
});
