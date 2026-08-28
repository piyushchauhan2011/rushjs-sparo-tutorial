# Hotel Booking Monorepo — Rush + Sparo tutorial

A small hotel-booking app used as a vehicle for exploring [Rush.js](https://rushjs.io) monorepo
management and TikTok's [Sparo](https://tiktok.github.io/sparo/) sparse-checkout plugin. The
domain logic is intentionally minimal — the point is the monorepo tooling.

## Stack

- **API**: NestJS 11 + TypeORM 1.x + PostgreSQL, JWT auth
- **Web**: TanStack Start (React 19) + TanStack Router + shadcn-style components + Tailwind CSS v4
- **Monorepo**: Rush.js + PNPM workspaces, with Sparo for sparse checkout
- **Infra**: Docker Compose (Postgres, API, Web)

## Layout

```text
apps/
  api/    NestJS + TypeORM REST API
  web/    TanStack Start frontend
packages/
  ui/                shared shadcn-style React components (@hotel/ui)
  shared-types/       DTOs shared by api + web (@hotel/shared-types)
  api-client/         typed fetch client used by web (@hotel/api-client)
  eslint-config/       shared ESLint flat configs
  typescript-config/   shared tsconfig bases
```

The three library packages (`ui`, `shared-types`, `api-client`) are consumed from
source: their `main`/`types` point at `src/index.ts` and their `build` script only
runs `tsc --noEmit`. Nothing publishes them; `shared-types` exports types only (every
import of it is an `import type`, erased at compile time), and Vite compiles the other
two straight from source into the web bundle. A `dist/` handoff would buy nothing —
and it actively broke CI, where `rush typecheck` runs before any build and so could
never produce the `.d.ts` files its own type check needed. `apps/api` and `apps/web`
are the only projects that emit build output.

## Prerequisites

- Node.js ≥20 (repo pins `nodeSupportedVersionRange` to `>=20.9.0 <25.0.0` in `rush.json`)
- Docker + Docker Compose (for the containerized golden path)
- No global Rush/PNPM install needed — `common/scripts/install-run-rush.js` downloads and runs the
  pinned Rush release (5.178.1), which in turn downloads the pinned PNPM version on first use.
  If you'd rather install Rush globally, `npm install -g @microsoft/rush` and use `rush`/`rushx`
  directly instead of the `node common/scripts/install-run-*.js` commands below.

## Local development

A `Makefile` wraps the common commands — run `make` on its own to list them.

```bash
make setup   # install deps, build, start Postgres, seed sample data
make dev     # start the API and web dev servers (watch mode)
```

`make dev` always ensures Postgres is up and accepting connections first, because
the API can't boot without it and a missing database otherwise shows up as an
opaque SSR "fetch failed" in the browser rather than a useful error. Both servers
log to the same terminal and Ctrl+C stops both.

Each server is started through `rushx dev`, the per-project task runner
[Rush documents for everyday development](https://rushjs.io/pages/developer/everyday_commands/)
— it's `npm run` with Rush's version selector in front of it. To work on one
project, that's all you need:

```bash
cd apps/web
rushx dev        # or: node ../../common/scripts/install-run-rushx.js dev
```

`make api` and `make web` are just wrappers around exactly that (plus the
Postgres check for the API).

Neither server clears the terminal. `nest start --watch` runs `tsc --watch`,
which by default wipes the screen _and_ the scrollback (`ESC[2J ESC[3J`) on every
recompile — with both servers sharing one terminal that destroys the web
server's output too, so the API's `dev` script passes `--preserveWatchOutput`.
Vite doesn't clear today; `clearScreen: false` in `apps/web/vite.config.ts`
keeps it that way.

> **Why `dev` is a Rush _global_ command, not a _bulk_ one.** Bulk commands
> stream one project's output at a time and buffer the rest until that operation
> finishes. Two watch servers never finish, so a bulk `dev` prints only the first
> one and silently swallows the second (its output goes to
> `apps/<name>/rush-logs/*.dev.log` instead) — it looks like the second server
> failed to start when it's actually running fine. The global command runs
> `common/scripts/dev.js`, which starts both `rushx dev` processes itself.
>
> **Why that script spawns each server in its own process group.** `rushx dev`
> expands to an `install-run-rushx → rushx → shell → server` chain. Signalling
> only the leader PID kills the launcher and leaves the server alive, still
> holding its port — which is what a supervisor like `concurrently` does, and why
> this repo used to bypass `rushx` and invoke `nest`/`vite` directly. Signalling
> the _group_ tears the whole chain down, so `dev.js` forwards SIGINT/SIGTERM to
> each child's group and does the same if one server exits on its own. Running a
> single `rushx dev` in a terminal needs none of this: Ctrl+C already signals the
> whole foreground process group.

Other useful targets: `make build`, `make rebuild`, `make lint`, `make format`,
`make typecheck`, `make seed`, `make api` / `make web` (run one dev server),
`make db-reset`, `make clean`, `make up` / `make down` (full Docker stack).

`make check` runs format-check + lint + typecheck + build, the same sequence CI
uses. `typecheck` is separate from `build` on purpose: Vite performs no type
checking, so type errors in `apps/web` never fail `make build` — without it they
surface only in your editor.

Because `typecheck` runs before anything is built, `apps/web/src/routeTree.gen.ts`
is committed even though TanStack Start's Vite plugin generates it: `src/router.tsx`
imports it, and at typecheck time nothing has produced it yet. Regenerate it by
running the app (`make dev`) or `make rebuild`, and commit the result alongside any
change under `apps/web/src/routes/` — CI re-runs the generator during the build and
fails if the committed copy has drifted.

### Formatting

Prettier formats the whole repo. It's installed through a Rush
[autoinstaller](https://rushjs.io/pages/maintainer/autoinstallers/)
(`common/autoinstallers/rush-prettier`) rather than as a dependency of each
project, so it's available without any project depending on it:

```bash
make format        # rewrite files          (rush format)
make format-check  # fail if unformatted    (rush format:check)
make check         # format-check + lint + typecheck + build, as CI runs it
```

Settings live in `.prettierrc.json` (Prettier defaults) and `.prettierignore`.
Generated files — Rush's `common/scripts/`, `common/config/rush/`, lockfiles and
`routeTree.gen.ts` — are excluded, since reformatting them just creates noise
that gets overwritten the next time they're regenerated.

<details>
<summary>The same steps without <code>make</code></summary>

```bash
# 1. Install all workspace dependencies (resolves the pnpm lockfile across every project)
node common/scripts/install-run-rush.js update

# 2. Build everything once (shared packages first, then api/web, in dependency order)
node common/scripts/install-run-rush.js build

# 3. Start Postgres (only Postgres — api/web run on the host for local dev)
docker compose up -d postgres

# 4. Copy env files and adjust if needed
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 5. Seed sample hotels/room types (runs the compiled dist/seed.js from step 2)
cd apps/api && node dist/seed.js && cd ../..

# 6. Run both dev servers in parallel (custom Rush global command, see common/config/rush/command-line.json)
node common/scripts/install-run-rush.js dev

# ...or run just one of them, the way rushjs.io documents:
cd apps/api && node ../../common/scripts/install-run-rushx.js dev
cd apps/web && node ../../common/scripts/install-run-rushx.js dev
```

</details>

- API: <http://localhost:3001/api>
- Web: <http://localhost:3000>

## Docker Compose (full stack)

```bash
make up          # or: cp .env.example .env && docker compose up --build
```

Brings up Postgres + API + Web together. Seed data once the stack is up:

```bash
docker compose exec api node dist/seed.js
```

### A note on very new dependencies

PNPM 11 enforces a supply-chain policy that refuses packages published within the
last day (`minimumReleaseAgeMinutes` in `common/config/rush/pnpm-config.json`).
It's set explicitly there so every environment applies the same rule — left
implicit, `pnpm install` quietly writes an exemption into the _generated_
`common/temp/pnpm-workspace.yaml`, which is gitignored and dockerignored, so
local installs keep working while a fresh clone, CI, or `docker compose build`
fails lockfile verification.

If an install fails with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`, the dependency
is simply too new. Either pin it to an older release (as `apps/web` does with
`@vitejs/plugin-react`) and run `rush update --full`, or add a deliberate entry
to `minimumReleaseAgeExclude` in `pnpm-config.json`.

The Dockerfiles use a pragmatic single-stage build (see comments in `apps/api/Dockerfile` /
`apps/web/Dockerfile`): they install and build the whole Rush workspace inside the image, trading
image size for reliability, since pruning Rush/PNPM's symlinked `node_modules` across build stages
is fragile. `rush deploy` (Rush's built-in deployment-folder pruning feature) is a documented
follow-up if you want smaller images.

## Exploring Sparo

Sparo speeds up Git in large monorepos via sparse checkout integrated with Rush + PNPM. It only
pays off once this repo lives on a real Git remote (a fresh clone is where sparse checkout
matters), so it's a deliberate follow-up rather than part of the initial bootstrap:

1. Push this repo to a remote (e.g. GitHub).
2. Install Sparo globally: `npm install -g sparo`.
3. Two starter profiles already exist at `common/sparo-profiles/api.json` and `web.json`, each
   selecting `--to @hotel/api` / `--to @hotel/web` (pulls in only what that app depends on). They
   were hand-written against Sparo's documented profile schema — regenerate/verify them with
   `sparo init-profile --profile api` (and `--profile web`) once Sparo is installed, in case the
   schema has since changed.
4. From a **fresh** clone: `sparo clone <remote-url>` instead of `git clone`, then
   `sparo checkout --profile web` to materialize only the files needed for frontend work (or
   `--profile api` for backend work). Compare the checked-out file count/size against a full
   `git clone` to see the effect.

## Notes on versions

Dependency versions were current as of Aug 2026 (Rush 5.178.1, NestJS 11.1.x, TypeORM 1.1.x,
`@tanstack/react-start` 1.168.x, Tailwind CSS v4). `rush update` will resolve exact patch versions
within the ranges declared in each project's `package.json`.
