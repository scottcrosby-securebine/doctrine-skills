# Doctrine on Codex CLI

The hub and the wrappers name actions. This file says how each is done on Codex CLI. Where your tool list disagrees with it, trust the tool list.

## Reading

A long file's middle is cut from a single read on Codex.

- Read the hub, this file, and any skill or artifact longer than one read's output in chunks of at most 4,000 characters, cut on character boundaries so no character is split: for example `python3 -c 'import sys; t=open(sys.argv[1], encoding="utf-8").read(); o=int(sys.argv[2]); sys.stdout.write(t[o:o+4000])' <file> <offset>`, with the offset stepping by 4,000 until a read prints nothing. This needs `python3`. Where it is absent, use any reader that cuts on character boundaries. Size a chunk by characters, not lines: one line of the hub runs past 3,000 characters.
- An injected skill body is cut at 8,000 bytes. When a skill is injected, read its SKILL.md in full from the path the skill list gives.

## Actions

| Action | On Codex CLI |
|---|---|
| Load a skill by name | Read that skill's SKILL.md from the path in your skill list. A plugin skill is listed as `doctrine:doctrine-code`, the same name Claude Code uses. |
| Read a skill that is not model-invocable | Its SKILL.md under `~/.agents/skills/<name>/`, `.agents/skills/<name>/`, or `$CODEX_HOME/skills/<name>/`, whichever holds it. |
| Dispatch a seat | `spawn_agent`. |
| Dispatch a blind seat | Every seat is blind: builders, finders, reviewers, red teams and research engines. Pass the no-history setting of the spawn schema your tool list shows: `fork_turns: "none"` under v2, where an omitted `fork_turns` copies your whole history into the child; `fork_context: false` or omitted under v1. A seat that spawns a seat of its own passes the same setting. |
| Run a workflow | Codex has no workflow runner. Dispatch the wave's seats with `spawn_agent` and wait on them. A gauntlet round runs through `doctrine-gauntlet`'s `harness/round.codex.mjs`, whose seats you dispatch this way (that skill's `workflow.md`, On Codex). |
| Wait on a file | Run a shell loop that exits when the file appears (`until [ -f <file> ]; do sleep 15; done`), repeating it if your shell's timeout ends it first, then read the file. |
| Wait on seats | `wait_agent`. |
| Notify the user | No notification tool. Say it in your turn. When you pause auto-cycle yourself, run `node <plugin-root>/hooks/dctr-notify.mjs <phase> <reason>`, which shows `<phase>: doctrine auto-cycle paused, <reason>` as a herdr notification. Where it stands down or prints that herdr refused, say in your turn that no notification was sent. |
| Project instructions | Codex loads AGENTS.md (or AGENTS.override.md), one file per directory from the repo root down to the working directory, and stops at 32 KiB in all by default. Read the rest yourself where the files run longer, and read a CLAUDE.md yourself where it exists, since Codex does not load it unless it is configured as a fallback name. |

## The red team from the other model family

The red team here is Claude, run through the Claude Code CLI in headless mode. A Codex subagent cannot change model provider, so a `spawn_agent` seat is never a red team from the other family.

**Run it.** Write the assembled brief to a file. Start the seat through the doctrine's gate launcher, which detaches it: a plain `&` job can die when Codex's shell call returns. Limit the seat's tool set to read-only tools and allow those tools, so it has no tool that writes, runs commands or dispatches:

```
env -u HERDR_ENV -u HERDR_PANE_ID -u CLAUDE_CODE_SESSION_ID node <plugin-root>/hooks/dctr-gate.mjs red-team <out-file> -- sh -c 'claude -p --strict-mcp-config --tools "Read,Grep,Glob,WebSearch,WebFetch" --allowedTools "Read,Grep,Glob,WebSearch,WebFetch" < <brief-file>'
```

Then wait on `<out-file>.result` as the table says, which the launcher writes with `exit=N` when the seat ends.

**The brief.** The seat runs no commands, so hand it its artifact verbatim in the brief. Where the artifact is too large for one brief, split it by file across seats. Never hand this seat a command that produces its artifact.

**The `env -u` prefix.** It sits on the launcher on purpose, not after `--`: it clears the variables the launcher itself reads, so it runs the seat detached instead of trying to place a herdr pane from inside Codex.

**Where it survives.** On Linux, Codex's sandbox runs each shell call in its own process namespace, which ends when the call returns, and the detached seat ends with it. No result file appears, and the seat fails at its deadline.

- The seat runs to completion in a Codex session started with `--dangerously-bypass-approvals-and-sandbox` and no managed-network requirement.
- `--sandbox danger-full-access` avoids the per-call sandbox only in that same unmanaged configuration.
- With a managed network configured, the sandbox can still apply.
- On macOS the sandbox works differently, and whether the seat survives there is unknown.

Where the seat cannot run, the hub's Fallbacks row gives the same-model substitute, and the phase loses the cross-model red team.

- **Paths.** `<out-file>` is a new path for each dispatch, with the dispatch time in its name.
- **Its record.** The seat's record is that pair of files together with its wave line. `<out-file>` is the return, `<out-file>.result` is its status, and the wave line names the out-file, the workspace and the dispatch time. The hub's ownership test reads all three.
- **Its wording.** The brief's own words say the seat is non-mutating.
- **The model.** Where the record carries the return, name its model as Claude.

**Its return.** The return is `<out-file>`. It counts only when all three hold:

- the process exited 0;
- the output holds findings or an attack list, not an acknowledgement;
- the brief named the revision under review.

Each of these is a failed seat:

- a missing `claude` command;
- a sign-in failure;
- a network failure;
- a sandbox refusal;
- no result file by the seat's deadline.

The hub's Fallbacks row then applies, and its substitute is a same-model red team, which the record and the exit statement name as such. It never counts as the cross-model red team.

## Research engines

**Engine 1.** Codex has no deep-research workflow. It is a fan-out of blind `spawn_agent` web-search seats with per-claim adversarial verification. Codex's own web search must reach the live web: the top-level `web_search` setting in `$CODEX_HOME/config.toml` set to `"live"`. A `[tools] web_search` line is ignored by current releases.

**Engine 2.** It is `claude -p` as the red team section above gives it. WebSearch and WebFetch are in its tool set and allowed, so it searches the live web. A reply whose `[web]` tags carry no fetchable URL is model knowledge.

## Auto-cycle and the hooks

- The user installs the hooks with `node <plugin-root>/hooks/dctr-codex.mjs install`, adding `--codex-home <dir>` for a home other than `$CODEX_HOME` or `~/.codex`, and runs it again after each plugin update. It writes the entries into that home's `hooks.json`, trusts them in its `config.toml`, and sets `sandbox_workspace_write.network_access = true` so a command you run in the workspace-write sandbox can reach herdr.
- Once installed, the herdr seat panes, the restore after `/clear`, the context gauge and auto-cycle run on Codex as they do on Claude Code. The typer types `/clear` and then `$doctrine:doctrine-resume`, and reads the pane only to confirm the `/clear` took and to find the composer empty before each send. It pauses rather than type into a draft. Without the install none of them runs, and auto-cycle is off: no gauge warns you and no hook types `/clear`.
- `doctrine-pane` runs once installed: its launcher reads the session from `CODEX_SESSION_ID` and reaches herdr through the same sandbox network access. The pane runs on the host, outside the sandbox.
- The gate launcher does run. Outside herdr it runs the check detached and writes `<out-file>.result` itself; inside Codex's sandbox, where a detached child dies with the command, it runs the check to completion first. Either way, wait on that file as the table says.
