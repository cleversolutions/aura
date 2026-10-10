import { DemoAccount } from '@aura/backend/api';
import { ClubAccount, PlatformAdmin, Thread, User, UserId } from '@aura/shared/models';
import { ALL_GROUPS, addDays, isoDate } from '@aura/shared/util';
import { MockData, createSeed } from './seed';

export interface MockCredential {
  userId: UserId;
  /** Unique within the club only. */
  username: string;
  password: string;
  mustChangePassword: boolean;
}

export interface MockClub {
  account: ClubAccount;
  data: MockData;
  credentials: MockCredential[];
  /** The club admin's user, kept in step with `account.adminName` / `adminEmail`. */
  adminUserId: UserId;
  /** Accounts offered by the demo switcher on the More tab. */
  demoAccounts: DemoAccount[];
}

/** Every seeded account uses this password. */
export const DEMO_PASSWORD = 'password';

export const DEMO_PLATFORM_ADMIN: PlatformAdmin & { password: string } = {
  id: 'platform-admin',
  name: 'Alex Rivera',
  email: 'admin@aura.example',
  password: DEMO_PASSWORD,
};

export const SPARTANS_SLUG = 'k3v9qp';
export const PANTHERS_SLUG = 'p7x2mn';

/** Sign-in details for everyone who has accepted their invite. */
export function credentialsFor(users: User[]): MockCredential[] {
  return users
    .filter((u) => !u.invited && u.email)
    .map((u) => ({ userId: u.id, username: u.email ?? '', password: DEMO_PASSWORD, mustChangePassword: false }));
}

function defaultThreads(teamId: string): Thread[] {
  return [
    ['ann', '#announcements'],
    ['gen', '#general'],
  ].map(([suffix, name]) => ({
    id: `${teamId}-${suffix}`,
    name,
    scope: teamId,
    teams: [teamId],
    include: { ...ALL_GROUPS },
    members: [],
    creatorId: null,
    isDefault: true,
    messages: [],
    unread: 0,
  }));
}

/** A new club: just its admin and a club-wide announcements thread. */
export function createEmptyClubData(admin: User): MockData {
  return {
    teams: [],
    users: [admin],
    profiles: [],
    events: [],
    rsvps: {},
    threads: [
      {
        id: 'club-ann',
        name: '#club-announcements',
        scope: 'club',
        teams: [],
        include: { ...ALL_GROUPS },
        members: [],
        creatorId: admin.id,
        isDefault: false,
        messages: [],
        unread: 0,
      },
    ],
    muted: [],
  };
}

/** A small second club. Its Jordan Smith shares a username with the Spartans' Jordan but is a different person. */
function createPanthersSeed(now: Date): MockData {
  const day = (offset: number) => isoDate(addDays(now, offset));
  const users: User[] = [
    {
      id: 'morgan',
      name: 'Morgan Lee',
      kind: 'club',
      teams: [],
      title: 'Club President',
      email: 'morgan@panthers.example',
    },
    { id: 'pat', name: 'Pat Kim', kind: 'staff', teams: ['U11G'], email: 'pat@panthers.example' },
    { id: 'chris', name: 'Chris Obi', kind: 'staff', teams: ['U13B'], email: 'chris@panthers.example' },
    { id: 'jordan', name: 'Jordan Smith', kind: 'parent', teams: ['U13B'], email: 'jordan.smith@email.com' },
    { id: 'ana', name: 'Ana Ruiz', kind: 'parent', teams: ['U11G'], email: 'ana@panthers.example' },
  ];
  const profiles = [
    ['Sky Smith', '12', 'U13B', 'jordan'],
    ['Leo Park', '3', 'U13B', null],
    ['Ravi Shah', '9', 'U13B', null],
    ['Isla Ruiz', '7', 'U11G', 'ana'],
    ['Nia Brown', '21', 'U11G', null],
  ].map(([name, jersey, team, parentId], i) => ({
    id: `pp${i}`,
    name: name as string,
    jersey: jersey as string,
    team: team as string,
    parentIds: parentId ? [parentId as string] : [],
    userId: null,
    login: '',
  }));
  return {
    teams: [
      { id: 'U11G', name: 'U11 Girls' },
      { id: 'U13B', name: 'U13 Boys' },
    ],
    users,
    profiles,
    events: [
      { id: 'pe1', type: 'practice', team: 'U13B', date: day(1), time: '18:30', location: 'Eastside Gym', notes: '' },
      { id: 'pe2', type: 'practice', team: 'U11G', date: day(2), time: '17:00', location: 'Eastside Gym', notes: '' },
      {
        id: 'pe3',
        type: 'game',
        team: 'U13B',
        opponent: 'Spartans',
        home: false,
        date: day(5),
        time: '10:00',
        location: 'Spartan Centre · Court 1',
        notes: 'Carpool from the gym at 9:00.',
      },
    ],
    rsvps: {},
    threads: [
      {
        id: 'club-ann',
        name: '#club-announcements',
        scope: 'club',
        teams: ['U11G', 'U13B'],
        include: { ...ALL_GROUPS },
        members: [],
        creatorId: 'morgan',
        isDefault: false,
        messages: [
          {
            id: 'pm1',
            from: 'morgan',
            text: 'Welcome to the Panthers app! Schedules and team chat all live here now.',
            sentAt: new Date(`${day(-1)}T09:00:00`).toISOString(),
          },
        ],
        unread: 1,
      },
      ...defaultThreads('U11G'),
      ...defaultThreads('U13B'),
    ],
    muted: [],
  };
}

export function createMockClubs(now: Date): MockClub[] {
  const created = (daysAgo: number) => addDays(now, -daysAgo).toISOString();
  const spartans = createSeed(now);
  const panthers = createPanthersSeed(now);
  return [
    {
      account: {
        id: 'spartans',
        slug: SPARTANS_SLUG,
        name: 'Spartans',
        logoUrl: 'club-logo.svg',
        ink: '#000000',
        paper: '#ffffff',
        logoInk: '#000000',
        logoPaper: '#ffffff',
        adminName: 'Sam Okoro',
        adminEmail: 'sam@spartans.example',
        createdAt: created(54),
      },
      data: spartans,
      credentials: credentialsFor(spartans.users),
      adminUserId: 'sam',
      demoAccounts: [
        { userId: 'jordan', label: 'Parent' },
        { userId: 'eli', label: 'Player' },
        { userId: 'dana', label: 'Team Staff' },
        { userId: 'sam', label: 'Club Staff' },
      ],
    },
    {
      account: {
        id: 'panthers',
        slug: PANTHERS_SLUG,
        name: 'Panthers',
        logoUrl: 'clubs/panthers.svg',
        ink: '#1d2a6b',
        paper: '#f6c945',
        logoInk: '#1d2a6b',
        logoPaper: '#f6c945',
        adminName: 'Morgan Lee',
        adminEmail: 'morgan@panthers.example',
        createdAt: created(12),
      },
      data: panthers,
      credentials: credentialsFor(panthers.users),
      adminUserId: 'morgan',
      demoAccounts: [
        { userId: 'jordan', label: 'Parent' },
        { userId: 'pat', label: 'Team Staff' },
        { userId: 'morgan', label: 'Club Staff' },
      ],
    },
  ];
}
