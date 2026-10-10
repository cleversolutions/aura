import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestBackend } from '@aura/backend/mock';
import { ClubStore } from '@aura/club/data-access';
import { AccountPage } from './account-page';

async function render(initialUserId: string) {
  TestBed.configureTestingModule({ providers: [provideTestBackend({ initialUserId }), provideRouter([])] });
  const club = TestBed.inject(ClubStore);
  await club.load();
  const fixture = TestBed.createComponent(AccountPage);
  await fixture.whenStable();
  return { fixture, club, el: fixture.nativeElement as HTMLElement };
}

describe('AccountPage', () => {
  it('shows parents their linked players', async () => {
    const { el } = await render('jordan');
    expect(el.querySelector('h1')?.textContent).toContain('Jordan Smith');
    expect(el.textContent).toContain('Parent · 2 linked players');
    expect(el.textContent).toContain('PLAYER ACCESS');
    expect(el.textContent).toContain('Has own login · eli.smith@email.com');
    expect(el.textContent).toContain('LINK NEW PLAYER');
    expect(el.textContent).not.toContain('CLUB TEAMS');
  });

  it('shows club staff every team and team creation', async () => {
    const { el } = await render('sam');
    expect(el.textContent).toContain('CLUB TEAMS');
    expect(el.textContent).toContain('+ CREATE TEAM');
    expect(el.querySelectorAll('.tile')).toHaveLength(5);
  });

  it('switches demo accounts', async () => {
    const { fixture, club, el } = await render('jordan');
    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Dana · Team Staff'))
      ?.click();
    await fixture.whenStable();
    expect(club.persona()).toBe('teamStaff');
    expect(el.textContent).toContain('MY TEAMS');
  });

  it('creates a team and reports duplicates from the backend', async () => {
    const { fixture, club, el } = await render('sam');
    const click = (text: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.trim() === text)
        ?.click();
    const pickStaff = (name: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('aura-team-form button.card-row'))
        .find((b) => b.textContent?.includes(name))
        ?.click();

    click('+ CREATE TEAM');
    await fixture.whenStable();
    pickStaff('Dana Reyes');
    click('CREATE TEAM');
    await fixture.whenStable();
    expect(club.teamName('U13G')).toBe('U13 Girls');
    expect(el.querySelector('aura-team-form')).toBeNull();

    click('+ CREATE TEAM');
    await fixture.whenStable();
    pickStaff('Dana Reyes');
    click('CREATE TEAM');
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('U13 Girls already exists.');
  });

  it('lets club staff add and remove an existing team’s staff', async () => {
    const { fixture, club, el } = await render('sam');
    const click = (text: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.trim() === text)
        ?.click();
    const toggleStaff = async (name: string) => {
      Array.from(el.querySelectorAll<HTMLButtonElement>('aura-team-form button.card-row'))
        .find((b) => b.textContent?.includes(name))
        ?.click();
      await fixture.whenStable();
    };
    const pressed = (name: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('aura-team-form button.card-row'))
        .find((b) => b.textContent?.includes(name))
        ?.getAttribute('aria-pressed');

    el.querySelector<HTMLElement>('aura-team-card button, aura-team-card [role=button], .tile')?.click();
    await fixture.whenStable();
    expect(el.querySelector('aura-team-form')?.textContent).toContain('U10 Boys');
    expect(pressed('Chris Bell')).toBe('true');

    await toggleStaff('Chris Bell');
    await toggleStaff('Dana Reyes');
    expect(pressed('Chris Bell')).toBe('false');
    expect(pressed('Dana Reyes')).toBe('true');

    click('SAVE STAFF');
    await fixture.whenStable();
    expect(club.user('dana')?.teams).toContain('U10B');
    expect(club.user('chris-bell')?.teams).not.toContain('U10B');
  });

  it('edits my own profile', async () => {
    const { fixture, club, el } = await render('sam');
    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'EDIT PROFILE')
      ?.click();
    await fixture.whenStable();
    const title = Array.from(el.querySelectorAll<HTMLInputElement>('aura-member-form input')).at(-1)!;
    title.value = 'Club President';
    title.dispatchEvent(new Event('input'));
    Array.from(el.querySelectorAll('aura-member-form button'))
      .find((b) => b.textContent?.trim() === 'SAVE')
      ?.dispatchEvent(new Event('click'));
    await fixture.whenStable();
    expect(club.me()?.title).toBe('Club President');
    expect(el.querySelector('aura-member-form')).toBeNull();
    expect(el.textContent).toContain('Club Staff · Club President');
  });
});
