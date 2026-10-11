import { TestBed } from '@angular/core/testing';
import { PlayerProfile } from '@aura/shared/models';
import { AddPlayerForm, ClubSettingsForm, InviteForm, MemberForm, PlayerProfileForm, TeamForm } from './forms';
import { SetupChecklist, StartSeasonForm } from './seasons';
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
    expect(el.textContent).toContain('added to U12 Girls and automatically join 3 chat threads');
    click(el, 'U14 Boys');
    click(el, 'Team Staff');
    await fixture.whenStable();
    expect(el.textContent).toContain('added to U14 Boys and automatically join 2 chat threads');
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

  it('offers club staff, with a title and no team, only when allowed', async () => {
    const { fixture, el } = await render();
    expect(el.textContent).not.toContain('Club Staff');
    fixture.componentRef.setInput('canInviteClubStaff', true);
    fixture.componentRef.setInput('clubStaffThreadCount', 1);
    await fixture.whenStable();
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);

    click(el, 'Club Staff');
    await fixture.whenStable();
    expect(el.textContent).not.toContain('U14 Boys');
    expect(el.textContent).toContain('automatically join 1 chat thread,');
    type(el, 'input[placeholder="First and last name"]', 'Tia Bank');
    type(el, 'input[type=email]', 'tia@example.com');
    type(el, 'input[placeholder^="e.g. Registrar"]', 'Treasurer');
    click(el, 'SEND INVITE');
    expect(submitted).toHaveBeenCalledWith({
      kind: 'club',
      title: 'Treasurer',
      name: 'Tia Bank',
      email: 'tia@example.com',
    });
  });
});

describe('InviteForm: someone already in the club', () => {
  it('adds an existing member to the chosen team instead of inviting them again', async () => {
    const fixture = TestBed.createComponent(InviteForm);
    fixture.componentRef.setInput('teamOptions', [
      { value: 'U12G', label: 'U12 Girls' },
      { value: 'U14B', label: 'U14 Boys' },
    ]);
    fixture.componentRef.setInput('initialTeam', 'U12G');
    fixture.componentRef.setInput('existingByTeam', {
      U12G: [],
      U14B: [{ id: 'wei', name: 'Wei Chen', sub: 'Parent · U12 Girls' }],
    });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const added = vi.fn();
    fixture.componentInstance.addedExisting.subscribe(added);

    click(el, 'ALREADY IN CLUB');
    await fixture.whenStable();
    expect(el.textContent).toContain('Everyone you can add is already on this team.');
    click(el, 'U14 Boys');
    await fixture.whenStable();
    click(el, 'ADD TO TEAM');
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Choose who to add.');
    click(el, 'Wei Chen');
    click(el, 'ADD TO TEAM');
    expect(added).toHaveBeenCalledWith({ team: 'U14B', userId: 'wei' });
  });

  it('only offers it when someone can be added', async () => {
    const fixture = TestBed.createComponent(InviteForm);
    fixture.componentRef.setInput('teamOptions', [{ value: 'U12G', label: 'U12 Girls' }]);
    fixture.componentRef.setInput('initialTeam', 'U12G');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('ALREADY IN CLUB');
  });
});

describe('ClubSettingsForm', () => {
  it('saves who sees contact details', async () => {
    const fixture = TestBed.createComponent(ClubSettingsForm);
    fixture.componentRef.setInput('settings', { announcements: 'staff', contacts: 'staff' });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    expect(el.textContent).toContain('Only staff see who is invited.');
    const everyone = Array.from(el.querySelectorAll<HTMLButtonElement>('[aria-labelledby=contacts-label] button')).find(
      (b) => b.textContent?.includes('EVERYONE'),
    );
    everyone?.click();
    await fixture.whenStable();
    click(el, 'SAVE');
    expect(submitted).toHaveBeenCalledWith({ announcements: 'staff', contacts: 'everyone' });
  });
});

describe('TeamForm', () => {
  const nameField = (el: HTMLElement) => el.querySelector<HTMLInputElement>('input[placeholder^="e.g."]')!;

  it('suggests a name from the optional age and division, and needs no staff', async () => {
    const fixture = TestBed.createComponent(TeamForm);
    fixture.componentRef.setInput('staffOptions', [{ id: 'dana', name: 'Dana Reyes', sub: 'Currently: U12 Girls' }]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);

    click(el, 'CREATE TEAM');
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Name the team');

    click(el, 'U15');
    click(el, 'BOYS');
    await fixture.whenStable();
    expect(nameField(el).value).toBe('U15 Boys');
    click(el, 'CREATE TEAM');
    expect(submitted).toHaveBeenLastCalledWith({
      name: 'U15 Boys',
      age: 'U15',
      division: 'Boys',
      staffIds: [],
      newStaff: undefined,
    });
    expect(el.textContent).not.toContain('DELETE TEAM');
  });

  it('keeps a typed name, and allows teams without an age or division', async () => {
    const fixture = TestBed.createComponent(TeamForm);
    fixture.componentRef.setInput('staffOptions', []);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);

    nameField(el).value = 'Masters';
    nameField(el).dispatchEvent(new Event('input'));
    click(el, 'ADULT');
    await fixture.whenStable();
    expect(nameField(el).value).toBe('Masters');
    click(el, 'CREATE TEAM');
    expect(submitted).toHaveBeenLastCalledWith({ name: 'Masters', age: 'Adult', staffIds: [], newStaff: undefined });
  });

  it('edits an existing team and confirms before deleting it', async () => {
    const fixture = TestBed.createComponent(TeamForm);
    fixture.componentRef.setInput('team', { name: 'U11 Boys', age: 'U11', division: 'Boys' });
    fixture.componentRef.setInput('staffOptions', [{ id: 'dana', name: 'Dana Reyes', sub: '' }]);
    fixture.componentRef.setInput('initialStaff', ['dana']);
    fixture.componentRef.setInput('canDelete', true);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const submitted = vi.fn();
    const deleted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.componentInstance.deleted.subscribe(deleted);

    expect(el.textContent).toContain('MANAGE TEAM');
    click(el, 'GIRLS');
    await fixture.whenStable();
    expect(nameField(el).value).toBe('U11 Boys');
    click(el, 'SAVE TEAM');
    expect(submitted).toHaveBeenLastCalledWith({
      name: 'U11 Boys',
      age: 'U11',
      division: 'Girls',
      staffIds: ['dana'],
      newStaff: undefined,
    });

    click(el, 'DELETE TEAM');
    await fixture.whenStable();
    expect(deleted).not.toHaveBeenCalled();
    click(el, 'DELETE');
    expect(deleted).toHaveBeenCalled();
  });
});

describe('StartSeasonForm', () => {
  it('carries teams over a year older, and confirms before ending the season', async () => {
    const fixture = TestBed.createComponent(StartSeasonForm);
    fixture.componentRef.setInput('currentName', '2026–27');
    fixture.componentRef.setInput('teams', [
      { id: 'U11B', name: 'U11 Boys Red', age: 'U11', division: 'Boys', counts: '9 players · 1 staff' },
      { id: 'masters', name: 'Masters', age: 'Adult', counts: '12 players · 0 staff' },
      { id: 'U18B', name: 'U18 Boys', age: 'U18', division: 'Boys', counts: '10 players · 1 staff' },
    ]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);

    expect(el.querySelector<HTMLInputElement>('input[placeholder="e.g. 2027–28"]')?.value).toBe('2027–28');
    const names = () => Array.from(el.querySelectorAll<HTMLInputElement>('input[aria-label^="New name"]'));
    expect(names().map((i) => i.value)).toEqual(['U12 Boys Red', 'Masters', 'U19 Boys']);

    // U18 Boys ends; Masters rebuilds without its players.
    Array.from(el.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'))
      .find((b) => b.textContent?.includes('U18 Boys'))
      ?.click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Ends with 2026–27');
    Array.from(el.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'))
      .filter((b) => b.textContent?.trim() === 'PLAYERS')[1]
      ?.click();
    await fixture.whenStable();

    click(el, 'START 2027–28');
    await fixture.whenStable();
    expect(submitted).not.toHaveBeenCalled();
    expect(el.textContent).toContain('End 2026–27 and start 2027–28 with 2 teams?');
    click(el, 'START SEASON');
    expect(submitted).toHaveBeenCalledWith({
      name: '2027–28',
      teams: [
        { from: 'U11B', name: 'U12 Boys Red', age: 'U12', division: 'Boys', staff: true, players: true },
        { from: 'masters', name: 'Masters', age: 'Adult', staff: true, players: false },
      ],
    });
  });

  it('asks for distinct names', async () => {
    const fixture = TestBed.createComponent(StartSeasonForm);
    fixture.componentRef.setInput('currentName', 'Spring');
    fixture.componentRef.setInput('teams', [
      { id: 'a', name: 'Red', counts: '' },
      { id: 'b', name: 'Blue', counts: '' },
    ]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    click(el, 'START SEASON');
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Name the new season.');

    const season = el.querySelector<HTMLInputElement>('input[placeholder="e.g. 2027–28"]')!;
    season.value = 'Fall';
    season.dispatchEvent(new Event('input'));
    const blue = el.querySelectorAll<HTMLInputElement>('input[aria-label^="New name"]')[1];
    blue.value = 'red';
    blue.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    click(el, 'START FALL');
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Give each team a different name.');
  });
});

describe('SetupChecklist', () => {
  it('shows progress and offers the open steps', async () => {
    const fixture = TestBed.createComponent(SetupChecklist);
    fixture.componentRef.setInput('steps', [
      { id: 'team', label: 'Create a team', detail: '', done: true, action: 'CREATE TEAM' },
      { id: 'coach', label: 'Invite a coach', detail: '', done: false, action: 'INVITE COACH' },
      { id: 'players', label: 'Add players', detail: 'Create a team first.', done: false, action: '' },
    ]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const started = vi.fn();
    fixture.componentInstance.started.subscribe(started);
    expect(el.textContent).toContain('GET STARTED · 1 OF 3');
    expect(Array.from(el.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['INVITE COACH']);
    click(el, 'INVITE COACH');
    expect(started).toHaveBeenCalledWith('coach');
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
  };

  it('has no sign-in field: staff give players their own sign-in from the roster', async () => {
    const fixture = TestBed.createComponent(PlayerProfileForm);
    fixture.componentRef.setInput('player', { ...eli, userId: null });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('input[type=email]')).toBeNull();
    expect(el.textContent).toContain('Ask the team staff');

    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    click(el, 'SAVE PLAYER');
    expect(submitted).toHaveBeenCalledWith({ name: 'Eli Smith', jersey: '1' });
  });
});

describe('TeamCard', () => {
  it('emits when opened', async () => {
    const fixture = TestBed.createComponent(TeamCard);
    fixture.componentRef.setInput('vm', {
      id: 't1',
      name: 'U12 Girls',
      badge: 'U12G',
      counts: '9 players',
      staff: 'Staff: Dana',
    });
    await fixture.whenStable();
    const opened = vi.fn();
    fixture.componentInstance.opened.subscribe(opened);
    expect(fixture.nativeElement.textContent).toContain('U12G');
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

  it('words a password reset as one', async () => {
    const fixture = TestBed.createComponent(MemberInvited);
    fixture.componentRef.setInput('vm', {
      name: 'Rae Moss',
      clubName: 'Spartans',
      url: 'https://aura.example/k3v9qp',
      username: 'rae@x.example',
      temporaryPassword: 'KMRT-a7bq-49',
      reset: true,
    });
    const copied: CopiedValue[] = [];
    fixture.componentInstance.copied.subscribe((c) => copied.push(c));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('PASSWORD RESET');
    click(el, 'COPY MESSAGE');
    expect(copied[0].value).toMatch(/^Your password for Spartans on Aura has been reset\. Open /);
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

  it('confirms resetting a password, disabling and removing a member', async () => {
    const { fixture, el } = await render(vm({ canResetPassword: true, canRemove: true }));
    const events: string[] = [];
    const c = fixture.componentInstance;
    c.resetPassword.subscribe(() => events.push('reset'));
    c.disable.subscribe(() => events.push('disable'));
    c.remove.subscribe(() => events.push('remove'));

    click(el, 'RESET PASSWORD');
    await fixture.whenStable();
    expect(el.textContent).toContain('Give Rae Moss a new temporary password?');
    expect(events).toEqual([]);
    click(el, 'RESET');
    click(el, 'BACK');
    await fixture.whenStable();
    click(el, 'DISABLE');
    await fixture.whenStable();
    click(el, 'DISABLE');
    click(el, 'BACK');
    await fixture.whenStable();
    click(el, 'REMOVE FROM CLUB');
    await fixture.whenStable();
    expect(el.textContent).toContain('Their messages stay, from “Former member”.');
    click(el, 'REMOVE');
    expect(events).toEqual(['reset', 'disable', 'remove']);
  });

  it('enables a disabled member without asking, and offers none of this for invites', async () => {
    const { fixture, el } = await render(vm({ canRemove: true, canResetPassword: true, disabled: true }));
    const enabled = vi.fn();
    fixture.componentInstance.enable.subscribe(enabled);
    click(el, 'ENABLE');
    expect(enabled).toHaveBeenCalled();

    fixture.componentRef.setInput('vm', vm({ canRemove: true, canResetPassword: true, invited: true }));
    await fixture.whenStable();
    expect(el.textContent).not.toContain('RESET PASSWORD');
    expect(el.textContent).not.toContain('REMOVE FROM CLUB');
  });
});

describe('PersonDetails: players', () => {
  const player = (o: Partial<PersonDetailsVm> = {}): PersonDetailsVm => ({
    name: 'Kai Chen',
    role: 'Player · #– · U12 Girls',
    jersey: '–',
    invited: false,
    canEdit: true,
    canManageInvite: false,
    canManagePlayer: true,
    fields: [
      { key: 'name', label: 'NAME', value: 'Kai Chen', editable: true, required: true, editOnly: true },
      {
        key: 'team',
        label: 'TEAM',
        value: 'U12 Girls',
        editable: true,
        editOnly: true,
        choices: [
          { value: 'U12G', label: 'U12 Girls' },
          { value: 'U14B', label: 'U14 Boys' },
        ],
        selected: ['U12G'],
      },
    ],
    ...o,
  });

  async function render(value: PersonDetailsVm) {
    const fixture = TestBed.createComponent(PersonDetails);
    fixture.componentRef.setInput('vm', value);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('approves a link request, or rejects it after asking', async () => {
    const { fixture, el } = await render(player({ pending: true }));
    const events: string[] = [];
    fixture.componentInstance.approve.subscribe(() => events.push('approve'));
    fixture.componentInstance.removePlayer.subscribe(() => events.push('remove'));
    expect(el.textContent).not.toContain('REMOVE FROM ROSTER');
    click(el, 'APPROVE');
    click(el, 'REJECT');
    await fixture.whenStable();
    expect(el.textContent).toContain('Reject the request to add Kai Chen?');
    click(el, 'REJECT');
    expect(events).toEqual(['approve', 'remove']);
  });

  it('removes a player from the roster after asking', async () => {
    const { fixture, el } = await render(player());
    const removed = vi.fn();
    fixture.componentInstance.removePlayer.subscribe(removed);
    expect(el.textContent).not.toContain('APPROVE');
    click(el, 'REMOVE FROM ROSTER');
    await fixture.whenStable();
    expect(el.textContent).toContain('Their parents, and their own sign-in if they have one, stay in the club.');
    click(el, 'REMOVE');
    expect(removed).toHaveBeenCalled();
  });

  it('moves a player with the team chips', async () => {
    const { fixture, el } = await render(player());
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    click(el, 'EDIT');
    await fixture.whenStable();
    click(el, 'U14 Boys');
    await fixture.whenStable();
    click(el, 'SAVE');
    expect(saved).toHaveBeenCalledWith({ name: 'Kai Chen', team: 'U14B' });
  });

  it('gives a player their own sign-in with a valid email', async () => {
    const { fixture, el } = await render(player({ canGiveSignIn: true }));
    const given = vi.fn();
    fixture.componentInstance.giveSignIn.subscribe(given);
    click(el, 'GIVE OWN SIGN-IN');
    await fixture.whenStable();
    type(el, 'input[type=email]', 'kai');
    click(el, 'CREATE SIGN-IN');
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Enter the player’s email.');
    type(el, 'input[type=email]', 'kai@x.example');
    click(el, 'CREATE SIGN-IN');
    expect(given).toHaveBeenCalledWith('kai@x.example');
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

  it('invites a parent who isn’t listed', async () => {
    const fixture = TestBed.createComponent(AddPlayerForm);
    fixture.componentRef.setInput('teamName', 'U11 Boys');
    fixture.componentRef.setInput('parentOptions', []);
    const emitted: unknown[] = [];
    fixture.componentInstance.submitted.subscribe((v) => emitted.push(v));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const add = () =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
        .filter((b) => b.textContent?.trim() === 'ADD PLAYER')[0]
        ?.click();

    type(el, 'input', 'Liam Ortiz');
    click(el, 'Invite a parent');
    await fixture.whenStable();
    type(el, 'input[aria-label="Parent’s name"]', 'Rosa Ortiz');
    add();
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('valid email for the new parent');
    type(el, 'input[aria-label="Parent’s email"]', 'rosa@x.example');
    add();
    expect(emitted).toEqual([
      { name: 'Liam Ortiz', jersey: '', parentIds: [], newParent: { name: 'Rosa Ortiz', email: 'rosa@x.example' } },
    ]);
  });
});
