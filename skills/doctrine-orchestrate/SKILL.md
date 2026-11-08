---
name: doctrine-orchestrate
description: Use when the user asks to run several doctrine phases at once as an orchestrated run, with the doctrine: an orchestrator session that writes no code, one lane session per phase in its own worktree and herdr pane, a merge session that lands each lane behind a gate, and recovery that restarts every session after a usage-limit stop. Needs Claude Code, herdr and a repo carrying docs/PROJECT.md. Not for one phase, which runs under its own wrapper.
---

# Doctrine Orchestrate

Several doctrine phases of one epic, run at once and landed one at a time.

**REQUIRED BACKGROUND:** Read the `doctrine` skill first: it defines phases, seats, the record, the gate (step 5), alarms and their diagnosis, auto-cycle and the fallbacks. Read `doctrine-project` too, since every run here sits in a repo it tracks, and its `formats.md` for the project file, the epic record, the Members line's ordering clause and the ruling Kinds. This file supplies the task shape and restates neither. Paths below are relative to the plugin root unless they start `<run>`, `<repo>` or `<checkout>`.

The core discipline is relay. You, the orchestrator, write no code and run no phase's work. Each lane is its own doctrine phase under its own wrapper, with that wrapper's designated review and red team. The gate this shape adds is the merged-revision gate the merge session runs for each lane, and the epic's own exit stays as `doctrine-project` gives it. Your record is the record of your own phase, under the project file's `Records:` path, and it carries your `relay:` lines and every line doctrine step 5 puts in its orchestrator-only part.

## Hosts and refusals

Run every check here before anything else, and stop at the first that fails, saying which and why:

1. **Claude Code only.** On Codex, refuse and say that Codex parity for an orchestrated run is a later epic.
2. **herdr.** Every session of a run lives in its own herdr pane, so without herdr (no `HERDR_ENV=1`), or in a contained session (`DCTR_VIEW_REQUEST_DIR` set), refuse to start a run and say that the run's sessions, sender and watcher all need herdr panes.
3. **A project file.** Refuse in a repo that carries no `docs/PROJECT.md`, and say so. Judge that by the file itself, never by whether `runRoot` returns a run, since with `DCTR_RUN` set it returns one in any repo.
4. **Your role.** Refuse in a session whose `DCTR_ROLE` is not `orchestrator`, and print the launch line that starts one, naming the model by the id this session runs on, since `<run>/model/orchestrator` is not written until the run starts: `cd <checkout> && env DCTR_ROLE=orchestrator DCTR_CALLER=orchestrator DCTR_RUN=<run> CLAUDE_CONFIG_DIR=<config dir> PATH=<path> TMPDIR=<tmp> claude --model <model id>`, with this session's config dir, PATH and TMPDIR, and `<run>` the absolute path of `<Records>/orchestrate/`, `<Records>` being the project file's `Records:` path. A session with no `DCTR_ROLE`, such as a second session opened by hand in your checkout, is not in the run.

## Roles and the run

A run has three kinds of session, each a Claude Code session in its own herdr pane: you; one lane session per phase; and the merge session. The lane watcher and the sender are scripts, not sessions, and the owner answers questions. A lane is not a seat (doctrine step 5): you never wait on one, and you cycle on your own schedule.

Every session reads its role and its run from its own environment, set by its launch line, so a `/clear`, a restart or a seat keeps them. `<run>` holds `inbox/`, `held/<role>/`, `model/<role>`, `waiting-questions.md`, `reset.txt`, `events.log`, `guard.log` and `lane.log`. `node hooks/dctr-project.mjs board` writes `board.md`, one row per lane phase, into the Records path, and is how you read the run at a glance.

The only text any session or script types into a run session's pane is one of four fixed lines: `/clear`, `RESUME_LINE` from `hooks/dctr-lib.mjs`, the nudge "Read your brief and your held folder, then act on them.", and a role's launch line as `lane.log` records it. Everything else is message text and goes through the sender.

## Run start

In this order:

1. Your checkout holds a branch of its own, never the integration branch.
2. **Ignored handoffs.** You never edit `.gitignore`, so check before the run starts that your repo already ignores what `doctrine-backup`'s step 0 would otherwise add there. Where that step's "Ignore first" bullet judges the repo public or copied whole, and `git check-ignore docs/handoffs/` in your checkout exits 1, stop the run and tell the owner to add the line `docs/handoffs/` to that repo's `.gitignore`.
3. **One question to the owner**, in one message: the full model id, the tier and the cycle cap for each role (yourself, the merge session and every lane), and your own time budget. Write the time budget into your anchor (doctrine step 1).
4. **Capacity.** For each role run `node hooks/dctr-orchestrate.mjs capacity <model id> <tier> <transcript path>`, the transcript path being your own session's transcript for every role, since a role not yet started has none and each role's resume load was measured alike. Refuse to start a role it prints `refuse` for, and put the refusal to the owner. Decide capacity by that command alone: compute no window, load or margin yourself.
5. Write each role's model id to `<run>/model/<role>` before that role starts, since its launch line reads the file.
6. Write the tier and cycle cap of each lane, and of the merge session, into that session's first handoff, from which it writes its own `auto-cycle: on` line. Never write a lane's or the merge session's auto-cycle line into its record yourself.
7. Start the lane watcher with `node hooks/dctr-lanewatch.mjs start`.
8. **The merge session, before any lane**: `node hooks/dctr-lane.mjs create merge <repo> <integration branch> <handoff>`. When `create merge` refuses, stop the run and say why. Create no lane after that refusal.
9. **The guard probe.** Attempt one Write to `<checkout>/guard-probe.txt`, which is outside every path the guard allows you. Then read `<run>/guard.log`. When it has gained no line `<ISO time> Write <checkout>/guard-probe.txt` (the absolute path), stop the run and say the guard is not on. Judge by that line, never by the Write's error alone, since a guard failing open gives an error from nothing and no line.
10. Create each lane with `node hooks/dctr-lane.mjs create <role> <repo> <base> <handoff>`, its first handoff written under your own `docs/handoffs/`.

## Lanes

- **Each lane is its own doctrine phase**, never a sub-record of yours: its own `- phase` line under the epic's `## Members`, its own Coverage line on the items it serves, its own record and its own wrapper and gate.
- **Overlapping lanes run in separate worktrees with disjoint files**, each with its own record and its own auto-cycle line.
- **Every worktree transition is `dctr-lane.mjs`'s**: `create`, `reset`, `archive` and `remove`, for every lane and for the merge worktree, never a `git worktree` or `git reset` by hand, and no lane makes one. The one exception is the merge session's rollback under Merges and ordering: resetting the integration branch, inside the merge worktree, to the commit before a merge whose merged-revision gate did not pass is that session's own step and not a worktree transition. `archive` before `remove`, and never `remove` a lane whose session still runs.
- **A lane knows it is a lane from its first handoff**, whose first action is its brief. The brief you write for each lane, and for the merge session, says:
  - Read `<run>/reset.txt` before acting, and when the session started before the time it names, log the hold only as the one line of your reply `doctrine-resume`'s first step gives, and do no work until that time has passed.
  - Read your held folder at each resume, and act on what is there.
  - Send every question for the owner to the orchestrator as a `question` report (`node hooks/dctr-send.mjs report question <text>`), never to the owner directly.
  - Ask the orchestrator for each lifecycle write by a `request` report, and take no step that needs it until the answer is in your held folder (`doctrine-project`, its orchestrated-run rule).
  - Send each report as `node hooks/dctr-send.mjs report report <text>`, and make no worktree transition.

## Messages and the wake

- **`hooks/dctr-send.mjs` is the only way a message reaches a session of the run**, the merge session included (`held/merge/`). `send <role> <text>` writes the text to the role's held folder and types at most the nudge. A sender never types free-form text into a lane: every message goes to the lane's held folder, and the lane reads it after its next resume.
- **A paused lane is woken only by `dctr-send.mjs wake <role>`**, never by lines typed by hand.
- **Relay lines.** The sender writes the `relay:` line for each send or wake you make. You write one `relay:` line yourself for each report you relay to the owner.
- **Your wake is a Monitor on `<run>/events.log`**, the lane watcher's events log. An armed Monitor holds your Stop, so stop it as the last step before your ready line, and re-arm it as the first step after your resume, which includes your handoff's reset-file first action.

## Questions and alarms

- **A waiting question lives in `<run>/waiting-questions.md`**, the one source for it, and never as a `question:` line in your record, which would pause your cycle. At each context warning copy every unanswered question as `doctrine-backup`'s and `doctrine-handoff`'s orchestrator profiles say.
- **One question to the owner at a time.**
- **At an alarm, yours or a lane's**, write doctrine step 5's diagnosis with a recommended option and the options beside it, for the owner to answer in one word. Never rule on an alarm yourself.
- **A per-model usage limit**: put a `/model` switch for that role's running session to the owner as one question naming the role and the model id you recommend. Before you recommend a model, run `node hooks/dctr-orchestrate.mjs capacity <new model id> <the role's tier> <your own transcript>`, and recommend only a model it prints `accept` for. Where it prints `refuse`, the question names that refusal and a tier at which the same command prints `accept` for that model. The owner types `/model` in that role's pane himself, after answering: no session, seat or script of the run types it, since only the fixed lines are ever typed there. Record his answer as a `note` ruling in the epic record whose quote holds his own words (`formats.md`, Entries), never as a `ruling:` line in a session's record, since any later `ruling:` line clears a fired alarm there (`pausingStates` in `hooks/dctr-lib.mjs`). Then write the new model id to `<run>/model/<role>`, so a later restart starts that role on it, after the same command has printed `accept` for the model and tier he chose.
- **An account-wide usage limit**: wait for the reset and switch no model.

## Recovery

After a usage-limit stop, the cycle hook writes the reset time to `<run>/reset.txt`, and at that time the lane watcher restarts or wakes every session of the run. No session restarts or wakes another by hand. Your own first action on a restart is one `doctrine-resume` finds done or due, never ambiguous: your handoff's first action reads `<run>/reset.txt` and holds while its time has not passed, which leaves no effect to find (`doctrine-handoff`'s orchestrator profile). Every `unfinished` or standing-pause event the watcher writes goes to the owner as a question.

## Merges and ordering

- **The merge session**, neither a lane nor you, works in its own worktree made by `dctr-lane.mjs create merge`, with its own record and memory chain, and merges one lane at a time with `git merge --no-ff` at the integration branch's tip, when you ask through the sender. Its brief says: run the merged-revision gate through `hooks/dctr-gate.mjs` as `sh -c 'date -u +%Y-%m-%dT%H:%M:%SZ; git rev-parse HEAD; <the tests>; s=$?; date -u +%Y-%m-%dT%H:%M:%SZ; exit $s'`; start no merge, and make no Write, Edit or Bash call other than reads of that gate's transcript and result, until its `.result` is written; leave the merge on the integration branch only when the result reads `exit=0` with no `capture=incomplete` line, report it landed, and otherwise reset the integration branch to the commit before the merge and report that.
- **Write your checked-in line only after that landed report**, its gate `exit=0` with no `capture=incomplete` line, and ask for the next merge only after it. A lane repaired after its merge merges again, and its last merge is the one the line names.
- **A later lane's Members line carries `after <lane> merged`**, which you alone write. Its session starts only after the earlier lane's checked-in line, from that checked-in revision. While the predecessor's gate has not passed, or when it ends Stopped, ships at an escalation or reopens, hold the later lane and tell the owner.
- **A running lane declared after another**: tell it through its held folder to commit its work, send a `report` naming its HEAD, and do nothing more until its next message. Only once its predecessor has landed and that HEAD report is in, run `dctr-lane.mjs reset <lane> <landed revision>`, which keeps the lane's own earlier work on a side branch, then send the lane that side branch's name, and the lane re-applies its commits from it.
- **Where the project file lives in the code repo**, your Shared-writes commits sit on your own branch, and after the last lane has landed you ask the merge session to merge that branch as it merges a lane.

## The no-code boundary

You and your seats change no tracked file in any checkout or worktree outside your allowed paths, by any tool, Bash and MCP tools included, and a file you commit counts as tracked. Your allowed paths are your record and every file under the Records path, `docs/PROJECT.md`, every file under `docs/epics/`, your memory file, every file under `docs/handoffs/`, and the `.doctrine/auto-cycle` files. `hooks/dctr-guard.mjs` refuses your Write, Edit and NotebookEdit calls anywhere else and logs each to `<run>/guard.log`. It does not see Bash or MCP writes, so this rule is what holds them. Keeping working state in claude-mem or graft, and research by you or your seats, are not work in this sense. Only you write `docs/PROJECT.md` and the epic records (`doctrine-project`, its orchestrated-run rule).

## Ending the run

After the last lane has landed and the epic's state is written, run `node hooks/dctr-lanewatch.mjs stop` as the last step of the run.

## Red flags

- A refusal skipped because the run "obviously" has herdr, or a project file judged present because `runRoot` returned a run.
- A lane created before the merge session, or after `create merge` refused.
- A capacity verdict worked out in prose, a role started on a `refuse`, or a `/model` switch recommended or written with no `accept` from the capacity command.
- A guard probe judged by the Write's error with no `guard.log` line read.
- Text typed into a lane's pane that is not one of the four fixed lines: a message, a hand-typed wake, or `/model`.
- A waiting question written as a `question:` line in your record, or quoted from memory rather than word for word.
- A `/model` answer recorded as a `ruling:` line, or a model switched on an account-wide limit.
- An alarm ruled by you because the diagnosis seemed clear.
- A worktree reset by hand, other than the merge session's rollback after a failed gate, or a lane reset before its HEAD report is in.
- A checked-in line written on the merge session's word alone, before its gate reads `exit=0`.
- A Monitor still armed at your ready line, so your Stop is held and the cycle never comes.
- A fix to a lane's code made by you or your seat through Bash, because the guard did not stop it.
