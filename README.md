# Doctrine Skills

Nine skills for Claude Code that make an agent work like a small team with a QA gate, instead of one confident pass.

## The problem

You already get good work out of Claude Code by pushing on it — check that again, did the linter run, go back and finish. It works, and you do it differently every time, so what you get back tracks how much attention you had that day.

These are the failures that survive that, and none of them look like failures:

- **It answers the request it thought you made.** Your ask was ambiguous somewhere. It picked a reading and never told you.
- **It marks its own homework.** The same context that wrote the code reads it back and finds it reasonable.
- **It stops at the checks it thought of.** The tests pass, so it ships. Your linter and your schema check never ran.
- **It builds more than you asked for.** Three abstractions for a feature with one caller.
- **It loses the thread on long runs.** The conversation gets compacted, the list of what still fails goes with it, and the next message says everything is clean.
- **And catching any of it depends on you remembering to look.** Which check you demanded on Tuesday is not the one you demanded on Thursday.

Every one of those produces output that looks exactly like finished work.

The doctrine runs the same procedure every time, whatever kind of day you are having. It costs more time and more tokens, and what you get back is code that has actually been checked rather than code that looks finished.

## One model is one set of blind spots

The part that is hard to do by hand: **the adversary is a different model.** When the codex plugin is installed, the reviewer that attacks the work is not the model that wrote it, and it does not share the assumptions that produced the defect.

Here is what that bought on one real run.

A feature reached its certifying round and came back clean: 837 backend tests, the frontend suite, the build, the linter, plus a reviewer that had read the whole 2,283-line change end to end. Nothing blocking. The next round ran again on the **same frozen revision** — not a line had changed — and the reviewer read all 2,283 lines again and again found nothing.

The second model, on that same revision, found two things, both confirmed from source:

- A user could name a custom field `toString`, and opening that record's history threw a type error that took the whole page down. Permanently: the event was stored, so it crashed again on every reopen.
- The audit log timestamped each change from the start of the database transaction, which begins before the row is locked. Two people editing at once could be recorded in the wrong order — in the feature whose entire job is saying who changed what.

Neither is exotic. Both are the kind of thing you see immediately once someone else points at it, which is the whole problem: the model that wrote the code shares the assumptions that produced the bug, so it reviews the symptom and not the cause. On another round of the same project three same-model reviewers returned zero findings each and the different model returned six.

Without the codex plugin you still get an adversary, just a fresh context on the same model, and the run says so in its report rather than quietly reporting a stronger gate than it ran.

## What the doctrine does

Seven rules, applied to every job.

1. **Ask before building.** Questions come to you first, one topic at a time. Your answers are written down word for word and handed to every agent that later judges the result.
2. **Split the work.** The job becomes phases with checkable exit gates, and independent tasks inside a phase run as parallel agents. Work shown to have small reach shares a neighbouring phase's gate instead of carrying its own.
3. **Run every check your project documents.** Not just the ones an agent thinks of. A check that did not run is recorded as not run — never as clean.
4. **Send an adversary.** A fresh reviewer — a different model, when one is installed — attacks the work. Its findings are checked against the source first, because adversarial reviewers invent things too.
5. **Loop until one full pass comes back clean with nothing outstanding**, certified by a reviewer that did not write the fix, on a version that has actually run. A code fix after that pass gets a pass of its own. Two alarms stop the loop and hand you the decision: every Nth round that still finds a blocker (you set N, default 4), and a phase past your time budget (default two hours) without a round closing.
6. **Cut what nobody asked for.** Before the pass that certifies what ships.
7. **Deliver the way your repo delivers**, and say whether the shipped version is the one the clean pass certified.

**What it touches.** It edits your working tree, the way Claude Code already does. It commits only where your repo's own conventions say to, and it pushes or opens a PR only if that is your documented norm or you asked. Where it cannot write, it builds elsewhere and hands you the diff. Interrupt it like any other Claude Code run; a phase writes its state to a file as it goes, so a new session picks up where it stopped instead of starting over.

You ask for it in task terms — `audit the payments module for bugs with the doctrine`. Rules 3 to 6 run as a loop rather than a sequence, which is the point of rule 5. What comes back opens with one line about the gate, before anything about the work:

```text
Gate: clean pass on 4a3e4ca, real run on record. No blockers open.
```
```text
Gate: shipped at an escalation, round 6, zero clean passes.
Open: 2 blocking findings, both in the migration path.
```

The wording varies. What that line contains does not, and there is no third form where a run that never got clean is summarised as finished.

## You are not assembling this yourself

The doctrine does not reinvent the disciplines it runs on. It invokes other people's skills, by name, at the moments they apply — so their disciplines are in the loop whether or not you know they exist:

- [**Matt Pocock's engineering skills**](https://github.com/mattpocock/skills) — from the author of Total TypeScript — for the build and review disciplines.
- [**superpowers**](https://github.com/obra/superpowers), by Jesse Vincent and Prime Radiant, for parallel dispatch and git worktree isolation.
- [**ponytail**](https://github.com/DietrichGebert/ponytail), by Dietrich Gebert, for the pass that deletes what nobody asked for.
- [**writing-clearly-and-concisely**](https://github.com/softaworks/agent-toolkit/tree/main/skills/writing-clearly-and-concisely), Strunk's rules as a skill, by Josh Thomas via softaworks, for the editing pass.
- [**OpenAI's codex plugin**](https://github.com/openai/codex-plugin-cc) for the different-model red team.

Plus [session-memory](https://github.com/scottcrosby-securebine/session-memory-commands) for handoffs between sessions. Every one is optional, each has a fallback, and the details are in [Requirements](#requirements). The credit is theirs. What you are spared is deciding which discipline belongs at which moment, and remembering to invoke it.

## Install

Two commands inside Claude Code:

```text
/plugin marketplace add scottcrosby-securebine/doctrine-skills
/plugin install doctrine@doctrine-skills
```

That brings all nine skills. One extra step, sometimes: if the install message tells you to, run `/reload-plugins` (or restart Claude Code) — a freshly installed plugin does not always load into the session that installed it.

## Try it on one file first

Do not start with a big audit; the doctrine is expensive and you should see its shape before you spend on it. Point it at one file you already suspect:

```text
use doctrine-audit on src/whatever.ts — scope is that file only
```

It will ask you what counts as a bug before it changes anything, fan out a couple of agents, run whatever your repo documents as a gate, and open its report with the `Gate:` line above. Ten minutes rather than five, since part of the clock is you answering its questions, and a small fraction of what a real phase costs.

Two things it will not show you. Without the codex plugin the adversary is a fresh context on the same model rather than a different one, so the section above is the one part you cannot evaluate this way. And a one-file scope will not exercise the parallel waves.

Then ask in task terms — "hunt bugs in the payments module with the doctrine" — or name a skill directly, "use doctrine-debug on this flaky test".

## The nine skills

| Skill | Use it for |
|---|---|
| [`doctrine`](skills/doctrine/) | The shared posture. The seven wrappers invoke it. |
| [`doctrine-code`](skills/doctrine-code/) | Features, specs and tickets. |
| [`doctrine-debug`](skills/doctrine-debug/) | Anything broken, throwing, failing or slow. |
| [`doctrine-audit`](skills/doctrine-audit/) | Bug hunts and deep code audits. |
| [`doctrine-docs`](skills/doctrine-docs/) | Documentation sweeps. |
| [`doctrine-write`](skills/doctrine-write/) | Proposals, briefs, PRDs, reports. |
| [`doctrine-research`](skills/doctrine-research/) | Multi-source questions needing a fact-checked answer. |
| [`doctrine-gauntlet`](skills/doctrine-gauntlet/) | Web design, judged on the rendered page. Visual work only. |
| [`doctrine-pane`](skills/doctrine-pane/) | An interactive terminal session — a router, a switch, a server — in a pane you watch and can take over. Not a wrapper: it does not load the posture. |

## What it costs

You pay real minutes and real tokens, and you get a real gate.

What is actually recorded, from runs on three projects: a review seat returns in **three to seven minutes**, a different-model red team in **two and a half to thirty**. Several of those run at once each round. Code phases have converged in **3, 7 and 23 rounds**; one prose audit ran **17 rounds without ever coming back clean** and shipped at an escalation with its open findings named. Multiply a round by the seats in it and you have the shape of the bill. No token figure is published here, because none of those runs measured one — an earlier version of this file quoted a token count it could not source, which is the thing this whole page argues against.

So point it at work where being wrong is expensive. The doctrine judges that by reach, not size: a one-line change to a rule everything else depends on earns the full gate, while a quick question or a low-stakes edit does not need the doctrine at all. There is no lighter mode to pick — the only discount is the one rule 2 names, for work shown to have small reach.

## Where these rules came from

Each rule replaced a specific failure rather than a theory about good process. Two of them, both from shipped work.

**A contact form went live with every input field ten pixels wide.** The unit test covering it asserted the input had a border, which is true of a ten-pixel field. The automated layout check passed it too, because a ten-pixel column does not overflow or clip — it just wraps and makes the page taller. Every gate was green over a form nobody could type into. The record's own line for it: *the instrument confirmed the form existed and never confirmed it had a shape.* That is why `doctrine-gauntlet` makes a critic look at the render, and why a critic that looked found three more defects in the same stylesheet that the fix had missed.

**Seven rounds passed a page whose navigation type was frozen at 13px** — byte-identical at 1440, 1920 and 2560 while the page grew around it — with a 9px label on the theme control and 17 of 28 controls at 13px or smaller. The primary link on every card had a 145x14px hit area, under WCAG's 24x24 minimum, which the accessibility scanner does not test. Nobody in the loop caught it; the site's owner did, reading his own site. That is why the harness now renders at 2560 and measures target size: no number of rounds below a width can see a defect that lives above it.

Its harness prints `TECHNICAL FLOOR: PASS` only when every check actually ran. If one could not, it names what went unmeasured and exits `3` rather than `0`, so no caller can read "nothing failed" as "it passed". Against [`fixtures/bare.html`](fixtures/bare.html), eight configurations pass and the harness still refuses to call itself clean:

```text
[dark 1440px] ok  height=427
[UNMEASURED] theme switch had no effect at 360, 768, 1440, 2560px — the dark and
light renders are the same theme. …

=== TECHNICAL FLOOR: NOT CLEAN — nothing failed, but 1 item(s) went unmeasured ===
Unmeasured is not clean. Report it; the user waives it or the run stops.
```

Excerpted to one width and two lines; the run covers four widths in both themes, which is where the eight configurations come from. That page has no theming to drive, so the theme line is correct rather than a page defect, and the harness cannot tell that apart from a site whose dark mode is broken. So it hands the question to a person instead of deciding it.

That is also the limit of the evidence. These rules came out of real work, but the failures behind them are ones the author hit. There is no third-party benchmark.

## Requirements

**Seven of the nine skills need nothing installed. Two do, and neither degrades into a weaker version of itself — both refuse.**

`doctrine-gauntlet` judges real rendered pages, so it needs a browser. Without one its harness refuses to run rather than report a pass:

```text
npm i -D playwright-core axe-core
node node_modules/playwright-core/cli.js install chromium
```

Not `npx playwright install`. That command belongs to the full `playwright` package, and with only `playwright-core` present it refuses and points you at `@playwright/test`. `playwright-core` ships its own CLI at the path above.

`doctrine-pane` opens a terminal session in a [herdr](#watch-it-work) pane, so it needs herdr, and it is the one place where herdr is not optional. Outside a herdr session — or inside a container, where a pane would be a process on the host — it refuses rather than falling back, because an interactive session nobody can watch has no purpose. The other eight skills are unaffected.

For everything else the herdr integration is optional and runs outside the skills entirely: without it the hooks bow out and doctrine behaves exactly as it does today; only the pane is missing.

The upstream skills named above are all optional. Each entry below says what happens when it is missing — every one has a fallback, and a tool that is installed but reports itself unusable degrades the same way rather than stalling the run.

<details>
<summary>Optional integrations and their fallbacks</summary>

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

</details>

## Watch it work

When Claude Code dispatches a subagent, you cannot see what it is doing. The terminal goes quiet and some minutes later an answer appears. A doctrine run dispatches a lot of them, so that quiet gets long, and if one is off down the wrong path you find out at the end.

[herdr](https://herdr.dev) fixes that. It is a terminal multiplexer that knows which agent is running in which pane. Run Claude Code inside it (0.8.2 or later) and **every subagent gets a live pane you can read while it works** — its instructions, the files it opens, the commands it runs, as they happen. Optional, and nothing here is needed to use the skills.

Up to six panes stack beside your session, which keeps the bigger share of the screen:

```text
── doctrine seat · …/subagents/agent-4fc0a9.jsonl
» Verify every claim in README.md against the current source…
→ Read  {"file_path":"hooks/dctr-seat.mjs"}
    // doctrine — herdr seat visibility hook (issue #17).
→ Grep  {"pattern":"SIDE_CAP"}
```

**Overflow and exits.** Six is the whole column. Past six, extras open as tabs in herdr's sidebar. When an agent finishes its pane closes itself, unless you are reading it at that moment, in which case it stays with a `· done` suffix. Nothing ever steals your cursor: panes and tabs open unfocused.

**Long checks get a pane too.** A gate that outlasts the ten minutes Claude Code allows a command used to vanish into the background. Doctrine runs it in a pane instead, streaming output and writing the same output to a file whose last line is `exit=N` when the check finishes. Outside herdr it runs detached with the same file, so the record is identical either way.

**Nothing to set up, and nothing breaks without it.** The hooks wake only inside a herdr pane and stand down in their first lines everywhere else. A herdr problem never changes the run; the work carries on and the reason is logged to `hook.log` in the session's temp folder. There is also an opt-in sidebar token showing a run's round and gate counters, configured in herdr's own `config.toml`.

## The gate, in full

The seven rules above are a summary. The specification is [`skills/doctrine/SKILL.md`](skills/doctrine/SKILL.md), which is the file the agent actually loads, so it is the one that stays correct. Each wrapper sits beside it under [`skills/`](skills/) and states only its own task shape.

Three things worth knowing before you rely on the gate:

- A finding is **blocking** when someone acting on the deliverable as it stands would do the wrong thing. Two things never block: wording that carries the right meaning, and any claim about the review's own instruments and history — a count, a coverage note, a round number. One exception, because it bit: a comment inside a check that ships describes product behaviour, so a wrong one blocks.
- **A pass is clean when it leaves nothing outstanding**, including a finding carried over from an earlier pass. A code repair after that pass needs a pass of its own, judged from the diff rather than from a label.
- An alarm's stop leads with what shipping now would mean, before anything about the loop.
- The doctrine is a **layer, not a fork**. It invokes other authors' skills at runtime so their updates flow through untouched. The one exception is the renamed `matts-code-review` copy.

Defects found and not yet fixed are listed in [`docs/known-issues.md`](docs/known-issues.md), so you can tell a known one from a surprise.

## How this is tested

**Thirteen checks run on every push**, including a mutation gate that reverts each named repair in a copy of the tree and fails if no check notices — the check that answers whether the other checks pin anything. Most of what is here is prose, though, and prose has no suite to run. Four things stand in.

- **Driven runs.** Fresh-context agents are put through each wrapper against realistic scenarios, and every ambiguity they hit gets patched. This is periodic, not per-commit, so the skills can be ahead of the last full run.
- **[`fixtures/`](fixtures/)** is a standing regression suite for `doctrine-gauntlet`: three generality cases, each proving something the other two cannot. Two are runnable from this repo; the third is a real bound design system, which cannot ship with it.
- **The harness code** carries a syntax gate and three-clause tamper fixtures, both defined in [`skills/doctrine-gauntlet/workflow.md`](skills/doctrine-gauntlet/workflow.md). The syntax gate runs on every push; the fixtures run through Claude Code's Workflow tool and are rerun by hand after any change.
- **The documents have a gate too.** `node tools/doc-check.mjs` reads every skill's markdown, plus the prose inside the harness's tamper fixtures, and fails on a stale fixture reference, a roster of fixture names in one sentence, a claim restated in two places, an unclassifiable fixture, or a citation that no longer resolves. It states its own blind spots in its header, and no skill loads it.

**CI runs thirteen checks on every push** ([`gates.yml`](.github/workflows/gates.yml)): the prose gate and its tamper test, a lint over the hooks' herdr decision paths and its tamper test, five tamper tests over the hook code itself, the mutation gate, two steps covering all three manifests, and the harness's syntax gate. The mutation gate is the one worth naming — it reverts each named repair in a copy of the tree and fails if no check notices, which is the check that answers whether the other checks pin anything. What CI cannot run is the browser harness against `fixtures/`, the Workflow-tool fixtures, and the driven runs above.

Here is the document gate catching a real defect. The same sentence was added to two skills, which is an unversioned fork: correcting one can no longer reach the other.

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
