import { TestBed } from '@angular/core/testing';
import { PlayerProfile } from '@aura/shared/models';
import { AddPlayerForm, InviteForm, MemberForm, PlayerProfileForm, TeamForm } from './forms';
import { CopiedValue, MemberInvited } from './member-invited';
import { TeamCard } from './people';
import { PersonDetails, PersonDetailsVm } from './person-details';

const click = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
    .find((b) => b.textContent?.includes(text))
    ?.click();

function type(el: HTMLElement, selector: string, value: string) {
  const input = el.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`missing ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('InviteForm', () => {
  async function render() {
    const fixture = TestBed.createComponent(InviteForm);
    fixture.componentRef.setInput('teamOptions', [
      { value: 'U12G', label: 'U12 Girls' },
      { value: 'U14B', label: 'U14 Boys' },
    ]);
    fixture.componentRef.setInput('initialTeam', 'U12G');
    fixture.componentRef.setInput('linkedThreadCounts', {
      U12G: { parent: 3, player: 3, staff: 4 },
      U14B: { parent: 1, player: 1, staff: 2 },
    });
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('describes the threads the person will join for the chosen team and role', async () => {
    const { fixture, el } = await render();
    expect(el.textContent).toContain('added to U12 Girls and automatically join 3 team-linked threads');
    click(el, 'U14 Boys');
    click(el, 'Team Staff');
    await fixture.whenStable();
    expect(el.textContent).toContain('added to U14 Boys and automatically join 2 team-linked threads');
  });

  it('validates, then emits the invite', async () => {
    const { fixture, el } = await render();
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);

    type(el, 'input[placeholder="First and last name"]', 'Pat Lee');
    type(el, 'input[type=email]', 'pat');
    click(el, 'SEND INVITE');
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Enter a valid email.');

    type(el, 'input[type=email]', 'pat@example.com');
    click(el, 'SEND INVITE');
    expect(submitted).toHaveBeenCalledWith({ team: 'U12G', kind: 'parent', name: 'Pat Lee', email: 'pat@example.com' });
  });
});

describe('TeamForm', () => {
  it('names a new team from age and division and requires staff', async () => {
    const fixture = TestBed.createComponent(TeamForm);
    fixture.componentRef.setInput('staffOptions', [{ id: 'dana', name: 'Dana Reyes', sub: 'Currently: U12G' }]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);

    click(el, 'U15');
    click(el, 'BOYS');
    click(el, 'CREATE TEAM');
    await fixture.whenStable();
    expect(el.textContent).toContain('U15 Boys');
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Assign at least one team staff member.');

    click(el, 'Dana Reyes');
    click(el, 'CREATE TEAM');
    expect(submitted).toHaveBeenCalledWith({ name: 'U15 Boys', staffIds: ['dana'], newStaff: undefined });
  });
});

describe('PlayerProfileForm', () => {
  const eli: PlayerProfile = {
    id: 'eli',
    name: 'Eli Smith',
    jersey: '1',
    team: 'U18B',
    parentIds: ['jordan'],
    userId: 'eli',
    login: 'eli.smith@email.com',
  };

  it('only offers a separate login when asked to', async () => {
    const fixture = TestBed.createComponent(PlayerProfileForm);
    fixture.componentRef.setInput('player', eli);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain("PLAYER'S OWN LOGIN");

    fixture.componentRef.setInput('showLogin', true);
    await fixture.whenStable();
    expect(el.querySelector<HTMLInputElement>('input[type=email]')?.value).toBe('eli.smith@email.com');
  });
});

describe('TeamCard', () => {
  it('emits when opened', async () => {
    const fixture = TestBed.createComponent(TeamCard);
    fixture.componentRef.setInput('vm', { id: 'U12G', name: 'U12 Girls', counts: '9 players', staff: 'Staff: Dana' });
    await fixture.whenStable();
    const opened = vi.fn();
    fixture.componentInstance.opened.subscribe(opened);
    click(fixture.nativeElement, 'U12 Girls');
    expect(opened).toHaveBeenCalled();
  });
});

describe('MemberInvited', () => {
  it('shows the sign-in details and copies each one, or all as a message', async () => {
    const fixture = TestBed.createComponent(MemberInvited);
    fixture.componentRef.setInput('vm', {
      name: 'Rae Moss',
      clubName: 'Spartans',
      url: 'https://aura.example/k3v9qp',
      username: 'rae@x.example',
      temporaryPassword: 'KMRT-a7bq-49',
    });
    const copied: CopiedValue[] = [];
    fixture.componentInstance.copied.subscribe((c) => copied.push(c));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('KMRT-a7bq-49');

    el.querySelector<HTMLButtonElement>('[aria-label="Copy temporary password"]')?.click();
    click(el, 'COPY INVITE MESSAGE');
    expect(copied[0]).toEqual({ label: 'Password', value: 'KMRT-a7bq-49' });
    expect(copied[1].value).toBe(
      "You're invited to Spartans on Aura. Open https://aura.example/k3v9qp and sign in as rae@x.example " +
        'with the temporary password KMRT-a7bq-49, then choose your own password.',
    );
  });
});

describe('MemberForm', () => {
  it('validates, then emits the details, with a title only when shown', async () => {
    const fixture = TestBed.createComponent(MemberForm);
    fixture.componentRef.setInput('member', { name: 'Sam Okoro', email: 'sam@x.example', title: 'Director' });
    fixture.componentRef.setInput('showTitle', true);
    const emitted: unknown[] = [];
    fixture.componentInstance.submitted.subscribe((v) => emitted.push(v));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    type(el, 'input[type=email]', 'not-an-email');
    click(el, 'SAVE');
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Enter a valid email.');

    type(el, 'input[type=email]', 'sam@new.example');
    click(el, 'SAVE');
    expect(emitted).toEqual([{ name: 'Sam Okoro', email: 'sam@new.example', title: 'Director' }]);
  });
});

describe('PersonDetails', () => {
  const vm = (o: Partial<PersonDetailsVm> = {}): PersonDetailsVm => ({
    name: 'Rae Moss',
    role: 'Parent',
    invited: false,
    canEdit: true,
    canManageInvite: false,
    fields: [
      { key: 'name', label: 'NAME', value: 'Rae Moss', editable: true, required: true, editOnly: true },
      { key: 'email', label: 'EMAIL', value: 'rae@x.example', editable: true, required: true, type: 'email' },
      { key: 'teams', label: 'TEAMS', value: 'U12 Girls', editable: false },
    ],
    ...o,
  });

  async function render(value: PersonDetailsVm) {
    const fixture = TestBed.createComponent(PersonDetails);
    fixture.componentRef.setInput('vm', value);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el };
  }

  it('shows details, then edits the editable fields in place', async () => {
    const { fixture, el } = await render(vm());
    const saved: unknown[] = [];
    fixture.componentInstance.saved.subscribe((v) => saved.push(v));
    expect(el.textContent).toContain('U12 Girls');
    expect(el.querySelector('input')).toBeNull();

    click(el, 'EDIT');
    await fixture.whenStable();
    expect(el.querySelectorAll('input')).toHaveLength(2);
    type(el, 'input[type=email]', 'nope');
    click(el, 'SAVE');
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Enter a valid email.');
    type(el, 'input[type=email]', 'rae@new.example');
    click(el, 'SAVE');
    expect(saved).toEqual([{ name: 'Rae Moss', email: 'rae@new.example' }]);

    fixture.componentRef.setInput('vm', vm({ fields: [] }));
    await fixture.whenStable();
    expect(el.querySelector('input')).toBeNull();
  });

  it('hides edit without permission and confirms cancelling an invite', async () => {
    const { fixture, el } = await render(vm({ canEdit: false, invited: true, canManageInvite: true }));
    const events: string[] = [];
    fixture.componentInstance.resend.subscribe(() => events.push('resend'));
    fixture.componentInstance.cancelInvite.subscribe(() => events.push('cancel'));
    expect(Array.from(el.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'EDIT')).toBe(false);

    click(el, 'RESEND INVITE');
    click(el, 'CANCEL INVITE');
    await fixture.whenStable();
    expect(events).toEqual(['resend']);
    click(el, 'KEEP');
    await fixture.whenStable();
    click(el, 'CANCEL INVITE');
    await fixture.whenStable();
    click(el, 'CANCEL INVITE');
    expect(events).toEqual(['resend', 'cancel']);
  });
});

describe('AddPlayerForm', () => {
  it('needs a parent or the player’s own email, then emits the player', async () => {
    const fixture = TestBed.createComponent(AddPlayerForm);
    fixture.componentRef.setInput('teamName', 'U11 Boys');
    fixture.componentRef.setInput('parentOptions', [
      { id: 'evan', name: 'Evan Moore', sub: 'Team Staff' },
      { id: 'jenn', name: 'Jenn Buell', sub: 'Parent' },
    ]);
    const emitted: unknown[] = [];
    fixture.componentInstance.submitted.subscribe((v) => emitted.push(v));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const add = () =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
        .filter((b) => b.textContent?.trim() === 'ADD PLAYER')[0]
        ?.click();

    type(el, 'input', 'Davis Moore');
    add();
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Choose a parent');

    click(el, 'Evan Moore');
    click(el, 'Jenn Buell');
    add();
    expect(emitted).toEqual([{ name: 'Davis Moore', jersey: '', parentIds: ['evan', 'jenn'] }]);

    click(el, 'Signs in themselves');
    await fixture.whenStable();
    type(el, 'input[type=email]', 'davis@x.example');
    add();
    expect(emitted[1]).toEqual({
      name: 'Davis Moore',
      jersey: '',
      parentIds: ['evan', 'jenn'],
      email: 'davis@x.example',
    });
  });
});
