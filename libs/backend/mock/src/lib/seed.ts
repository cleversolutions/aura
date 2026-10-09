import { ChatMessage, ClubEvent, PlayerProfile, RsvpMap, Team, Thread, User, UserKind } from '@aura/shared/models';
import { ALL_GROUPS, addDays, isoDate } from '@aura/shared/util';

/** One club's data. Branding and sign-in details live on the club record (see clubs.ts). */
export interface MockData {
  teams: Team[];
  users: User[];
  profiles: PlayerProfile[];
  events: ClubEvent[];
  rsvps: RsvpMap;
  threads: Thread[];
  muted: string[];
}

const GIRLS = [
  'Grace',
  'Chloe',
  'Nora',
  'Mia',
  'Ella',
  'Ruby',
  'Iris',
  'Hana',
  'Leah',
  'Sofia',
  'Jade',
  'Quinn',
  'Ivy',
];
const BOYS = ['Owen', 'Jalen', 'Theo', 'Noah', 'Liam', 'Kai', 'Ezra', 'Leo', 'Milo', 'Isaac', 'Felix', 'Omar', 'Ben'];
const LAST = [
  'Brooks',
  'Kim',
  'Diaz',
  'Grant',
  'Ward',
  'Lam',
  'Price',
  'Nguyen',
  'Foster',
  'Silva',
  'Bauer',
  'Hughes',
  'Reid',
  'Ortiz',
  'Kaur',
  'Moss',
  'Yang',
  'Cole',
];
const PARENT_FIRST = [
  'Rosa',
  'Jin',
  'Alex',
  'Tara',
  'Ken',
  'Nina',
  'Paul',
  'Lena',
  'Beth',
  'Raj',
  'Gwen',
  'Hugo',
  'Cal',
  'Erin',
  'Matt',
  'Joy',
];

/** [name, jersey, parent (user id or new parent name), has own login, fixed profile id] */
type RosterSeed = [string, number, string | null, boolean?, string?];

const FIXED_ROSTERS: Record<string, RosterSeed[]> = {
  U12G: [
    ['Maya Smith', 8, 'jordan', false, 'maya'],
    ['Ava Chen', 4, 'Wei Chen'],
    ['Zoe Patel', 11, 'Priya Patel'],
    ['Lily Okafor', 5, 'Ada Okafor'],
  ],
  U18B: [
    ['Eli Smith', 1, 'jordan', true, 'eli'],
    ['Marcus Hill', 23, null, true],
    ['Dev Sharma', 7, 'Raj Sharma', true],
  ],
};

const TEAM_STAFF: Record<string, string[]> = {
  U10B: ['Chris Bell'],
  U12G: ['Kim Alvarez'],
  U14B: ['Ray Novak'],
  U16G: ['Tess Moreau', 'Jo Park'],
  U18B: ['Andre Lewis'],
};

/** Demo data for the Spartans club, also used as preview sample data. Dates are relative to `now` so the schedule stays current. */
export function createSeed(now: Date): MockData {
  const teams: Team[] = [
    ['U10B', 'U10 Boys'],
    ['U12G', 'U12 Girls'],
    ['U14B', 'U14 Boys'],
    ['U16G', 'U16 Girls'],
    ['U18B', 'U18 Boys'],
  ].map(([id, name]) => ({ id, name }));

  const users: User[] = [];
  const profiles: PlayerProfile[] = [];
  const ids = new Set<string>();
  const addUser = (name: string, kind: UserKind, teamIds: string[], extra: Partial<User> = {}): string => {
    const base = extra.id ?? name.toLowerCase().replace(/[^a-z]+/g, '-');
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    users.push({ ...extra, id, name, kind, teams: [...teamIds] });
    return id;
  };

  addUser('Sam Okoro', 'club', [], { id: 'sam', title: 'Club Director' });
  addUser('Lee Fontaine', 'club', [], { id: 'lee', title: 'Registrar' });
  // The same username exists at the Panthers as a different person: accounts are per club.
  addUser('Jordan Smith', 'parent', ['U12G', 'U18B'], { id: 'jordan', email: 'jordan.smith@email.com' });
  addUser('Dana Reyes', 'staff', ['U12G', 'U14B'], { id: 'dana' });
  addUser('Mike Tran', 'staff', ['U18B'], { id: 'mike' });
  for (const [team, names] of Object.entries(TEAM_STAFF)) names.forEach((n) => addUser(n, 'staff', [team]));

  teams.forEach((team, ti) => {
    const older = Number(team.id.slice(1, 3)) >= 16;
    const girls = team.id.endsWith('G');
    const roster: RosterSeed[] = [...(FIXED_ROSTERS[team.id] ?? [])];
    const used = new Set(roster.map((r) => r[1]));
    for (let i = 0; roster.length < 9; i++) {
      const first = (girls ? GIRLS : BOYS)[(i * 3 + ti * 5) % 13];
      const last = LAST[(i * 7 + ti * 3) % 18];
      let jersey = ((i * 5 + ti * 7) % 30) + 2;
      while (used.has(jersey)) jersey++;
      used.add(jersey);
      const parent = older && i % 3 === 2 ? null : `${PARENT_FIRST[(i * 5 + ti * 2) % 16]} ${last}`;
      roster.push([`${first} ${last}`, jersey, parent, older]);
    }
    for (const [name, jersey, parent, ownLogin, fixedId] of roster) {
      const parentId = parent === 'jordan' ? 'jordan' : parent ? addUser(parent, 'parent', [team.id]) : null;
      const userId = ownLogin ? addUser(name, 'player', [team.id], fixedId === 'eli' ? { id: 'eli' } : {}) : null;
      profiles.push({
        id: fixedId ?? `pf${profiles.length}`,
        name,
        jersey: String(jersey),
        team: team.id,
        parentId,
        userId,
        login: userId ? `${userId}@email.com` : '',
      });
    }
  });
  const eli = profiles.find((p) => p.id === 'eli');
  if (eli) eli.login = 'eli.smith@email.com';

  const day = (offset: number) => isoDate(addDays(now, offset));
  const at = (daysAgo: number, time: string) => new Date(`${day(-daysAgo)}T${time}:00`).toISOString();
  let msgId = 0;
  const msg = (from: string, text: string, sentAt: string): ChatMessage => ({ id: `m${++msgId}`, from, text, sentAt });
  const thread = (id: string, name: string, scope: string, o: Partial<Thread> = {}): Thread => ({
    id,
    name,
    scope,
    teams: [],
    include: { ...ALL_GROUPS },
    members: [],
    creatorId: null,
    isDefault: false,
    messages: [],
    unread: 0,
    ...o,
  });
  const allTeams = teams.map((t) => t.id);

  const threads: Thread[] = [
    thread('club-ann', '#club-announcements', 'club', {
      creatorId: 'sam',
      teams: allTeams,
      members: ['lee'],
      messages: [
        msg(
          'sam',
          'Winter registration opens next week. Details are in the email from the club office.',
          at(4, '16:00'),
        ),
      ],
    }),
    thread('carpool', 'Carpool · Thursday', 'U12G', {
      creatorId: 'jordan',
      members: ['priya-patel', 'wei-chen'],
      unread: 2,
      messages: [
        msg('jordan', 'I can drive Thursday. Room for two more.', at(1, '19:10')),
        msg('wei-chen', 'Ava needs a ride, thanks!', at(0, '10:41')),
        msg('priya-patel', 'Zoe too if there is space. Pickup 5:30?', at(0, '10:44')),
      ],
    }),
    thread('bake', 'Bake sale volunteers', 'U12G', {
      creatorId: 'priya-patel',
      members: ['jordan', 'wei-chen', 'ada-okafor'],
      messages: [msg('priya-patel', 'Sign-up sheet for the bake sale table is up. Add your name!', at(2, '11:00'))],
    }),
    thread('hotel', 'Tournament hotel', 'U18B', {
      creatorId: 'mike',
      members: ['jordan', 'marcus-hill', 'dev-sharma'],
      messages: [
        msg('mike', 'Block rate at the Lakeview Inn is held until Friday.', at(2, '09:30')),
        msg('jordan', 'Booked two nights. Thanks Coach.', at(2, '10:05')),
      ],
    }),
    thread('coaches', 'Club coaches', 'club', {
      creatorId: 'sam',
      teams: allTeams,
      include: { staff: true, parents: false, players: false },
      members: ['lee'],
      messages: [msg('sam', 'Coaches meeting Thursday 7 PM at the Centre.', at(5, '18:00'))],
    }),
  ];
  for (const t of teams) {
    threads.push(
      thread(`${t.id}-ann`, '#announcements', t.id, { isDefault: true, teams: [t.id] }),
      thread(`${t.id}-gen`, '#general', t.id, { isDefault: true, teams: [t.id] }),
    );
  }
  const byId = (id: string) => threads.find((t) => t.id === id) as Thread;
  Object.assign(byId('U12G-ann'), {
    unread: 1,
    messages: [
      msg(
        'dana',
        'Gym change for Tuesday practice: we are at Northview Middle School, not the Centre.',
        at(0, '08:12'),
      ),
    ],
  });
  Object.assign(byId('U18B-ann'), {
    messages: [msg('mike', 'Tournament schedule for next weekend is posted. Check the Schedule tab.', at(1, '17:20'))],
  });
  Object.assign(byId('U12G-gen'), {
    unread: 3,
    messages: [
      msg('priya-patel', 'Does anyone have spare size 6 court shoes?', at(0, '07:40')),
      msg('jordan', 'Maya has a pair she outgrew. I can bring them Tuesday.', at(0, '07:52')),
      msg('priya-patel', 'Amazing, thank you!', at(0, '07:55')),
      msg('wei-chen', 'Water bottles are labelled now, please check yours.', at(0, '09:03')),
      msg('ada-okafor', 'Lily left a black hoodie at the gym, size S.', at(0, '09:20')),
    ],
  });
  Object.assign(byId('U18B-gen'), { messages: [msg('marcus-hill', 'Who has the ball pump?', at(3, '15:00'))] });

  const events: ClubEvent[] = [
    {
      id: 'e1',
      type: 'practice',
      team: 'U12G',
      date: day(1),
      time: '18:00',
      location: 'Northview Middle School Gym',
      notes: 'Bring light and dark jerseys.',
    },
    {
      id: 'e2',
      type: 'game',
      team: 'U18B',
      opponent: 'Riverside Hawks',
      home: true,
      date: day(3),
      time: '19:30',
      location: 'Spartan Centre · Court 1',
      notes: 'Warm-up starts 6:45 PM. White jerseys.',
    },
    {
      id: 'e10',
      type: 'practice',
      team: 'U14B',
      date: day(2),
      time: '17:30',
      location: 'Spartan Centre · Court 2',
      notes: '',
    },
    {
      id: 'e11',
      type: 'game',
      team: 'U16G',
      opponent: 'Northgate Storm',
      home: true,
      date: day(4),
      time: '18:00',
      location: 'Spartan Centre · Court 1',
      notes: '',
    },
    {
      id: 'e12',
      type: 'practice',
      team: 'U10B',
      date: day(6),
      time: '10:00',
      location: 'Spartan Centre · Court 3',
      notes: 'Parents please stay for the first 15 minutes.',
    },
    {
      id: 'e3',
      type: 'special',
      team: 'ALL',
      title: 'Club Awards Night',
      tbd: true,
      location: 'Spartan Centre Hall',
      notes: 'Date confirmed once the league schedule is released. Families welcome.',
    },
    {
      id: 'e4',
      type: 'practice',
      team: 'U18B',
      date: day(5),
      time: '09:00',
      location: 'Spartan Centre · Court 2',
      notes: '',
    },
    {
      id: 'e5',
      type: 'game',
      team: 'U12G',
      opponent: 'Eastside Kings',
      home: false,
      tbd: true,
      location: 'Eastside Community Centre',
      notes: 'Tournament pool play. Time posted when the bracket is out.',
    },
    {
      id: 'e6',
      type: 'game',
      team: 'U12G',
      opponent: 'Westdale Wolves',
      home: true,
      date: day(-2),
      time: '10:00',
      location: 'Spartan Centre · Court 1',
      notes: '',
      score: { us: 42, them: 38 },
    },
    {
      id: 'e7',
      type: 'practice',
      team: 'U18B',
      date: day(-4),
      time: '19:00',
      location: 'Spartan Centre · Court 2',
      notes: '',
    },
    {
      id: 'e8',
      type: 'game',
      team: 'U18B',
      opponent: 'Lakeshore Lions',
      home: false,
      date: day(-5),
      time: '18:30',
      location: 'Lakeshore Secondary',
      notes: '',
      score: { us: 55, them: 61 },
    },
    {
      id: 'e9',
      type: 'practice',
      team: 'U12G',
      date: day(-6),
      time: '18:00',
      location: 'Northview Middle School Gym',
      notes: '',
    },
  ];

  const rsvps: RsvpMap = {
    e2: { eli: 'going' },
    e6: { maya: 'going' },
    e7: { eli: 'going' },
    e8: { eli: 'going' },
    e3: { maya: 'going' },
  };

  for (const u of users) u.email ??= u.id === 'eli' ? 'eli.smith@email.com' : `${u.id}@spartans.example`;

  return {
    teams,
    users,
    profiles,
    events,
    rsvps,
    threads,
    muted: [],
  };
}
