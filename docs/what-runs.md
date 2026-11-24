# What runs on your machine

The plugin is mostly markdown. It also ships node scripts under [`hooks/`](../hooks/). This page lists each one: what runs it, when, and what it touches. It is written from each script's header comment, checked against its code. Every script needs node and the standard Unix tools a POSIX system ships (`sh`, `env`, `cat`, `find`, `ps` and the like). An entry names anything beyond those, such as git, bash, herdr or a host's CLI. Each script also keeps its own small state files, locks and log lines under the system temp folder (`$TMPDIR`), a session's `hook.log` among them. An entry names the main files it writes, not every lock, marker or log beside them; the orchestration scripts keep theirs in the run's folder. Two reach past your machine's files and processes: the status page server, which listens on loopback unless you give it another host, and the doctor, which drives your installed Claude Code and Codex through real model turns.

## Scripts the hooks run

Claude Code runs these on its own once the plugin is installed. [`hooks/hooks.json`](../hooks/hooks.json) names them. On Codex CLI most of them run too, once you install them ([requirements](requirements.md#auto-cycle-setup)), and the two PreToolUse guards and the band do not.

| Script | Runs on | What it does |
|---|---|---|
| `dctr-seat.mjs` | SubagentStart, SubagentStop, SessionEnd | Gives each dispatched subagent a live pane, in herdr or in Herdr.app, closes the pane when the subagent stops unless you are reading it, and sweeps any pane left over at the end of the session. A `codex:codex-rescue` seat's pane is the exception: its job runs on after the seat returns, so the pane follows the job and stays ([watching a run](watching-a-run.md)). Outside both it stands down. In a container it calls no herdr and writes a view-request file instead. |
| `dctr-restore.mjs` | SessionStart, after `/clear` | When the record of an open doctrine phase is reachable from `SESSION_MEMORY.md`, it hands the new session the phase name, the record's path and last state line, the wrapper and the current handoff. In every other case it prints nothing. It writes a small start file in the temp folder, and when the session is in a herdr pane it also writes the restore file the auto-cycle typer waits for. It calls no herdr. |
| `dctr-gauge.mjs` | every tool batch | Only while auto-cycle is on: it reads how much of the context window the session has used. The first time that reaches the tier, it warns the session and appends `auto-cycle: warned` to the phase record. A subagent's batch stands down before anything is read. It calls no herdr. |
| `dctr-cycle.mjs` | Stop, Notification (permission or idle prompt), StopFailure, UserPromptSubmit | The auto-cycle hook. A StopFailure in a session of an orchestrated run appends a line to the run's `limits.log`, whether or not auto-cycle is on. Everything else it does only while auto-cycle is on: at a Stop it either pauses with a line in the record, waits, or starts the typer (below). A permission prompt, idle stop or API error appends a paused line. Each pause is shown once, as a herdr notification and the `$autocycle` sidebar token. It uses git to hash the working tree, which adds objects to each repository's git object store. In a container it calls no herdr. |
| `dctr-promptgate.mjs` | UserPromptSubmit | Touches no prompt but the resume line auto-cycle types, which it lets through only in the session that line's `/clear` started. It blocks any other such line. It reads the pane's restore file, and when it blocks such a line in a herdr pane it writes a marker file the typer reads. It calls no herdr. |
| `dctr-roundguard.mjs` | PreToolUse on Bash, Write and Edit | Claude Code inside herdr only. When a tool call writes a new round line into a run record, it refuses that call once if the call does not also publish the sidebar counters, or if the call or the record names a gate transcript under the temp directory, which dies with the session. A latch file in the session's temp folder records each refusal, so an identical retry goes through, and any error lets the call through. It calls no herdr. |
| `dctr-guard.mjs` | PreToolUse on Write, Edit, MultiEdit and NotebookEdit | Acts only in an orchestrated run's orchestrator session (`DCTR_ROLE=orchestrator`) and its subagents. There it refuses a file write to any path the orchestrator may not write, and logs each refusal to the run's `guard.log`. In every other session it lets every call through. Bash and MCP tools are never refused. It calls no herdr. |

The hook set also loads one hooks module, `hooks/band/register.tsx`, the **doctrine band**: on Claude Code, one line above the prompt while an open doctrine phase is reachable from `SESSION_MEMORY.md`. It reads that file, the handoff and the record, hooks no tool call and calls no herdr. Turn it off with the plugin's `band` option in `/config`.

## Scripts these start

| Script | Started by | What it does |
|---|---|---|
| `dctr-typer.mjs` | `dctr-cycle.mjs`, detached | Waits until your focus has moved off the session's herdr pane, then types `/clear` and the resume command into it and appends the cycle line to the record. In a container it exits before any herdr call. |
| `dctr-render.mjs` | `dctr-seat.mjs`, in a seat's pane | Renders the subagent's transcript in its pane as it grows. It writes nothing and calls no herdr. |
| `dctr-watch.mjs` | `dctr-cycle.mjs`, on Codex only | Codex fires no hook for an API error, an idle session or a background command's exit. This watches for them in the session's rollout, the process tree under the Codex process and, in a herdr pane, herdr's reading of that pane, and hands the cycle hook the event Claude Code would have fired. It writes only its own lines to `hook.log`. |

Four modules are only imported by the others: `dctr-lib.mjs` (the decisions), `dctr-state.mjs` (the files, locks and herdr calls), `dctr-host.mjs` (the host seam: the herdr TUI or herdr-core) and `dctr-record.mjs` (the record line parser).

## Scripts a skill tells a run to invoke

The agent runs these as commands when a skill tells it to. The skill named beside each is where to read when and why.

| Script | Named by | What it does |
|---|---|---|
| `dctr-gate.mjs` | `doctrine`, step 3 | Runs every gate check. Inside herdr or a Herdr.app terminal the check runs in a pane you can watch. Outside both, or in a container, it runs detached, except inside Codex's Linux sandbox, where a detached process dies with its command, so it runs the check to completion first. Either way it writes the command to `<transcript>.cmd` at launch, the check's output to a transcript file and, once the check ends, `<transcript>.result` with `exit=N` on its first line. It needs bash. |
| `dctr-token.mjs` | `doctrine`, step 5; `doctrine-project` | Publishes the run's round and gate counters, and the epic and phase, as herdr sidebar tokens ([watching a run](watching-a-run.md)). Outside herdr it does nothing. It writes no file. |
| `dctr-pane.mjs` | `doctrine-pane` | Opens an interactive login (ssh, a console, a log tail) under `script(1)` and bash in a pane you can watch and take over, and lets the agent read it and type into it. It refuses outside herdr and in a container. |
| `dctr-project.mjs` | `doctrine-project`, `doctrine-orchestrate` | `check` validates `docs/PROJECT.md` and the epic records offline. `status` prints what they show. `board` overwrites the records folder's `board.md`. Only `status` calls herdr, and only inside herdr. |
| `dctr-orchestrate.mjs` | `doctrine-orchestrate` | `capacity`: says whether one role of the run, the orchestrator, a lane or the merge session, may go on: its resume load plus the handoff's cost must fall below its auto-cycle tier, and the tier must fit its context window. Each role runs it on its own transcript. It reads that transcript and the statusline bridge's reading for the session, takes no model id, and writes nothing. With no fresh reading it refuses and says the window is unknown. `start`, run by a session with no run role, opens the orchestrator's own herdr tab and starts its session there with `claude`, writing its launch file under `$TMPDIR`. It refuses with no herdr workspace, in a herdr-core terminal and in a container. |
| `dctr-lane.mjs` | `doctrine-orchestrate` | Makes each lane's git worktree change: `create`, `reset`, `archive` and `remove`. `create` also opens the lane's herdr tab and starts its session with `claude`. A `create` that fails before it types the resume line undoes what it made and names anything it could not undo. Only the orchestrator may run it, and each success appends a line to the run's `lane.log`. It needs git. |
| `dctr-send.mjs` | `doctrine-orchestrate`, `doctrine-project` | Carries messages between the sessions of an orchestrated run. `send` holds a message for a lane and nudges its pane through herdr. `report` writes to the orchestrator's inbox. `wake` and `wake-all` restart sessions after a usage limit, and `wake` uses git to check that a session's handoff has landed. |
| `dctr-lanewatch.mjs` | `doctrine-orchestrate` | The lane watcher. It runs in a pane of its own, reads every lane's pane, logs each new fact to the run's `events.log`, and shows a herdr notification for a usage limit or a stalled orchestrator. Its own pane prints each new line as it logs it and marks the ones that wait on you. It never types into a pane. |
| `dctr-notify.mjs` | the Codex reference | On Codex, which has no notification tool, it shows the orchestrator's auto-cycle pause as one herdr notification. Outside herdr it does nothing. |
| `dctr-codex.mjs` | the Codex reference, `doctrine-pane` | `install` copies the hooks into your Codex home and registers them in its `hooks.json` and `config.toml`. Re-run it after every plugin update. |

## Scripts you run by hand

| Script | What it does |
|---|---|
| `dctr-bridge.mjs` | `install` copies the statusline bridge into your Claude config folder and points settings.json's `statusLine` at it. Claude Code then runs it to draw the statusline. It records the window size for the context gauge, and your own statusline's output passes through unchanged ([requirements](requirements.md#auto-cycle-setup)). |
| `dctr-page.mjs` | A status page server for a repo carrying `docs/PROJECT.md`, serving the same text `dctr-project.mjs status` prints. It listens on `127.0.0.1:8787` by default. A host other than loopback needs `DCTR_PAGE_PASSWORD`. It writes nothing but its responses. |
| `dctr-doctor.mjs` | Run after a Codex, Claude Code or herdr update. It starts its own herdr server, drives both installed hosts through two cheap model turns each in scratch homes, and reports whether each host signal the hooks read still holds. It needs herdr and the codex and claude binaries, and it never writes `~/.claude` or `~/.codex`. |
| `dctr-mutations.mjs` | A maintainer's gate. It breaks each named repair in a copy of the tree and fails if no test notices ([how this is tested](how-this-is-tested.md)). The tests it runs also need git, bash, `which` and python3 3.11 or later, and bubblewrap, without which it fails. It never writes the repo. |

The `*.selftest.mjs` files beside these are their tests, which CI runs.
