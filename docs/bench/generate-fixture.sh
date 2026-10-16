#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# generate-fixture.sh - build the Rush scale fixture used by benchmark.sh.
#
# Recreates the fixture from a copy of the tutorial repo:
#   * copies the tutorial's tracked files (git archive of HEAD)
#   * writes N synthetic @hotel/gen-* packages under packages/gen-XXX
#   * registers every one of them in rush.json
#   * refreshes the lockfile with `rush update`
#   * commits and publishes to a bare remote with uploadpack.allowFilter=true
#     (required for `git clone --filter=blob:none`)
#
# Usage:
#   ./generate-fixture.sh [--source DIR] [--root DIR] [--bare DIR]
#                         [--packages N] [--skip-update]
#
# Defaults:
#   --source   /Users/piyush/Downloads/wordpress-projects/rushjs-sparo-tutorial
#   --root     /tmp/rush-scale         working clone
#   --bare     /tmp/rush-scale.git     bare remote
#   --packages 400                     => 407 registered projects (7 + 400)
#
#   --skip-update   skip the `rush update` lockfile refresh: faster, no network,
#                   but the committed pnpm-lock.yaml will not match the registry
#                   and `rush install` in a clone fails with
#                   "The shrinkwrap file (pnpm-lock.yaml) is out of date."
#
# Synthetic dependency wiring (mirrors the original fixture generator):
#   gen-000 .. gen-199  -> dependency @hotel/gen-200   (hub: ~200 direct dependents)
#   gen-201 .. gen-N    -> dependency @hotel/gen-099   (untouched by a hub change)
#   gen-200             -> no runtime dependency
#   every gen-*         -> devDependency @hotel/typescript-config (+ typescript)
#   every gen-* is named @hotel/gen-NNN and lives in packages/gen-NNN
#
# $ROOT and $BARE are deleted before they are rebuilt. Nothing outside those
# two paths (and $SOURCE, which is read-only) is touched.
# ---------------------------------------------------------------------------
set -euo pipefail

SOURCE=/Users/piyush/Downloads/wordpress-projects/rushjs-sparo-tutorial
ROOT=/tmp/rush-scale
BARE=/tmp/rush-scale.git
PACKAGES=400
SKIP_UPDATE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --source)      SOURCE=$2; shift 2 ;;
    --root)        ROOT=$2; shift 2 ;;
    --bare)        BARE=$2; shift 2 ;;
    --packages)    PACKAGES=$2; shift 2 ;;
    --skip-update) SKIP_UPDATE=1; shift ;;
    -h|--help)     sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ "$PACKAGES" -ge 205 ] || { echo "--packages must be >= 205 (gen-099 and gen-200 must exist)" >&2; exit 2; }
[ -d "$SOURCE" ]        || { echo "source repo not found: $SOURCE" >&2; exit 2; }

# Node: the fixture's rush.json requires >=20.9.0 <25.0.0. When mise is present it
# is used, but it only sees the repo's mise.toml when the working directory is
# inside the repo, so every node invocation below is scoped to a repo directory.
NODE=(node)
command -v mise >/dev/null 2>&1 && NODE=(mise exec -- node)

# Run a command with $1 as the working directory (this is what makes the repo's
# mise.toml apply).
run_in() { local dir=$1; shift; ( cd "$dir" && "$@" ); }

echo -n "node (repo-scoped): "
if command -v mise >/dev/null 2>&1; then
  run_in "$SOURCE" "${NODE[@]}" --version || { echo "mise could not provide node for $SOURCE" >&2; exit 1; }
else
  node --version
fi
run_in "$SOURCE" "${NODE[@]}" -e '
  const v = process.versions.node.split(".").map(Number);
  const inRange = (v[0] > 20 || (v[0] === 20 && v[1] >= 9)) && v[0] < 25;
  if (!inRange) { console.error(`node ${process.versions.node} is outside the fixture range >=20.9.0 <25.0.0`); process.exit(1); }
' || { echo "aborting: the fixture needs node >=20.9.0 <25.0.0 (mise.toml in $SOURCE pins it)" >&2; exit 1; }

echo "== 1/6 copy $SOURCE tracked files -> $ROOT"
rm -rf "$ROOT" "$BARE"
mkdir -p "$ROOT"
git -C "$SOURCE" archive HEAD | tar -x -C "$ROOT"

echo "== 2/6 generate $PACKAGES synthetic packages"
node - "$ROOT" "$PACKAGES" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';

const [ROOT, n] = [process.argv[2], Number(process.argv[3])];
const pad = (i) => String(i).padStart(3, '0');

// gen-000..gen-199 depend on the hub gen-200; everything after gen-200 depends
// on gen-099, so a hub change does not reach those packages.
function upstreamDeps(i) {
  if (i >= 0 && i <= 199) return ['@hotel/gen-200'];
  if (i >= 201) return ['@hotel/gen-099'];
  return [];
}

function srcFiles(i) {
  const id = pad(i);
  const up = upstreamDeps(i);
  const files = {};
  files['constants.ts'] =
    `export const GEN_${id}_ID = "gen-${id}" as const;\n` +
    `export const GEN_${id}_VERSION = "0.0.1" as const;\n` +
    `export const GEN_${id}_CHUNK_SIZE = 64;\n`;
  files['model.ts'] =
    `export interface GenContract {\n  readonly id: string;\n}\n\n` +
    `export interface Gen${id}Record extends GenContract {\n  readonly payload: string;\n  readonly revision: number;\n}\n\n` +
    `export type Gen${id}Map = Readonly<Record<string, Gen${id}Record>>;\n`;
  files['validate.ts'] =
    `import type { Gen${id}Record } from "./model.js";\n\n` +
    `function isObject(value: unknown): value is Record<string, unknown> {\n` +
    `  return typeof value === "object" && value !== null;\n}\n\n` +
    `export function isGen${id}Record(value: unknown): value is Gen${id}Record {\n` +
    `  if (!isObject(value)) return false;\n` +
    `  return typeof value.payload === "string" && typeof value.id === "string";\n}\n`;
  files['format.ts'] =
    `import type { Gen${id}Record } from "./model.js";\n\n` +
    `export function formatGen${id}(record: Gen${id}Record): string {\n` +
    `  return \`\${record.id}@\${record.revision}:\${record.payload.length}\`;\n}\n`;
  if (up.length > 0) {
    files['upstream.ts'] =
      `import type { GenContract } from "${up[0]}";\n\n` +
      `/** Bridges this package's records onto the upstream contract it is built against. */\n` +
      `export function upstream${id}Id(contract: GenContract): string {\n  return contract.id;\n}\n`;
  }
  files['index.ts'] = Object.keys(files).sort()
    .map((f) => `export * from "./${f.replace(/\.ts$/, '.js')}";`).join('\n') + '\n';
  return files;
}

function packageJson(i) {
  const deps = {};
  for (const d of upstreamDeps(i)) deps[d] = 'workspace:*';
  const doc = {
    name: `@hotel/gen-${pad(i)}`,
    version: '0.0.1',
    private: true,
    license: 'MIT',
    type: 'module',
    main: 'src/index.ts',
    types: 'src/index.ts',
    scripts: {
      build: 'tsc -p . --noEmit',
      typecheck: 'tsc -p . --noEmit',
      lint: 'echo ok',
      test: 'echo "no tests" && exit 0',
    },
  };
  if (Object.keys(deps).length > 0) doc.dependencies = deps;
  doc.devDependencies = { '@hotel/typescript-config': 'workspace:*', typescript: '^5.7.3' };
  return JSON.stringify(doc, null, 2) + '\n';
}

// Consumed from source, exactly like @hotel/shared-types: "build" is a type
// check and emits nothing, so there is no outDir.
const TSCONFIG = `{
  "extends": "@hotel/typescript-config/base.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src"]
}
`;

for (let i = 0; i < n; i++) {
  const dir = path.join(ROOT, 'packages', `gen-${pad(i)}`);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), packageJson(i));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
  for (const [f, body] of Object.entries(srcFiles(i))) {
    fs.writeFileSync(path.join(dir, 'src', f), body);
  }
}
console.log(`   wrote ${n} packages under ${ROOT}/packages`);
NODE

echo "== 3/6 register every package in rush.json"
node - "$ROOT/rush.json" "$PACKAGES" <<'NODE'
import fs from 'node:fs';

const [file, n] = [process.argv[2], Number(process.argv[3])];
let s = fs.readFileSync(file, 'utf8');

const anchor =
  `      "packageName": "@hotel/web",\n` +
  `      "projectFolder": "apps/web",\n` +
  `      "shouldPublish": false\n    }\n`;
const idx = s.indexOf(anchor);
if (idx === -1) throw new Error('anchor (the @hotel/web project entry) not found in rush.json');
if (s.indexOf(anchor, idx + 1) !== -1) throw new Error('anchor is not unique in rush.json');

let entries = [];
for (let i = 0; i < n; i++) {
  const id = String(i).padStart(3, '0');
  entries.push(
    `    {\n      "packageName": "@hotel/gen-${id}",\n` +
    `      "projectFolder": "packages/gen-${id}",\n` +
    `      "shouldPublish": false\n    }`);
}
// No trailing comma after the final entry: the array is closed by "]" further
// down, after a block of commented example projects. Rush tolerates a trailing
// comma here, but other JSONC parsers (Sparo's rush.json reader) reject it.
s = s.slice(0, idx) + anchor.replace(/\n$/, ',\n') + entries.join(',\n') + '\n' + s.slice(idx + anchor.length);
fs.writeFileSync(file, s);
console.log(`   registered ${n} gen-* projects`);
NODE

echo "== 3b/6 validate rush.json (strict JSONC)"
node - "$ROOT/rush.json" <<'NODE'
import fs from 'node:fs';

const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');
function stripComments(text) {
  let out = '', i = 0, inString = false;
  while (i < text.length) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') { out += text[i + 1] ?? ''; i += 2; continue; }
      if (c === '"') inString = false;
      i++; continue;
    }
    if (c === '"') { inString = true; out += c; i++; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}
try {
  JSON.parse(stripComments(src));
  console.log('   rush.json parses as strict JSONC');
} catch (err) {
  console.error(`   rush.json is not valid strict JSONC: ${err.message}`);
  process.exit(1);
}
NODE

registered=$(grep -cE '^      "projectFolder"' "$ROOT/rush.json")
echo "   rush.json now registers $registered projects"

echo "== 4/6 git init + lockfile refresh"
git -C "$ROOT" init -q -b main
if [ "$SKIP_UPDATE" = "0" ]; then
  run_in "$ROOT" "${NODE[@]}" common/scripts/install-run-rush.js update
else
  echo "   --skip-update: leaving the committed lockfile untouched"
fi
git -C "$ROOT" add -A
git -C "$ROOT" -c user.name="Scale Benchmark" -c user.email="scale@example.com" \
  commit -q -m "Rush monorepo scaled to $registered projects"

echo "== 5/6 create bare remote $BARE"
git init -q --bare -b main "$BARE"
git -C "$BARE" config uploadpack.allowFilter true
git -C "$ROOT" remote remove origin 2>/dev/null || true
git -C "$ROOT" remote add origin "$BARE"
git -C "$ROOT" push -q origin main

echo "== 6/6 summary"
echo "   working clone : $ROOT ($(du -sh "$ROOT" | cut -f1), $(git -C "$ROOT" ls-files | wc -l | tr -d ' ') tracked files)"
echo "   bare remote   : $BARE"
echo "   allowFilter   : $(git -C "$BARE" config --get uploadpack.allowFilter)"
echo "   projects      : $registered"
echo "   HEAD          : $(git -C "$ROOT" rev-parse --short HEAD)"
