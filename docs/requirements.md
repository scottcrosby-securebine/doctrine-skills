# Requirements

The two hard requirements in full, the one-time auto-cycle setup, then every optional integration and what happens without it. The
[README](../README.md#requirements) names them all; this page is the detail.

## A browser, for `doctrine-gauntlet`

`doctrine-gauntlet` judges real rendered pages, so it needs a browser. Without one its harness refuses to run rather than report a pass:

```text
npm i -D playwright-core axe-core
node node_modules/playwright-core/cli.js install chromium
```

Not `npx playwright install`. That command belongs to the full `playwright` package, and with only `playwright-core` present it refuses and points you at `@playwright/test`. `playwright-core` ships its own CLI at the path above.

## herdr, for `doctrine-pane`

The README states the requirement. The detail it leaves out: inside a container a pane would be a
process on the host, so a contained session refuses for the same reason a non-herdr one does. See
[watching a run](watching-a-run.md).

For everything else the herdr integration is optional and runs outside the skills entirely: without it the hooks bow out and doctrine behaves exactly as it does today; only the pane is missing.

## Auto-cycle setup

Auto-cycle is off by default, and a phase switches it on in its own record. These two are needed only to use it:

- **Auto-compaction off**: `claude config set -g autoCompactEnabled false`. It is a global config key, stored in `~/.claude.json`, not a settings.json key. The phase resets by `/clear` after a handoff, and a compaction mid-phase discards the session's context and the gauge's reading.
- **The statusline bridge**, which tells the context gauge the session's window size and how much of it is used:

  ```text
  node <plugin-root>/hooks/dctr-bridge.mjs install
  ```

  It copies the bridge to `<config dir>/doctrine/dctr-bridge.mjs`, the config dir being `$CLAUDE_CONFIG_DIR` or `~/.claude`, and rewrites the `statusLine` command in that dir's settings.json to run the copy in front of your existing command, whose output passes through unchanged. settings.json names the copy, never the plugin's own path, so **re-run the command after every plugin update**. With no `statusLine` set it installs one that prints nothing; a statusline hides Claude Code's footer hints, so if you have none you may prefer to add your own first and then install. A `statusLine` that is not a command is refused, with the reason.

  Without it, while auto-cycle is on, the gauge reports the window as unknown on every batch: a tier given in tokens still warns, and a percent or default tier cannot resolve and does not.

## Optional integrations and their fallbacks

Each entry says what happens when it is missing. Every one has a fallback, and a tool that is installed but reports itself unusable degrades the same way rather than stalling the run.

- [Matt Pocock's engineering skills](https://github.com/mattpocock/skills): `diagnosing-bugs`, `tdd`, `implement`, `improve-codebase-architecture`, `code-review`. The wrappers invoke these by name and never fork their content.

  **Install standalone, not as the `mattpocock-skills` plugin.** The wrappers call them by bare name and read `~/.claude/skills/<name>/SKILL.md`; a plugin install namespaces them as `mattpocock-skills:<name>` instead. Copy the `skills/engineering/<name>/` folders into `~/.claude/skills/`.

  One special case: install `code-review` as `matts-code-review`, because the original name collides with Claude Code's own `/code-review`. Copy it to `~/.claude/skills/matts-code-review/` and set its frontmatter `name:` to match. It is a copy, not a symlink, so re-sync it when his repo changes.

  Without them: the `doctrine` skill's fallback table names a substitute for each. `matts-code-review` degrades to `/code-review` or two parallel review subagents.

- [superpowers](https://github.com/obra/superpowers): brainstorming, parallel dispatch, verification-before-completion, git worktrees.

  Without it: parallel Agent calls with check output pasted before claiming done, `git worktree add` for isolation, and a one-question-at-a-time interview for brainstorming.

- [OpenAI's codex plugin](https://github.com/openai/codex-plugin-cc), plus the Codex CLI logged in. Run `/codex:setup` to verify. Supplies the default red team, `doctrine-research`'s second engine, and the gauntlet's image generation.

  Without it, or with the plugin installed and its CLI unreachable: a fresh-context subagent prompted to refute. Research loses cross-model diversity and says so in its report; the gauntlet directs native CSS, SVG and canvas art instead of generated assets.

- [ponytail](https://github.com/DietrichGebert/ponytail): the simplification review, and the audit lens in `doctrine-audit`.

  Without it: the fallback table gives a **different** substitute for each use. `/simplify` for the first. For the audit lens, a manual report-only YAGNI read, never `/simplify`, which is scoped to the diff rather than the target area and mutates the repo.

- [writing-clearly-and-concisely](https://github.com/softaworks/agent-toolkit/tree/main/skills/writing-clearly-and-concisely): the clarity lens in `doctrine-write` and the editing pass in `doctrine-docs`.

  Without it: a lens prompted with Strunk's core rules.

- **Claude Code's `deep-research` workflow**, built into Claude Code on hosts that carry it, nothing to install. `doctrine-research`'s first engine. It is a workflow rather than a skill, so it will not appear in your skills list.

  Without it: a fan-out of web-search agents with per-claim adversarial verification.

- **Claude Code's Workflow tool**, built into Claude Code on hosts that carry it, nothing to install. Lets one gauntlet round run as a journaled, crash-resumable script.

  Without it: the prose flow in the skill is the round, unchanged.

- **Claude Design**, on a claude.ai login. A gauntlet run with a bound Design project can push finished sections for you to watch in the Design pane as the run goes. A Design project is a rendering, never a design-system binding.

  Without it: git is the source of record either way, and the run says the sync was skipped and delivers from the repo.
