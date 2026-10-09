import { TestBed } from '@angular/core/testing';
import { ClubAccount } from '@aura/shared/models';
import { ClubForm, ClubFormValue } from './club-form';

const SPARTANS: ClubAccount = {
  id: 'spartans',
  slug: 'k3v9qp',
  name: 'Spartans',
  logoUrl: 'club-logo.svg',
  ink: '#000000',
  paper: '#ffffff',
  logoInk: '#000000',
  logoPaper: '#ffffff',
  adminName: 'Sam Okoro',
  adminEmail: 'sam@spartans.example',
  createdAt: '2026-08-12T12:00:00.000Z',
};

async function render(club: ClubAccount | null) {
  const fixture = TestBed.createComponent(ClubForm);
  fixture.componentRef.setInput('club', club);
  fixture.componentRef.setInput('baseUrl', 'https://aura.test/');
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const submitted: ClubFormValue[] = [];
  fixture.componentInstance.submitted.subscribe((v) => submitted.push(v));
  const button = (text: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes(text));
  const type = (selector: string, text: string) => {
    const input = el.querySelector<HTMLInputElement>(selector);
    if (!input) throw new Error(`${selector} missing`);
    input.value = text;
    input.dispatchEvent(new Event('input'));
  };
  const submit = async () => {
    button(club ? 'SAVE CHANGES' : 'CREATE CLUB')?.click();
    await fixture.whenStable();
  };
  return { fixture, el, submitted, button, type, submit };
}

describe('ClubForm', () => {
  it('starts a new club with a random link, a temporary password and black on white', async () => {
    const { el } = await render(null);
    expect(el.textContent).toContain('New club');
    expect(el.textContent).toMatch(/https:\/\/aura\.test\/[a-z2-9]{6}/);
    expect(el.textContent).toContain('21.0:1');
    expect(el.textContent).toContain('Passes for all text.');
    expect(el.textContent).not.toContain('OPEN APP PREVIEW');
  });

  it('requires a name and a logo', async () => {
    const { el, submitted, type, submit } = await render(null);
    await submit();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Enter the club name.');
    type('input[placeholder="e.g. Northside Aura"]', 'Northside');
    await submit();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Upload the club logo.');
    expect(submitted).toEqual([]);
  });

  it('checks colour contrast as hex is typed', async () => {
    const { fixture, el, type } = await render(SPARTANS);
    type('input[aria-label="Secondary hex"]', '#77');
    await fixture.whenStable();
    expect(el.textContent).toContain('21.0:1');
    type('input[aria-label="Secondary hex"]', '#777');
    await fixture.whenStable();
    expect(el.textContent).toMatch(/4\.\d:1/);
    expect(el.textContent).toContain('Passes for all text.');
    type('input[aria-label="Primary hex"]', '#555555');
    await fixture.whenStable();
    expect(el.textContent).toContain('Too low.');
  });

  it('saves edits without a password, keeping the link', async () => {
    const { fixture, el, submitted, button, type, submit } = await render(SPARTANS);
    expect(el.textContent).toContain('https://aura.test/k3v9qp');
    expect(el.textContent).not.toContain('Temporary password');
    expect(button('New link')).toBeUndefined();

    type('input[placeholder="e.g. Northside Aura"]', 'Spartans Basketball');
    button('Swap')?.click();
    await fixture.whenStable();
    await submit();
    expect(submitted).toEqual([
      expect.objectContaining({
        name: 'Spartans Basketball',
        slug: 'k3v9qp',
        ink: '#ffffff',
        paper: '#000000',
        temporaryPassword: '',
      }),
    ]);
  });
});
