import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideMockBackend } from '@aura/backend/mock';
import { ChatStore } from '@aura/chat/data-access';
import { ClubStore } from '@aura/club/data-access';
import { ScheduleStore } from '@aura/schedule/data-access';
import { CLOCK } from '@aura/shared/util';
import { App } from './app';
import { appRoutes } from './app.routes';

/** The root component triggers these loads; the harness renders routes without it. */
async function loadStores() {
  await TestBed.inject(ClubStore).load();
  await Promise.all([TestBed.inject(ChatStore).load(), TestBed.inject(ScheduleStore).load()]);
}

describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(appRoutes, withComponentInputBinding()),
        provideMockBackend({ latencyMs: 0, replyDelayMs: 0 }),
        { provide: CLOCK, useValue: () => new Date('2026-10-05T12:00:00') },
      ],
    });
  });

  it('shows the routed page once the directory has loaded', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('LOADING');
    await TestBed.inject(ClubStore).load();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });

  it('opens on the schedule with the tab bar and unread chat badge', async () => {
    await loadStores();
    const harness = await RouterTestingHarness.create('/');
    await harness.fixture.whenStable();
    const el = harness.routeNativeElement as HTMLElement;

    expect(el.querySelector('nav[aria-label="Main"]')?.textContent).toContain('Schedule');
    expect(el.textContent).toContain('UPCOMING');
    expect(el.querySelectorAll('aura-event-card').length).toBeGreaterThan(0);
    expect(el.querySelector('nav a[href="/chat"]')?.textContent).toContain('6');
  });

  it('keeps the thread list inside the tab shell', async () => {
    await loadStores();
    const harness = await RouterTestingHarness.create('/chat');
    await harness.fixture.whenStable();
    const el = harness.routeNativeElement as HTMLElement;

    expect(el.querySelector('nav[aria-label="Main"]')).not.toBeNull();
    expect(el.querySelector('aura-chat-list-page')?.textContent).toContain('Carpool · Thursday');
  });

  it('renders a thread full-screen without the tab bar', async () => {
    await loadStores();
    const harness = await RouterTestingHarness.create('/chat/carpool');
    await harness.fixture.whenStable();
    const el = harness.routeNativeElement as HTMLElement;

    expect(el.querySelector('nav[aria-label="Main"]')).toBeNull();
    expect(el.querySelector('h1')?.textContent).toContain('Carpool');
    expect(el.textContent).toContain('Pickup 5:30?');
  });
});
