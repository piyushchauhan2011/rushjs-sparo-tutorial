# Hotel Booking Monorepo — common developer commands.
#
# Rush is invoked via common/scripts/install-run-rush.js, so no global install is
# needed: that script bootstraps the Rush and PNPM versions pinned in rush.json.
# If you have Rush installed globally you can also just use `rush <command>`.

RUSH    := node common/scripts/install-run-rush.js
COMPOSE := docker compose

.DEFAULT_GOAL := help

.PHONY: help setup install build rebuild lint format format-check check dev typecheck \
        db-up db-wait db-down db-reset seed api web up down logs clean env

help: ## Show available commands
	@echo "Hotel Booking Monorepo"
	@echo ""
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "First time here?  Run 'make setup', then 'make dev'."

## --- Setup -----------------------------------------------------------------

setup: install build db-up seed ## First-time setup: install, build, start db, seed
	@echo ""
	@echo "Setup complete. Run 'make dev' to start the API and web dev servers."

install: ## Install all workspace dependencies (rush update)
	$(RUSH) update

env: ## Create .env files from the .env.example templates (if missing)
	@test -f apps/api/.env || (cp apps/api/.env.example apps/api/.env && echo "created apps/api/.env")
	@test -f apps/web/.env || (cp apps/web/.env.example apps/web/.env && echo "created apps/web/.env")
	@test -f .env         || (cp .env.example .env                   && echo "created .env")

## --- Build / check ---------------------------------------------------------

build: ## Build all projects in dependency order (incremental)
	$(RUSH) build

rebuild: ## Force a full rebuild of all projects
	$(RUSH) rebuild

lint: ## Run ESLint across all projects
	$(RUSH) lint

format: ## Reformat all source files with Prettier
	$(RUSH) format

format-check: ## Fail if any file is not Prettier-formatted (CI)
	$(RUSH) format:check

# Vite doesn't type-check during `build`, so apps/web type errors never reach
# `make build`. This runs tsc explicitly everywhere.
typecheck: ## Type-check every project (tsc --noEmit)
	$(RUSH) typecheck

check: format-check lint typecheck build ## Run every check the way CI would

## --- Development -----------------------------------------------------------

# The API can't start without Postgres, so `dev` always ensures the database is
# up and accepting connections first — a missing database otherwise surfaces as
# an opaque SSR "fetch failed" in the browser.
dev: env db-wait ## Start the API and web dev servers (watch mode)
	@echo "API -> http://localhost:3001/api"
	@echo "Web -> http://localhost:3000"
	@$(RUSH) dev

# These invoke the project binaries directly rather than going through `rushx`.
# The install-run-rushx -> rushx -> shell chain does not forward SIGINT, so
# Ctrl+C would leave the server orphaned still holding its port.
api: env db-wait ## Start only the API dev server
	@cd apps/api && node_modules/.bin/nest start --watch

web: env ## Start only the web dev server
	@cd apps/web && node_modules/.bin/vite dev --port 3000

## --- Database --------------------------------------------------------------

db-up: ## Start the Postgres container
	$(COMPOSE) up -d postgres

db-wait: db-up ## Start Postgres and wait until it accepts connections
	@printf "waiting for postgres"
	@for i in $$(seq 1 30); do \
		if $(COMPOSE) exec -T postgres pg_isready -U hotel -d hotel >/dev/null 2>&1; then \
			echo " ready"; exit 0; \
		fi; \
		printf "."; sleep 1; \
	done; \
	echo " timed out after 30s"; exit 1

db-down: ## Stop the Postgres container
	$(COMPOSE) stop postgres

db-reset: ## Destroy the Postgres volume and re-seed from scratch
	$(COMPOSE) down -v
	@$(MAKE) --no-print-directory seed

seed: build db-wait ## Populate the database with sample hotels
	@cd apps/api && node dist/seed.js

## --- Docker (full stack) ---------------------------------------------------

up: env ## Build and run the whole stack (postgres + api + web) in Docker
	$(COMPOSE) up --build

down: ## Stop and remove all containers
	$(COMPOSE) down

logs: ## Tail logs from all running containers
	$(COMPOSE) logs -f

## --- Housekeeping ----------------------------------------------------------

clean: ## Remove build output (dist/, .output/) from every project
	rm -rf apps/api/dist apps/web/.output apps/web/dist
	rm -rf packages/*/dist
	rm -f apps/*/tsconfig.tsbuildinfo packages/*/tsconfig.tsbuildinfo
	# Rush's incremental build tracks source hashes, not whether output still
	# exists, so a plain `rush build` would otherwise skip every project as
	# "already up to date" and leave nothing behind. Remove only the build state
	# files — shrinkwrap-deps.json lives here too and Rush needs it.
	rm -f apps/*/.rush/temp/package-deps_*.json packages/*/.rush/temp/package-deps_*.json
	@echo "Build output removed. Run 'make build' to rebuild."
