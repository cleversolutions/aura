# Aura

Multi-club PWA (schedules, RSVPs, chat, rosters) on zoneless Angular 22, NgRx Signal Store, Tailwind v4 and Nx.
Read `README.md` for the workspace layout, the container/presentational split and the backend ports; this file only
adds what the README does not say or what is easy to get wrong.

## Environment

- Node is managed by Volta. Non-interactive shells do not have it on `PATH`, so prefix commands with
  `export PATH="$HOME/.volta/bin:$PATH";` or `npx` is not found.
- Docker Desktop's CLI is at `~/.docker/bin`, also not on the non-interactive `PATH`; add it for the Supabase
  commands. They talk to the Docker socket, so run them with the sandbox disabled.
- Local Supabase (`npm run db:start`): API 54321, database 54322, Studio 54323, Mailpit 54324. `npm start` needs it
  running and seeded (`npm run db:reset`); `npm run start:mock` does not.
- The GitHub CLI is at `/usr/local/bin/gh`. Git and `gh` credentials live in the macOS keychain, which the sandbox
  cannot reach: run `git push`, `git fetch` and `gh` with the sandbox disabled.

## Verifying a change

Run what CI runs (`.github/workflows/ci.yml`), plus a typecheck:

```sh
npx nx run-many -t test build                # all unit tests + production build (checks templates)
npx nx format:check --base=origin/main       # Prettier; fix with npx nx format:write
npx tsc -p libs/<scope>/<lib>/tsconfig.lib.json --noEmit   # Vitest does not typecheck; also tsconfig.spec.json
```

After touching `supabase/` or `libs/backend/supabase`, also run what the CI `supabase` job runs: `npm run db:reset`,
`npm run db:test`, `npm run functions:test` and `npm run test:supabase`. After a migration, `npm run db:types`.

New libraries are scaffolded by copying an existing one's `project.json`, `tsconfig*.json`, `vite.config.mts` and
`src/test-setup.ts`, then adding the path alias to `tsconfig.base.json`. Tag them `scope:*` and `type:*`.

## Rules

- **Accounts are per club.** The same username in two clubs is two different people: `(club, username)` is unique,
  never the username alone. Sign-in always passes the club slug. Sessions are kept per club (installed club apps share
  storage on one origin). Only the platform admin (`/admin`) spans clubs. Never write code that assumes a user
  belongs to more than one club.
- **Club links are slug-scoped.** Every club route lives under `/:club` (e.g. `/k3v9qp/chat`). Build links with the
  slug from `ClubStore.slug()` (or relative to the tab shell); never hard-code `/chat`, `/schedule`, etc.
- **Presentational components** (`*/ui`, `shared/ui`) take inputs and emit outputs only. Links they render come in
  through their view model (e.g. `ThreadListItemVm.link`). They may call pure helpers from `shared/util`.
- **Colours** come from the `ink` / `paper` / `pressed` / `subtle` tokens only; club themes replace them at runtime
  (`themeTokens()`). No hard-coded colours outside the design tokens, except previews that show a club's own colours.
- **Layout:** structural differences (which nav, side pane vs sheet, chat split) use the `Viewport.wide()` signal;
  styling uses the `wide:` (900px) and `full:` (1200px) variants. Both use the same breakpoints, defined in `rem` in
  `theme.css` and `WIDE_QUERY`; change them together.
- Pages own their `<h1>`. Shared headers and shells must not add another.
- **Club sign-ins are derived** (`authEmailFor` in shared/util, copied verbatim into `supabase/functions/_shared`):
  change both copies together, and never let a club's id change. Only edge functions create auth users or set
  `app_metadata`; row-level security trusts `app_metadata.club_id`.
- Permission rules exist twice: in `permissions.ts`, and as SQL helpers in the migrations or checks in the edge
  functions (`managesInvite` in `supabase/functions/_shared/admin.ts`); change them together.
- A new edge function directory is only picked up when local Supabase restarts (`npm run db:stop && npm run db:start`).
- Keep the mock backend (`libs/backend/mock`) honest: it models what the real backend must do (per-club sessions,
  per-club credentials, permission checks), not just the happy path.

## Angular gotchas

- In async guards and other async functions, call every `inject()` before the first `await`; the injection
  context ends there (NG0203).
- Canvas helpers (`readLogoColors`, `renderAppIcon`) return null without canvas, as in jsdom. Tests cannot exercise
  logo colours or icon drawing; check those in a browser.
- App-level tests render the real `App` with `provideTestBackend()` and settle with a few
  `setTimeout` + `whenStable()` rounds so guards, store loads and effects finish (see `apps/aura/src/app/app.spec.ts`).

## Design source

Designs come from the Claude Design project "Spartans Basketball PWA" (files `Spartans PWA v2/v3/v4.dc.html`), read
through the `claude_design` MCP tools. The current code implements v4. When a new version lands, diff it against the
previous version rather than re-reading the whole file: each version's changes are not always what its name
suggests (v3 introduced the responsive layout). Screens not in the design (sign-in, choose a password, landing) follow
its visual language. Update the design credit in the README when porting a new version.

## Git

Work on a branch and open a PR into `main`; do not commit to `main` directly. Leave unrelated local changes (for
example in-progress Supabase setup) out of commits unless asked.
