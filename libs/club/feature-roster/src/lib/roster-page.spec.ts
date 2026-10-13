import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PlatformRepository } from '@aura/backend/api';
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

/** A brand-new club, signed in as its admin. */
async function renderNewClub() {
  TestBed.configureTestingModule({
    providers: [provideTestBackend({ initialUserId: null, platformSignedIn: true }), provideRouter([])],
  });
  await TestBed.inject(PlatformRepository).createClub({
    name: 'Rockets',
    slug: 'r0ck3t',
    logoUrl: '',
    ink: '#000000',
    paper: '#ffffff',
    logoInk: '#000000',
    logoPaper: '#ffffff',
    adminName: 'Casey Morgan',
    adminEmail: 'casey@rockets.example',
    temporaryPassword: 'TEMP-pass-22',
  });
  const club = TestBed.inject(ClubStore);
  await club.open('r0ck3t');
  await club.signIn('casey@rockets.example', 'TEMP-pass-22');
  await club.changePassword('casey-own-password');
  await TestBed.inject(ChatStore).load();
  const fixture = TestBed.createComponent(RosterPage);
  await fixture.whenStable();
  return { fixture, club, el: fixture.nativeElement as HTMLElement };
}

describe('RosterPage', () => {
  it('guides a new club’s staff through setup until it has a team, a coach and players', async () => {
    const { fixture, club, el } = await renderNewClub();
    const buttons = () =>
      Array.from(el.querySelectorAll('aura-setup-checklist button')).map((b) => b.textContent?.trim());
    expect(el.textContent).toContain('GET STARTED · 0 OF 3');
    expect(buttons()).toEqual(['CREATE TEAM']);

    await club.saveTeam({ name: 'U11 Boys', staffIds: [] });
    await fixture.whenStable();
    expect(el.textContent).toContain('GET STARTED · 1 OF 3');
    expect(buttons()).toEqual(['INVITE COACH', 'ADD PLAYER']);
    expect(el.querySelector('h1')?.textContent).toContain('U11 Boys');

    el.querySelector<HTMLButtonElement>('aura-setup-checklist button')?.click();
    await fixture.whenStable();
    expect(el.querySelector('aura-invite-form [role=radio][aria-checked=true]')?.textContent).toContain('Team Staff');
  });

  it('shows past seasons read-only', async () => {
    const { fixture, el } = await render('sam');
    const club = TestBed.inject(ClubStore);
    const old = club.season()!;
    await club.startSeason({
      name: 'Next',
      teams: [{ from: 'U12G', name: 'U13 Girls', age: 'U13', division: 'Girls', staff: true, players: true }],
    });
    await fixture.whenStable();
    expect(el.querySelector('h1')?.textContent).toContain('U13 Girls');

    Array.from(el.querySelectorAll<HTMLButtonElement>('[role=radio]'))
      .find((b) => b.textContent?.trim() === old.name.toUpperCase())
      ?.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(el.textContent).toContain(`${old.name} has ended`);
    expect(el.querySelector('h1')?.textContent).toContain('U10 Boys');
    expect(el.textContent).toContain('Chris Bell');
    expect(el.textContent).not.toContain('ADD PLAYER');
    expect(el.querySelector('aura-player-row button')).toBeNull();
  });

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
    expect(el.textContent).toContain('automatically join 3 chat threads');

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
    expect(el.textContent).toContain('Rae MossNo player linked yet · invited');
  });

  describe('details', () => {
    const helpers = (fixture: { whenStable(): Promise<unknown> }, el: HTMLElement) => ({
      openRow: async (name: string) => {
        Array.from(el.querySelectorAll<HTMLButtonElement>('[role=listitem] button'))
          .find((b) => b.textContent?.includes(name))
          ?.click();
        await fixture.whenStable();
      },
      /** Opens the row whose name is exactly `name` (player rows also mention parents' names). */
      openPerson: async (name: string) => {
        Array.from(el.querySelectorAll<HTMLButtonElement>('[role=listitem] button'))
          .find((b) => b.querySelector('span span')?.textContent?.trim() === name)
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

    it('shows staff titles; any staff change any staff member’s title, and only that', async () => {
      const { fixture, el } = await render('dana');
      const h = helpers(fixture, el);
      const row = (name: string) =>
        Array.from(el.querySelectorAll('[role=listitem]')).find((r) => r.textContent?.includes(name));
      expect(row('Dana Reyes')?.textContent).toContain('Head Coach · also U14 Boys');
      expect(row('Kim Alvarez')?.textContent).toContain('Team Staff');

      // Dana can't edit Kim's details (Kim has joined), but can set Kim's title.
      await h.openPerson('Kim Alvarez');
      await h.click('EDIT');
      expect(h.sheet()!.querySelectorAll('input')).toHaveLength(1);
      h.type('TITLE', 'Assistant Coach');
      await h.click('SAVE');
      expect(TestBed.inject(ClubStore).user('kim-alvarez')?.title).toBe('Assistant Coach');
      expect(row('Kim Alvarez')?.textContent).toContain('Assistant Coach');

      // Club staff are not team staff's to edit.
      h.sheet()?.querySelector<HTMLButtonElement>('[aria-label=Close]')?.click();
      await fixture.whenStable();
      await h.openPerson('Sam Okoro');
      expect(h.sheet()?.textContent).toContain('Club Director');
      expect(h.sheet()?.textContent).not.toContain('EDIT');
    });

    it('lets team staff make a parent on their team team staff', async () => {
      const { fixture, el } = await render('dana');
      const club = TestBed.inject(ClubStore);
      const h = helpers(fixture, el);
      const parent = club.users().find((u) => u.kind === 'parent' && u.teams.join() === 'U12G')!;
      const section = (heading: string) =>
        Array.from(el.querySelectorAll('h2')).find((e) => e.textContent?.startsWith(heading))?.nextElementSibling
          ?.textContent ?? '';
      expect(section('TEAM STAFF')).not.toContain(parent.name);

      await h.openPerson(parent.name);
      await h.click('MAKE TEAM STAFF');
      expect(h.sheet()?.textContent).toContain(`Make ${parent.name} team staff of U12 Girls?`);
      await h.click('CHANGE ROLE');
      expect(club.user(parent.id)?.kind).toBe('staff');
      expect(h.sheet()?.textContent).toContain('Team Staff');
      expect(h.sheet()?.textContent).not.toContain('MAKE TEAM STAFF');
      expect(section('TEAM STAFF')).toContain(parent.name);

      // Jordan's other team, U18B, isn't Dana's.
      h.sheet()?.querySelector<HTMLButtonElement>('[aria-label=Close]')?.click();
      await fixture.whenStable();
      await h.openPerson('Jordan Smith');
      expect(h.sheet()?.textContent).not.toContain('MAKE TEAM STAFF');
    });

    it('shows a player’s care details to their family and staff, who edit them', async () => {
      const { fixture, el } = await render('dana');
      const h = helpers(fixture, el);
      await h.openRow('Maya Smith');
      expect(h.sheet()?.textContent).toContain('Mild asthma: inhaler in her bag.');
      await h.click('EDIT');
      h.type('EMERGENCY CONTACT', 'Aunt Bea · 555-0111');
      const notes = h.sheet()!.querySelector('textarea')!;
      notes.value = 'Peanut allergy';
      notes.dispatchEvent(new Event('input'));
      await h.click('SAVE');
      expect(
        TestBed.inject(ClubStore)
          .profiles()
          .find((p) => p.id === 'maya')?.care,
      ).toEqual({ emergencyContact: 'Aunt Bea · 555-0111', medicalNotes: 'Peanut allergy' });

      TestBed.resetTestingModule();
      const other = await render('priya-patel');
      const o = helpers(other.fixture, other.el);
      await o.openRow('Maya Smith');
      expect(o.sheet()?.textContent).not.toContain('MEDICAL NOTES');
      expect(o.sheet()?.textContent).not.toContain('asthma');
    });

    it('shows phone numbers as links, and staff edit them', async () => {
      const { fixture, el } = await render('sam', 'U12G');
      const h = helpers(fixture, el);
      await h.openPerson('Dana Reyes');
      expect(h.sheet()?.querySelector<HTMLAnchorElement>('a[href="tel:5550134"]')?.textContent).toContain('555-0134');
      await h.click('EDIT');
      h.type('PHONE', 'call me');
      await h.click('SAVE');
      expect(h.sheet()?.querySelector('[role=alert]')?.textContent).toContain('Enter a valid phone number.');
      h.type('PHONE', '+1 555 010 9999');
      await h.click('SAVE');
      expect(TestBed.inject(ClubStore).user('dana')?.phone).toBe('+1 555 010 9999');
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

    it('lets team staff reset a parent’s password, but not disable or remove them', async () => {
      const { fixture, el } = await render('dana');
      const h = helpers(fixture, el);
      await h.openPerson('Jordan Smith');
      expect(h.sheet()?.textContent).not.toContain('REMOVE FROM CLUB');
      await h.click('RESET PASSWORD');
      await h.click('RESET');
      const ready = el.querySelector('aura-member-invited');
      expect(ready?.textContent).toContain('PASSWORD RESET');
      expect(ready?.textContent).toContain('jordan.smith@email.com');
      await expect(TestBed.inject(ClubStore).signIn('jordan.smith@email.com', 'password')).rejects.toThrow();
    });

    it('lets club staff disable, enable and remove a member', async () => {
      const { fixture, el } = await render('sam', 'U12G');
      const club = TestBed.inject(ClubStore);
      const h = helpers(fixture, el);

      await h.openPerson('Kim Alvarez');
      await h.click('DISABLE');
      expect(h.sheet()?.textContent).toContain('Nothing is deleted.');
      await h.click('DISABLE');
      expect(club.user('kim-alvarez')?.disabled).toBe(true);
      expect(h.sheet()?.textContent).toContain('Team Staff · disabled');
      expect(el.textContent).toContain('Team Staff · disabled');
      await h.click('ENABLE');
      expect(club.user('kim-alvarez')?.disabled).toBeUndefined();

      await h.click('REMOVE FROM CLUB');
      await h.click('REMOVE');
      expect(club.user('kim-alvarez')).toBeUndefined();
      expect(h.sheet()).toBeNull();
      expect(el.textContent).not.toContain('Kim Alvarez');
    });

    it('lets the team’s staff approve a parent’s link request; pending players are no one’s child yet', async () => {
      const { fixture, el } = await render('dana');
      const club = TestBed.inject(ClubStore);
      await club.signOut();
      await club.signIn('wei-chen@spartans.example', 'password');
      await club.requestPlayerLink({ name: 'Kai Chen', team: 'U12G', jersey: '', parentId: 'wei-chen' });
      await fixture.whenStable();
      expect(el.textContent).toContain('Your player · pending approval');
      expect(el.textContent).not.toContain('PENDING REQUESTS');

      await club.signOut();
      await club.signIn('dana@spartans.example', 'password');
      await fixture.whenStable();
      expect(el.textContent).toContain('PENDING REQUESTS · 1');
      expect(el.textContent).toContain('Requested by Wei Chen');
      expect(el.textContent).toContain('Wei ChenParent of Ava Chen');
      expect(el.textContent).not.toContain('Ava Chen, Kai Chen');
      expect(el.textContent).toContain('PLAYERS · 9');

      const h = helpers(fixture, el);
      await h.openRow('Kai Chen');
      await h.click('APPROVE');
      expect(el.textContent).not.toContain('PENDING REQUESTS');
      expect(el.textContent).toContain('PLAYERS · 10');
      expect(el.textContent).toContain('Parent of Ava Chen, Kai Chen');
    });

    it('moves a player to another team and follows them there', async () => {
      const { fixture, el } = await render('dana');
      const h = helpers(fixture, el);
      await h.openRow('Maya Smith');
      await h.click('EDIT');
      Array.from(el.querySelectorAll<HTMLButtonElement>('aura-person-details [role=radio]'))
        .find((b) => b.textContent?.includes('U14 Boys'))
        ?.click();
      await fixture.whenStable();
      await h.click('SAVE');
      expect(el.querySelector('h1')?.textContent).toContain('U14 Boys');
      expect(el.textContent).toContain('Maya Smith');
      expect(TestBed.inject(ClubStore).user('jordan')?.teams).toEqual(['U14B', 'U18B']);
    });

    it('takes a player off the roster after asking', async () => {
      const { fixture, el } = await render('dana');
      const h = helpers(fixture, el);
      await h.openRow('Ava Chen');
      await h.click('REMOVE FROM ROSTER');
      await h.click('REMOVE');
      expect(h.sheet()).toBeNull();
      expect(el.textContent).not.toContain('Ava Chen');
      // Wei had no other player on U12G, so leaves it (and its chats), staying in the club.
      expect(el.textContent).not.toContain('Wei Chen');
      expect(TestBed.inject(ClubStore).user('wei-chen')?.teams).toEqual([]);
    });

    it('gives a player their own sign-in and hands it over', async () => {
      const { fixture, el } = await render('dana');
      const h = helpers(fixture, el);
      await h.openRow('Maya Smith');
      await h.click('GIVE OWN SIGN-IN');
      h.type('PLAYER’S EMAIL', 'maya@x.example');
      await h.click('CREATE SIGN-IN');
      expect(el.querySelector('aura-member-invited')?.textContent).toContain('maya@x.example');
      expect(
        TestBed.inject(ClubStore)
          .profiles()
          .find((p) => p.id === 'maya')?.userId,
      ).toBeTruthy();
    });

    it('lets club staff change a member’s teams', async () => {
      const { fixture, el } = await render('sam', 'U12G');
      const h = helpers(fixture, el);
      await h.openPerson('Wei Chen');
      await h.click('EDIT');
      Array.from(el.querySelectorAll<HTMLButtonElement>('aura-person-details button.card-row'))
        .find((b) => b.textContent?.includes('U14 Boys'))
        ?.click();
      await h.click('SAVE');
      expect(TestBed.inject(ClubStore).user('wei-chen')?.teams).toEqual(['U12G', 'U14B']);
      expect(h.sheet()?.textContent).toContain('U12 Girls, U14 Boys');
    });

    it('lets team staff put a family on another of their teams, but not edit their details', async () => {
      const { fixture, el } = await render('dana');
      const h = helpers(fixture, el);
      await h.openPerson('Wei Chen');
      await h.click('EDIT');
      const sheet = h.sheet()!;
      expect(sheet.querySelector('input')).toBeNull();
      expect(sheet.textContent).toContain('U14 Boys');
      expect(sheet.textContent).not.toContain('U18 Boys');
    });

    it('lists the club staff, and never offers to remove the club admin', async () => {
      const { fixture, el } = await render('lee');
      expect(el.textContent).toContain('CLUB STAFF');
      expect(el.textContent).toContain('Club Director · Club admin');
      const h = helpers(fixture, el);
      await h.openRow('Sam Okoro');
      expect(h.sheet()?.textContent).toContain('Club Staff · Club admin');
      expect(h.sheet()?.textContent).toContain('RESET PASSWORD');
      expect(h.sheet()?.textContent).not.toContain('REMOVE FROM CLUB');
    });
  });

  it('registers a player whose parents are the coach and a parent without a player yet', async () => {
    const { fixture, el } = await render('dana');
    const club = TestBed.inject(ClubStore);
    const settle = async () => {
      await fixture.whenStable();
      await fixture.whenStable();
    };
    const button = (text: string, root: ParentNode = el) =>
      Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
        b.textContent?.trim().startsWith(text),
      );

    // Jenn accepts her invite: she is a parent on the team with no player yet.
    const invite = await club.inviteMember({
      team: 'U12G',
      kind: 'parent',
      name: 'Jenn Buell',
      email: 'jenn@x.example',
    });
    await club.signOut();
    await club.signIn('jenn@x.example', invite.temporaryPassword);
    await club.changePassword('jenn-own-password');
    await club.signOut();
    await club.signIn('dana@spartans.example', 'password');
    await settle();
    expect(el.textContent).toContain('Jenn Buell');
    expect(el.textContent).toContain('No player linked yet');

    button('ADD PLAYER')?.click();
    await settle();
    const form = el.querySelector('aura-add-player-form')!;
    const name = form.querySelector<HTMLInputElement>('input')!;
    name.value = 'Davis Moore';
    name.dispatchEvent(new Event('input'));
    const tick = (name: string) =>
      Array.from(form.querySelectorAll<HTMLButtonElement>('button.card-row'))
        .find((b) => b.textContent?.includes(name))
        ?.click();
    tick('Dana Reyes');
    tick('Jenn Buell');
    button('ADD PLAYER', form)?.click();
    await settle();

    expect(el.querySelector('aura-add-player-form [role=alert]')?.textContent ?? '').toBe('');
    expect(el.querySelector('aura-add-player-form')).toBeNull();
    const davis = club.profiles().find((p) => p.name === 'Davis Moore');
    expect(davis?.parentIds.sort()).toEqual(['dana', invite.user.id].sort());
    expect(el.textContent).toContain('Parent of Davis Moore');
    expect(el.textContent).toContain('Team Staff · Parent of Davis Moore');
    expect(el.textContent).not.toContain('No player linked yet');
    // Dana is Davis's parent, so he shows as her player.
    expect(club.myPlayers().map((p) => p.name)).toEqual(['Davis Moore']);
  });

  it('adds someone already in the club to the team instead of inviting them again', async () => {
    const { fixture, el } = await render('dana', 'U14B');
    const click = (text: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.trim().startsWith(text))
        ?.click();
    click('INVITE MEMBER');
    await fixture.whenStable();
    click('ALREADY IN CLUB');
    await fixture.whenStable();
    click('Wei Chen');
    click('ADD TO TEAM');
    await fixture.whenStable();
    await fixture.whenStable();
    expect(el.querySelector('aura-invite-form')).toBeNull();
    expect(TestBed.inject(ClubStore).user('wei-chen')?.teams).toEqual(['U12G', 'U14B']);
    expect(el.textContent).toContain('Wei ChenNo player linked yet');
  });

  it('invites a missing parent while adding a player, then hands over both sign-ins', async () => {
    const { fixture, el } = await render('dana');
    const settle = async () => {
      await fixture.whenStable();
      await fixture.whenStable();
    };
    const type = (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector);
      if (!input) throw new Error(`missing ${selector}`);
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const button = (text: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim().startsWith(text));

    button('ADD PLAYER')?.click();
    await settle();
    type('aura-add-player-form input', 'Liam Ortiz');
    button('+ Invite a parent')?.click();
    await settle();
    type('input[aria-label="Parent’s name"]', 'Rosa Ortiz');
    type('input[aria-label="Parent’s email"]', 'rosa@x.example');
    button('Signs in themselves')?.click();
    await settle();
    type('aura-add-player-form input[placeholder="name@email.com"]', 'liam@x.example');
    Array.from(el.querySelectorAll<HTMLButtonElement>('aura-add-player-form button'))
      .filter((b) => b.textContent?.trim() === 'ADD PLAYER')[0]
      ?.click();
    await settle();

    const club = TestBed.inject(ClubStore);
    const rosa = club.users().find((u) => u.name === 'Rosa Ortiz');
    expect(club.profiles().find((p) => p.name === 'Liam Ortiz')?.parentIds).toEqual([rosa?.id]);
    expect(el.querySelector('aura-member-invited')?.textContent).toContain('rosa@x.example');
    el.querySelector<HTMLButtonElement>('aura-member-invited [aria-label=Close]')?.click();
    await settle();
    expect(el.querySelector('aura-member-invited')?.textContent).toContain('liam@x.example');
  });

  it('shows parents names only for other families, and no invites', async () => {
    const { fixture, el } = await render('jordan');
    const club = TestBed.inject(ClubStore);
    expect(club.user('wei-chen')?.email).toBeUndefined();
    expect(club.user('dana')?.email).toBe('dana@spartans.example');
    await club.signOut();
    await club.signIn('dana@spartans.example', 'password');
    await club.inviteMember({ team: 'U12G', kind: 'staff', name: 'Tia Bank', email: 'tia@x.example' });
    await club.signOut();
    await club.signIn('jordan.smith@email.com', 'password');
    await fixture.whenStable();
    expect(el.textContent).not.toContain('INVITED');
    expect(el.textContent).not.toContain('tia@x.example');
  });
});
