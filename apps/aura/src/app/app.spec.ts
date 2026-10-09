import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { MockBackendOptions, PANTHERS_SLUG, SPARTANS_SLUG, provideTestBackend } from '@aura/backend/mock';
import { ClubStore } from '@aura/club/data-access';
import { Viewport } from '@aura/shared/util';
import { App } from './app';
import { appRoutes } from './app.routes';

function setup(options: Partial<MockBackendOptions> = {}, wide = false) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(appRoutes, withComponentInputBinding()),
      provideTestBackend(options),
      { provide: Viewport, useValue: { wide: signal(wide) } },
    ],
  });
  return TestBed.createComponent(App);
}

/** Lets guards, store loads and effects finish. */
async function settle(fixture: ComponentFixture<App>) {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  }
}

async function open(fixture: ComponentFixture<App>, url: string) {
  await TestBed.inject(Router).navigateByUrl(url);
  await settle(fixture);
  return { el: fixture.nativeElement as HTMLElement, url: TestBed.inject(Router).url };
}

function type(el: HTMLElement, selector: string, value: string) {
  const input = el.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`${selector} missing`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('App', () => {
  beforeEach(() => localStorage.clear());

  it('offers the demo clubs at / and flags unknown club links', async () => {
    const fixture = setup();
    let { el } = await open(fixture, '/');
    expect(el.textContent).toContain('DEMO CLUBS');
    expect(el.textContent).toContain('Panthers');

    ({ el } = await open(fixture, '/zzzz99/schedule'));
    expect(TestBed.inject(Router).url).toBe('/?missing=zzzz99');
    expect(el.querySelector('[role=alert]')?.textContent).toContain('There is no club at /zzzz99');
  });

  it('opens a club link on the schedule with the tab bar and unread chat badge', async () => {
    const fixture = setup();
    const { el, url } = await open(fixture, `/${SPARTANS_SLUG}`);

    expect(url).toBe(`/${SPARTANS_SLUG}/schedule`);
    expect(el.querySelector('nav[aria-label="Main"]')?.textContent).toContain('Schedule');
    expect(el.querySelectorAll('aura-event-card').length).toBeGreaterThan(0);
    expect(el.querySelector(`nav a[href="/${SPARTANS_SLUG}/chat"]`)?.textContent).toContain('6');
  });

  it('returns to the last club opened from /', async () => {
    const fixture = setup();
    await open(fixture, `/${SPARTANS_SLUG}/roster`);
    const { url } = await open(fixture, '/');
    expect(url).toBe(`/${SPARTANS_SLUG}/schedule`);
  });

  it('keeps the thread list inside the tab shell and shows a thread full-screen', async () => {
    const fixture = setup();
    let { el } = await open(fixture, `/${SPARTANS_SLUG}/chat`);
    expect(el.querySelector('nav[aria-label="Main"]')).not.toBeNull();
    expect(el.querySelector('aura-chat-list-page')?.textContent).toContain('Carpool · Thursday');

    ({ el } = await open(fixture, `/${SPARTANS_SLUG}/chat/carpool`));
    expect(el.querySelector('nav[aria-label="Main"]')).toBeNull();
    expect(el.querySelector('h1')?.textContent).toContain('Carpool');
    expect(el.textContent).toContain('Pickup 5:30?');
  });

  it('signs in to a club with its own colours, keeping usernames per club', async () => {
    const fixture = setup({ initialUserId: null });
    let { el, url } = await open(fixture, `/${PANTHERS_SLUG}/chat`);
    expect(url).toBe(`/${PANTHERS_SLUG}/sign-in`);
    expect(el.querySelector('h1')?.textContent).toContain('Panthers');
    expect(document.documentElement.style.getPropertyValue('--color-ink')).toBe('#1d2a6b');
    expect(document.documentElement.style.getPropertyValue('--color-paper')).toBe('#f6c945');

    type(el, 'input[name=username]', 'sam@spartans.example');
    type(el, 'input[name=password]', 'password');
    el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
    await settle(fixture);
    expect(el.querySelector('[role=alert]')?.textContent).toContain('don’t match an account at this club');

    type(el, 'input[name=username]', 'jordan.smith@email.com');
    el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
    await settle(fixture);
    expect(TestBed.inject(Router).url).toBe(`/${PANTHERS_SLUG}/schedule`);
    expect(
      TestBed.inject(ClubStore)
        .myPlayers()
        .map((p) => p.name),
    ).toEqual(['Sky Smith']);

    ({ el, url } = await open(fixture, `/${SPARTANS_SLUG}`));
    expect(url).toBe(`/${SPARTANS_SLUG}/sign-in`);
    expect(document.documentElement.style.getPropertyValue('--color-ink')).toBe('#000000');
  });

  it('sends the platform admin to sign in', async () => {
    const fixture = setup();
    const { el, url } = await open(fixture, '/admin');
    expect(url).toBe('/admin/sign-in');
    expect(el.textContent).toContain('Platform admin');
  });

  it('lists clubs for the platform admin and previews one with sample data', async () => {
    const fixture = setup({ platformSignedIn: true, initialUserId: null });
    let { el } = await open(fixture, '/admin');
    expect(el.querySelectorAll('aura-club-card')).toHaveLength(2);
    expect(el.textContent).toContain(`/${PANTHERS_SLUG}`);

    ({ el } = await open(fixture, '/admin/clubs/panthers'));
    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('OPEN APP PREVIEW'))
      ?.click();
    await settle(fixture);
    expect(TestBed.inject(Router).url).toBe(`/${PANTHERS_SLUG}/schedule`);
    expect(el.textContent).toContain('Preview · sample data');
    expect(document.documentElement.style.getPropertyValue('--color-ink')).toBe('#1d2a6b');

    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'EXIT')
      ?.click();
    await settle(fixture);
    expect(TestBed.inject(Router).url).toBe('/admin/clubs/panthers');
    expect(document.documentElement.style.getPropertyValue('--color-ink')).toBe('#000000');
  });

  describe('on wide screens', () => {
    it('shows the side nav with the club name and signed-in user', async () => {
      const fixture = setup({}, true);
      const { el } = await open(fixture, `/${SPARTANS_SLUG}/schedule`);
      const navs = el.querySelectorAll('nav[aria-label="Main"]');

      expect(navs).toHaveLength(1);
      expect(navs[0].textContent).toContain('Spartans');
      expect(navs[0].textContent).toContain('Jordan Smith');
      expect(navs[0].querySelector(`a[href="/${SPARTANS_SLUG}/chat"]`)?.textContent).toContain('6');
    });

    it('shows a thread beside the list, keeping the nav', async () => {
      const fixture = setup({}, true);
      let { el } = await open(fixture, `/${SPARTANS_SLUG}/chat`);
      expect(el.textContent).toContain('Select a thread to read messages.');

      ({ el } = await open(fixture, `/${SPARTANS_SLUG}/chat/carpool`));
      expect(el.querySelector('nav[aria-label="Main"]')).not.toBeNull();
      expect(el.querySelectorAll('aura-thread-list-item').length).toBeGreaterThan(0);
      expect(el.querySelector('aura-thread-list-item a[aria-current="page"]')?.textContent).toContain('Carpool');
      expect(el.textContent).toContain('Pickup 5:30?');
      expect(el.textContent).not.toContain('Select a thread to read messages.');
    });
  });
});
