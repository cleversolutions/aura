import { TestBed } from '@angular/core/testing';
import { provideTestBackend } from '@aura/backend/mock';
import { ChatStore } from '@aura/chat/data-access';
import { ClubStore } from '@aura/club/data-access';
import { RosterPage } from './roster-page';

async function render(initialUserId: string, team?: string) {
  TestBed.configureTestingModule({ providers: provideTestBackend({ initialUserId }) });
  await TestBed.inject(ClubStore).load();
  await TestBed.inject(ChatStore).load();
  const fixture = TestBed.createComponent(RosterPage);
  if (team) fixture.componentRef.setInput('team', team);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el };
}

describe('RosterPage', () => {
  it('shows the first team with my player highlighted', async () => {
    const { el } = await render('jordan');
    expect(el.querySelector('h1')?.textContent).toContain('U12 Girls');
    expect(el.textContent).toContain('PLAYERS · 9');
    expect(el.textContent).toContain('Maya Smith');
    expect(el.textContent).toContain('Your player');
    expect(el.textContent).not.toContain('INVITE MEMBER');
    expect(el.querySelector('[role=radio][aria-checked=true]')?.textContent).toContain('U12 GIRLS');
  });

  it('switches teams from the query parameter', async () => {
    const { el } = await render('jordan', 'U18B');
    expect(el.querySelector('h1')?.textContent).toContain('U18 Boys');
    expect(el.textContent).toContain('Andre Lewis');
  });

  it('lets team staff invite and validates the form', async () => {
    const { fixture, el } = await render('dana');
    const invite = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('INVITE MEMBER'));
    invite?.click();
    await fixture.whenStable();
    expect(el.textContent).toContain('automatically join 3 team-linked threads');

    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('SEND INVITE'))
      ?.click();
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Enter their name.');
  });

  it('shows the new member’s sign-in after inviting them', async () => {
    const { fixture, el } = await render('dana');
    const click = (text: string) =>
      Array.from(el.querySelectorAll('button'))
        .find((b) => b.textContent?.includes(text))
        ?.click();
    const type = (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector);
      if (!input) throw new Error(`missing ${selector}`);
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    click('INVITE MEMBER');
    await fixture.whenStable();
    type('aura-invite-form input:not([type=email])', 'Rae Moss');
    type('aura-invite-form input[type=email]', 'rae@x.example');
    click('SEND INVITE');
    await fixture.whenStable();
    await fixture.whenStable();

    expect(el.querySelector('aura-invite-form')).toBeNull();
    const sheet = el.querySelector('aura-member-invited');
    expect(sheet?.textContent).toContain('rae@x.example');
    expect(sheet?.textContent).toMatch(/[A-Z]{4}-[a-z2-9]{4}-[2-9]{2}/);
    expect(sheet?.textContent).toContain('/k3v9qp');
    expect(el.textContent).toContain('Parent · invited as rae@x.example');
  });

  it('lets club staff edit team staff, and only club staff', async () => {
    const { fixture, el } = await render('sam');
    const club = TestBed.inject(ClubStore);
    el.querySelector<HTMLButtonElement>('[aria-label="Edit Chris Bell"]')?.click();
    await fixture.whenStable();
    const email = el.querySelector<HTMLInputElement>('aura-member-form input[type=email]')!;
    email.value = 'chris@new.example';
    email.dispatchEvent(new Event('input'));
    Array.from(el.querySelectorAll('aura-member-form button'))
      .find((b) => b.textContent?.trim() === 'SAVE')
      ?.dispatchEvent(new Event('click'));
    await fixture.whenStable();
    expect(club.user('chris-bell')?.email).toBe('chris@new.example');
    expect(el.querySelector('aura-member-form')).toBeNull();

    TestBed.resetTestingModule();
    const dana = await render('dana');
    expect(dana.el.querySelector('[aria-label^="Edit "]')).toBeNull();
  });
});
