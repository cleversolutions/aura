import { TestBed } from '@angular/core/testing';
import { PlayerProfile } from '@aura/shared/models';
import { InviteForm, PlayerProfileForm, TeamForm } from './forms';
import { CopiedValue, MemberInvited } from './member-invited';
import { TeamCard } from './people';

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
    parentId: 'jordan',
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
