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
    expect(el.textContent).toContain('Has own sign-in · eli.smith@email.com');
    expect(el.textContent).toContain('LINK NEW PLAYER');
    expect(el.textContent).not.toContain('CLUB TEAMS');
  });

  it('counts a single linked player in the singular', async () => {
    const { el } = await render('wei-chen');
    expect(el.textContent).toContain('Parent · 1 linked player');
    expect(el.textContent).not.toContain('1 linked players');
  });

  it('shows club staff every team and team creation', async () => {
    const { el } = await render('sam');
    expect(el.textContent).toContain('CLUB TEAMS');
    expect(el.textContent).toContain('+ CREATE TEAM');
    expect(el.querySelectorAll('.tile')).toHaveLength(5);
  });

  it('lets club staff choose who posts in announcement channels', async () => {
    const { fixture, club, el } = await render('sam');
    const click = (text: string) =>
      Array.from(el.querySelectorAll('button'))
        .find((b) => b.textContent?.includes(text))
        ?.click();
    expect(el.textContent).toContain('CLUB SETTINGS');
    expect(el.textContent).toContain('Staff post, everyone reads');
    click('Announcements');
    await fixture.whenStable();
    click('EVERYONE');
    click('SAVE');
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(club.settings()).toEqual({ announcements: 'everyone', contacts: 'staff' });
    expect(el.textContent).toContain('Everyone posts');
    expect(el.querySelector('aura-club-settings-form')).toBeNull();
  });

  it('hides club settings from everyone else', async () => {
    expect((await render('dana')).el.textContent).not.toContain('CLUB SETTINGS');
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
    const nameField = () => el.querySelector<HTMLInputElement>('aura-team-form input[placeholder^="e.g."]')!;

    click('+ CREATE TEAM');
    await fixture.whenStable();
    click('U13');
    click('GIRLS');
    await fixture.whenStable();
    expect(nameField().value).toBe('U13 Girls');
    pickStaff('Dana Reyes');
    click('CREATE TEAM');
    await fixture.whenStable();
    const created = club.teams().find((t) => t.name === 'U13 Girls');
    expect(created).toMatchObject({ age: 'U13', division: 'Girls', season: club.season()?.id });
    expect(created?.id).not.toBe('U13G');
    expect(club.user('dana')?.teams).toContain(created?.id);
    expect(el.querySelector('aura-team-form')).toBeNull();

    click('+ CREATE TEAM');
    await fixture.whenStable();
    click('U13');
    click('GIRLS');
    click('CREATE TEAM');
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('U13 Girls already exists this season.');
  });

  it('creates a team without staff and with a name the pickers can’t express', async () => {
    const { fixture, club, el } = await render('sam');
    const click = (text: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.trim() === text)
        ?.click();
    click('+ CREATE TEAM');
    await fixture.whenStable();
    click('U11');
    click('BOYS');
    await fixture.whenStable();
    const name = el.querySelector<HTMLInputElement>('aura-team-form input[placeholder^="e.g."]')!;
    name.value = 'U11 Boys Red';
    name.dispatchEvent(new Event('input'));
    // Picking another division no longer changes a typed name.
    click('MIXED');
    click('CREATE TEAM');
    await fixture.whenStable();
    expect(club.teams().find((t) => t.name === 'U11 Boys Red')).toMatchObject({ age: 'U11', division: 'Mixed' });
    expect(el.querySelector('aura-team-form')).toBeNull();
  });

  it('lets club staff rename a team and change its staff', async () => {
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
    const name = el.querySelector<HTMLInputElement>('aura-team-form input[placeholder^="e.g."]')!;
    expect(name.value).toBe('U10 Boys');
    expect(pressed('Chris Bell')).toBe('true');

    await toggleStaff('Chris Bell');
    await toggleStaff('Dana Reyes');
    expect(pressed('Chris Bell')).toBe('false');
    expect(pressed('Dana Reyes')).toBe('true');
    name.value = 'U10 Boys Blue';
    name.dispatchEvent(new Event('input'));

    click('SAVE TEAM');
    await fixture.whenStable();
    expect(club.teamName('U10B')).toBe('U10 Boys Blue');
    expect(club.user('dana')?.teams).toContain('U10B');
    expect(club.user('chris-bell')?.teams).not.toContain('U10B');
  });

  it('deletes only a team with no players and no events', async () => {
    const { fixture, club, el } = await render('sam');
    const click = (text: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.trim() === text)
        ?.click();
    const openTeam = async (name: string) => {
      Array.from(el.querySelectorAll<HTMLElement>('aura-team-card'))
        .find((c) => c.textContent?.includes(name))
        ?.querySelector<HTMLElement>('button')
        ?.click();
      await fixture.whenStable();
    };

    await openTeam('U10 Boys');
    click('DELETE TEAM');
    await fixture.whenStable();
    click('DELETE');
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('no players and no events');
    click('BACK');
    el.querySelector<HTMLButtonElement>('aura-team-form button[aria-label=Close]')?.click();
    await fixture.whenStable();

    await club.saveTeam({ name: 'U8 Mixed', staffIds: [] });
    await fixture.whenStable();
    await openTeam('U8 Mixed');
    click('DELETE TEAM');
    await fixture.whenStable();
    click('DELETE');
    await fixture.whenStable();
    expect(club.teams().some((t) => t.name === 'U8 Mixed')).toBe(false);
    expect(el.querySelector('aura-team-form')).toBeNull();
  });

  it('starts a new season, carrying teams over a year older', async () => {
    const { fixture, club, el } = await render('sam');
    const click = (text: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.trim() === text)
        ?.click();
    const old = club.season()!;
    expect(el.textContent).toContain(`${old.name} · current`);

    click('START NEW SEASON');
    await fixture.whenStable();
    const form = el.querySelector('aura-start-season-form')!;
    const names = Array.from(form.querySelectorAll<HTMLInputElement>('input[aria-label^="New name"]'));
    expect(names.map((i) => i.value)).toContain('U11 Boys');
    // U18 Boys ends with the old season.
    Array.from(form.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'))
      .find((b) => b.textContent?.includes('U18 Boys'))
      ?.click();
    await fixture.whenStable();
    const next = form.querySelector<HTMLInputElement>('input[placeholder="e.g. 2027–28"]')!.value;
    click(`START ${next}`);
    await fixture.whenStable();
    expect(form.textContent).toContain(`End ${old.name} and start ${next} with 4 teams?`);
    click('START SEASON');
    await fixture.whenStable();

    expect(club.season()?.name).toBe(next);
    expect(club.pastSeasons().map((s) => s.name)).toEqual([old.name]);
    expect(
      club
        .teams()
        .map((t) => t.name)
        .sort(),
    ).toEqual(['U11 Boys', 'U13 Girls', 'U15 Boys', 'U17 Girls']);
    expect(club.teamName('U18B')).toBe('U18 Boys');
    const u11 = club.teams().find((t) => t.name === 'U11 Boys')!;
    expect(club.user('chris-bell')?.teams).toEqual([u11.id]);
    expect(club.profiles().filter((p) => p.team === u11.id).length).toBeGreaterThan(0);
    expect(el.querySelector('aura-start-season-form')).toBeNull();
    expect(el.textContent).toContain(`${old.name}`);
    expect(el.textContent).toContain('read-only');
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
