---
name: doctrine-backup
description: Use when the user asks to back up the session, save session memory, update SESSION_MEMORY.md, or wrap up so the next session can pick up where this one left off. Writes the repo's memory file as survivable session context and red-teams it before reporting done.
---

# Doctrine Backup

Write the session's memory file: survivable context, the color and taste the next session needs
beside the handoff. It does not direct the work; the handoff does (`doctrine-handoff`). Works in any
repo, with or without a doctrine project file or an open doctrine phase.

**Update** the memory file; do not compose it from scratch. Read the existing file first and carry
forward everything you cannot disprove. Target ≤400 words. The only edits you make are for
correctness: a line the repo, the record or this session shows is wrong.

## 0. Conform the repo

The standard is one memory file, `SESSION_MEMORY.md` at the repo root, and every handoff under
`docs/handoffs/`. Before anything else, bring a repo that differs to it:

- **Ignore first.** In a public repo, or one an installer's tooling copies whole, `docs/handoffs/` is
  in `.gitignore`; add it when it is not. `gh repo view --json visibility --jq .visibility` answers
  the first, and when `gh` errors (no remote, not authenticated) treat the repo as public;
  `.claude-plugin/plugin.json` or `.claude-plugin/marketplace.json` present answers the second. Doing
  this before any move keeps an untracked handoff from being committed there; a handoff already
  tracked stays tracked.
- **Memory file.** `ls` the root, and keep the current memory file's text as it stands now, before any
  move or write: step 5 hands it to the red team as the previous file. When there is no `SESSION_MEMORY.md` but there is one other memory
  file (`SESSION_MEMORY-<x>.md`, `session-memory.md`, and the like), `git mv` it (plain `mv` when
  untracked) to `SESSION_MEMORY.md`. When there are several, ask which one is current and stop until
  answered.
- **Handoffs.** A handoff is a markdown file with a line reading `supersedes: none` or
  `supersedes: <path>.md` among its first five lines, or the file a memory file's kickoff names. When any sit outside `docs/handoffs/`, move each there with `git mv`
  (plain `mv` when untracked), keeping its name; when that name is taken there, append `-2`, `-3`.
  Then rewrite every path reference that pointed at an old location, in every handoff under
  `docs/handoffs/` and in the memory file, so every `supersedes:` chain and the kickoff resolve.
  Change nothing else in their bodies, and move nothing that is not a handoff: run records, plans and
  notes stay where they are, even in the same directory.
- Say what you moved or ignored. When nothing differs, say nothing.

## 1. Gather state

Run the batch in `doctrine-resume` step 2, with its rules for a `gh` error, an empty workflow list, an
empty `conclusion` and a green build that is not a deploy. Record the **tracked-only** dirty count it
takes. Add `gh issue list --state open --limit 200 --json number --jq 'length'` for the count, written as
"200+" when it returns 200, since the limit caps the fetch, and pull titles only for the few you will name; when `gh` errors, record that rather than a count.

## 2. Carry forward

Before writing, take from the existing file:

- **Every Gotcha still true.** They are the highest-value lines in the file and nothing in step 1 can
  regenerate them. Add this session's. Check each against the code and the repo: one they contradict is wrong and is deleted, not carried as unverified. The file holds three;
  when more than three are true, the three that save the next session the most stay and the rest go
  into the handoff this run writes, appended to its Gotchas section when it is already written. When this run writes none, run `doctrine-handoff` steps 1 to 3 to write one, then continue here.
  A true Gotcha is never dropped.
- **Every 🔴 row you cannot disprove with a command**, whether or not a phase owns it. "Merged but
  undeployed" survives a green build and a merged PR: only an actual deploy clears it.
- **The `Runtime` block**, unchanged, unless you observed the live system this session. Copying a
  stale line forward with its original date is honest; asserting freshness you never checked is not.

## 3. Write the file

```markdown
# State [descriptive title | YYYY-MM-DD]

## Resume
[Where the work stands → what is live → the immediate next step. Two sentences.]

## Active Work
| Item | Issue | Status | Key Files |
|------|-------|--------|-----------|
[Max 5 rows, but never drop a 🔴 to honor the cap: cut ✅ rows first, then oldest. One bare `#N` per
cell, or — when untracked. A cell holding several ids, a legacy tracker id, or a cross-repo ref cannot
be hydrated by doctrine-resume.]

## Git State
- Branch: `name` @ sha | clean or N dirty | PRs: numbers or none

## Runtime
- [Whatever "live" means here: services, migrations, last deploy + deployed sha.]

## Gotchas (learned this session)
- [Non-obvious discovery that saves the next session real time. Max 3.]

## Next Session Kickoff
handoff: docs/handoffs/<file>.md | state: <open|none>
[What to pick up, in priority order, and any skill to invoke. MANDATORY: doctrine-primer and
doctrine-resume read this section by name and report its absence as a lost handoff.]
```

The kickoff's first line is machine-shaped; `doctrine-resume` §1b says what the loaders do with it.

- **`handoff:`** names the current handoff: the file `doctrine-handoff` wrote this run, else the one
  the previous kickoff named. When no kickoff names one (no memory file, or a kickoff with no
  machine-shaped first line), the current handoff is the one in `docs/handoffs/` that no other
  handoff's `supersedes:` names; when more than one qualifies, read them and ask the user which is
  current rather than guess. Only when `docs/handoffs/` holds none, write `handoff: none`.
- **`state:`** is `open` when a doctrine phase is open, meaning the last state line of the record
  the current handoff's header names reads *Open* or *Blocked*, and `none` otherwise, including
  ordinary unfinished work and a repo with no doctrine at all. Read it from that record now, never
  copy it forward. When the handoff names no record, write `none`. When it names one that is not on
  this host, keep the previous state word and say the record was not found.

`## Next Session Kickoff` is required always. Omit `## Gotchas` only when it is empty *and* the
previous file had none, and omit `## Runtime` entirely for a project with nothing deployable: an empty
heading is worse than no heading.

## 4. Rules

**Unshipped work is the headline.** Uncommitted, unpushed, merged-but-undeployed, or
deployed-but-unverified each go in Resume *and* get a 🔴 row. A session that ends with work stranded
must read that way at a glance.

**Merged ≠ deployed ≠ verified.** Separate states. Record the deployed sha.

**Reference, never duplicate.** Architecture and commands live in the repo's own docs; reasoning
lives in the issue and the handoff; history lives in git. Point at them.

**Compact.** Tables over prose. One-liners. Symbols: ✅ ⏳ 🔴.

## 5. Red-team, then fix

Before verifying, dispatch one fresh-context subagent that did not write the files, and wait for its
return: a seat whose return is only an acknowledgement has checked nothing. It is read-only:
it reports and never edits. Hand it, pasted in full, never as paths:

- the memory file you wrote, the previous memory file as step 0 kept it (or that there was none), and
  the handoff this run wrote, if any
- step 1's output, and the last state line of the record the handoff names, with its line number
- the plan: in a repo a doctrine project file tracks, the epic record the handoff's plan section names;
  otherwise the open issues this work touches (`gh issue view <N>`), or that none do; when `gh` errors,
  say so and hand the seat the issue numbers the files name
- a list of what this session did: its commits, the files it changed, the decisions it made

Ask it two things, and only these. **Correctness**: which line in either file, each Gotcha included, does the
code, the repo, the record or the list contradict? **Completeness**: which part of this session's work, or of the plan
items in play, is missing from the handoff, and which unshipped work, or which context the previous memory file
held that is still true and now sits nowhere, is missing from the memory file? Require each finding to quote the line or name the gap and cite its evidence.

Verify each finding against the source, then fix what it shows and nothing else: no rewording, no
trimming, no removal of detail the next session can use. A fix that changes which Gotchas the memory
file holds applies step 2's cap again: a true Gotcha that leaves the memory file goes into the
handoff's Gotchas section, written by `doctrine-handoff` steps 1 to 3 when this run wrote none, so
only a Gotcha the code, the repo or the record disproves leaves both files. Say what the seat found and what you fixed,
and name any finding you rejected with its reason.

## 6. Verify, then commit

```bash
root=$(git rev-parse --show-toplevel 2>/dev/null) && cd "$root" || { echo "NOT A GIT REPO — stop here"; exit 1; }
wc -w SESSION_MEMORY.md                              # ≤400
grep -c "^## Next Session Kickoff$" SESSION_MEMORY.md || echo "MISSING — doctrine-primer will report a lost handoff"
git status -sb | head -1                             # branch, ahead/behind
git status --short | grep -v '^??' || true           # dirty tracked files; || true keeps a clean tree from exiting 1
```

Reread your Git State line against those last two. The count must match, and a staged deletion counts
as dirty work. Writing "clean" over a dirty tree is the one error this file cannot survive. Count
tracked files only: untracked tooling and plan directories can inflate a raw `git status --short`
several-fold, which is why the `grep -v '^??'` is there.

Then land it locally. Name only what this run wrote, edited or moved: drop any path
`git check-ignore -q <path>` matches and any file you did not touch, and name `.gitignore` only when
`git diff HEAD -- .gitignore` shows your line and nothing else, or the file is untracked and holds nothing
but your line. A pathspec commit takes the worktree file whole, so someone else's edit there would
land under your message; leave it and say so. A `git mv` has already staged its move, so add nothing for it. A plain `mv` of an untracked file
needs `git add` of its new path only. The commit's pathspec names every new path, and the old path
only of a `git mv`, since git never knew an untracked file's old path, and every handoff step 0
rewrote in place. If nothing remains to name, say which files are ignored and which you left for their owner, and stop.

```bash
git add -- SESSION_MEMORY.md docs/handoffs/<file>.md .gitignore <new paths of plain mv moves> <handoffs rewritten in place>    # new files: a pathspec commit sees only tracked paths
git commit -m "docs(session): <what changed>" -- SESSION_MEMORY.md docs/handoffs/<file>.md .gitignore <new paths of all moves> <old paths of git mv moves> <handoffs rewritten in place>
git status -sb               # [ahead N] is expected: nothing here pushes
```

Never push from this skill. A backup is taken mid-thought and pushing publishes; push only when the
user says to, and say the commit is local until then.

Commit by pathspec, never a bare `git commit`. A bare commit ships the whole index, including anything
another step left staged, and a docs-flavoured message on a non-docs change misrepresents the commit.
Leave unrelated staged work for its own commit and say it is still pending.

Follow the repo's own branching norm (AGENTS.md / CLAUDE.md; AGENTS.md is not auto-loaded): some
repos require a branch before committing to the default branch, with a documented exemption for
docs-only changes. If the norm is unstated, committing the memory update directly is the common case,
but say what you did.

Committing is the terminal step whether or not the repo has a remote: where a commit was made, say
it is committed and unpushed, and stop.
