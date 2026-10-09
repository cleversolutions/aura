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
});
