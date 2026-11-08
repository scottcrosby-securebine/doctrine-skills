# doctrine-orchestrate

The orchestrated-run wrapper: it runs several doctrine phases of one epic at once, one lane session per phase in its own worktree and herdr pane, and lands them one at a time through a merge session and a gate on each merged revision. The session that runs it, the orchestrator, writes no code. It relays, keeps the project file and the epic record, and puts every question to you.

## When to use it, and when not

Use it when an epic has several phases that can run at the same time, each in files the others do not touch, and you want them built in parallel and merged behind a gate without you starting, waking or merging any session by hand.

Do not use it for:

- One phase. Run it under its own wrapper, such as [doctrine-code](doctrine-code.md).
- A repo with no `docs/PROJECT.md`. Start tracking first with [doctrine-project](doctrine-project.md), since a run's lanes are the epic's member phases.
- Codex. A run supports Claude Code only, and the skill refuses on Codex.
- A session outside herdr. Every session of a run lives in a herdr pane, and the skill refuses without one.

## What it asks you first

One question, before any session starts: the full model id, the tier and the cycle cap for each role (the orchestrator, the merge session and every lane), and the orchestrator's own time budget, which goes into its anchor. A role whose resume load would not fit is refused by `hooks/dctr-orchestrate.mjs capacity` before it starts, and that refusal comes to you. Later questions come one at a time: a lane's question reaches you through the orchestrator, never from the lane directly.

## How the work runs

Three kinds of session, each a Claude Code session in its own herdr pane:

- **The orchestrator** runs `doctrine-orchestrate` in your checkout, on a branch of its own. It writes only its own paths: its record and the Records path, the project file, the epic records, its memory file, its handoffs and the auto-cycle files. A guard hook refuses its file writes anywhere else, and a probe write at run start proves the guard is on.
- **One lane per phase**, each its own doctrine phase under its own wrapper, with its own record, Coverage line, worktree and gate. A lane is not a seat, so the orchestrator never waits on one. A lane asks the orchestrator for any project-file write it needs.
- **The merge session**, in a worktree of the integration branch, merges one lane at a time with `git merge --no-ff` and runs the gate on the merged revision.

Two scripts run beside them. The sender, `hooks/dctr-send.mjs`, is the only way a message reaches a session: it writes the message to that session's held folder and types at most a fixed nudge. The lane watcher, `hooks/dctr-lanewatch.mjs`, writes each event to the run's events log, which the orchestrator waits on, and after a usage-limit stop it restarts or wakes every session at the reset time. Worktrees are made, reset, archived and removed only by `hooks/dctr-lane.mjs`.

## What the gate is for this shape

Each lane passes its own phase gate under its own wrapper. On top of that, a lane is landed only when the merged-revision gate the merge session runs reads `exit=0` with no `capture=incomplete` line; otherwise the merge session resets the integration branch to the commit before the merge. The orchestrator writes its checked-in line only after that landed report, and a lane declared `after <lane> merged` starts only from the landed revision. The epic exits as `doctrine-project` gives it.

## A worked example

You ask for an epic's three phases to run at once: two independent hook changes and a skill that names both. The orchestrator asks its one question, and you give a model id, tier and cap for each role and a four-hour budget. It runs the capacity check for each role, starts the lane watcher, creates the merge session, proves the guard on with a probe write, and creates the two hook lanes, with the skill lane's Members line carrying `after hooks-a merged`. A lane asks a question mid-phase; the orchestrator copies it into its waiting-questions file and puts it to you. One lane hits a per-model usage limit; you get one question recommending a model, type `/model` in that lane's pane yourself, and the answer is recorded as a note ruling in your words. When the first hook lane lands, the skill lane starts from the landed revision, and the epic closes after the last merge passes its gate.

## How to invoke it

Start the orchestrator session with the launch line the skill prints when it refuses a session without the orchestrator role, then:

```text
use doctrine-orchestrate to run epic E15's open phases at once
```

## Requirements

Claude Code, a repo carrying `docs/PROJECT.md`, and [herdr](https://herdr.dev) with each session in a herdr pane and herdr's Claude integration installed. Without herdr the skill refuses to start a run and says why. Auto-cycle's setup applies to every session of the run, since each one cycles on its own. [docs/requirements.md](../requirements.md) has the install commands.

## Red flags

- A lane started before the merge session, or after the merge worktree could not be created.
- A line typed into a lane's pane by hand, or `/model` typed by anything but you.
- A worktree moved by hand instead of by `dctr-lane.mjs`.
- A lane counted as landed before its merged-revision gate read `exit=0` with no `capture=incomplete` line.
- An alarm ruled by the orchestrator instead of put to you.
- A file outside the orchestrator's allowed paths changed by the orchestrator or its seats through Bash.

The specification is [`skills/doctrine-orchestrate/SKILL.md`](../../skills/doctrine-orchestrate/SKILL.md); trust it over this page wherever the two disagree.
