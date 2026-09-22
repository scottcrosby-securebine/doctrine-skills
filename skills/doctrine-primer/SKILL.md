---
name: doctrine-primer
description: Use when starting cold in a repo, when the user asks to prime, orient, or get a situation report, or when an agent has never seen this repo. Restores session state exactly as doctrine-resume does, then explains the project.
---

# Doctrine Primer — cold-start orientation

Restore the session's state, then explain the project to an agent that has never seen this repo.

Need state only, not a codebase tour? `doctrine-resume` is the cheap path: say so and stop.

CLAUDE.md is already in your context; the harness loads it every session, so never spend a read on
it. **AGENTS.md is not**: it is not auto-loaded unless something `@`-imports it, and it is usually where
issue-tracking and session-completion norms live. Read it if present.

## 1. Restore state

Run `doctrine-resume` steps 1 to 4 as written there: read the memory file, act on the kickoff's first
line, check drift, hydrate Active Work, and produce its report. Put that report at the very top of
your reply, ahead of everything else; the kickoff in it is a live instruction from the prior session,
not history. Where it finds drift, offer its step 5 resync. Those steps are written there once and not restated here.

Where `doctrine-resume` would stop because no memory file exists, do not stop: say there is none,
offer `doctrine-backup` at session end, run `doctrine-resume` step 2's batch anyway for the
branch, dirty work, PRs and build, and continue to step 2. Where the file exists but its
`## Next Session Kickoff` is absent, say so plainly: `doctrine-backup` is contracted to write it, so
its absence means the last handoff was lost.

## 2. Recon

Discover the project's shape; never assume `src/`. Batch these, then read what the listing reveals:

- `ls` the root, then `ls` the two or three real source directories it shows
- `command -v tree` before reaching for a tree; on many hosts it is absent
- `gh issue list --state open --limit 200 --json number --jq 'length'` for the count, written as "200+"
  when it returns 200, since the limit caps the fetch. Only pull titles
  for the handful the kickoff names: some repos carry thousands of open issues.

Then read `README.md` if it exists, and any `docs/` index: the root README is usually the product, the
docs index the engineering map.

**Several plausible build workflows** (large repos often have a dozen): name the one `doctrine-resume`'s
drift check picked and mark the verdict as based on that pick, or say it is ambiguous. Never let a guess
become a silent "built ✓".

## 3. Explain the project

- Structure: the real directories you listed, never a guessed layout
- Purpose and goals
- Key files and what each is for
- Important dependencies
- Important configuration files
- Open work: the issue count from step 2, and whatever the kickoff points at

## Done when

`doctrine-resume`'s report leads the reply, with the kickoff quoted or its absence flagged, and every
step 3 bullet is covered.
