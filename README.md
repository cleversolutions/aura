# Aura

Club Management Tool: schedules, RSVPs, team chat and rosters for a youth sports club, as an installable PWA.

Built with zoneless Angular 22, NgRx Signal Store, Tailwind CSS v4 and Nx. Unit tests run on Vitest. The backend is
Supabase (Postgres with row-level security, Auth, Realtime, Storage and edge functions); an in-memory mock backend
implements the same ports for tests and offline demos.

## Getting started

Node is managed with [Volta](https://volta.sh); the version is pinned in `package.json` (`"volta"`), and CI reads it
from there too. With Volta installed, `node` and `npm` switch to the pinned version automatically inside this repo.

```sh
npm ci
npm run db:start   # local Supabase in Docker (first run pulls the images)
npm run db:reset   # apply migrations and seed the demo clubs (wipes the local database)
npm start          # http://localhost:4200, against the local Supabase
npm run start:mock # or: the in-memory mock backend, no Docker needed
npm test           # all unit tests (no Docker needed)
npm run build      # production build (with service worker) in dist/apps/aura
```

Useful Nx commands:

```sh
npx nx test schedule-data-access   # one project
npx nx graph                       # dependency graph
npx nx affected -t test build      # only what changed
```

Both backends have the same demo data: the **Spartans** (`/k3v9qp`, black on white) and the **Panthers** (`/p7x2mn`,
navy on gold). Every seeded account uses the password `password`; usernames are the seeded emails, e.g.
`jordan.smith@email.com` (parent), `eli.smith@email.com` (player), `dana@spartans.example` (team staff) and
`sam@spartans.example` (club staff).

- With Supabase, open a club's link and sign in. Data persists until `npm run db:reset`, which wipes everything.
- With the mock (`npm run start:mock`), data lives in memory and resets on reload. `/` lists the demo clubs, the
  Spartans start signed in as Jordan Smith, and **More → Demo account** switches between the parent, player, team
  staff and club staff views.
- Both clubs have a `jordan.smith@email.com`. They are different people: accounts belong to one club, so signing in
  always happens at a club's link.
- `/admin` is the platform admin (`admin@aura.example`). It lists clubs, creates them (logo, colours read from the
  logo, admin sign-in, link) and previews any club with sample data. A new club's admin signs in at the club's link
  with the temporary password and must choose their own.

Layout follows the screen: a bottom tab bar on phones, a side nav from 900px (labelled from 1200px), with the open
event and the open chat thread beside their lists.

## Workspace layout

```
apps/aura                    App shell: root component, nav, routes and guards, club branding, PWA config
libs/
  shared/models              Domain types (Team, User, ClubEvent, Thread, ...)
  shared/util                Pure helpers (formatting, membership/permission rules), CLOCK, Toaster, Submission
  shared/ui                  Design tokens (theme.css) and primitives: sheet, toast, icon, chips, segmented, ...
  backend/api                Backend ports: AuthRepository, DirectoryRepository, ScheduleRepository, ChatRepository,
                             PlatformRepository
  backend/mock               In-memory implementations + seed data; provideMockBackend(), provideTestBackend()
  backend/supabase           Supabase implementations; provideSupabaseBackend()
  <domain>/data-access       Signal stores: ClubStore, ScheduleStore, ChatStore
  <domain>/ui                Presentational components for the domain (cards, rows, forms, sheets)
  <domain>/feature*          Container pages, one per route
```

Outside `apps` and `libs`:

```
supabase/
  config.toml                Local Supabase settings (sign-ups off: accounts come from edge functions)
  migrations/                Schema, row-level security and helper functions
  tests/                     pgTAP tests for row-level security (npm run db:test)
  functions/                 Edge functions: create-club, update-club, invite-member, update-member, manage-invite,
                             manage-member
functions/                   Cloudflare Pages Functions: /<slug>/manifest.webmanifest
tools/                       Seed script and test runners
```

Domains are `schedule`, `chat`, `club` (two feature libs: `feature-roster`, and `feature-account`, which also holds
sign-in) and `platform` (the master admin: `data-access`, `ui`, `feature-admin`).

## Clubs, links and accounts

Each club lives under its own unguessable link, `/<slug>`, and every club route is nested under it
(`/k3v9qp/schedule`). `/admin` is the platform admin; slugs never contain `i`, so they cannot clash with it.

- **Accounts are per club.** The same username at two clubs is two different people; `(club, username)` is unique,
  not the username. Signing in always names the club (`AuthRepository.signIn({ clubSlug, username, password })`).
  The platform admin is the only account that spans clubs.
- **Sign-in identities are derived.** Supabase Auth needs a globally unique email, so each club member's auth user
  is `authEmailFor(clubId, username)` (shared/util): `<club uuid>_<sha256(username), 24 hex>@login.aura.invalid`.
  The readable username stays in `members.username`. `.invalid` never resolves, so no mail can reach anyone.
  Changing the login domain (or the format) changes every member's sign-in address: it needs a one-off admin script
  that rewrites each club member's `auth.users.email`, and the edge functions' `AURA_LOGIN_DOMAIN` must match the
  app's. Club ids must never change for the same reason.
- **Sessions are per club.** Installed club apps share browser storage on one origin, so each club has its own
  Supabase client with its own session key (`aura-auth-<slug>`; the admin console uses `aura-auth-platform`).
  `AuthRepository.useClub(slug)` selects the active club; the other repositories are scoped to it, and row-level
  security limits every query to the signed-in member's club (`app_metadata.club_id`, set only by edge functions).
- **Each club installs as its own app.** Browsers tell installed apps apart by the manifest `id`. A Cloudflare Pages
  Function serves `clubManifest(club)` (shared/util) at `/<slug>/manifest.webmanifest`, with `id`, `start_url` and
  `scope` all `/<slug>/`, and the app points `<link rel="manifest">` at it. The dev server and the mock have no such
  endpoint, so they keep the static manifest.
- **Club colours** replace the `ink` and `paper` tokens at runtime (`themeTokens()`), so all components follow the
  open club's theme. The admin form reads the two colours from the logo and warns when contrast is too low.

## Component architecture: containers and presentational components

The front end follows a smart/dumb (container/presentational) split, enforced by library type:

- **Presentational components** live in `shared/ui` and `<domain>/ui`. They take data through `input()`s (usually a
  `…Vm` view-model interface exported next to the component) and report user intent through `output()`s. They never
  inject stores, services, the router or the toaster, and never import `data-access` or `backend` libraries. Local UI
  state is fine: form field values, which players are ticked, field-level validation messages. Forms emit a validated
  value (`submitted`) and accept `saving` and `error` inputs for the server round-trip.
- **Containers** are the route components in `feature` libraries (plus the app root and tab shell). They inject
  stores, map state into view models with `computed()`, and handle outputs: calling the store, catching failures,
  showing toasts, navigating. `Submission` (shared/util) holds the `saving`/`error` pair a container passes to a form.

Test presentational components with plain inputs and output spies, no backend needed. Test containers against the
mock backend via `provideTestBackend()`.

Projects are tagged `scope:*` and `type:*` (see each `project.json`) so these rules can be enforced with Nx module
boundaries later. Dependency direction: `feature → ui, data-access → backend/api → shared/*`; `ui → shared/*` only.
Only `app.config.ts` (and tests) import `backend/mock`, plus `backend/supabase`'s preview (see below).

## Supabase backend

Feature code only sees the ports in `@aura/backend/api`; `app.config.ts` binds them to `provideSupabaseBackend()` or
`provideMockBackend()` depending on the build configuration (`apps/aura/src/environments`).

- **Schema and permissions** live in `supabase/migrations`. The SQL helpers `thread_member_ids`, `is_thread_member`,
  `can_read_thread`, `can_post_in_thread`, `can_moderate_thread`, `can_manage_thread`, `can_edit_event`,
  `can_manage_team`, `can_change_member_team`, `can_see_contact` and `can_see_player_care` mirror `permissions.ts`;
  change both together. `npm run test:supabase` checks SQL and TypeScript agree on every seeded thread's members, on
  whose emails each kind of member sees, and on whose care details.
- **Club settings** (`club_settings`, one row per club, edited by club staff under More → Club settings) hold
  club-wide choices; a club without a row has the defaults (`DEFAULT_CLUB_SETTINGS`). Today: who posts in
  announcement channels, and who sees contact details.
- **Contact details.** Members read each other's names, roles and teams, but not `members.email`, `username` or
  `phone` (column grants): emails and phones come from `member_contacts()`, which applies `can_see_contact`. By
  default club staff see everyone's, team staff their teams' people, and parents and players their teams' staff, the
  club staff and their own players'; the `contacts` setting lets everyone see everyone's. Only staff see the INVITED
  list unless it does. A player's emergency contact and medical notes (`player_care`) are another matter: only
  their parents, the player, club staff and the team's staff read or write them (`can_see_player_care`), whatever
  the setting, and they carry over with the player into a new season.
- **Weekly events** are one event per week sharing a `series_id`, so each week keeps its own RSVPs, cancellation and
  score. `save_event_series` applies an edit to one week and every later week (dates move by the same number of
  days), under the events policies; deleting later weeks is a filtered delete. Events also have optional end and
  arrive-by times; the map link is built from the location.
- **Teams and seasons.** Every club has one current season (`seasons.ended_at` null); a new club gets its first,
  named for the school year (`2026–27`). Teams belong to a season and have generated ids (never derived from the
  name, so they can be renamed; older teams keep ids like `U11B`), a free-text name unique within the season, and an
  optional age and division. Events belong to their team's season, or to the current one if club-wide. A team needs
  no staff: club staff manage it meanwhile. `delete_team` deletes a mistake (no players, no events) with its
  channels. `start_season` (club staff) ends the current season and carries the chosen teams over, renamed, with
  or without their staff and approved players (copied with their parents; those parents and the players' own
  sign-ins join the new team). It moves every `team_members` row of the old season into `past_team_members`, so
  team membership, and every rule built on it (`member_teams`, `can_manage_team`, `can_see_contact`, thread
  membership, the edge functions, `permissions.ts`), always means this season. Triggers make past seasons read-only
  for signed-in members (teams, rosters, profiles, events, RSVPs, and messages in past teams' threads); the service
  role's cascades still work. The app loads every season's teams but only this season's profiles; `loadSeason`
  fetches a past season's rosters, which Roster and Schedule show read-only behind a season picker. Chat hides past
  teams' threads.
- **Roster corrections** go through SQL functions that check `can_manage_team`: `approve_player` and
  `remove_player` (parents' link requests, and taking a player off the roster with their RSVPs), `move_player`
  (for staff of both teams; the player's parents and own sign-in join the new team, and parents leave the old one
  unless another of their players is on it) and `set_member_teams` (`can_change_member_team`: club staff for
  anyone but club staff, team staff for families on their teams; also how someone already in the club joins
  another team).
- **Edge functions** do the work that needs the service-role key: `create-club` and `update-club` (platform admin;
  `update-club` also makes another of the club's staff its admin), `invite-member` (club staff, or team staff for
  their teams; club staff also invite club staff, who join no team; with `profile`, gives a player already on the
  roster their own sign-in), `update-member` (yourself, or anyone at the club
  for club staff; a new email moves the person's sign-in), `manage-invite` (resend with a new temporary password, or
  cancel, while someone has not joined; whoever could invite them) and `manage-member` (for people who have joined:
  reset a forgotten password, which club staff do for anyone and team staff for their teams' families, and the
  platform admin for the club admin; disable, enable or remove, club staff only). Logos and icons go to the
  `club-assets` bucket.
- **Leaving the club.** A disabled member (`members.disabled`) stays on record but cannot sign in (their auth user is
  banned) and has no access: `auth_club_id()` is null for them, so every policy denies them, and they are in no
  thread. Removing a member deletes their sign-in and member row; foreign keys unlink them from teams, threads and
  players, and their messages stay with `from_member_id` null, shown as "Former member". Nobody disables or removes
  themselves or the club admin.
- **Invites have no email yet.** `invite-member` creates the member's sign-in with a temporary password and returns
  it once; staff see the club link, username and password with copy buttons and send them by hand. The member must
  choose their own password at first sign-in, which also takes them off the invited list.
- **Preview** (`usePreview`) shows a club's real branding over the mock's in-memory sample data, so no real club's
  data is ever shown or touched. `libs/backend/supabase/src/lib/preview.ts` is the one place that library imports
  the mock.
- **Chat** loads up to the newest 1,000 messages per club (PostgREST's row limit) and receives new ones, edits and
  deletions over Realtime; row-level security limits all of them to threads the member can read. Default channels
  have fixed membership: `#club-announcements` (everyone in the club) and each team's `#announcements` and
  `#general` (everyone on the team). Club staff also read and post in every team's channels without counting as
  members. `#announcements` and `#club-announcements` are announcement channels: staff post, unless the club setting
  lets everyone. Senders edit and delete their own messages (`edit_message`, `delete_message`); club staff, and a
  team's staff in its threads, delete anyone's. A deleted message keeps its place as "Message deleted".

Commands (local Supabase ports: API 54321, database 54322, Studio 54323, Mailpit 54324):

```sh
npm run db:start         # start local Supabase (Docker)
npm run db:reset         # DESTRUCTIVE: wipes the local database (every club, sign-in and upload), then seeds
npm run db:seed          # replaces the demo clubs and the platform admin; refuses if a demo club was changed
                         # since it was seeded (pass -- --force to replace it anyway)
npm run db:test          # pgTAP row-level security tests
npm run db:types         # regenerate libs/backend/supabase/src/lib/database.types.ts after a migration
npm run functions:test   # edge function tests (Deno, run in Docker)
npm run test:supabase    # Supabase repository tests (seed and delete their own throwaway clubs)
```

CI runs all of these in a separate `supabase` job.

To apply new migrations to a local database without losing its data, use `npx supabase migration up --local`
instead of `db:reset`. Everything else above leaves existing clubs alone.

## Hosting

The app is free for clubs and is meant to run on free tiers: Cloudflare Pages for the app and Supabase's free plan.
Neither account exists yet; until then production builds use the mock backend.

1. Create the Supabase project. Apply the schema with `npx supabase link` and `npx supabase db push`, deploy the
   functions with `npx supabase functions deploy`, and set their secrets:
   `npx supabase secrets set AURA_PUBLIC_SUPABASE_URL=https://<project>.supabase.co AURA_LOGIN_DOMAIN=login.aura.invalid`.
   In Auth settings, turn off sign-ups and email confirmations. Create the platform admin as a user with
   `app_metadata.role = "platform_admin"`. Do not run the seed script against it.
2. Check that the hosted Auth accepts `login.aura.invalid` addresses (local Supabase does). If not, use a subdomain
   of the app's own host, e.g. `login.<project>.pages.dev`, in both the functions' secret and the build.
3. Create the Cloudflare Pages project from this repository. Build command:
   `node tools/write-environment.mjs && npx nx build aura`; output directory `dist/apps/aura/browser`. Set
   `AURA_SUPABASE_URL` and `AURA_SUPABASE_ANON_KEY` (public by design) for the build and for Functions. The
   service-role key never goes into the app, the build or the repository. Pages serves `index.html` for unknown
   paths, which the router needs.
4. On Chrome desktop or Android, install two clubs from their links and confirm they appear as separate apps.

Free-tier limits to keep in mind:

- **Supabase pauses a free project after about a week without activity**, and every club's app fails until it is
  resumed in the dashboard. Before relying on it off-season, add a scheduled ping (e.g. a Cloudflare Cron Trigger) or
  move to a paid plan.
- Supabase also caps database size, storage, monthly active users and concurrent Realtime connections; icons are
  small PNGs and only the active club opens a Realtime channel.
- **Pick the final address before real clubs install the app.** Installed apps, saved sign-ins and club links all
  belong to one origin; moving to a custom domain later means every member reinstalls and signs in again.

## Design

Ported from the Claude Design project "Spartans Basketball PWA", file "Spartans PWA v4" (responsive layout, master
admin, club colours). The sign-in and choose-a-password screens are not in the design; they follow its visual language.
`apps/aura/public/club-logo.svg` and `clubs/panthers.svg` are placeholders for the demo clubs.
