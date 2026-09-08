# Requirements

What each optional integration is for, and what happens without it. The two hard requirements are
named in the [README](../README.md#requirements); everything else here is optional.

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

The skills the README names as optional are covered below. Each entry below says what happens when it is missing — every one has a fallback, and a tool that is installed but reports itself unusable degrades the same way rather than stalling the run.

## Optional integrations and their fallbacks

- [Matt Pocock's engineering skills](https://github.com/mattpocock/skills): `diagnosing-bugs`, `tdd`, `implement`, `improve-codebase-architecture`, `code-review`. The wrappers invoke these by name and never fork their content.

  **Install standalone, not as the `mattpocock-skills` plugin.** The wrappers call them by bare name and read `~/.claude/skills/<name>/SKILL.md`; a plugin install namespaces them as `mattpocock-skills:<name>` instead. Copy the `skills/engineering/<name>/` folders into `~/.claude/skills/`.

  One special case: install `code-review` as `matts-code-review`, because the original name collides with Claude Code's own `/code-review`. Copy it to `~/.claude/skills/matts-code-review/` and set its frontmatter `name:` to match. It is a copy, not a symlink, so re-sync it when his repo changes.

  Without them: the `doctrine` skill's fallback table names a substitute for each. `matts-code-review` degrades to `/code-review` or two parallel review subagents.

- [superpowers](https://github.com/obra/superpowers): brainstorming, parallel dispatch, verification-before-completion, git worktrees.

  Without it: parallel Agent calls with check output pasted before claiming done, `git worktree add` for isolation, and a one-question-at-a-time interview for brainstorming.

- [OpenAI's codex plugin](https://github.com/openai/codex-plugin-cc), plus the Codex CLI logged in. Run `/codex:setup` to verify. Supplies the default red team, `doctrine-research`'s second engine, and the gauntlet's image generation.

  Without it — or with the plugin installed and its CLI unreachable — a fresh-context subagent prompted to refute. Research loses cross-model diversity and says so in its report; the gauntlet directs native CSS, SVG and canvas art instead of generated assets.

- [ponytail](https://github.com/DietrichGebert/ponytail): the simplification review, and the audit lens in `doctrine-audit`.

  Without it: the fallback table gives a **different** substitute for each use. `/simplify` for the first. For the audit lens, a manual report-only YAGNI read, never `/simplify`, which is scoped to the diff rather than the target area and mutates the repo.

- [writing-clearly-and-concisely](https://github.com/softaworks/agent-toolkit/tree/main/skills/writing-clearly-and-concisely): the clarity lens in `doctrine-write` and the editing pass in `doctrine-docs`.

  Without it: a lens prompted with Strunk's core rules.

- **Claude Code's `deep-research` workflow**, built into Claude Code on hosts that carry it — nothing to install. `doctrine-research`'s first engine. It is a workflow rather than a skill, so it will not appear in your skills list.

  Without it: a fan-out of web-search agents with per-claim adversarial verification.

- **Claude Code's Workflow tool**, built into Claude Code on hosts that carry it — nothing to install. Lets one gauntlet round run as a journaled, crash-resumable script.

  Without it: the prose flow in the skill is the round, unchanged.

- **Claude Design**, on a claude.ai login. A gauntlet run with a bound Design project can push finished sections for you to watch in the Design pane as the run goes. A Design project is a rendering, never a design-system binding.

  Without it: git is the source of record either way — the run says the sync was skipped and delivers from the repo.

- [session-memory](https://github.com/scottcrosby-securebine/session-memory-commands): `/BackupMemory`, `/LoadMemory`, `/primer`. The hub's step 5 names the backup command as the writer of a phase's handoff document and the loaders as what acts on its first line.

  Without it: the hub says where to write the handoff yourself and what its header lines carry, and the handoff carries an `invoke doctrine:doctrine first` header line, since no loader is there to do it by rule.

