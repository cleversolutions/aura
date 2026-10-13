import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTestBackend } from '@aura/backend/mock';
import { ClubStore } from '@aura/club/data-access';
import { PlatformStore } from '@aura/platform/data-access';
import { Toaster } from '@aura/shared/util';
import { ClubEditPage } from './club-pages';

async function settle(fixture: { whenStable(): Promise<unknown> }) {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  }
}

describe('ClubEditPage', () => {
  it('creates a club whose admin must replace the temporary password', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideTestBackend({ platformSignedIn: true, initialUserId: null }),
        provideRouter(
          [
            { path: 'admin/clubs/new', component: ClubEditPage },
            { path: 'admin/clubs/:clubId', component: ClubEditPage },
          ],
          withComponentInputBinding(),
        ),
      ],
    });
    const harness = await RouterTestingHarness.create('/admin/clubs/new');
    const fixture = harness.fixture;
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const type = (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector);
      if (!input) throw new Error(`${selector} missing`);
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };

    type('input[placeholder="e.g. Northside Aura"]', 'Northside Aura');
    const file = el.querySelector<HTMLInputElement>('input[type=file]');
    if (!file) throw new Error('file input missing');
    Object.defineProperty(file, 'files', {
      value: [new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'logo.svg', { type: 'image/svg+xml' })],
    });
    file.dispatchEvent(new Event('change'));
    await settle(fixture);
    // No canvas in tests, so the colours fall back to black and white.
    expect(TestBed.inject(Toaster).message()?.text).toBe('Couldn’t read the logo colours. Using black and white.');

    type('input[placeholder="First and last name"]', 'Riley Shaw');
    type('input[placeholder="admin@club.com"]', 'riley@northside.example');
    const password = el.querySelector<HTMLInputElement>('input.field-input.font-mono')?.value ?? '';
    const link = el.textContent?.match(/http:\/\/[^/\s]+\/([a-z2-9]{6})/);
    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('CREATE CLUB'))
      ?.click();
    await settle(fixture);

    // The club's own page shows the panel, so a refresh shows the club, not an empty form.
    const created = TestBed.inject(PlatformStore)
      .clubs()
      .find((c) => c.name === 'Northside Aura');
    expect(TestBed.inject(Router).url).toBe(`/admin/clubs/${created?.id}`);
    expect(el.textContent).toContain('CLUB CREATED');
    expect(el.textContent).toContain('Share this link with Riley Shaw');
    expect(el.textContent).toContain(password);
    const slug = link?.[1] ?? '';
    expect(el.textContent).toContain(`/${slug}`);

    const club = TestBed.inject(ClubStore);
    expect(await club.open(slug)).toMatchObject({ name: 'Northside Aura' });
    await club.signIn('riley@northside.example', password);
    expect(club.mustChangePassword()).toBe(true);

    // Shown once: coming back to the club's page shows its form.
    await harness.navigateByUrl('/admin/clubs/new');
    await harness.navigateByUrl(`/admin/clubs/${created?.id}`);
    await settle(fixture);
    expect(el.textContent).not.toContain('CLUB CREATED');
    expect(el.querySelector<HTMLInputElement>('input[placeholder="e.g. Northside Aura"]')?.value).toBe(
      'Northside Aura',
    );
  });
});
