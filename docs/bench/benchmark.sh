#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# benchmark.sh - checkout / install / build measurements for the Rush scale
# fixture produced by generate-fixture.sh.
#
# Usage:
#   ./benchmark.sh [--remote DIR] [--workdir DIR] [--checkouts N]
#                  [--installs N] [--reps N]
#
# Defaults:
#   --remote    /tmp/rush-scale.git          bare fixture remote
#   --workdir   /tmp/rush-bench/bench        scratch dir (created/deleted)
#   --checkouts 5                            samples per clone mode
#   --installs  5                            cold `rush update` samples per tree
#   --reps      3                            repeats of each build arm
#
# What it measures:
#   1. CHECKOUT   full clone | blobless clone | blobless+cone sparse set |
#                 blobless+non-cone "install-capable" sparse set, each cloned
#                 --checkouts times; then files on disk, .git size and
#                 `git status` time for the final tree of each mode.
#   2. INSTALL    cold `rush update` (common/temp deleted, lockfile restored)
#                 --installs times on the full clone and on the install-capable
#                 sparse clone. Every sample is printed, plus min/median/max.
#   3. BUILD      on the full clone, against a one-package commit on top of a
#                 base commit, three arms for each of a leaf change
#                 (packages/gen-201, no dependents) and a hub change
#                 (packages/gen-200, ~200 direct dependents):
#                   (a) rush build                        incremental, warm, no selection
#                   (b) rush build --from git:HEAD~1      incremental, warm, selected
#                   (c) rush rebuild --from git:HEAD~1    forced, selected
#                 Each measurement is preceded by a re-warm at the base commit,
#                 so incremental state is always warm when the arm runs.
#                 Projects built vs skipped are parsed from Rush's own summary.
#   4. FAILURE    `rush build --to @hotel/ui` inside the install-capable sparse
#                 clone, which is where a sparse tree runs out of config files.
#
# Everything is written under --workdir. The bare remote is only read from.
# ---------------------------------------------------------------------------
set -uo pipefail

REMOTE=/tmp/rush-scale.git
WORKDIR=/tmp/rush-bench/bench
CHECKOUTS=5
INSTALLS=5
REPS=3

while [ $# -gt 0 ]; do
  case "$1" in
    --remote)    REMOTE=$2; shift 2 ;;
    --workdir)   WORKDIR=$2; shift 2 ;;
    --checkouts) CHECKOUTS=$2; shift 2 ;;
    --installs)  INSTALLS=$2; shift 2 ;;
    --reps)      REPS=$2; shift 2 ;;
    -h|--help)   sed -n '2,45p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -d "$REMOTE" ] || { echo "fixture remote not found: $REMOTE" >&2; exit 2; }
[ "$(git -C "$REMOTE" config --get uploadpack.allowFilter)" = "true" ] \
  || { echo "remote $REMOTE does not set uploadpack.allowFilter=true" >&2; exit 2; }

# Git SILENTLY IGNORES --filter for a bare local path ("warning: --filter is
# ignored in local clones; use file:// instead"), which turns every blobless
# clone below into a full clone and makes the whole checkout comparison
# meaningless. Normalise a local path to an absolute file:// URL. The check
# above still uses the path, because `git -C file://...` does not work.
case "$REMOTE" in
  /*|./*|../*) REMOTE="file://$(cd "$REMOTE" && pwd)" ;;
esac
echo "remote (for clone): $REMOTE"

NODE=(node)
command -v mise >/dev/null 2>&1 && NODE=(mise exec -- node)
echo "node: $("${NODE[@]}" --version) via ${NODE[*]}"

REPORT=$WORKDIR/results.txt
LOGS=$WORKDIR/logs
rm -rf "$WORKDIR"
mkdir -p "$LOGS"

# --- helpers ---------------------------------------------------------------
now() { date +%s.%N; }
ms() { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.0f", (b-a)*1000}'; }
median() { printf '%s\n' "$@" | sort -n | awk '{a[NR]=$1} END{ if (NR%2) print a[(NR+1)/2]; else printf "%.0f", (a[NR/2]+a[NR/2+1])/2 }'; }
minmax() { printf '%s\n' "$@" | grep -E '^[0-9]+$' | sort -n | awk 'NR==1{mn=$1} {mx=$1} END{if(NR) print mn" "mx; else print "NA NA"}'; }
say() { echo "$@" | tee -a "$REPORT"; }

rush() { local dir=$1; shift; ( cd "$dir" && "${NODE[@]}" common/scripts/install-run-rush.js "$@" ); }

CONE_PATHS=(apps/api apps/web packages/ui packages/shared-types packages/api-client)
NONCONE_PATTERNS=('/*' '!/*/' '/apps/api/' '/apps/web/' '/common/' '/packages/*/package.json'
                  '/packages/api-client/' '/packages/shared-types/' '/packages/ui/')

say "# checkout / install / build benchmark"
say "# remote   : $REMOTE"
say "# date     : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
say "# node     : $("${NODE[@]}" --version)"
say ""

# ===========================================================================
# 1. CHECKOUT
# ===========================================================================
say "## 1. checkout"
clone_full()      { git clone -q "$REMOTE" "$1"; }
clone_blobless()  { git clone -q --filter=blob:none "$REMOTE" "$1"; }
clone_cone()      { git clone -q --filter=blob:none --sparse "$REMOTE" "$1" \
                      && git -C "$1" sparse-checkout set --cone "${CONE_PATHS[@]}"; }
clone_installable() { git clone -q --filter=blob:none --sparse "$REMOTE" "$1" \
                      && git -C "$1" sparse-checkout set --no-cone "${NONCONE_PATTERNS[@]}"; }

for mode in full blobless cone installable; do
  times=()
  for i in $(seq 1 "$CHECKOUTS"); do
    d=$WORKDIR/co-$mode
    rm -rf "$d"
    s=$(now)
    "clone_$mode" "$d" >"$LOGS/clone-$mode-$i.log" 2>&1 || say "   clone_$mode failed (see $LOGS/clone-$mode-$i.log)"
    e=$(now)
    times+=("$(ms "$s" "$e")")
  done
  # stats for the tree left behind by the final iteration
  d=$WORKDIR/co-$mode
  files=$(find "$d" -type f -not -path '*/.git/*' 2>/dev/null | wc -l | tr -d ' ')
  tracked=$(git -C "$d" ls-files 2>/dev/null | wc -l | tr -d ' ')
  gitkib=$(du -sk "$d/.git" 2>/dev/null | cut -f1)
  stat=()
  for i in 1 2 3 4 5; do s=$(now); git -C "$d" status >/dev/null 2>&1; e=$(now); stat+=("$(ms "$s" "$e")"); done
  mm=$(minmax "${times[@]}")
  say "$(printf '%-12s clone ms (n=%s): %s | min=%s max=%s | median=%s' "$mode" "$CHECKOUTS" "${times[*]}" \
        "${mm%% *}" "${mm##* }" "$(median "${times[@]}")")"
  say "$(printf '%-12s files-on-disk=%s tracked=%s .git=%sKiB status median=%sms' "$mode" "$files" "$tracked" "${gitkib:-NA}" "$(median "${stat[@]}")")"
  cone=$(git -C "$d" config --get core.sparseCheckoutCone 2>/dev/null || echo unset)
  say "$(printf '%-12s core.sparseCheckoutCone=%s' "$mode" "$cone")"
  say ""
done

# ===========================================================================
# 2. INSTALL (cold `rush update`)
# ===========================================================================
say "## 2. cold \`rush update\` (common/temp deleted, lockfile restored before each run)"
for tree in co-full co-installable; do
  d=$WORKDIR/$tree
  samples=()
  for i in $(seq 1 "$INSTALLS"); do
    rm -rf "$d/common/temp"
    git -C "$d" checkout -- common/config/rush/pnpm-lock.yaml 2>/dev/null
    s=$(now)
    rush "$d" update > "$LOGS/install-$tree-$i.log" 2>&1
    rc=$?
    e=$(now)
    sample=$(ms "$s" "$e")
    samples+=("$sample")
    echo "$tree run$i rc=$rc ms=$sample"
  done
  mm=$(minmax "${samples[@]}")
  say "$(printf '%-14s samples ms (n=%s): %s' "$tree" "$INSTALLS" "${samples[*]}")"
  say "$(printf '%-14s min=%sms median=%sms max=%sms' "$tree" "${mm%% *}" "$(median "${samples[@]}")" "${mm##* }")"
  tmpk=$(du -sk "$d/common/temp" 2>/dev/null | cut -f1)
  files=$(find "$d" -type f -not -path '*/.git/*' | wc -l | tr -d ' ')
  say "$(printf '%-14s files-on-disk-after-install=%s common/temp=%sKiB' "$tree" "$files" "${tmpk:-NA}")"
  say ""
done

# ===========================================================================
# 3. BUILD (three arms x two change sizes)
# ===========================================================================
say "## 3. build arms on the full clone"
say "   (a) rush build  (b) rush build --from git:HEAD~1  (c) rush rebuild --from git:HEAD~1"
FULL=$WORKDIR/co-full
GIT=(git -C "$FULL" -c user.name="Scale Benchmark" -c user.email="scale@example.com")

"${GIT[@]}" add -A
"${GIT[@]}" commit -q -m "bench base" || true
BASE=$("${GIT[@]}" rev-parse HEAD)

"${GIT[@]}" checkout -q -b leaf "$BASE"
echo "// leaf change" >> "$FULL/packages/gen-201/src/constants.ts"
"${GIT[@]}" commit -q -am "leaf change"
LEAF=$("${GIT[@]}" rev-parse HEAD)

"${GIT[@]}" checkout -q -b hub "$BASE"
echo "// hub change" >> "$FULL/packages/gen-200/src/constants.ts"
"${GIT[@]}" commit -q -am "hub change"
HUB=$("${GIT[@]}" rev-parse HEAD)

say "   base=$(git -C "$FULL" rev-parse --short "$BASE") leaf=$(git -C "$FULL" rev-parse --short "$LEAF") hub=$(git -C "$FULL" rev-parse --short "$HUB")"
say ""
say "$(printf '%-24s %8s %7s %8s %8s' arm wall_ms built skipped rush_ms)"

build_arm() { # $1=label $2=dir, rest = rush args
  local label=$1 dir=$2; shift 2
  local log="$LOGS/build-$label.log" s e w rc built skipped internal
  s=$(now)
  rush "$dir" "$@" > "$log" 2>&1
  rc=$?
  e=$(now)
  w=$(ms "$s" "$e")
  built=$(grep -oE 'SUCCESS: [0-9]+ operations?' "$log" | grep -oE '[0-9]+' | head -1)
  skipped=$(grep -oE 'SKIPPED: [0-9]+ operations?' "$log" | grep -oE '[0-9]+' | head -1)
  internal=$(grep -oE 'rush (build|rebuild) \([0-9.]+ seconds\)' "$log" | grep -oE '[0-9.]+' | head -1)
  [ "$rc" = 0 ] || echo "   $label rc=$rc (see $log)"
  say "$(printf '%-24s %8s %7s %8s %8s' "$label" "$w" "${built:-0}" "${skipped:-0}" "${internal:-NA}")"
}

git -C "$FULL" checkout -q -f "$BASE"
build_arm "base-full-rebuild" "$FULL" rebuild   # forced rebuild of the whole repo

for size in leaf hub; do
  case "$size" in leaf) TARGET=$LEAF ;; hub) TARGET=$HUB ;; esac
  for rep in $(seq 1 "$REPS"); do
    for arm in a b c; do
      git -C "$FULL" checkout -q -f "$BASE"
      rush "$FULL" build > "$LOGS/warm-$size-$arm-$rep.log" 2>&1   # re-warm incremental state
      git -C "$FULL" checkout -q -f "$TARGET"
      case "$arm" in
        a) build_arm "$size-a-incremental-r$rep" "$FULL" build ;;
        b) build_arm "$size-b-selected-r$rep"    "$FULL" build --from git:HEAD~1 ;;
        c) build_arm "$size-c-forced-r$rep"      "$FULL" rebuild --from git:HEAD~1 ;;
      esac
    done
  done
  say ""
done
git -C "$FULL" checkout -q -f "$BASE"

# ===========================================================================
# 4. SPARSE TREE BUILD ATTEMPT (the failure the article documents)
# ===========================================================================
say "## 4. build in the install-capable sparse clone"
SP=$WORKDIR/co-installable
rush "$SP" build --to @hotel/ui > "$LOGS/sparse-build.log" 2>&1
sparse_rc=$?
say "   rush build --to @hotel/ui rc=$sparse_rc"
say "   diagnostic: $(grep -m1 -E 'error TS[0-9]+|ERROR|error:' "$LOGS/sparse-build.log" | sed 's/^ *//')"
say "   (full log: $LOGS/sparse-build.log)"
say ""

say "DONE. full report: $REPORT"
