# Doctrine on Claude Code

The hub and the wrappers name actions. This file says how each is done on Claude Code. Where your tool list disagrees with it, trust the tool list.

## Actions

| Action | On Claude Code |
|---|---|
| Load a skill by name | The Skill tool, with the skill's full name, `doctrine:doctrine-code` for example. |
| Read a skill that is not model-invocable | The user's `~/.claude/skills/<name>/SKILL.md`, then the project's `.claude/skills/<name>/SKILL.md`; the first that exists. |
| Dispatch a seat | The Agent tool. A subagent starts with a fresh context, so every seat is blind by default. |
| Run a workflow | The Workflow tool, where it is in your tool list. The hub's step 2 is your authorization to use it. |
| Wait on a file or a job | A background command that exits when the file appears (`until [ -f <file> ]; do sleep 15; done`), or the Monitor tool. Either one re-invokes you. |
| The shell tool's ceiling | The Bash tool kills a foreground call after ten minutes. |
| Notify the user | The PushNotification tool. |
| Project instructions | Claude Code loads CLAUDE.md. It reads AGENTS.md only through an `@AGENTS.md` import, or when no CLAUDE.md exists. |

## The dctr command

The skills reach the doctrine runtime, the `doctrine-runtime` plugin, through one command, `dctr`, run through the Bash tool as `dctr <subcommand> ...`. On Claude Code it is on the Bash tool's PATH through the runtime plugin's `bin/` while that plugin is enabled. Installing or updating the `doctrine` plugin installs the runtime with it, since `doctrine` depends on it; the user can also run `/plugin install doctrine-runtime@doctrine-skills`.

Every skill that names a `dctr` subcommand names the lowest runtime version that has it, and `dctr --version` prints the version installed. `dctr` itself, and each subcommand this file names, came with runtime 3.0.0. Where `dctr` is not found, or prints a version below the one the skill names, the runtime is absent or older than the skill needs, and the subcommand's fallback applies:

- `dctr gate`: run the check directly, its output written to `<out-file>`, and when it ends write its exit status as the line `exit=N` that opens `<out-file>.result`, so the wait on the result file and the record read the same two files the launcher would have written.
- Every other subcommand: do not run it. Say in your turn that the doctrine runtime is absent or older than the version the skill names, and which subcommand you skipped, and write the same in the record where the phase has one.

## The red team from the other model family

The red team here is Codex, run as the `codex:codex-rescue` subagent.

Dispatch it with the Agent tool as `subagent_type: "codex:codex-rescue"`, never with the Skill tool, which has no such skill. Check that it is present in the Agent tool's own subagent list. If it is absent there, the plugin is absent and the hub's Fallbacks row applies.

A wrapper that gives its own invocation of this red team, as `doctrine-gauntlet`'s `tools.md` does to attach renders, uses that invocation and not this subagent. For that wrapper the seat is absent when its invocation's own command is, and one whose command is present and fails is retried and substituted as the hub's Fallbacks section says. Whether `codex:codex-rescue` is installed decides neither.

The seat forwards to the Codex CLI, and returns either a start line or the full result.

**Where its return is.** Its return is in its job record: `<config dir>/plugins/data/codex-openai-codex/state/<workspace-basename>-<hash>/jobs/<task-id>.json`, where `<config dir>` is `$CLAUDE_CONFIG_DIR` when that variable is set and `~/.claude` otherwise, with the fields status, pid, logFile, result, createdAt, summary and workspaceRoot. For the hub's ownership test, workspaceRoot is the workspace the record names and createdAt is when it was created.

A dead pid, or a terminal status with no result, is a failed seat. A wrapper that dies, from an API error or a kill, is not a dead job, so read the record's status before calling the seat failed.

**Dispatch it read-only.** Say so in the dispatch's own words. It picks its sandbox from how the request reads, before Codex sees the task, and it defaults to write-capable.

**Display.** In the herdr TUI and in herdr-core, as "herdr TUI and herdr-core" below decides it, the seat hook keeps the codex seat's pane open and follows the job's log there until the record leaves running, so open no second pane. Where the hook is not running, skip the display: display never blocks a seat or a pass.

## Research engines

**Engine 1.** It is the stock deep-research workflow: `Workflow({name: 'deep-research', args: '<refined question>'})`.

**Engine 2.** It is the codex:codex-rescue seat, a thin wrapper whose only tool is Bash. It shells out to the Codex CLI.

- **Search.** The companion script passes no search flag, so engine 2 searches only as the user's Codex config allows. Check the top-level `web_search` setting in `~/.codex/config.toml` before you dispatch: `"live"` reaches the live web, and anything else may answer from a cache or from model knowledge.
- **Returns.** Say in the dispatch to run in the foreground. The seat prefers background execution for open-ended work and cannot fetch its own results. A job handle that comes back anyway is retrieved with `/codex:status <job-id>`, then the job record's result.

## Auto-cycle and the hooks

On Claude Code the plugin loads the hooks, auto-cycle and the seat panes itself. The seat and gate panes run in the herdr TUI and in herdr-core, and auto-cycle's typing runs in the herdr TUI only. On Codex they run once the user installs them, as the Codex reference says.

When you pause auto-cycle yourself, send a PushNotification whose text is exactly the pause text the hub gives. Where the PushNotification tool is not in your tool list, say in your turn that you rely on the herdr alert alone, or, in herdr-core, where no herdr alert is raised, that nothing alerts the user beyond your turn.

## herdr TUI and herdr-core

Doctrine supports two terminal hosts: the herdr TUI, which ordinary terminals run, and herdr-core, the terminal core behind Herdr.app, driven by `hc` and `herdr-app`. The hooks decide which one the session is in from its environment, in this order, and you read it the same way:

1. `TERM_PROGRAM` is `herdr` and `HERDR_ENV` is `1`: the herdr TUI, including one nested inside a herdr-core terminal.
2. Otherwise, `HC_TERMINAL_ID` is set: herdr-core, even when `HERDR_*` variables are set too, because a herdr-core started from a herdr pane passes them to every terminal it runs.
3. Otherwise, `HERDR_ENV` is `1`: the herdr TUI.
4. Otherwise neither.

In herdr-core, seat panes, gate panes and `doctrine-pane`'s sessions run in the Herdr.app window, placed by the same rules as in the herdr TUI: right of your pane, stacked down to six, then tabs in your space. Herdr.app cannot rename a pane, so each such pane prints its label as its first line, and a focused seat or gate pane stays open with its result. The other doctrine hooks stand down from herdr there, so these do not run in this release: auto-cycle's typer, orchestrated lanes, which need the herdr TUI, and sidebar tokens.

A session the user asks to log into, watch and take over goes through `doctrine-pane`. When the user asks you there to start an agent or any other program they will watch, do not use `herdr`, even when it is on PATH and its server answers: anything it starts lands in the herdr TUI, out of sight of the person in Herdr.app. For starting, reading, messaging and waiting on agents and programs, follow `hc --skill`. For what the person sees in the window, follow `herdr-app --skill`. Where either command is missing, tell the user which, and do not fall back to `herdr`.
