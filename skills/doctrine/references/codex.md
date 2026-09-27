# Doctrine on Codex CLI

The hub and the wrappers name actions. This file says how each is done on Codex CLI. Where your tool list disagrees with it, trust the tool list.

## Reading

A long file's middle is cut from a single read on Codex.

- Read the hub, this file, and any skill or artifact longer than one read's output in chunks, for example 200 lines at a time with `sed -n`, until you have read its last line.
- An injected skill body is cut at 8,000 bytes. When a skill is injected, read its SKILL.md in full from the path the skill list gives.

## Actions

| Action | On Codex CLI |
|---|---|
| Load a skill by name | Read that skill's SKILL.md from the path in your skill list. A plugin skill is listed as `doctrine:doctrine-code`, the same name Claude Code uses. |
| Read a skill that is not model-invocable | Its SKILL.md under `~/.agents/skills/<name>/`, `.agents/skills/<name>/`, or `$CODEX_HOME/skills/<name>/`, whichever holds it. |
| Dispatch a seat | `spawn_agent`. |
| Dispatch a blind seat | Every reviewer, red team and research engine is blind. Pass the no-history setting of the spawn schema your tool list shows: `fork_turns: "none"` under v2, where an omitted `fork_turns` copies your whole history into the child; `fork_context: false` or omitted under v1. A seat that spawns a seat of its own passes the same setting. |
| Run a workflow | Codex has no workflow runner. Dispatch the wave's seats with `spawn_agent` and wait on them. |
| Wait on a file | Run a shell loop that exits when the file appears (`until [ -f <file> ]; do sleep 15; done`), repeating it if your shell's timeout ends it first, then read the file. |
| Wait on seats | `wait_agent`. |
| Notify the user | No notification tool. Say it in your turn. |
| Project instructions | Codex loads AGENTS.md, one file per directory from the repo root down. A CLAUDE.md is not loaded unless it is configured as a fallback name, so read it yourself where it exists. |

## The red team from the other model family

The red team here is Claude, run through the Claude Code CLI in headless mode. A Codex subagent cannot change model provider, so a `spawn_agent` seat is never a red team from the other family.

**Run it.** Run it from the shell, read-only:

```
claude -p --permission-mode plan "<the assembled brief>" > <out-file> 2>&1; echo "exit=$?" > <out-file>.result
```

For a brief longer than a command line holds, write it to a file and pass it on standard input. The brief's own words say the seat is non-mutating.

**Its return.** The return is `<out-file>`. It counts only when all three hold:

- the process exited 0;
- the output holds findings or an attack list, not an acknowledgement;
- the brief named the revision under review.

A missing `claude` command, a sign-in failure, a network failure, or a sandbox refusal is a failed seat. The hub's Fallbacks row then applies, and its substitute is a same-model red team, which the record and the exit statement name as such. It never counts as the cross-model red team.

## Research engines

**Engine 1.** Codex has no deep-research workflow. It is a fan-out of blind `spawn_agent` web-search seats with per-claim adversarial verification. Codex's own web search must be on (`[tools] web_search = true` in `$CODEX_HOME/config.toml`).

**Engine 2.** It is `claude -p` as the red team section above gives it. Its web search and fetch tools work in plan mode. A reply whose `[web]` tags carry no fetchable URL is model knowledge.

## Auto-cycle and the hooks

- The doctrine's hooks, auto-cycle and the herdr seat panes run on Claude Code only. On Codex, auto-cycle is off: no gauge warns you and no hook types `/clear`.
- `doctrine-pane` does not run on Codex, because its launcher needs a Claude Code session.
- The gate launcher does run. Outside herdr it runs the check detached and writes `<out-file>.result` itself. Wait on that file as the table says.
