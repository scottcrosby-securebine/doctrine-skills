# doctrine-primer

Use it when an agent starts cold in a repo: it restores the last session's state exactly as `doctrine-resume` does, then explains the project to an agent that has never seen it.

![The doctrine-primer shape: read the project instruction files, run doctrine-resume's restore and put its report first, then recon the repo's real directories, README and open issues, and explain the project in six parts.](doctrine-primer.png)

The figure shows the three steps this page walks through: restore, recon, explain.

## When to use it, and when not

The trigger is a cold start: a fresh session in a repo, a request to prime, orient or give a situation report, or an agent that has never seen this repo.

When you need state only and not a tour of the code, `doctrine-resume` is the cheaper path, and the primer says so and stops.

The primer is not one of the hub's nine wrappers, and it runs no review gate of its own.

## What it asks you

The primer asks nothing of its own. Two questions can reach you through the resume steps it runs:

- Where the memory file and the repo disagree and auto-cycle is off: "Memory is stale — resync it?" On yes it runs `doctrine-backup`.
- Where the first action the last handoff named may already have run, and no phase record was read to settle it: it asks whether that action ran.

Where no memory file exists, it says so and offers to run `doctrine-backup` at the end of the session. Once `doctrine-backup` runs, it can ask questions of its own.

## How the work runs

Before step 1 it reads the project instruction files. Your host loads one for it, and the hub's host reference names which: Claude Code loads `CLAUDE.md`, and Codex loads `AGENTS.md`. The primer reads the other one too where it exists, and reads the loaded one itself where the host loaded only part of it, as Codex does past 32 KiB by default. `AGENTS.md` is usually where a project keeps its issue-tracking and session-completion norms.

1. **Restore.** It loads `doctrine-resume` first and makes no call before it except reading the instruction files, because resume decides what has to come before the phase's wrapper. It then runs resume's steps 1 to 4: read the memory file, act on the kickoff's first line, check drift, hydrate the Active Work table, and write resume's report. That report goes at the very top of the reply, since its kickoff is a live instruction from the previous session and not history.

   Where resume finds drift or a backup that never landed, the primer takes resume's step 5 as resume writes it. Through those steps, when the record the current handoff names is Open or Blocked, the session loads that phase's wrapper and then the `doctrine` skill. The wrapper comes from the record's last `wrapper:` line, else the handoff header's. With `wrapper: none`, or no wrapper line in either place, it loads `doctrine` alone.

   Two cases differ from a plain resume. With no memory file, resume would stop; the primer says there is none, runs resume's drift batch anyway for the branch, uncommitted work, open PRs and the build, and goes on to recon. With a memory file that has no `## Next Session Kickoff` section, it says so plainly: `doctrine-backup` is required to write that section, so its absence means the last handoff was lost.

2. **Recon.** It finds the project's real shape and never assumes a `src/` directory. In one batch:

   - `ls` the root, then `ls` the two or three real source directories that listing shows.
   - `command -v tree` before using a tree, since many hosts lack it.
   - `gh issue list --state open --limit 200 --json number --jq 'length'` for the open issue count, reported as "200+" when it returns 200, because the limit caps the fetch. It pulls titles only for the few issues the kickoff names, since some repos carry thousands.

   Then it reads `README.md` if one exists and any index under `docs/`: the README is usually the product, the docs index the engineering map. Where the repo has several plausible build workflows, it names the one resume's drift check picked and says the build verdict rests on that pick, or says the choice is ambiguous. A guess never becomes a silent "built ✓".

3. **Explain.** It covers six things:

   - Structure: the directories it actually listed, never a guessed layout.
   - Purpose and goals.
   - Key files, and what each is for.
   - Important dependencies.
   - Important configuration files.
   - Open work: the issue count from recon, and whatever the kickoff points at.

## How it ends

It is done when resume's report leads the reply, with the kickoff quoted or its absence flagged, and all six parts of the explanation are covered.

Two cases end sooner, before recon and the tour:

- Where the handoff's first action may already have run and a phase record was read, resume appends a paused line to that record and ends the turn after its report, until that is settled.
- Where `doctrine-backup` runs during the restore, for a resync you accepted or a backup that never landed, it commits the memory file locally, never pushes, and its own text says to stop once it has committed. Under auto-cycle, a question `doctrine-backup` would ask is instead appended to the phase record as a pause, and the turn ends.

The primer writes no file of its own. A file changes only through the steps it runs:

- `doctrine-backup`, when you say yes to a resync, accept the end-of-session backup it offers, or a backup never landed.
- One line naming the drift in the phase record, when auto-cycle is on and resume finds drift.
- One paused line appended to the phase record, in the case above.

## A worked example

This example is illustrative: it shows the shape of a run, not a recorded one.

You open a fresh session in a repo you last worked in a week ago and type `prime`. The primer reads `CLAUDE.md`, finds no `AGENTS.md`, and loads `doctrine-resume`. The reply opens with resume's report: the kickoff quoted, and drift noted because the branch is two commits past what the memory file recorded. Auto-cycle is off, so it asks "Memory is stale — resync it?" and you say no.

It then lists the root and the two source directories it finds, checks for `tree`, and reads the README and the `docs/` index. The issue count returns 200, so it reports "200+" open issues and pulls titles only for the two the kickoff names. It explains the structure, purpose, key files, dependencies, configuration and open work, and stops there without writing a file.

## How to invoke it

Sample prompts:

```text
prime
```

```text
give me a situation report on this repo
```

## Requirements

The GitHub CLI `gh` supplies the open PRs, the build status, the Active Work issue states and the open issue count. Where `gh` fails, resume's drift check says so once and continues on git alone. The primer's text does not say what its recon reports for the issue count without `gh`. The plugin's own requirements are in [docs/requirements.md](../requirements.md).

The hub's page is [doctrine.md](doctrine.md), and the README is [here](../../README.md).

The specification is [`skills/doctrine-primer/SKILL.md`](../../skills/doctrine-primer/SKILL.md), and the restore steps it runs are in [`skills/doctrine-resume/SKILL.md`](../../skills/doctrine-resume/SKILL.md); trust them over this page wherever they disagree.
