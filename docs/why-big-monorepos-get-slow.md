---
title: Why big monorepos get slow, and what Rush.js + Sparo do about it
published: false
description: "How Rush.js, PNPM workspaces, and Sparo's sparse checkout attack the three things that slow big monorepos: Git, install, and build."
tags: monorepo, javascript, devops, git
cover_image:
---

**TL;DR**

- A big monorepo gets slow in three places that fail independently: Git, the dependency install, and the build. A fix for one does nothing for the others.
- Sparse checkout made a test repo of 407 projects clone twice as fast, halve `.git`, and cut `git status` from 49 ms to 13 ms.
- Sparse checkout did not speed up the install at all: install cost is the dependency graph, not the number of files on disk.
- On a cold CI runner, project selection cuts a one-line change from 407 projects to 4. On a warm laptop, Rush's input hashing already skipped them.
- Most of this assumes you use npm, pnpm, or yarn. If you do not, the Rush half of the article does not apply to you.

## The problem

Picture a new hire's first day. They run `git clone` and wait ten to forty minutes, watching the object counter climb past a million.

Then the install runs. A lockfile with tens of thousands of entries resolves, and `node_modules` grows past a gigabyte. By lunch they have not opened an editor.

On day two they change one line in one package. CI rebuilds the whole repository to check it.

Three separate costs produced that day, and each one scales with something different:

- **Git**: the bytes of history, and the number of files in your working tree. Not which of those files you edit. You see it in clone time, pack size, `git status`, and `checkout`.
- **Install**: the number of third-party packages, and the size of the dependency graph the package manager must resolve and write. You see it in `node_modules` size and install wall time.
- **Build**: the number of projects, and whether you rebuild ones that did not change. You see it in "it rebuilt everything", and in CI minutes.

That is why one fix never covers all three. A sparse checkout does not make an install faster. A build cache does not make `git status` faster.

![Three monorepo bottlenecks: Git, install, and build/test, with the tool that addresses each](https://raw.githubusercontent.com/piyushchauhan2011/rushjs-sparo-tutorial/main/docs/diagrams/bottlenecks.png)

## The repo this is grounded in

Everything below is checked against a small tutorial repo. It is a toy hotel-booking app with a NestJS API and a TanStack Start frontend. The domain logic is thin on purpose. The repo exists to demonstrate the tooling.

The repo has seven projects, all registered by hand in `rush.json`. Two are apps (`@hotel/api` and `@hotel/web`). Five are packages (`@hotel/ui`, `@hotel/shared-types`, `@hotel/api-client`, `@hotel/eslint-config`, and `@hotel/typescript-config`).

The runtime edges are `web → ui`, `web → api-client`, `web → shared-types`, `api-client → shared-types`, and `api → shared-types`. Each project also lists both config packages as dev dependencies. Dev-only edges therefore outnumber runtime edges two to one, which matters later when we select projects by what changed.

The toolchain is pinned: Rush 5.181.0, PNPM 11.5.1, and Node in the range `>=20.9.0 <25.0.0`.

The repo is 120 tracked files with a 1.1 MB `.git` directory. At that size sparse checkout buys you nothing, so this repo cannot tell you whether any of it works at scale. That is why the numbers later come from a synthetic scale-up instead.

## Sparo: make Git deliver less

Sparo is a small wrapper around two Git features. To understand the wrapper, you need to know what it wraps.

### Partial clone: download fewer objects

A normal `git clone` downloads every commit, every directory listing, and every version of every file. Most of that you will never read.

`git clone --filter=blob:none` asks the server for a subset. You still get all the commits and all the directory listings. What you skip is file contents. Git fetches a file's contents later, on demand, from a remote it marks as a **promisor**.

That deferral has a price. Git's own documentation says dynamic fetching "tends to be slow as objects are fetched one at a time". A `git checkout` fetches everything it needs in one batch, so a checkout is fine. A script that reads arbitrary files out of history is not.

### Sparse checkout: write fewer files

Partial clone reduces what you download. Sparse checkout reduces what you write to disk. You give Git a list of directories, and Git leaves everything else out of the working tree.

The list goes in one of two formats. **Cone mode** is the default, and it takes directories: everything under a directory you name, plus the files at the top level. **Non-cone mode** takes gitignore-style patterns. It is deprecated, it costs O(N×M) pattern matches, and it does not work with a sparse index.

You can speed up the resulting tree further. The **sparse index** (`index.sparse`) stores whole directories as single entries instead of one entry per file. That shrinks the index and speeds up `git status` and `git add`. Git only writes it when you pass `--sparse-index`.

The **file system monitor** (`core.fsmonitor`) lets Git find modified files without checking every one on disk. It works natively on Windows and macOS. Linux support arrived in Git 2.55.0 in June 2026.

Two warnings about sparse checkout. It removes files that are already on disk, and it will refuse to proceed if a file it wants to remove has unstaged changes. Resolve those, then run `git sparse-checkout reapply`.

### Profiles: name the set you want

Hand-writing sparse directory lists is worse than it sounds. The list changes as the repo grows, and every developer would maintain their own. Sparo replaces the list with a committed file.

`sparo clone` differs from `git clone` in four documented ways. It fetches only the default branch. It enables blobless partial clone. It checks out the **skeleton** folders. It configures cone mode. It also applies some Git settings for you, including fsmonitor, the untracked cache, `feature.manyFiles`, `fetch.prune`, and `pull.rebase`.

A **profile** lives at `common/sparo-profiles/<name>.json` and is committed to Git, so it is versioned with the branch it applies to. It has four fields: `$schema`, `selections`, `includeFolders`, and `excludeFolders`. Each entry in `selections` is a selector and an argument.

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/sparo/v1/sparo-profile.schema.json",
  "selections": [{ "selector": "--to", "argument": "@hotel/web" }]
}
```

The selectors are Rush's project selectors. So `--to`, `--from`, and `--impacted-by` all work here, and you can list several. Multiple selections union together. `excludeFolders` beats `includeFolders` and beats selections.

Because the selector is Rush's, the profile above materializes exactly the projects that `rush build --to @hotel/web` would build: the app plus everything it depends on.

From a fresh clone the workflow is two commands: `sparo clone <remote-url>`, then `sparo checkout --profile web`. Two related commands are worth knowing. `sparo checkout --to` and `--from` add to the profiles already recorded instead of replacing them, and `--no-profile` clears the recording.

One part never gets stripped. Sparo calls it the **skeleton**, and it holds the whole `common/` directory plus every project's `package.json` and root-level config files. That is what makes Rush's install work from a sparse tree at all. A profile can still leave you unable to _build_ a project whose source it has not pulled.

One caveat about the profiles in this repo. Both were written by hand, and their `$schema` points at a Microsoft-hosted URL. I checked that URL on 2026-10-16 and it returned HTTP 404. Sparo's own published schema at `https://tiktok.github.io/sparo/schemas/sparo-profile.schema.json` returned 200. The Microsoft URL is not an old location; it does not exist, and Sparo's docs never mention it. Run `sparo init-profile --profile web` to generate a template from your installed Sparo version.

![Which projects each Sparo profile materializes, and which stay out of the working tree](https://raw.githubusercontent.com/piyushchauhan2011/rushjs-sparo-tutorial/main/docs/diagrams/sparo-profiles.png)

### What a sparse tree looks like day to day

I wrote this article inside a working copy created by `sparo clone` with a profile applied. That makes the mechanism inspectable instead of theoretical.

```bash
git ls-files | wc -l                                                      # 120
git ls-files | while read -r f; do [ -e "$f" ] && echo x; done | wc -l     # 118
git status --porcelain | wc -l                                             # 0
git config --get remote.origin.partialCloneFilter                          # blob:none
git config --get remote.origin.promisor                                   # true
```

Git tracks 120 files. Only 118 are on disk. `git status` calls the tree clean, because the two missing files are marked skip-worktree.

Those two files are `docs/BANG_OPERATOR.md` and `.github/workflows/ci.yml`. To read the workflow I had to run `git show HEAD:.github/workflows/ci.yml`, because it is not on disk in this clone. The sparse settings live in `.git/config.worktree` rather than `.git/config`, because `git sparse-checkout set` upgrades a repo to worktree-specific config.

That is the pitfall to plan around. A profile that selects `--to @hotel/web` excludes `.github/`, so your CI configuration disappears from the working tree. Everything that walks the tree sees a smaller repo than Git does. `git grep` returns fewer results, and `git commit -a` will not record an out-of-cone file as deleted.

If a tool needs a directory, name it:

```json
{
  "selections": [{ "selector": "--to", "argument": "@hotel/web" }],
  "includeFolders": [".github"]
}
```

Three further problems come up in practice. The clone is blobless, so reading content Git has not fetched costs a network round trip. A repo-wide lint or a background IDE index will trigger exactly that. Sparo refuses to check out a profile that omits a folder with local edits, so stash or commit first. And `sparo-ci checkout` uses a **treeless** clone in CI rather than a blobless one. Anything that assumes directory listings are present will behave differently on a runner than on your laptop.

### What sparse checkout cannot fix

Sparse checkout does not make the install cheaper. That is worth separating from a different question, because the two answers point in opposite directions.

Can you install at all from a sparse tree? Not from an arbitrary one. Rush and PNPM need every registered project's `package.json` on disk, and a set that omits project folders does not have them. I built two by hand and both failed:

- A cone set naming only the app and package folders leaves out `common/`, and `rush update` died in 0.29 s with `MODULE_NOT_FOUND` for `common/scripts/install-run-rush.js`. Cone mode includes root files and the directories you name, and nothing else.
- Adding `common/` was not enough. The same command failed with `Could not find package.json for @hotel/eslint-config`.
- A non-cone set that materializes all 408 `package.json` files plus `common/` does install, with 513 files on disk instead of 3,328. But `rush build --to @hotel/ui` then failed with `TS6053: File '@hotel/typescript-config/react.json' not found`.

Does Sparo hit that? No. I expected it to, and it does not, which is the most useful thing I learned here.

Sparo's clone is not a general sparse set. It is a skeleton built for Rush: cone mode, all 408 `package.json` files, and every package's root-level files, so `tsconfig.json` and the shared `typescript-config` presets are all present. `common/` comes along too. `rush update` works in that tree, and `sparo checkout --profile web` adds the profile's folders without ever removing the skeleton.

So the constraint above applies to hand-built sparse sets, including the two I demonstrated. Sparo is built around it, which is the point of the tool.

Does the install get cheaper? No, and this is the part that matters at scale. Sparse checkout cut the working tree by 97% and moved the install median by less than 2%: 50.0 s against 50.8 s across 11 cold runs each. `common/temp` came out identical at 1.20 GiB. Install cost is the size of the dependency graph, not the number of files on disk, and the graph does not change when you check out fewer folders.

Sparo's real limit is narrower and different in kind. You cannot **build** a project whose source the active profile has not pulled. Running `rush build --to @hotel/ui` against the bare skeleton fails with `TS18003: No inputs were found in config file`, because `packages/ui/src` is not on disk. The thing to size correctly is profile coverage, not the install.

Two things cost me time while setting that up. `sparo clone` on a bare local path is accepted but silently drops the blob filter, because Git warns `--filter is ignored in local clones; use file:// instead`; pass a `file://` URL. And Sparo reads `rush.json` with a stricter JSONC parser than Rush does, so a trailing comma that Rush tolerates stopped the clone before it checked anything out.

The lever for install size is not the checkout at all. It is Rush's **filtered install**, which the next section covers.

## Rush: the graph, the install, the selection

Rush builds the dependency graph and delegates the install to PNPM. Four pieces of it do the work.

![The seven projects and their runtime and dev-only dependency edges](https://raw.githubusercontent.com/piyushchauhan2011/rushjs-sparo-tutorial/main/docs/diagrams/workspace-graph.png)

### The project registry

`rush.json` lists every project by hand. There is no glob discovery and no directory scan.

From `rush.json`, abridged to two of the seven entries:

```json
{
  "rushVersion": "5.181.0",
  "pnpmVersion": "11.5.1",
  "nodeSupportedVersionRange": ">=20.9.0 <25.0.0",
  "projects": [
    {
      "packageName": "@hotel/shared-types",
      "projectFolder": "packages/shared-types",
      "shouldPublish": false
    },
    {
      "packageName": "@hotel/ui",
      "projectFolder": "packages/ui",
      "shouldPublish": false
    }
  ]
}
```

All seven entries omit three optional fields: `tags`, `versionPolicyName`, and a truthy `shouldPublish`. Each omission costs you a feature. Without tags you cannot select projects by `tag:<name>`. Without a version policy nothing is lockstepped. With `shouldPublish: false` Rush tracks no change files.

Listing projects by hand costs you one line per project, and buys a shortcut everywhere else. Every command reads one small file instead of walking the tree for `package.json`. Adding a project becomes a one-line diff in the file that is obviously authoritative.

### Install: one lockfile, and a way to install less

Rush delegates the install to PNPM in workspaces mode.

```jsonc
{
  "useWorkspaces": true,
  "minimumReleaseAgeMinutes": 1440,
}
```

Rush generates `common/temp/pnpm-workspace.yaml` listing every local project, then runs PNPM once for the whole repo. You get one lockfile at `common/config/rush/pnpm-lock.yaml`, one content-addressed store, and symlinks into each project's `node_modules`.

`rush install` performs an install but will not modify any file. It fails if the lockfile is out of date. `rush update` is the command that resolves and rewrites. Use `update` while working and `install` in CI. A CI job that runs `update` will accept a lockfile that no longer matches the manifests, which is the state you want CI to reject.

To install less, pass the same project selectors you would pass to `rush build`:

```bash
rush install --to @hotel/web
```

Rush still generates the full workspace. It then passes `--filter` to PNPM for each selection, so only the selected projects and their dependency closure get installed. Two constraints apply. The flags work only when `useWorkspaces` is true. And `rush update` rejects them, so this narrows the install and not the resolution.

It helps to know what ends up on disk. After a full install in this repo, `common/temp` holds 1.6 GB. The PNPM store accounts for 707 MB, `node_modules` for 344 MB, and Rush's own downloaded tooling under `install-run` for 336 MB. The `rush-recycler` cache adds 164 MB. About half a gigabyte is Rush managing itself.

### The supply-chain age check

PNPM can refuse packages that were published too recently. Its setting is `minimumReleaseAge`, measured in minutes, added in PNPM 10.16.0 and defaulting to 1440 from PNPM 11. Rush surfaces the same value under its own key, `minimumReleaseAgeMinutes`. The check applies to transitive dependencies, not only the ones you name.

The reason to write the number down is where exemptions go. PNPM keeps them in `minimumReleaseAgeExclude`, inside `pnpm-workspace.yaml`. In a Rush repo that file is generated under `common/temp`, which is gitignored and dockerignored. An exemption added on one laptop therefore exists only on that laptop. Your local build keeps working while a fresh clone, CI, or `docker compose build` fails lockfile verification.

When you need a release younger than the window, the install fails with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`. Pin an older release, or add a deliberate exemption. Disabling the policy to land one patch is the third option, and the wrong one.

### Bulk, global, and phased commands

`common/config/rush/command-line.json` defines six custom commands here. Three are `bulk`, which means they run once per selected project in dependency order: `lint`, `typecheck`, and `seed`. Three are `global`, which means they run once for the repo: `dev`, `format`, and `format:check`.

`dev` has to be global. Bulk commands buffer every project's output until that project finishes, and two watch servers never finish. The global command runs a small script that spawns each server in its own process group. Signalling the group tears down the whole `rushx` chain. Signalling only the leader leaves a server holding its port.

Rush also supports **phased commands**, which this repo does not use. Instead of one `build` script per project, a project declares operations such as `_phase:build` and `_phase:test`, along with their inputs and outputs, in `rush-project.json`. Phases are what make operation-level caching possible, because the cache key is computed per operation. A project can then cache its build and not its test. If you move to the build cache, this is the file you edit.

Subspaces are the other scaling feature this repo leaves switched off. A subspace is a group of projects with its own lockfile and its own install. That is how a monorepo of a few thousand projects splits resolution work by product group instead of resolving one enormous graph on every install. Cross-subspace dependencies are injected rather than symlinked in some configurations, so enabling subspaces is a deliberate step.

### Selection: build only what changed

This is the half of Rush that decides what CI rebuilds. Pass a project selector and Rush builds a subset.

```bash
rush build --to @hotel/web                 # @hotel/web and everything it depends on
rush build --from @hotel/shared-types      # shared-types, its dependents, and their dependencies
rush build --only @hotel/ui                # exactly this project, dependencies ignored
rush build --from git:origin/main          # everything this branch changed, closed over
```

Four properties matter if you build automation on top of these.

Selectors combine as a **union**. The same flag can repeat, as in `--only a --only b`, and no flag removes projects from the selection. To narrow a set, narrow the inputs.

Three flags are documented as **unsafe**: `--only`, `--impacted-by`, and `--impacted-by-except`. Each can select a project without its dependencies, so the build fails if those dependencies were never built. They suit a CI stage that runs after a build stage. They are the wrong choice for a cold checkout. `--from` is the safe form, because it pulls in the dependencies of everything it selects.

`--from` changed meaning in Rush 5.38.0. Today it means the project, its dependents, and the dependencies of that whole set. Before 5.38.0 it behaved like `--impacted-by` and added no dependencies, so older documentation describes the older behaviour. The `git:<ref>` selector is newer still, added in Rush 5.57.0.

There is no `--from-except`. Only `--to-except` and `--impacted-by-except` exist. `--from-except` shows up in generated CI configs and blog posts that were never run.

A selector can be a project name, `.` for the current project, `git:<ref>`, `subspace:<name>`, or `tag:<name>`. For the Git form, the documented shape is a single ref such as `git:origin/main`. Rush resolves it, and falls back to `git merge-base -- HEAD <ref>` when the ref is not a full commit hash. I found no documented support for a triple-dot range such as `git:origin/main...HEAD`, so I would compute the base commit and pass the hash.

### Incremental builds, and the assumption under them

`rush build` is incremental and cannot be made otherwise. It hashes each project's inputs and skips any project whose inputs are unchanged since the last successful build. That state lives in `<project>/.rush/temp/package-deps_build.json`. It is why this repo's `make clean` deletes those files: the state tracks source hashes, not whether output still exists.

With the cache disabled, Rush uses **output preservation**. If no inputs changed, Rush assumes the output on disk is still correct. Delete `apps/api/dist` by hand and the assumption is now false. `rush build` reports everything up to date, emits nothing, and the failure surfaces later as a missing file at runtime.

The two build commands differ in a way that catches people out.

- `rush build` reads from the cache and writes to it.
- `rush rebuild` cleans and rebuilds every project. It does **not** read from the cache, and it **does** write to it.

So a CI job running `rebuild` gets no cache benefit while still filling the cache that other jobs read. If you adopt the cache, move CI to `rush build`. You can turn writes off with `RUSH_BUILD_CACHE_WRITE_ALLOWED=0`.

The cache itself is still documented as experimental, and it is off in this repo. That is why no `build-cache` directory exists under `common/temp`.

Rush and PNPM are not installed globally. `mise.toml` pins the toolchain for developers. Where mise is unavailable, as in the Dockerfiles, `common/scripts/install-run-rush.js` reads `rushVersion` from `rush.json` and runs that release.

### Versioning and publishing

Every project here sets `shouldPublish: false`, and `version-policies.json` is empty, so this repo has no `common/changes/` directory and publishes nothing. In a repo that does publish, `rush change` writes a per-change file, and `rush change --verify` fails CI when a public package changed without one. `rush version --bump` then applies the bumps, and `rush publish` writes the changelogs.

## What the numbers look like

I built a fixture and measured it, because estimating would have been worse than saying nothing.

The fixture is this repo's working tree plus 400 generated packages. Each generated package has a `package.json`, a `tsconfig.json`, and six source files. The result is 407 registered projects and 3,328 tracked files, committed to a local bare remote of 1.7 MB, 5,785 objects, and a 1.32 MiB pack. The machine was an 8-core arm64 laptop running Node 24.22.0, Rush 5.181.0, and PNPM 11.5.1.

One setup detail cost me a wasted run. A bare remote needs `uploadpack.allowFilter=true`. Without it, `git clone --filter=blob:none` prints `warning: filtering not recognized by server, ignoring` and quietly produces a full clone. Every blobless number below comes from after that setting.

Percentiles are nearest-rank over the stated run count, and every table names the tree it measured.

Two caveats before you read the numbers. The clones run over `file://` on one machine, so they measure Git's object and tree work rather than network transfer. Across a real network a sparse clone would look better than it does here, because the bytes it skips are the expensive part. And these measurements use several different trees, so read each table's heading.

Both scripts are in this repo, so any of it can be rerun. `docs/bench/generate-fixture.sh` builds the fixture from a copy of the tutorial repo, and `docs/bench/benchmark.sh` runs the checkout, install, and build measurements and prints the tables.

**Checkout**, measured on a cone-mode sparse set applied at clone time:

| Metric                    | Full clone | Sparse  |
| ------------------------- | ---------- | ------- |
| Clone, median of 5        | 270 ms     | 148 ms  |
| `.git` on disk            | 1,836 KiB  | 924 KiB |
| Files on disk             | 3,328      | 85      |
| `git status`, median of 5 | 49 ms      | 13 ms   |

**Install**, comparing a full clone against the install-capable sparse tree (513 files, every `package.json`). Eleven cold `rush update` runs each, with `common/temp` deleted and the lockfile restored before every run:

| Metric                            | Full clone  | Sparse tree  |
| --------------------------------- | ----------- | ------------ |
| Cold `rush update`, median (n=11) | 50.0 s      | 50.8 s       |
| Range                             | 39.6–66.7 s | 36.6–330.6 s |
| `common/temp` after install       | 1.20 GiB    | 1.20 GiB     |

The sparse range's outlier is one run that stalled for 330.6 s on the registry. Drop it and the sparse maximum is 67.2 s, which brackets the full clone's 66.7 s. The two distributions overlap almost completely.

**Build** after a one-file change, on a warm tree (incremental state restored before every arm), three runs each:

| Scenario                           | Projects built | p50     |
| ---------------------------------- | -------------- | ------- |
| Forced full rebuild                | 407            | 40.86 s |
| Cold tree, plain `rush build`      | 407            | 34.19 s |
| Leaf change, `rush build`          | 1              | 1.44 s  |
| Leaf change, `rush build --from`   | 1              | 1.27 s  |
| Leaf change, `rush rebuild --from` | 4              | 1.85 s  |
| Hub change, `rush build`           | 400            | 40.95 s |
| Hub change, `rush build --from`    | 400            | 41.45 s |
| Hub change, `rush rebuild --from`  | 401            | 40.84 s |

Before the findings, one caveat about every absolute number above. Re-running the build
measurements a few hours later on the same machine gave a forced full rebuild of **40.86 s where
the first session measured 24.60 s**, with the same 407 projects. The machine was busier, and
nothing in the methodology accounts for that. Treat the ratios as the finding and the absolute
times as one afternoon's weather. I have kept both sessions' figures visible rather than
substituting the newer one, because the gap is itself the caveat.

Three things in those tables are worth reading twice.

### Blobless clone on its own is worse than useless

`--filter=blob:none` alone cloned in 314 ms with a 1,976 KiB `.git`, against 270 ms and 1,836 KiB for a plain clone. Both worse. Checking out `HEAD` materializes every blob anyway, and the deferred ones land in a second, unconsolidated pack. The win comes from the sparse set that stops those files being written, which is why the two belong together.

### The `git status` number is the one you feel

49 ms to 13 ms. Git stops checking 3,243 files that are no longer on disk. That is the difference between a command you do not notice and one you do.

### Selection is a CI lever, not a laptop lever

This one corrected me, so it is worth stating plainly. I originally credited the build table's savings to project selection. On a warm tree, selection adds nothing measurable, because Rush already skips unchanged projects by hashing their inputs:

- A leaf change cost 1.44 s with no flags and 1.27 s with `--from`. A 0.17 s gap is inside run-to-run noise.
- A hub change took 40.95 s, 41.45 s, and 40.84 s across the three arms, because all three had to rebuild the same ~400 dependents.

Selection earns its keep where no incremental state exists. Delete the `.rush` directories from a full clone and a plain `rush build` builds all 407 projects in 34.19 s, because it has nothing to compare against. That is the cold CI runner, and it is the case the `--from` flag is for.

Input hashing is the laptop lever. Selection is the CI lever. Neither one substitutes for the other.

The cache was off in this fixture, and a grep across 30 build and install logs found no cache messages. Every skip above came from Rush's incremental change detection.

## CI and CD

### The workflow this repo commits

The repo commits one workflow, and its ordering encodes two lessons. From `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: ["main"]
  pull_request:
    branches: ["main"]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node common/scripts/install-run-rush.js install
      - run: node common/scripts/install-run-rush.js format:check
      - run: node common/scripts/install-run-rush.js lint
      - run: node common/scripts/install-run-rush.js typecheck
      - run: node common/scripts/install-run-rush.js rebuild --verbose
      - run: git diff --exit-code -- apps/web/src/routeTree.gen.ts
```

The first lesson is that `typecheck` runs before `build`. Vite does not type-check during `build`, so `rush build` can succeed on a web app that has type errors in it. Type-checking has to be its own pass.

The second lesson follows from the first. Because `typecheck` runs before anything is built, `apps/web/src/routeTree.gen.ts` has to be committed. TanStack Start's Vite plugin generates that file, and `src/router.tsx` imports it, but at typecheck time nothing has produced it yet. The last step re-runs the generator during the build and diffs the file, so drift fails the job.

Two smaller choices are deliberate. CI uses `rebuild` rather than `build`, because it wants a clean full build. And `--production` is absent, because it is not a built-in Rush parameter. `rush.json` does not declare it, and Rush 5 rejects the whole command with `Unrecognized arguments: --production`.

This job installs everything and builds everything, so it scales linearly with the repo. That is the right default at this size. The next section is the shape it should take at a large one. None of it is implemented in this repository.

![How a developer machine, CI, and a shared remote build cache fit together](https://raw.githubusercontent.com/piyushchauhan2011/rushjs-sparo-tutorial/main/docs/diagrams/architecture.png)

### The workflow a large repo wants

In a large repo the checkout is the first thing to shrink.

What follows is a design, not a pipeline I have run. I tested the pieces it depends on: the selectors, the filtered install, and the cache behaviour. I did not run this workflow end to end, so treat it as something to verify rather than a recipe.

The rule that matters most is to use **one selector for every step**. If the checkout materializes a different set of projects than the later steps select, some step ends up running against a project that is not on disk.

Call the file `ci-affected.yml`:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- run: git fetch origin main
- run: npx sparo-ci checkout --from git:origin/main
- run: node common/scripts/install-run-rush.js install --from git:origin/main
- run: node common/scripts/install-run-rush.js format:check
- run: node common/scripts/install-run-rush.js lint --from git:origin/main
- run: node common/scripts/install-run-rush.js typecheck --from git:origin/main
- run: node common/scripts/install-run-rush.js build --from git:origin/main
- run: git diff --exit-code -- apps/web/src/routeTree.gen.ts
```

Some choices there are deliberate. It uses `--from` rather than `--impacted-by`, because `--impacted-by` selects dependents without their dependencies and fails on a cold worker. It keeps `typecheck` before `build`. It uses `build` rather than `rebuild`, because only `build` reads the cache. And it uses a filtered install, which is the one place install time drops.

Four parts of that snippet I have not verified, and would check first on a real repo.

- **`fetch-depth: 0` fights the point of a sparse checkout.** Selection needs the merge-base, and that needs the base commit locally, so a shallow clone breaks it. Cloning full history is the blunt fix. `--filter=blob:none` makes that history cheap, or you can fetch just the target branch.
- **`format:check` cannot be scoped.** It is a global command, so it takes no selector, and on a sparse tree it only sees the files that were materialized. It quietly checks less than it did before.
- **The route-tree drift check only means something when the web app is in the selected set.** On a change that does not touch `apps/web`, that step compares a file nothing regenerated.
- **Profile coverage breaks the build, not the install.** Sparo's skeleton keeps every `package.json` and every package's root config files, so `rush install` works from a sparse tree. What fails is building a project whose source the checkout did not pull: `TS18003: No inputs were found in config file`. If the selection used for the checkout and the one used for the checks drift apart, steps fail on missing sources rather than missing manifests.

![The pull request pipeline, with the build-cache branch made explicit](https://raw.githubusercontent.com/piyushchauhan2011/rushjs-sparo-tutorial/main/docs/diagrams/ci-pipeline.png)

### Four ways affected selection goes wrong

- **A shallow clone breaks merge-base.** This repo's `fetch-depth: 2` is enough for its route-tree diff and not enough for selection. Rush resolves a `git:<ref>` selector through Git, and falls back to `git merge-base -- HEAD <ref>` when the ref is not a full commit hash. That needs the base commit locally. On a shallow clone the merge-base is missing, or it is the shallow boundary rather than the real one. Either way the selected set silently comes out too small.
- **A stale cache returns wrong output.** With `buildCacheEnabled: true`, cache restoration replaces output preservation, so a project's output folders are always replaced by a restore. The cache key covers the project's source files, plus the sources of its workspace dependencies. It also covers the versions of external npm dependencies including indirect ones, and the Rush command-line parameters. It does not cover environment variables or the Node.js version unless you opt in through `operationSettings[].dependsOnEnvVars` and `dependsOnNodeVersion`. No documentation states that Rush's or PNPM's own version invalidates an entry. A build that reads `process.env.SOMETHING` will therefore restore wrong output with full confidence. Rush's docs point at `rush-audit-cache-plugin` for finding inputs you failed to declare.
- **Cache reads and writes go the wrong way round.** `isCacheWriteAllowed` defaults to false in the cloud provider blocks. The documented pattern is read-only on developer machines and `RUSH_BUILD_CACHE_WRITE_ALLOWED=1` on CI. Get it backwards and developer machines overwrite entries while CI reads nothing useful.
- **Flaky tests block merges.** A test that fails one run in twenty is worse than a slow test, because it teaches people to re-run until green. Select affected projects for speed, but do not make the merge decision depend on a suite you do not trust.

### Do not copy this repo's Node pinning

This repo runs three different Node versions and gets away with it. `mise.toml` pins Node 24 for developers. The workflow above uses Node 22. Both Dockerfiles use `node:22-slim`.

It works because `rush.json` enforces a range rather than an exact version, and all three sit inside it. It also works because Rush and PNPM are pinned exactly, so the tool that resolves the graph is the same everywhere.

I would not copy it. A range is a tolerance, not a pin, and the failure mode of drift is a build that reproduces on one machine and not another. Pick one Node version and use it in all three places.

### Deployment

Deployment starts from the same problem. Two of the seven projects produce runnable artifacts, and both need the shared workspace to build.

The Dockerfiles are single-stage and deliberately pragmatic. Each is `node:22-slim`, copies the whole repo, installs with the install-run bootstrap, and builds one selection. From `apps/api/Dockerfile`:

```dockerfile
FROM node:22-slim
WORKDIR /repo
COPY . .
RUN node common/scripts/install-run-rush.js install
RUN node common/scripts/install-run-rush.js build --to @hotel/api
CMD ["node", "dist/main.js"]
```

The web variant carries one detail worth copying to any Vite app. `VITE_API_URL` is a build `ARG` and not a runtime environment variable, because Vite inlines `import.meta.env.*` at build time. Server-side rendering needs a different URL from the browser. It runs inside the container, so it must reach the API by its Compose service name rather than `localhost`.

The single-stage choice trades image size for reliability. Rush and PNPM link packages through symlinks into `common/temp`, and copying a pruned subset of that layout across build stages is fragile.

`rush deploy` is the improvement, and it is not implemented here. It copies the selected project plus its regular dependencies, npm packages and local projects alike. Dev dependencies are left out by default. Its config lives at `common/config/rush/deploy.json`, which you create with `rush init-deploy --project <name>` and commit. Output goes to `common/deploy/` unless you pass `--target-folder`, and `--create-archive` produces a zip.

The setting that needs care is `linkCreation`, which accepts `default`, `script`, or `none`. With `script` you get a `create-links.js` to run on the server, and `node_modules/.bin` binaries are not generated yet.

Per-app pipelines fall out of the same selection machinery as CI. Trigger the API pipeline when `--from` says the API's closure changed, and the web pipeline on the same test for the web closure.

![Merge-to-main deployment, with migration and API/web ordering](https://raw.githubusercontent.com/piyushchauhan2011/rushjs-sparo-tutorial/main/docs/diagrams/cd-pipeline.png)

Ordering is where deployment differs from affected selection. Migrations run before the API deploy, because the new code expects the new schema. The API deploys before the web app, because the running frontend may be calling an API one version ahead of it or behind it. Keep that skew window as short as your API contract tolerates.

## How Rush and Sparo compare with the alternatives

|                    | Rush + Sparo                       | Nx / Turborepo                  | Bazel / Buck2                        | Scalar, Sapling / EdenFS                 |
| ------------------ | ---------------------------------- | ------------------------------- | ------------------------------------ | ---------------------------------------- |
| **Unit of work**   | A project in `rush.json`           | A workspace project             | A `BUILD` file target                | A path in the repo                       |
| **Caching**        | Per-project hashing                | Task hashing, remote cache      | Content-addressed, sandboxed         | None                                     |
| **Git scaling**    | Sparse checkout and blobless clone | Not addressed                   | Not addressed                        | The whole point                          |
| **Migration cost** | Register packages, one lockfile    | A config file, keep your layout | Highest: build files, hermetic tools | Low for Scalar; a new client for Sapling |

Nx and Turborepo optimise task execution on top of whatever install you already have. Turborepo explicitly does not manage dependencies. Bazel and Buck2 buy isolation and reproducibility at the cost of modelling every build. Buck2's own list of ready languages runs to nine, including Haskell and OCaml.

Scalar, Sapling, and EdenFS attack Git's I/O rather than your build graph, and Scalar ships inside upstream Git. That group combines with any of the first three, since a sparse checkout is orthogonal to how you cache builds.

## When not to use this

Skip all of it if your repo holds a few dozen packages and one team.

The setup cost is real. You maintain a registry, agree on a lockfile policy, keep profiles current, and understand cache invalidation. Below that size the tooling is a bigger maintenance surface than the problem.

Rush is the wrong pick if you are not on the npm family of package managers, because its value is owning the npm lockfile and install strategy.

Skip the build cache until your projects declare accurate inputs and outputs. A cache that restores wrong output is worse than no cache, because it is fast and wrong. Skip it as well if your builds touch state outside the project folder, or read environment variables you have not declared in `rush-project.json`.

Skip sparse checkout if the whole repo already checks out in a second, or if your tools assume a full tree and you cannot change them. The `docs/` and `.github/` experience above is what that looks like, and it applies to search tools and CI scripts as much as to IDEs.

Finally, do not adopt any of this on instinct. If you cannot state your current clone time, install time, and CI p50, you cannot tell whether a change helped.

## How to measure your own repo

Baseline with four commands:

```bash
du -sh .git                  # total Git footprint on disk
git count-objects -vH        # object count and pack size
git ls-files | wc -l         # index size: what Git knows about
time git status              # the command you run a hundred times a day
```

`count-objects -vH` prints `in-pack` and `size-pack`, which are the numbers that move when you go blobless. Compare `git ls-files | wc -l` against the files actually on disk to see what a profile removed.

Then measure the two things those commands cannot tell you. Time an install cold and warm. Count the projects selected for the change you make most often. Run each timing five times and report p50 and p95 rather than the mean. Clone and install times are heavy-tailed, so the mean is dominated by whichever run was slow.

## What this tutorial does not cover

The Dockerfiles are single-stage, and `rush deploy` is a follow-up rather than implemented. The build cache is off, so nothing here exercises cache keys. There is no Bazel or Buck2 depth, and that table row summarises each project's own documentation.

The two Sparo profiles were written by hand, their `$schema` URL does not resolve, and neither has been verified with `sparo init-profile`. CI installs and rebuilds everything. Subspaces and phased commands are not configured. And there is no real test suite: every `test` script is `echo "no tests"`. The flaky-test failure mode is therefore described from the design side rather than observed.

## Resources

- [Rush](https://rushjs.io), with [project selection](https://rushjs.io/pages/developer/selecting_subsets/) and [the build cache](https://rushjs.io/pages/maintainer/build_cache/)
- [`rush deploy` and `deploy.json`](https://rushjs.io/pages/maintainer/deploying/)
- [Sparo](https://tiktok.github.io/sparo/), with [the profile schema](https://tiktok.github.io/sparo/schemas/sparo-profile.schema.json)
- Git: [sparse checkout](https://git-scm.com/docs/git-sparse-checkout), [partial clone](https://git-scm.com/docs/partial-clone), and [Scalar](https://git-scm.com/docs/scalar)
- [PNPM settings](https://pnpm.io/settings), including `minimumReleaseAge`
