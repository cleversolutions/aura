import { TestBed } from '@angular/core/testing';
import { ClubAccount } from '@aura/shared/models';
import { ClubAdminPanel, ClubAdminPanelVm } from './club-admin-panel';
import { ClubArchivePanel } from './club-archive-panel';
import { ClubCard, ClubCardVm } from './club-card';
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

describe('ClubAdminPanel', () => {
  const vm = (o: Partial<ClubAdminPanelVm> = {}): ClubAdminPanelVm => ({
    adminName: 'Sam Okoro',
    adminEmail: 'sam@spartans.example',
    staff: [
      { id: 'lee', name: 'Lee Fontaine', sub: 'Registrar', eligible: true },
      { id: 'new', name: 'Tia Bank', sub: 'invited, hasn’t joined yet', eligible: false },
    ],
    reset: null,
    ...o,
  });
  const click = (el: HTMLElement, text: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent?.trim() === text)
      ?.click();

  it('confirms resetting the admin’s password, then shows the new one once', async () => {
    const fixture = TestBed.createComponent(ClubAdminPanel);
    fixture.componentRef.setInput('vm', vm());
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const reset = vi.fn();
    fixture.componentInstance.resetPassword.subscribe(reset);

    click(el, 'RESET PASSWORD');
    await fixture.whenStable();
    expect(el.textContent).toContain('Give Sam Okoro a new temporary password?');
    click(el, 'RESET');
    expect(reset).toHaveBeenCalled();

    fixture.componentRef.setInput(
      'vm',
      vm({ reset: { username: 'sam@spartans.example', temporaryPassword: 'KMRT-a7bq-49' } }),
    );
    await fixture.whenStable();
    expect(el.textContent).toContain('KMRT-a7bq-49');
    expect(el.textContent).toContain('RESET PASSWORD');
  });

  it('makes another of the club’s staff the admin, if they have joined', async () => {
    const fixture = TestBed.createComponent(ClubAdminPanel);
    fixture.componentRef.setInput('vm', vm());
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const changed: string[] = [];
    fixture.componentInstance.adminChanged.subscribe((id) => changed.push(id));

    expect(el.querySelectorAll('[aria-label^="Make "]')).toHaveLength(1);
    el.querySelector<HTMLButtonElement>('[aria-label="Make Lee Fontaine the club admin"]')?.click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Make Lee Fontaine the club admin? Sam Okoro stays on the club staff.');
    click(el, 'MAKE ADMIN');
    expect(changed).toEqual(['lee']);
  });
});

describe('ClubArchivePanel', () => {
  const click = (el: HTMLElement, text: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent?.trim() === text)
      ?.click();

  it('asks before archiving, and restores without asking', async () => {
    const fixture = TestBed.createComponent(ClubArchivePanel);
    fixture.componentRef.setInput('vm', { name: 'Spartans', archivedOn: null });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const changes: boolean[] = [];
    fixture.componentInstance.archivedChange.subscribe((v) => changes.push(v));

    click(el, 'ARCHIVE CLUB');
    await fixture.whenStable();
    expect(el.textContent).toContain('Archive Spartans?');
    click(el, 'ARCHIVE');
    expect(changes).toEqual([true]);

    fixture.componentRef.setInput('vm', { name: 'Spartans', archivedOn: 'Oct 11, 2026' });
    await fixture.whenStable();
    expect(el.textContent).toContain('Archived Oct 11, 2026.');
    click(el, 'RESTORE CLUB');
    expect(changes).toEqual([true, false]);
  });
});

describe('ClubCard', () => {
  const vm: ClubCardVm = {
    id: 'spartans',
    name: 'Spartans',
    url: 'https://aura.test/k3v9qp',
    logoUrl: 'club-logo.svg',
    ink: '#000000',
    paper: '#ffffff',
    admin: 'Sam Okoro · sam@spartans.example',
    counts: '12 members · 3 invited · 2 teams',
    created: 'Archived Oct 11, 2026',
    archived: true,
  };

  it('shows the club’s size and whether it is archived', async () => {
    const fixture = TestBed.createComponent(ClubCard);
    fixture.componentRef.setInput('vm', vm);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('12 members · 3 invited · 2 teams');
    expect(el.textContent).toContain('ARCHIVED');

    fixture.componentRef.setInput('vm', { ...vm, counts: '', archived: false, created: 'Created Aug 12, 2026' });
    await fixture.whenStable();
    expect(el.textContent).not.toContain('ARCHIVED');
    expect(el.textContent).not.toContain('members');
  });
});
