# Aura

Club Management Tool: schedules, RSVPs, team chat and rosters for a youth sports club, as an installable PWA.

Built with zoneless Angular 22, NgRx Signal Store, Tailwind CSS v4 and Nx. Unit tests run on Vitest. The backend will
be Supabase; for now every backend call goes through in-memory mock providers.

## Getting started

Node is managed with [Volta](https://volta.sh); the version is pinned in `package.json` (`"volta"`), and CI reads it
from there too. With Volta installed, `node` and `npm` switch to the pinned version automatically inside this repo.

```sh
npm ci
npm start          # http://localhost:4200
npm test           # all unit tests
npm run build      # production build (with service worker) in dist/apps/aura
```

Useful Nx commands:

```sh
npx nx test schedule-data-access   # one project
npx nx graph                       # dependency graph
npx nx affected -t test build      # only what changed
```

Mock data lives in memory and resets on reload. Every seeded account uses the password `password`.

- `/` lists the demo clubs: **Spartans** (`/k3v9qp`, black on white) and **Panthers** (`/p7x2mn`, navy on gold).
- The Spartans start signed in as a parent (Jordan Smith). Open **More → Demo account** to switch between the parent,
  player, team staff and club staff views, or **Sign out** to try the sign-in page.
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
  backend/api                Backend ports: AuthRepository, DirectoryRepository, ScheduleRepository, ChatRepository
  backend/mock               In-memory implementations + seed data; provideMockBackend(), provideTestBackend()
  <domain>/data-access       Signal stores: ClubStore, ScheduleStore, ChatStore
  <domain>/ui                Presentational components for the domain (cards, rows, forms, sheets)
  <domain>/feature*          Container pages, one per route
```

Domains are `schedule`, `chat`, `club` (two feature libs: `feature-roster`, and `feature-account`, which also holds
sign-in) and `platform` (the master admin: `data-access`, `ui`, `feature-admin`).

## Clubs, links and accounts

Each club lives under its own unguessable link, `/<slug>`, and every club route is nested under it
(`/k3v9qp/schedule`). `/admin` is the platform admin; slugs never contain `i`, so they cannot clash with it.

- **Accounts are per club.** The same username at two clubs is two different people; `(club, username)` is unique,
  not the username. Signing in always names the club (`AuthRepository.signIn({ clubSlug, username, password })`).
  The platform admin is the only account that spans clubs.
- **Sessions are per club.** Installed club apps share browser storage on one origin, so a real backend must keep its
  stored session keyed by slug. `AuthRepository.useClub(slug)` selects the active club; the other repositories are
  scoped to it.
- **Each club installs as its own app.** Browsers tell installed apps apart by the manifest `id`. The backend serves
  `clubManifest(club)` (shared/util) at `DirectoryRepository.manifestUrl(slug)`, with `id`, `start_url` and `scope`
  all `/<slug>/`, and the app points `<link rel="manifest">` at it. The mock has no server, so it keeps the static
  manifest and per-club install is not yet testable.
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
Only `app.config.ts` (and tests) import `backend/mock`.

## Swapping in Supabase

1. Create `libs/backend/supabase` implementing the five abstract classes in `@aura/backend/api`.
2. Export a `provideSupabaseBackend()` that binds them, mirroring `provideMockBackend()`.
3. Replace `provideMockBackend()` in `apps/aura/src/app/app.config.ts`.

`ChatRepository.subscribe()` maps directly onto Supabase Realtime. `AuthRepository.demoAccounts()` and `demoClubs()`
should return `[]`, which hides the demo switcher and the demo club list. The app reloads chat and schedule data
whenever the club or the signed-in user changes, so row-level security keyed by club will scope the data correctly.

Things the Supabase backend needs to handle:

- Supabase Auth requires a globally unique email, but Aura usernames are only unique per club. Map each
  `(club, username)` to its own auth identity, e.g. a generated login id, or sign in through an edge function.
- Create one Supabase client per club slug with its own `auth.storageKey`, so sessions in different clubs don't
  overwrite each other.
- Serve `/<slug>/manifest.webmanifest` (e.g. a Cloudflare Pages Function) from `clubManifest()`, and upload the club
  icons and logo to storage instead of keeping them as data URLs.
- `usePreview()` shows sample data under a club's branding. It needs a source of sample data that no real club
  can see.

## Design

Ported from the Claude Design project "Spartans Basketball PWA", file "Spartans PWA v4" (responsive layout, master
admin, club colours). The sign-in and choose-a-password screens are not in the design; they follow its visual language.
`apps/aura/public/club-logo.svg` and `clubs/panthers.svg` are placeholders for the demo clubs.
