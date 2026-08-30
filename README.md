# Doctrine Skills

Eight skills for Claude Code that make an agent work like a small team with a QA gate, instead of one confident pass.

## The problem

Claude Code is good at the work. It is bad at knowing when the work is not finished.

Hand it something substantial and the same failures recur. None of them look like failures:

- **It answers the request it inferred.** Your ask was ambiguous somewhere. It picked a reading and never said so.
- **It reviews its own work.** The context that wrote the code reads it back and finds it reasonable.
- **It stops at the checks it thought of.** Tests pass, so it ships. Your linter and schema check never ran.
- **It builds more than you asked for.** Three abstractions for a feature with one caller.
- **It loses the thread on long runs.** The context gets compacted, the tally of what still fails goes with it, and the next message says the loop is clean.

Every one of those produces output that looks exactly like finished work.

## What the doctrine does

Seven rules, applied to every job.

1. **Ask before building.** Questions come to you first, one topic at a time. Your answers are written down word for word and handed to every agent that later judges the result.
2. **Split the work.** A job becomes phases with checkable exit gates. Independent tasks inside a phase run as parallel agents.
3. **Run every gate the project documents.** Not just the ones an agent thinks of. A check that did not run is recorded as not run, never as clean.
4. **Send an adversary.** A fresh reviewer, by default a different model, attacks the diff. Its findings are checked against the source first, because adversarial reviewers also invent things.
5. **Loop until two passes in a row come back clean.** Any change resets the count. A second counter never resets, and every fourth unresolved round it stops and hands you a decision.
6. **Cut what nobody asked for.** Once per phase, before the passes that certify what ships.
7. **Deliver the way the repo delivers**, and say whether the shipped revision earned its two clean passes.

## What a run looks like

You type something like this:

```text
audit the payments module for bugs with the doctrine
```

Then:

1. It asks two or three questions first. What is in scope. Whether the legacy adapter counts. What you mean by "bug." It will not guess when the answer changes the direction of the work.
2. Several agents read different parts of the module at once.
3. It runs your project's checks, whatever the repo documents as a gate.
4. The diff goes to a reviewer with no memory of writing it.
5. Blocking findings get fixed. Each one is asked where else the same mistake appears, so it is fixed as a class.
6. The gate runs again. Two clean rounds and the phase exits. Four unresolved rounds and it stops to tell you what shipping now would mean.

Then it opens the report with one line about the gate, before anything about the work:

```text
Gate: two consecutive clean passes on 4a3e4ca. No blockers open.
```

or:

```text
Gate: shipped at an escalation, round 6, zero clean passes.
Open: 2 blocking findings, both in the migration path.
```

The wording varies. What that line contains does not, and there is no third form where a run that never got clean is summarised as finished.

## Install

```text
/plugin marketplace add scottcrosby-securebine/doctrine-skills
/plugin install doctrine@doctrine-skills
```

That brings all eight skills. Ask in task terms, "hunt bugs in the payments module with the doctrine", or name one directly, "use doctrine-debug on this flaky test".

## The eight skills

| Skill | Use it for |
|---|---|
| [`doctrine`](skills/doctrine/) | The shared posture. The other seven invoke it. |
| [`doctrine-code`](skills/doctrine-code/) | Features, specs and tickets. |
| [`doctrine-debug`](skills/doctrine-debug/) | Anything broken, throwing, failing or slow. |
| [`doctrine-audit`](skills/doctrine-audit/) | Bug hunts and deep code audits. |
| [`doctrine-docs`](skills/doctrine-docs/) | Documentation sweeps. |
| [`doctrine-write`](skills/doctrine-write/) | Proposals, briefs, PRDs, reports. |
| [`doctrine-research`](skills/doctrine-research/) | Multi-source questions needing a fact-checked answer. |
| [`doctrine-gauntlet`](skills/doctrine-gauntlet/) | Web design, judged on the rendered page. Visual work only. |

## What it costs

The doctrine trades tokens and time for confidence.

One data point rather than a cost model: a `doctrine-docs` run over a small repository took roughly 50 minutes and 236k tokens. Parallel agents, red teams and repeated review rounds multiply usage, and the figure grows with the job.

Point it at work where being wrong is expensive. Not at a one-line fix, a question, or a single-file edit. There is no lighter mode.

## Where these rules came from

Each rule replaced a specific failure rather than a theory about good process. Two examples.

`doctrine-gauntlet` renders every page at four widths up to 2560px. Seven earlier review rounds passed a page whose navigation rendered at 13px at every resolution up to 4K, and no number of rounds below a width can see a defect that lives above it.

Its harness prints `TECHNICAL FLOOR: PASS` only when every check actually ran. If one could not, it names what went unmeasured and exits `3` rather than `0`, so no caller can read "nothing failed" as "it passed". Run against [`fixtures/bare.html`](fixtures/bare.html), eight configurations pass and it still refuses to call itself clean:

```text
[dark 1440px] ok  height=427
[light 1440px] ok  height=427
[reduced-motion dark] ok — reduced motion removed nothing the ordinary render shows

[UNMEASURED] theme switch had no effect at 360, 768, 1440, 2560px — the dark and
light renders are the same theme.

[JUDGE] theme reachability — the switch above had NO effect, so whatever this page
themes by, it is not what the harness drove.

[MEASURED] file:///…/fixtures/bare.html
  title: Fen Ridge Bindery — repairs and rebinding
  h1:    Fen Ridge Bindery   (292 chars of text)

=== TECHNICAL FLOOR: NOT CLEAN — nothing failed, but 1 item(s) went unmeasured ===
Unmeasured is not clean. Report it; the user waives it or the run stops.
```

Trimmed to one width; the run covers four in both themes. That page has no theming to drive, so the theme line is correct rather than a page defect, and the harness cannot tell that apart from a site whose dark mode is broken. So it hands the question to a person instead of deciding it. `[MEASURED]` prints because two runs once scored a clean floor against a different page than the one intended.

That is also the limit of the evidence. These rules came out of real work, but the failures behind them are ones the author hit. There is no third-party benchmark.

## Requirements

**Nothing is needed to install.** All eight skills run without any of it.

One skill needs a browser: `doctrine-gauntlet` judges rendered pages, and without one its harness refuses to run rather than reporting a pass.

```text
npm i -D playwright-core axe-core
node node_modules/playwright-core/cli.js install chromium
```

Not `npx playwright install`. That command belongs to the full `playwright` package, and with only `playwright-core` present it refuses and points you at `@playwright/test`. `playwright-core` ships its own CLI at the path above.

One optional integration runs outside the skills entirely: with [herdr](https://herdr.dev) as your terminal multiplexer, every agent doctrine dispatches gets a live pane showing what it is doing — the first six stack in a column beside your session, and any seat past that opens its own tab, listed in herdr's sidebar as `dctr-<role>-<n>`. Without herdr the hooks stand down on their first line and doctrine behaves exactly as it does today.

Everything else is optional and improves one skill or another. Each entry below says what happens when it is missing.

<details>
<summary>Optional integrations and their fallbacks</summary>

- [Matt Pocock's engineering skills](https://github.com/mattpocock/skills): `diagnosing-bugs`, `tdd`, `implement`, `improve-codebase-architecture`, `code-review`. The wrappers invoke these by name and never fork their content.

  **Install standalone, not as the `mattpocock-skills` plugin.** The wrappers call them by bare name and read `~/.claude/skills/<name>/SKILL.md`; a plugin install namespaces them as `mattpocock-skills:<name>` instead. Copy the `skills/engineering/<name>/` folders into `~/.claude/skills/`.

  One special case: install `code-review` as `matts-code-review`, because the original name collides with Claude Code's own `/code-review`. Copy it to `~/.claude/skills/matts-code-review/` and set its frontmatter `name:` to match. It is a copy, not a symlink, so re-sync it when his repo changes.

  Without them: the `doctrine` skill's fallback table names a substitute for each. `matts-code-review` degrades to `/code-review` or two parallel review subagents.

- [herdr](https://herdr.dev) 0.8.2 or later: live visibility of dispatched seats. The plugin ships a Claude Code hook set that gives each seat a live pane — side panes beside the session up to a cap of six, tabs (reported to herdr's sidebar with a live state) beyond it — so a long run stops being a black box.

  Nothing to configure for the seats. The hooks read `HERDR_ENV`, which herdr sets in every pane it manages. One opt-in extra: a doctrine run also publishes its round number and both gate counters as sidebar tokens (`r3·e1·v4`, refreshed at each round's record write, expiring within the hour if the run dies). herdr renders custom tokens only when its config asks for them, so this is dark until you add `$doctrine` to a row under `[ui.sidebar.agents]` in herdr's config — one line, and without it nothing changes.

  Without it: every hook exits on its first check, costing one process spawn per dispatched seat. Nothing else changes, and a run is never blocked, delayed or altered by it. A failure to reach herdr is recorded with its reason rather than passing silently.

- [superpowers](https://github.com/obra/superpowers): brainstorming, parallel dispatch, verification-before-completion, git worktrees.

  Without it: parallel Agent calls with check output pasted before claiming done, `git worktree add` for isolation, and a one-question-at-a-time interview for brainstorming.

- [OpenAI's codex plugin](https://github.com/openai/codex-plugin-cc), plus the Codex CLI logged in. Run `codex:setup` to verify. Supplies the default red team, `doctrine-research`'s second engine, and the gauntlet's image generation.

  Without it: a fresh-context subagent prompted to refute. Research loses cross-model diversity and says so in its report; the gauntlet directs native CSS, SVG and canvas art instead of generated assets.

- [ponytail](https://github.com/DietrichGebert/ponytail): the simplification review, and the audit lens in `doctrine-audit`.

  Without it: the fallback table gives a **different** substitute for each use. `/simplify` for the first. For the audit lens, a manual report-only YAGNI read, never `/simplify`, which is scoped to the diff rather than the target area and mutates the repo.

- [writing-clearly-and-concisely](https://github.com/softaworks/agent-toolkit/tree/main/skills/writing-clearly-and-concisely): the clarity lens in `doctrine-write` and the editing pass in `doctrine-docs`.

  Without it: a lens prompted with Strunk's core rules.

- **Claude Code's `deep-research` workflow**, already installed. `doctrine-research`'s first engine. It is a workflow rather than a skill, so it will not appear in your skills list.

  Without it: a fan-out of web-search agents with per-claim adversarial verification.

- **Claude Code's Workflow tool**, already installed. Lets one gauntlet round run as a journaled, crash-resumable script.

  Without it: the prose flow in the skill is the round, unchanged.

- **Claude Design**, on a claude.ai login. `doctrine-gauntlet` pushes rounds you can watch in the Design pane. A Design project is a rendering, never a design-system binding.

  Without it: the repo alone is the design system and the source of record.

</details>

## The gate, in full

The seven rules above are a summary. The specification is [`skills/doctrine/SKILL.md`](skills/doctrine/SKILL.md), which is the file the agent actually loads, so it is the one that stays correct. Each wrapper sits beside it under [`skills/`](skills/) and states only its own task shape.

Three things worth knowing before you rely on the gate:

- A finding is **blocking** when the deliverable is wrong or unfinished without a change to it. Only blocking findings reset the two-pass count, so declined nitpicks cannot loop forever. A pass is clean when it leaves nothing outstanding, including a finding carried over from an earlier pass.
- The escalation valve leads with what shipping now would mean, before anything about the loop.
- The doctrine is a **layer, not a fork**. It invokes other authors' skills at runtime so their updates flow through untouched. The one exception is the renamed `matts-code-review` copy.

## How this is tested

Most of this is prose, and prose has no suite to run. Four things stand in.

- **Driven runs.** Fresh-context agents are put through each wrapper against realistic scenarios, and every ambiguity they hit gets patched. This is periodic, not per-commit, so the skills can be ahead of the last full run.
- **[`fixtures/`](fixtures/)** is a standing regression suite for `doctrine-gauntlet`: three generality cases, each proving something the other two cannot.
- **The harness code** carries a syntax gate and three-clause tamper fixtures, both defined in [`skills/doctrine-gauntlet/workflow.md`](skills/doctrine-gauntlet/workflow.md). The syntax gate runs on every push; the fixtures run through Claude Code's Workflow tool and are rerun by hand after any change.
- **The documents have a gate too.** `node tools/doc-check.mjs` reads every skill's markdown and fails on a stale fixture reference, a roster of fixture names in one sentence, a claim restated in two places, an unclassifiable fixture, or a citation that no longer resolves. It states its own blind spots in its header, and no skill loads it. It runs on every push, along with its own tamper test and both manifests — that workflow is the whole of what is automated here, and the driven runs and the fixture suite below are not in it.

Here is that last one catching a real defect. The same sentence was added to two skills, which is an unversioned fork: correcting one can no longer reach the other.

```text
$ node tools/doc-check.mjs
echo: the same 23-word claim appears in 2 places (doctrine-audit/SKILL.md; doctrine-docs/SKILL.md) — "the critic must be handed the artifact and never the filename it lives…"

1 finding(s)
$ echo $?
1
```

With the duplicate removed it prints `0 finding(s)` and exits `0`.

`doctrine-gauntlet` also cites incidents from real engagements, deliberately anonymized. No client, product, person or repository is named. They are mnemonics for the rule beside them, not citations you can follow.

It folds in the [gauntlet loop](https://somethingbig.ai/gauntlet-loop) by Matt Shumer: builder agents paired with harsh critics that judge rendered output blind against a reference.

## License

MIT
