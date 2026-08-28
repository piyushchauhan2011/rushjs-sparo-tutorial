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
opaque SSR "fetch failed" in the browser rather than a useful error.

Other useful targets: `make build`, `make rebuild`, `make lint`, `make seed`,
`make api` / `make web` (run one dev server), `make db-reset`, `make clean`,
`make up` / `make down` (full Docker stack).

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

# 6. Run both dev servers in parallel (custom Rush bulk command, see common/config/rush/command-line.json)
node common/scripts/install-run-rush.js dev
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
