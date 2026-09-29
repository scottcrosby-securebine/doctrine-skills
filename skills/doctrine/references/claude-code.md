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

## The red team from the other model family

The red team here is Codex, run as the `codex:codex-rescue` subagent.

Dispatch it with the Agent tool as `subagent_type: "codex:codex-rescue"`, never with the Skill tool, which has no such skill. Check that it is present in the Agent tool's own subagent list. If it is absent there, the plugin is absent and the hub's Fallbacks row applies.

The seat forwards to the Codex CLI, and returns either a start line or the full result.

**Where its return is.** Its return is in its job record: `<config dir>/plugins/data/codex-openai-codex/state/<workspace-basename>-<hash>/jobs/<task-id>.json`, where `<config dir>` is `$CLAUDE_CONFIG_DIR` when that variable is set and `~/.claude` otherwise, with the fields status, pid, logFile, result, createdAt, summary and workspaceRoot. For the hub's ownership test, workspaceRoot is the workspace the record names and createdAt is when it was created.

A dead pid, or a terminal status with no result, is a failed seat. A wrapper that dies, from an API error or a kill, is not a dead job, so read the record's status before calling the seat failed.

**Dispatch it read-only.** Say so in the dispatch's own words. It picks its sandbox from how the request reads, before Codex sees the task, and it defaults to write-capable.

**Display.** Inside herdr (`HERDR_ENV` is `1`), the seat hook keeps the codex seat's pane open and follows the job's log there until the record leaves running, so open no second pane. Where the hook is not running, skip the display: display never blocks a seat or a pass.

## Research engines

**Engine 1.** It is the stock deep-research workflow: `Workflow({name: 'deep-research', args: '<refined question>'})`.

**Engine 2.** It is the codex:codex-rescue seat, a thin wrapper whose only tool is Bash. It shells out to the Codex CLI.

- **Search.** The companion script passes no search flag, so engine 2 searches only as the user's Codex config allows. Check the top-level `web_search` setting in `~/.codex/config.toml` before you dispatch: `"live"` reaches the live web, and anything else may answer from a cache or from model knowledge.
- **Returns.** Say in the dispatch to run in the foreground. The seat prefers background execution for open-ended work and cannot fetch its own results. A job handle that comes back anyway is retrieved with `/codex:status <job-id>`, then the job record's result.

## Auto-cycle and the hooks

On Claude Code the plugin loads the hooks, auto-cycle and the herdr seat panes itself. On Codex they run once the user installs them, as the Codex reference says.

When you pause auto-cycle yourself, send a PushNotification whose text is exactly the pause text the hub gives. Where the PushNotification tool is not in your tool list, say in your turn that you rely on the herdr alert alone.
