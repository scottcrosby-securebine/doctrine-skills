#!/usr/bin/env bash
# Third-case fixture for doctrine-gauntlet validation.
#
# WHY A RECIPE AND NOT A CHECKED-IN APP: doctrine-skills is a pure-markdown
# plugin. Vendoring a Next app (node_modules, lockfile, build output) into it
# would be the opposite of the portability the harness already has. Build on
# demand instead; the recipe is the artifact worth keeping.
#
# WHAT IS PINNED: the two scaffolders below, and nothing else — everything they
# generate floats. `fixtures/README.md` ("What is pinned, and what is not") holds
# the full rule and how to read a diff under it. Deliberately not restated here:
# two copies of one rule are an unversioned fork, and these two had already
# drifted apart within a single round of each other being written.
set -uo pipefail

NEXT_VER="16.3.0"
SHADCN_VER="4.17.0"
DEST="${1:?usage: shadcn.sh <dest-dir>}"

log(){ printf '\n=== %s ===\n' "$*"; }

log "create-next-app@${NEXT_VER} -> ${DEST}"
npx --yes "create-next-app@${NEXT_VER}" "$DEST" \
  --ts --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-npm --disable-git --yes </dev/null || exit 1
# Every flag above exists in the pinned CLI — checked against `--help`, because
# create-next-app ends with .allowUnknownOption() and discards a flag it does not
# know without a word. Two did: `--turbopack` (gone; Next 16 defaults to it, and
# the pinned CLI offers --rspack instead) and `--no-git` (it is --disable-git).
# Both were silently swallowed for as long as they were here. If you add a flag,
# run `npx create-next-app@${NEXT_VER} --help` and confirm it is listed.

cd "$DEST" || exit 1

log "shadcn@${SHADCN_VER} init"
npx --yes "shadcn@${SHADCN_VER}" init --defaults --yes </dev/null || exit 1

# Deliberately a spread, not a pile: a control with size variants (target size),
# a data surface (inner clipping at width), a form control, and a checkbox — the
# label-as-target case, which is the one the two harnesses disagree on. `input`
# and `label` alone do NOT deliver that case: shadcn's Label emits a bare
# <label> and the two are installed as siblings, so nothing there is a small
# control with a large label. checkbox is.
log "shadcn add"
npx --yes "shadcn@${SHADCN_VER}" add button card dialog table input label badge checkbox \
  --yes --overwrite </dev/null || exit 1

# Installing components is not exercising them. Until this page existed the
# harness rendered the stock Next welcome screen — PASS, exit 0, no target-size
# line, no clip line, no table — and the fixture measured none of the classes the
# list above was chosen for. Keep this page small and keep it rendering all of
# them. The dialog is the one hole: its panel does not exist in the DOM until a
# user opens it, so what is measured here is the trigger, not the focus trap.
log "write a page that renders them"
cat > src/app/page.tsx <<'TSX'
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const rows = [
  ["FR-1182", "Quarter leather rebind", "Cambridge", "In press", "12 Mar 2026"],
  ["FR-1183", "Paper wash and size", "Ely", "Awaiting parts", "19 Mar 2026"],
  ["FR-1184", "Clamshell box, two tray", "Norwich", "Complete", "2 Apr 2026"],
];

export default function Home() {
  return (
    /* w-full is load-bearing: without it the auto margins turn <main> into a
       fit-content flex item, the table's min-content widens it past the
       viewport, and the page scrolls sideways at 360 instead of the table
       scrolling inside its own container. That is a page defect, not the case
       this fixture is for. */
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-8">
      <h1 className="text-3xl font-semibold">Bindery work log</h1>

      {/* size variants: the target-size check needs small controls to look at */}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm">Log work</Button>
        <Button size="default" variant="secondary">Reassign</Button>
        <Button size="icon" variant="outline" aria-label="Refresh">
          &#8635;
        </Button>
        <Badge>3 open</Badge>
        <Dialog>
          <DialogTrigger>New job</DialogTrigger>
          <DialogContent>
            <DialogTitle>New job</DialogTitle>
            <DialogDescription>Not open on load, so the panel is not measured.</DialogDescription>
          </DialogContent>
        </Dialog>
      </div>

      {/* label-as-target: a 16px box with a large clickable label beside it */}
      <Card>
        <CardHeader>
          <CardTitle>Intake</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ref">Reference</Label>
            <Input id="ref" placeholder="FR-0000" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="rush" />
            <Label htmlFor="rush">Rush this job to the front of the queue</Label>
          </div>
        </CardContent>
      </Card>

      {/* five columns in a 3rem-padded column: the inner-clip case at 360px */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ref</TableHead>
            <TableHead>Work</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r[0]}>
              {r.map((c) => (
                <TableCell key={c}>{c}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
TSX

log "inventory"
echo "components:"; ls src/components/ui 2>/dev/null || ls components/ui 2>/dev/null
echo "theme dialect:"; grep -n "darkMode\|\.dark\|prefers-color-scheme" \
  src/app/globals.css tailwind.config.* components.json 2>/dev/null | head -12
echo "declared gates:"; node -e "console.log(JSON.stringify(require('./package.json').scripts,null,1))"
# This answer CHANGED, and the change is the interesting part: Next 16 ships
# AGENTS.md by default (--no-agents-md opts out) and a CLAUDE.md that is just
# `@AGENTS.md`. So case 2 is no longer "a project with no house law" — a stock
# scaffold now hands the gauntlet law files to discover, written by nobody on
# this project. Left in on purpose: that is what a fresh install really looks
# like, and law discovery meeting scaffolded law is a case worth having.
echo "law files present?"; ls STANDARD.md USAGE.md CLAUDE.md AGENTS.md docs 2>&1 | head -5

log "DONE"
