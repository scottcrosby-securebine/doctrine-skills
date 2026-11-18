# doctrine-orchestrate

Use it to run several doctrine phases of one epic at once and land them one at a time. One session, the orchestrator, writes no code. It starts one lane session per phase, each in its own worktree and herdr pane, relays every message between them and you, and has a merge session land each lane behind a gate on the merged revision.

![The doctrine-orchestrate shape: four refusal checks, then run start in order, then the orchestrator relaying through the sender to the merge session and the lane sessions, each lane in its own worktree and phase, merged one at a time behind a gate on the merged revision, with wake-all after an account-wide usage limit.](doctrine-orchestrate.png)

The figure shows the shape this page walks through: the checks that refuse a run, the order a run starts in, the sessions and scripts that carry it, and the gate each lane lands behind.

## When to use it, and when not

The trigger is a request to run several doctrine phases at once as an orchestrated run. Use it when an epic has phases that can run at the same time in files the others do not touch, and you want them built in parallel and merged behind a gate without starting, waking or merging any session by hand.

Before anything else the skill runs four checks, in this order, and stops at the first that fails, saying which:

1. **Claude Code only.** On Codex it refuses and says Codex parity for an orchestrated run is a later epic.
2. **herdr.** Without herdr (no `HERDR_ENV=1`), or in a contained session (`DCTR_VIEW_REQUEST_DIR` set), it refuses, since every session, the sender and the watcher need herdr panes.
3. **A project file.** It refuses in a repo with no `docs/PROJECT.md`. Start tracking first with [doctrine-project](doctrine-project.md), since a run's lanes are the epic's member phases.
4. **The orchestrator role.** In a session whose `DCTR_ROLE` is not `orchestrator` it refuses, writes the command that starts an orchestrator session to a new file, and prints the line that runs it, `sh '<that file>'`. That command sets the role, the run directory, your config dir, PATH and TMPDIR, and starts `claude --model` on the model id the current session runs on.

For one phase, use that phase's own wrapper, such as [doctrine-code](doctrine-code.md).

## What it asks you first

One question, in one message: the full model id, the tier and the cycle cap for each role (the orchestrator, the merge session and every lane), and the orchestrator's own time budget, which goes into its anchor.

After that, questions come to you one at a time. Every question a lane has reaches you through the orchestrator, never from the lane, and waits in the run's `waiting-questions.md` until you answer. At an alarm, the orchestrator's or a lane's, you get the hub's diagnosis with a recommended option, for a one-word answer. The orchestrator never rules on an alarm itself.

## How the work runs

### The sessions and the run directory

A run has three kinds of session, each a Claude Code session in its own herdr pane:

- **The orchestrator**, in your checkout, on a branch of its own and never the integration branch.
- **One lane per phase.** Each lane is its own doctrine phase under its own wrapper, with its own `- phase` line under the epic's `## Members`, its own Coverage line, record, worktree, review and red team. A lane is not a seat, so the orchestrator never waits on one.
- **The merge session**, in its own worktree, which merges one lane at a time.

Each session reads its role and its run from the environment its launch line set, so a `/clear`, a restart or a seat keeps them. A session with no `DCTR_ROLE`, such as one you open by hand in the same checkout, is not in the run. The run directory is `orchestrate/` under the project file's `Records:` path. It holds the inbox, a held and a pending folder per role, each role's launch script and model file, `waiting-questions.md`, and the logs `limits.log`, `events.log`, `guard.log` and `lane.log`. `node hooks/dctr-project.mjs board` writes `board.md`, one row per lane phase, into the Records path: it is how you read the run at a glance.

### Run start

In this order:

1. Check the orchestrator's branch is its own.
2. In every repo of the run, run `git check-ignore SESSION_MEMORY.md docs/handoffs/ '<Records>/'`. The orchestrator never edits `.gitignore`, so where a path is not ignored it stops and tells you which path in which repo to add.
3. Ask you its one question.
4. Check each role's capacity with `node hooks/dctr-orchestrate.mjs capacity '<model id>' <tier> '<transcript path>'`, which prints `accept` or `refuse` with its reasons. The window comes from that session's statusline bridge reading where there is one, and otherwise from the model id: 1,000,000 tokens for a known id ending `[1m]` and 200,000 for a known id without it. The command refuses any model id it does not know. A role it refuses does not start, and the refusal comes to you. The orchestrator works out no window, load or margin itself.
5. Write each role's model id to its model file, which its launch line reads.
6. Write each lane's and the merge session's tier and cycle cap into that session's first handoff. Each session writes its own `auto-cycle: on` line from it.
7. Start the lane watcher: `node hooks/dctr-lanewatch.mjs start`.
8. Create the merge session before any lane: `node hooks/dctr-lane.mjs create merge '<repo>' <integration branch> '<handoff>'`. If that refuses, the run stops and no lane is created.
9. Prove the write guard is on: one Write outside the allowed paths, to `guard-probe.txt` in the checkout, must add its line to `guard.log`. An error from the Write alone does not count, since a guard failing open also errors and logs nothing.
10. Create each lane with `node hooks/dctr-lane.mjs create <role> '<repo>' <base> '<handoff>'`. That makes a worktree at `<repo>/.claude/worktrees/<role>` on a branch of the same name, copies the first handoff and writes the record there, opens the role's own herdr tab, and types its launch line, `/clear` and the resume line.
11. Run `board`.
12. Run [doctrine-handoff](../../skills/doctrine-handoff/SKILL.md) for its own phase, so its own auto-cycle has a kickoff chain from the start.

### What a lane is told

Each lane's first handoff opens with its brief, which says: read your held folder at each resume, before each commit and after each report; keep your phase Open until a held message says the run has ended, then write the state your exit gives; send every question as a `question` report and every request for a project-file write as a `request` report, and wait for the answer; send reports as `report` reports; and make no worktree transition.

### Messages, the watcher and the wake

The sender, `hooks/dctr-send.mjs`, is the only way a message reaches a session of the run:

- `send <role> '<text>'` writes the message to the role's held folder and types at most the nudge.
- `report <kind> '<text>'` is how a lane or the merge session writes to the run's inbox, the kind being `report`, `question` or `request`.
- `wake <role>` clears and resumes a session that handed off, and otherwise nudges it. A paused lane is woken only by this or by `wake-all`.
- `wake-all <run>` wakes every session an account-wide usage limit stopped.

Nothing else is ever typed into a run session's pane, and only four lines ever are: `/clear`, the resume line `/doctrine:doctrine-resume` with its marker, the nudge "Read your brief and your held folder, then act on them.", and the role's launch line. The sender writes a `relay:` line for each send and wake, and the orchestrator writes one for each report it passes to you.

The lane watcher, `hooks/dctr-lanewatch.mjs`, reads each pane and writes one line per new fact to `events.log`, and types nothing. The orchestrator waits on a Monitor over that file and reads it from a cursor it keeps in its record, so a restart misses no event and acts on none twice. When the watcher reports a held message that no nudge delivered, the orchestrator wakes that role again.

### Usage limits

On every stop caused by an API failure, the cycle hook writes a line to `limits.log` naming its kind, `account`, `model` or `other`, and the watcher raises an event for it. No session waits on a reset time.

- **A per-model limit.** You get one question naming the role and a model the capacity command accepts for it. Your answer is recorded in the epic record in your words. The orchestrator writes the new model file first, then you type `/model` in that role's pane yourself, and only after you say so does the orchestrator send the role a message, waking it if the send held its nudge. Where the command refuses the role's tier on the new model, the message tells the role which tier to write.
- **An account-wide limit.** No model switches and the orchestrator sends and wakes nothing. Once you roll past the limit, run `node <plugin-root>/hooks/dctr-send.mjs wake-all <run>` once from any shell. It wakes every session that stop left idle, the orchestrator among them. Any session it could not wake comes to you as a question, and a pane with no agent is reported for you to restart by hand, never relaunched.

### The orchestrator's boundary

The orchestrator and its seats change no tracked file outside its record, the Records path, `docs/PROJECT.md`, `docs/epics/`, its memory file, `docs/handoffs/` and the `.doctrine/auto-cycle` files. `hooks/dctr-guard.mjs` refuses its Write, Edit and NotebookEdit calls anywhere else and logs each to `guard.log`. The guard does not see Bash or MCP writes, so the rule holds those. Only the orchestrator writes the project file and the epic records. Every worktree is made, reset, archived and removed by `hooks/dctr-lane.mjs` and nothing else.

## What the gate is for this shape

Each lane passes its own phase gate under its own wrapper. This shape adds the merged-revision gate. When the orchestrator asks through the sender, the merge session merges one lane with `git merge --no-ff` at the integration branch's tip and runs the tests through the gate launcher, `hooks/dctr-gate.mjs`. It keeps the merge only when the result reads `exit=0` with no `capture=incomplete` line, and otherwise resets the integration branch to the commit before the merge. Either way it reports. The orchestrator writes a lane's checked-in line only after a landed report, and only then asks for the next merge. A lane repaired after its merge merges again.

Ordering is a clause on a lane's Members line, `after <lane> merged`, which the orchestrator alone writes. That lane starts only from its predecessor's checked-in revision. While the predecessor's gate has not passed, or when it ends Stopped, Shipped at an escalation or reopens, the later lane is held and you are told. A lane already running when it is declared after another commits its work and reports its HEAD. Once its predecessor lands, `dctr-lane.mjs reset` moves it to the landed revision, keeps its earlier work on a side branch, and the lane re-applies its commits from there. Where the project file lives in the code repo, the merge session merges the orchestrator's branch after the last lane. The epic exits as [doctrine-project](doctrine-project.md) gives it.

## How it ends

The orchestrator sends each lane, before archiving it, and the merge session, after its last landed report, a message saying the run has ended, and waits each time until that session's last state line is no longer Open. After the last lane has landed and the epic's state is written, it runs `node hooks/dctr-lanewatch.mjs stop` as the run's last step.

## A worked example

You ask for an epic's three phases to run at once: two independent hook changes and a skill that names both. The orchestrator checks the ignore rules, asks its one question, and you give a model id, tier and cap for each role and a four-hour budget. It runs the capacity check for each role, starts the lane watcher, creates the merge session, proves the guard with its probe write, and creates the two hook lanes. The skill lane's Members line carries `after hooks-a merged`. A lane asks a question mid-phase, and it reaches you from the orchestrator. One lane hits a per-model usage limit: you get one question recommending a model, and type `/model` in that lane's pane yourself. When the first hook lane's merged-revision gate passes, the skill lane starts from the landed revision. After the last merge passes its gate, each session is told the run has ended and the watcher stops.

## How to invoke it

Ask in a session in the repo, and it refuses with the launch line for an orchestrator session. Run that line in a herdr pane, then ask again:

```text
use doctrine-orchestrate to run epic E15's open phases at once
```

## Requirements

Claude Code, a repo carrying `docs/PROJECT.md`, and [herdr](https://herdr.dev) with herdr's Claude integration installed, so herdr reports which session each pane runs. Set up auto-cycle too, since each session of the run cycles on its own. In every repo of the run, `SESSION_MEMORY.md`, `docs/handoffs/` and the Records path must already be ignored by git. [docs/requirements.md](../requirements.md) has the install commands.

## Red flags

- A refusal skipped because the run "obviously" has herdr, or a project file judged present without reading for it.
- A lane created before the merge session, or after `create merge` refused.
- A role started on a capacity `refuse`, or a capacity verdict worked out in prose.
- The guard probe judged by the Write's error with no `guard.log` line.
- Any text typed into a run session's pane other than the four fixed lines, `/model` included unless you typed it.
- A session woken by hand after an account-wide stop instead of by `wake-all`, or a model switched for one.
- A worktree reset by hand, other than the merge session's rollback after a failed gate.
- A lane counted as landed before its merged-revision gate read `exit=0` with no `capture=incomplete` line.
- An alarm ruled by the orchestrator instead of put to you.
- A file outside the orchestrator's allowed paths changed by it or its seats through Bash.

The specification is [`skills/doctrine-orchestrate/SKILL.md`](../../skills/doctrine-orchestrate/SKILL.md). Trust it over this page wherever the two disagree.
