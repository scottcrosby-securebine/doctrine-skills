#!/usr/bin/env bash
# Third-case fixture for doctrine-gauntlet validation.
#
# WHY A RECIPE AND NOT A CHECKED-IN APP: doctrine-skills is a pure-markdown
# plugin. Vendoring a Next app (node_modules, lockfile, build output) into it
# would be the opposite of the portability the harness already has. Build on
# demand instead; the recipe is the artifact worth keeping.
#
# WHY PINNED: shadcn and Next move fast. An unpinned recipe rebuilds into a
# different system in three months and every "regression" it reports is noise.
# A rebuild that differs under these pins is a signal, not weather.
set -uo pipefail

NEXT_VER="16.3.0"
SHADCN_VER="4.17.0"
DEST="${1:?usage: build-shadcn-fixture.sh <dest-dir>}"

log(){ printf '\n=== %s ===\n' "$*"; }

log "create-next-app@${NEXT_VER} -> ${DEST}"
npx --yes "create-next-app@${NEXT_VER}" "$DEST" \
  --ts --tailwind --eslint --app --src-dir --turbopack \
  --import-alias "@/*" --use-npm --no-git --yes </dev/null || exit 1

cd "$DEST" || exit 1

log "shadcn@${SHADCN_VER} init"
npx --yes "shadcn@${SHADCN_VER}" init --defaults --yes </dev/null || exit 1

# Deliberately a spread, not a pile: a control with size variants (target size),
# an overlay (focus trapping), a data surface (inner clipping at width), and a
# form control (label-wrapped input — the exact case the two harnesses disagree on).
log "shadcn add"
npx --yes "shadcn@${SHADCN_VER}" add button card dialog table input label badge \
  --yes --overwrite </dev/null || exit 1

log "inventory"
echo "components:"; ls src/components/ui 2>/dev/null || ls components/ui 2>/dev/null
echo "theme dialect:"; grep -n "darkMode\|\.dark\|prefers-color-scheme" \
  src/app/globals.css tailwind.config.* components.json 2>/dev/null | head -12
echo "declared gates:"; node -e "console.log(JSON.stringify(require('./package.json').scripts,null,1))"
echo "law files present?"; ls STANDARD.md USAGE.md CLAUDE.md docs 2>&1 | head -4

log "DONE"
