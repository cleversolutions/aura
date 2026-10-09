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
});
