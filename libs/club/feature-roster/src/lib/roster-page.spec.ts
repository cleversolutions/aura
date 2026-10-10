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

  describe('details', () => {
    const helpers = (fixture: { whenStable(): Promise<unknown> }, el: HTMLElement) => ({
      openRow: async (name: string) => {
        Array.from(el.querySelectorAll<HTMLButtonElement>('[role=listitem] button'))
          .find((b) => b.textContent?.includes(name))
          ?.click();
        await fixture.whenStable();
      },
      sheet: () => el.querySelector('aura-person-details'),
      click: async (text: string) => {
        Array.from(el.querySelectorAll<HTMLButtonElement>('aura-person-details button'))
          .find((b) => b.textContent?.trim() === text)
          ?.click();
        await fixture.whenStable();
        await fixture.whenStable();
      },
      type: (label: string, value: string) => {
        const field = Array.from(el.querySelectorAll('aura-person-details label')).find((l) =>
          l.textContent?.includes(label),
        );
        const input = field?.querySelector('input');
        if (!input) throw new Error(`no ${label} field`);
        input.value = value;
        input.dispatchEvent(new Event('input'));
      },
    });

    it('shows anyone’s details; club staff edit them in place', async () => {
      const { fixture, el } = await render('sam');
      const club = TestBed.inject(ClubStore);
      const h = helpers(fixture, el);

      await h.openRow('Chris Bell');
      expect(h.sheet()?.textContent).toContain('chris-bell@spartans.example');
      expect(h.sheet()?.textContent).toContain('U10 Boys');
      await h.click('EDIT');
      h.type('EMAIL', 'chris@new.example');
      await h.click('SAVE');
      expect(club.user('chris-bell')?.email).toBe('chris@new.example');
      expect(h.sheet()?.textContent).toContain('chris@new.example');
      expect(h.sheet()?.querySelector('input')).toBeNull();
    });

    it('offers edit only where allowed', async () => {
      const { fixture, el } = await render('jordan');
      const h = helpers(fixture, el);
      await h.openRow('Maya Smith');
      expect(h.sheet()?.textContent).toContain('Jordan Smith');
      await h.click('EDIT');
      h.type('JERSEY', '18');
      await h.click('SAVE');
      expect(
        TestBed.inject(ClubStore)
          .profiles()
          .find((p) => p.id === 'maya')?.jersey,
      ).toBe('18');

      h.sheet()?.querySelector<HTMLButtonElement>('[aria-label=Close]')?.click();
      await fixture.whenStable();
      await h.openRow('Ava Chen');
      expect(h.sheet()?.textContent).not.toContain('EDIT');
      h.sheet()?.querySelector<HTMLButtonElement>('[aria-label=Close]')?.click();
      await fixture.whenStable();
      await h.openRow('Kim Alvarez');
      expect(h.sheet()?.textContent).toContain('Team Staff');
      expect(h.sheet()?.textContent).not.toContain('EDIT');
    });

    it('lets team staff resend and cancel invites to their team', async () => {
      const { fixture, el } = await render('dana');
      const club = TestBed.inject(ClubStore);
      const first = await club.inviteMember({ team: 'U12G', kind: 'parent', name: 'Rae Moss', email: 'rae@x.example' });
      await fixture.whenStable();
      const h = helpers(fixture, el);

      await h.openRow('Rae Moss');
      expect(h.sheet()?.textContent).toContain('invited, not signed in yet');
      await h.click('RESEND INVITE');
      const ready = el.querySelector('aura-member-invited');
      expect(ready?.textContent).toContain('rae@x.example');
      expect(ready?.textContent).not.toContain(first.temporaryPassword);
      await expect(club.signIn('rae@x.example', first.temporaryPassword)).rejects.toThrow();

      ready?.querySelector<HTMLButtonElement>('[aria-label=Close]')?.click();
      await fixture.whenStable();
      await h.openRow('Rae Moss');
      await h.click('CANCEL INVITE');
      expect(h.sheet()?.textContent).toContain('Their temporary password stops working.');
      await h.click('CANCEL INVITE');
      expect(club.users().some((u) => u.name === 'Rae Moss')).toBe(false);
      expect(el.textContent).not.toContain('Rae Moss');
    });
  });
});
