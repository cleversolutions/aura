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

The mock backend starts signed in as a parent (Jordan Smith). Open **More → Demo account** to switch between the
parent, player, team staff and club staff views. Mock data lives in memory and resets on reload.

## Workspace layout

```
apps/aura                    App shell: root component, tab bar, routes, PWA config
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

Domains are `schedule`, `chat` and `club` (club has two feature libs: `feature-roster` and `feature-account`).

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

1. Create `libs/backend/supabase` implementing the four abstract classes in `@aura/backend/api`.
2. Export a `provideSupabaseBackend()` that binds them, mirroring `provideMockBackend()`.
3. Replace `provideMockBackend()` in `apps/aura/src/app/app.config.ts`.

`ChatRepository.subscribe()` maps directly onto Supabase Realtime. `AuthRepository.demoAccounts()` should return `[]`,
which hides the demo switcher. The app reloads chat and schedule data whenever the signed-in user changes, so
row-level security will scope the data correctly.

## Design

Ported from the Claude Design project "Spartans PWA v2". `apps/aura/public/club-logo.svg` is a placeholder; replace it
with the club's real logo (and update `logoUrl` in the seed or the club record).
