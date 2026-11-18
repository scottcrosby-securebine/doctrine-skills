# doctrine-orchestrate

Use it to run several doctrine phases of one epic at once and land them one at a time. One session, the orchestrator, writes no code. It starts one lane session per phase, each in its own worktree and herdr pane, relays every message between them and you, and has a merge session land each lane behind a gate on the merged revision.

![The doctrine-orchestrate shape: four refusal checks, then run start in order, then the orchestrator relaying through the sender to the lane sessions, each lane in its own worktree and phase, landed one at a time by the merge session behind a gate on the merged revision, with wake-all after an account-wide usage limit.](doctrine-orchestrate.png)

The figure shows the shape this page walks through: the checks that refuse a run, the order a run starts in, the sessions and scripts that carry it, and the gate each lane lands behind.

Commands on this page that start `hooks/` are the plugin's own scripts, which the run's sessions invoke as `node <plugin-root>/hooks/...`, `<plugin-root>` being the directory the plugin is installed in. Beyond restarting by hand a pane with no agent, which the skill leaves to you, you run only two shell commands yourself: the launch line under How to invoke it, and `wake-all` under Usage limits.

## When to use it, and when not

The trigger is a request to run several doctrine phases at once as an orchestrated run. Use it when an epic has phases that can run at the same time in files the others do not touch, and you want them built in parallel and merged behind a gate, with your own part limited to starting the orchestrator, answering its questions, fixing any ignore rule it names, approving any permission prompt a session raises, and the few steps under Usage limits.

Before anything else the skill runs four checks, in this order, and stops at the first that fails, saying which:

1. **Claude Code only.** On Codex it refuses: Codex is not supported for an orchestrated run yet.
2. **herdr.** Without herdr (no `HERDR_ENV=1`), or in a contained session (`DCTR_VIEW_REQUEST_DIR` set), it refuses, since every session, the sender and the watcher need herdr panes.
3. **A project file.** It refuses in a repo with no `docs/PROJECT.md`, judged by the file itself. Start tracking first with [doctrine-project](doctrine-project.md), since a run's lanes are the epic's member phases.
4. **The orchestrator role.** In a session whose `DCTR_ROLE` is not `orchestrator` it refuses, writes the command that starts an orchestrator session to a new file, and prints the line that runs it, `sh '<that file>'`. That command sets the role, the run directory, your config dir, PATH and TMPDIR, and starts `claude --model` on the model id the current session runs on.

For one phase, use that phase's own wrapper, such as [doctrine-code](doctrine-code.md).

## What it asks you first

One question, in one message: the full model id, the tier and the cycle cap for each role (the orchestrator, the merge session and every lane), and the orchestrator's own time budget, which goes into its anchor.

- **The model id** is a full API id such as `claude-opus-5-5`, with `[1m]` appended for the one-million-token context window. The capacity check below refuses an id it does not know.
- **The tier** is the context use at which the session is warned and hands off to a fresh one: a token count, a percentage such as `60%`, or `default`, which is 60%.
- **The cycle cap** is how many times the session may clear and resume itself before auto-cycle pauses.

After that, questions come to you one at a time. Every question a lane has reaches you through the orchestrator, never from the lane, and waits in the run's `waiting-questions.md` until you answer. At an alarm, the orchestrator's or a lane's, you get the hub's diagnosis with a recommended option, for a one-word answer. The orchestrator never rules on an alarm itself.

## How the work runs

### The sessions and the run directory

A run has three kinds of session, each a Claude Code session in its own herdr pane:

- **The orchestrator**, in your checkout, on a branch of its own and never the integration branch.
- **One lane per phase.** Each lane is its own doctrine phase under its own wrapper, with its own `- phase` line under the epic's `## Members`, its own Coverage line, record, worktree, review and red team. A lane is not a seat, the hub's word for an agent the orchestrator dispatches and waits on, so the orchestrator never waits on one.
- **The merge session**, in its own worktree, which merges one lane at a time.

Each session reads its role and its run from the environment its launch line set, so a `/clear` or a restart keeps them. A session with no `DCTR_ROLE`, such as one you open by hand in the same checkout, is not in the run.

The run directory is the absolute path of `orchestrate/` under the project file's `Records:` path, written `<run>` below. It holds the inbox, a held and a pending folder per role, each role's launch script and model file, `waiting-questions.md`, and the logs `limits.log`, `events.log`, `guard.log` and `lane.log`.

The orchestrator runs `hooks/dctr-project.mjs board`, which writes `board.md` into the Records path, one row per `- phase` member of the current epic, the lanes among them. Read that file to see the run at a glance.

### Run start

The orchestrator does these, in this order. You run none of them:

1. Check the orchestrator's branch is its own.
2. In every repo of the run, run `git check-ignore SESSION_MEMORY.md docs/handoffs/ '<Records>/'`. The orchestrator never edits `.gitignore`, so where a path is not ignored it stops and tells you which path in which repo to add.
3. Ask you its one question.
4. Check each role's capacity with `hooks/dctr-orchestrate.mjs capacity '<model id>' <tier> '<transcript path>'`, which prints `accept` or `refuse` with its reasons. It takes the context window from that session's statusline reading where it has one for the same model, and otherwise from the model id: 1,000,000 tokens for a known id ending `[1m]` and 200,000 for a known id without it. A role it refuses does not start, and the refusal comes to you. The orchestrator works out no window, load or margin itself.
5. Write each role's model id to its model file, which its launch line reads.
6. Write each lane's and the merge session's tier and cycle cap into that session's first handoff. Each session writes its own `auto-cycle: on` line from it.
7. Start the lane watcher: `hooks/dctr-lanewatch.mjs start`.
8. Create the merge session before any lane: `hooks/dctr-lane.mjs create merge '<repo>' <integration branch> '<handoff>'`. If that refuses, the run stops and no lane is created.
9. Prove the write guard is on: one Write outside the allowed paths, to `guard-probe.txt` in the checkout, must add its line to `guard.log`. An error from the Write alone does not count, since a broken guard can return an error without refusing anything, and then logs no line. The allowed paths are listed under The orchestrator's boundary.
10. Create each lane with `hooks/dctr-lane.mjs create <role> '<repo>' <base> '<handoff>'`. That makes a worktree at `<repo>/.claude/worktrees/<role>` on a branch of the same name, copies the first handoff and writes the record there, opens the role's own herdr tab, and types its launch line, `/clear` and the resume line.
11. Run `board`.
12. Run [doctrine-handoff](../../skills/doctrine-handoff/SKILL.md) for its own phase, so its own auto-cycle has a kickoff chain from the start.

### What a lane and the merge session are told

Each lane's first handoff, and the merge session's, opens with a brief that tells the session to:

- Read its held folder at each resume, before each commit and after each report it sends, and act on what is there.
- Keep its phase Open until a held message says the run has ended, then write the state its exit gives.
- Send every question for the owner to the orchestrator as a `question` report, never to the owner directly.
- Ask the orchestrator for each write to the project file or an epic record as a `request` report, and take no step that needs it until the answer arrives.
- Send other reports as `report` reports, and make no worktree transition.

### Messages, the watcher and the wake

The sender, `hooks/dctr-send.mjs`, is the only way a message reaches a session of the run:

- `send <role> '<text>'` writes the message to the role's held folder and types at most the nudge.
- `report <kind> '<text>'` is how a lane or the merge session writes to the run's inbox, the kind being `report`, `question` or `request`.
- `wake <role>` clears and resumes a session that handed off, and otherwise nudges it. A paused lane is woken only by this or by `wake-all`.
- `wake-all <run>` wakes every session an account-wide usage limit stopped.

No session or script of the run types anything into a run session's pane except four fixed lines: `/clear`, the resume line `/doctrine:doctrine-resume` with its marker, the nudge "Read your brief and your held folder, then act on them.", and the role's launch line. The sender writes a `relay:` line for each send and wake, and the orchestrator writes one for each report it passes to you. Where the sender prints `dctr-send: no relay line written`, it has still held, nudged or woken as asked and only that line is missing: the orchestrator writes it in its own record, or puts it to you where it cannot, and never resends or wakes on it.

You talk to the run in the orchestrator's pane, where you answer its questions. In a lane's or the merge session's pane you do three things only: approve or deny a permission prompt that session raises, which nothing else can answer; type `/model`, under Usage limits; and restart by hand a pane the orchestrator reports has no agent.

The lane watcher, `hooks/dctr-lanewatch.mjs`, reads each pane and writes one line per new fact to `<run>/events.log`, and types nothing. The orchestrator waits on that file through Claude Code's Monitor tool and reads it from a cursor it keeps in its record, so a restart misses no event and acts on none twice. When the watcher reports a held message whose nudge was never typed, the orchestrator nudges that role with `wake <role>`. A session that stops idle is not put to you: the orchestrator wakes it once if it stopped after a context warning, and otherwise notes the pause. Only a wake that fails comes to you. Any other pause the watcher reports, such as a session that reached its cycle cap or made no progress, comes to you as a question.

### Usage limits

On every stop caused by an API error, the cycle hook writes a line to `limits.log` naming its kind, `account`, `model` or `other`, and the watcher raises an event for it. No session waits on a reset time.

- **A per-model limit.** You get one question naming the role and a model the capacity command accepts for it. Your answer is recorded in the epic record in your words. The orchestrator writes the new model file at once. You type `/model` in that role's pane yourself without waiting for any report, then tell the orchestrator you have. Only then does it send the role a message, and it wakes the role if the send held its nudge. Where the send prints no `dctr-send: held` line, delivery is unknown and the message is never sent again: the orchestrator looks for it in the role's held folder, goes on as for a held message where it is there, and otherwise runs no wake and puts the sender's output to you as its next question. A wake that prints no `woke` line also comes to you as a question, since the role then has no turn on the new model. Where the command refuses the role's tier on the new model, the message tells the role which tier to write. Where it accepts no tier for that model, that comes to you as a question with a model it does accept.
- **An account-wide limit.** No model switches and the orchestrator sends and wakes nothing. Once you are past the limit, which the skill calls rolling past it without saying how, run `node <plugin-root>/hooks/dctr-send.mjs wake-all <run>` once from any shell. The lane watcher shows you a notification when the limit stops the run, since the orchestrator is stopped too, and its `limit <role> account` line in `events.log` gives that command with both paths filled in. It wakes every session that stop left idle, the orchestrator among them. Any session it could not wake comes to you as a question, and a pane with no agent is reported for you to restart by hand, never relaunched.

### The orchestrator's boundary

The orchestrator and its seats change no tracked file outside these paths: its record, every file under the Records path, `docs/PROJECT.md`, `docs/epics/`, its memory file, `docs/handoffs/` and the `.doctrine/auto-cycle` files. `hooks/dctr-guard.mjs` refuses its Write, Edit, MultiEdit and NotebookEdit calls anywhere else and logs each to `guard.log`. The guard does not see Bash or MCP writes, so for those the boundary holds only as a rule the orchestrator follows. Only the orchestrator writes the project file and the epic records.

Every worktree is made, reset, archived and removed by `hooks/dctr-lane.mjs` and nothing else. A lane is archived before it is removed, and never removed while its session runs.

## What the gate is for this shape

Each lane passes its own phase gate under its own wrapper. This shape adds the merged-revision gate. When the orchestrator asks through the sender, the merge session merges one lane with `git merge --no-ff` at the integration branch's tip and runs the tests through the gate launcher, `hooks/dctr-gate.mjs`, with the time and `git rev-parse HEAD` printed before them and the time after. Until the gate's result is written it starts no merge and changes nothing. It keeps the merge only when the result reads `exit=0` with no `capture=incomplete` line, and otherwise resets the integration branch to the commit before the merge. Either way it reports. Only after a landed report does the orchestrator write the lane's checked-in line and ask for the next merge. A lane repaired after its merge merges again, and the checked-in line names its last merge.

Ordering is a clause on a lane's Members line, `after <lane> merged`, one per line, which the orchestrator alone writes. That lane starts only from its predecessor's checked-in revision. While the predecessor's gate has not passed, or when the predecessor's phase ends Stopped, Shipped at an escalation or reopens, the later lane is held and you are told.

When a running lane is declared to follow another, it commits its work, reports its HEAD and waits. Once its predecessor lands, `hooks/dctr-lane.mjs reset` moves the lane to the landed revision and keeps its earlier work on a side branch, and the lane re-applies its commits from there.

## How it ends

Where the project file lives in the code repo, the merge session merges the orchestrator's branch after the last lane. The orchestrator sends each lane, before archiving it, and the merge session, after its last landed report, a message saying the run has ended, and waits each time until that session's last state line is no longer Open. After the last lane has landed and the epic's state is written, it runs `hooks/dctr-lanewatch.mjs stop` as the run's last step. The epic exits as [doctrine-project](doctrine-project.md) gives it.

## A worked example

This example is illustrative: it shows the shape of a run, not a recorded one.

You ask for an epic's three phases to run at once: two independent hook changes, `hooks-a` and `hooks-b`, and a skill change, `skill-a`, that names what `hooks-a` adds. The orchestrator checks the ignore rules, asks its one question, and you give a model id, tier and cap for each role and a four-hour budget. It runs the capacity check for each role, starts the lane watcher, creates the merge session, proves the guard with its probe write, and creates the two hook lanes. The skill lane's Members line carries `after hooks-a merged`. A lane asks a question mid-phase, and it reaches you from the orchestrator. One lane hits a per-model usage limit: you get one question recommending a model, type `/model` in that lane's pane yourself, and tell the orchestrator you have. When `hooks-a`'s merged-revision gate passes, `skill-a` starts from the landed revision. After the last merge passes its gate, each session is told the run has ended and the watcher stops.

## How to invoke it

In a Claude Code session running in a herdr pane, in a repo that carries `docs/PROJECT.md`, ask for the run. It refuses and prints a launch line, `sh '<file>'`, that starts an orchestrator session. Run that line in a herdr pane, then ask again in the new session:

```text
use doctrine-orchestrate to run epic E15's open phases at once
```

## Requirements

Claude Code, a repo carrying `docs/PROJECT.md`, and [herdr](https://herdr.dev) with herdr's Claude integration installed, so herdr reports which session each pane runs. Set up auto-cycle too, since each session of the run cycles on its own. In every repo of the run, `SESSION_MEMORY.md`, `docs/handoffs/` and the Records path must already be ignored by git. [docs/requirements.md](../requirements.md) has the install commands.

## Red flags

Each of these means the run has left the skill's shape:

- A refusal skipped because the run "obviously" has herdr, or a project file judged present because a run directory was found rather than by reading for `docs/PROJECT.md`.
- A lane created before the merge session, or after `create merge` refused.
- A role started on a capacity `refuse`, or a capacity verdict worked out in prose.
- The guard probe judged by the Write's error with no `guard.log` line.
- Text typed into a run session's pane by a session or script other than the four fixed lines, or `/model` typed by anyone but you.
- A session woken by hand after an account-wide stop instead of by `wake-all`, or a model switched for one.
- A worktree reset by hand, other than the merge session's rollback after a failed gate.
- A lane counted as landed before its merged-revision gate read `exit=0` with no `capture=incomplete` line.
- An alarm ruled by the orchestrator instead of put to you.
- A file outside the orchestrator's allowed paths changed by it or its seats through Bash.

The specification is [`skills/doctrine-orchestrate/SKILL.md`](../../skills/doctrine-orchestrate/SKILL.md). Trust it over this page wherever the two disagree.
