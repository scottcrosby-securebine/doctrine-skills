# doctrine-research

Use it when you need an answer you do not have yet: a question spread across many sources, where a wrong answer is expensive and you want a recommendation whose claims are each tagged with where they came from. Two engines from different model families answer the question without seeing each other. Their claims merge into one table, every gap gets written down, and the report recommends only what the table carries.

![Round 1 sends the anchor to two blind engines whose claims merge into a claim table. Then a logic critique reads the merged research, the gap ledger lists what is missing, and each loop runs gap-fill, a red team and the critique again until a pass comes clean or the closing round delivers.](doctrine-research.png)

The figure's top row is round 1; the bottom row is everything after it.

## When to use it, and when not

It fires when you ask for deep research done with the doctrine: a multi-source question that needs a grounded, fact-checked recommendation.

Do not use it for a quick fact lookup, which a plain search answers faster. Do not use it for questions about your own code: that is [`doctrine-audit`](doctrine-audit.md), which reads code, not sources.

Against the other prose skills, the line is what you start with. [`doctrine-write`](doctrine-write.md) writes a document whose content you already have. [`doctrine-docs`](doctrine-docs.md) brings existing documentation in line with the code. `doctrine-research` produces the content itself, and `doctrine-write` can run after it to turn the report into a finished document.

It is a wrapper: it loads the [`doctrine`](doctrine.md) skill first and takes its posture from there. The hub supplies the record, the gate, the two alarms and the end states. This skill supplies the research shape: the engines, the claim table, the gap ledger and what blocks in a report.

## What it asks you first

Before any engine starts, it asks whichever of these your request left open:

- The decision the research informs.
- Its success criteria.
- Its scope bounds: timeframe, region, budget, constraints.

All three, in your own words, are the anchor, the standard every later check compares against. Where the research serves an epic in a repo that tracks one, the anchor also carries the Done means items it serves. Scope sits inside the anchor because research that answers the right question about the wrong region has drifted, and a critique cannot see that without the bounds.

It then asks where the report should land, suggesting `docs/research/YYYY-MM-DD-<topic>.md` in the current project. That answer is also your permission to write and commit the report there, so delivery does not ask again.

A question only you can answer, where the work would be aimed differently depending on the answer, blocks the run until you answer it. A value missing inside a direction you have settled does not block: the report shows it as an unknown, never a guess.

Later it may come back to you with three more things:

- **A divergence flag.** When the data suggests the real question differs from the one you asked, the logic critique says so, and you decide whether to re-aim or stay. It never pivots on its own.
- **An alarm.** When the loop runs long, it stops and puts a diagnosis to you (see [How it ends](#how-it-ends)).
- **The dossier.** At delivery, whether the working file ships beside the report or is dropped.

## How the work runs

### The dossier

Before the first engine goes out, the run opens one working file, the dossier, beside the report with a `-worknotes` suffix (`docs/research/YYYY-MM-DD-<topic>-worknotes.md`). Where that directory is not writable, or you do not want working files in the repo, it goes in the session's scratchpad instead. It holds the anchor, the claim table as it stands, the gap ledger, and a settled section listing every divergence and finding you have ruled on. Loop counts and round history sit under a trailing `## Run state (orchestrator only)` heading that no reviewer is handed, so no reviewer knows how badly a pass needs to come clean.

The run pastes what each agent needs into its prompt rather than pointing at the file. An agent pointed at a file works from its own summary of it.

### Round 1: two engines, blind

Both engines get the same refined question at the same time, and neither sees the other's output. Independence is the point: an engine that reads the run's draft first finds only that draft's kind of gaps.

| | Engine 1, your own model family | Engine 2, the other model family |
|---|---|---|
| On Claude Code | the built-in `deep-research` workflow, unmodified | the codex plugin's `codex:codex-rescue` agent, which shells out to the Codex CLI |
| On Codex | a fan-out of web-search agents, each claim adversarially verified | the Claude Code CLI run headless (`claude -p`), with web search and fetch allowed |

Engine 2 runs as a read-only research task and tags every claim `[web]` with a fetchable URL, or `[model-knowledge]`. The run checks that it can really search before counting it as a second sourced engine, and checks again on return: a `[web]` tag with no URL that fetches is model knowledge. On Claude Code that means reading the top-level `web_search` setting in `~/.codex/config.toml`. Only `"live"` reaches the live web. On Codex, engine 1 needs the same `web_search = "live"` in `$CODEX_HOME/config.toml`.

On Claude Code the dispatch asks engine 2 to run in the foreground, because the codex agent tends to background open-ended work. If a job handle comes back anyway, the run retrieves the result with `/codex:status <job-id>`. A handle is never merged as an answer: an engine 2 that has not returned by merge time is unavailable, and the report says so.

### The claim table

The merge files every claim under one of four labels:

- **Agree**: both engines assert it.
- **Conflict**: they disagree. Both sides stay, with their sources. A conflict is report content and is never resolved silently.
- **Single-engine**: unverified until a second source or a check confirms it.
- **Unknown**: neither engine established it.

An engine 2 that answered from memory does not corroborate anything. A claim both engines assert, when one of them only recalled it, is filed as single-engine, model-corroborated, and the report says plainly that the run had one sourced engine. Such an engine still earns its place by disagreeing: where it contradicts engine 1, the conflict gets a fetch.

### The logic critique and the gap ledger

A dedicated agent reads the merged research for unsupported leaps, circular sourcing (many citations tracing to one origin), survivorship and recency bias, adjacent questions conflated, and drift from the anchor. It returns the divergence flag described above when it sees one. Your ruling goes into the dossier's settled section, so the next loop's fresh critique does not reopen it. An accepted re-file of a ruled question is a blocking finding against the pass it lands in.

Every unknown and every unverified claim then gets a gap ledger entry: what is missing and what was already tried.

### The loop

Each loop is:

1. **Gap-fill**: a targeted fan-out over ledger entries only, never a full re-run. Each agent gets the anchor, its entries with the searches already tried, and the tag rule.
2. **Red team**: attacks the claim table and the drafted report together, holding the gap ledger so it does not repeat searches already tried. It refutes and extends the table, and anything it adds counts only once verified from its cited source.
3. **Logic critique** again, on whatever changed.

Before either reviewer goes out, the run fetches every citation and hands both reviewers its URL and the excerpt the claim rests on, both engines' original returns, the rule that an unsourced engine 2 does not corroborate, the blocking instances below and your settled rulings. Neither reviewer opens a link, so without the excerpts neither could see a misread citation.

## What the gate is for this shape

The hub's gate has three parts, and this skill fills each one:

- **Native checks**: every claim edited since the last pass is re-verified against its cited source. Every URL is fetched again and must still carry the cited content, and every repo path must resolve. On top of that runs whatever your project documents as a gate for the directory the report lands in, such as a Markdown linter or a link checker. The reviewers never open a link and nothing else checks that a citation still holds, so a dead citation is caught here or nowhere.
- **Designated review**: the logic critique. The report's Method appendix says so.
- **Red team**: the other-model-family seat, attacking the table and the report together.

A finding blocks the pass when it is:

- a dead, redirected or misread citation;
- a chain of citations that narrows to one origin while the report calls it corroborated;
- a conclusion the claim table does not carry;
- drift off the anchor;
- a gap neither closed nor written up;
- a failed native check.

One more confirming source for a claim already sourced does not block. It goes on a deferred list named at delivery. A cleaner phrasing is not a finding at all.

A pass is clean when it raises no blocking finding and none stands open from an earlier pass. "No new findings" is not the test: a leap filed in loop 3 and filed again in loop 4 is still outstanding.

## How it ends

The exit is the hub's prose-deliverable exit. The phase exits on one clean pass of all three parts. If no pass has come clean when the round alarm first fires (by default after four rounds that found a blocking finding), you get a diagnosis with the gap ledger as it stands inside it. Unless you say stop, one closing round then runs, scoped to the changes since the last fully reviewed revision, or to the whole report if none was. Before that round, every remaining gap must be closed or written up as unanswerable, with the attempts shown. The phase then ends Shipped at an escalation, with a punch list of what it did not fix.

The time alarm is separate: it stops the loop and waits for your ruling. By default it fires two hours after the last round closed, or, if no round has closed yet, two hours after the phase opened.

A run ends in one of the hub's five states: Exited (the only clean one), Stopped, Shipped at an escalation, Blocked on a question only you can answer, or Unable to continue. The dossier's record of the run names which.

Delivery writes the report to the agreed path and commits it by your project's norm. Its sections, in order:

1. **Recommendation**, bottom line first, grounded in the claim table.
2. **Findings**, ranked by confidence, each cited and tagged both-engines, single-engine or contested.
3. **Conflicts**.
4. **Gaps and unknowns**.
5. **Divergence notes**, if any, and how you ruled.
6. **Method appendix**: loops run, sources, red-team rounds, the logic critique named as the designated review, which native checks ran and which could not and why, the deferred list, and the dossier's path.

In chat you get the recommendation and anything that needs your judgment.

## A worked example

This example is illustrative: it shows the shape of a run, not a recorded one.

You ask which of three managed message queues the platform team should adopt for an internal event bus. The run asks first. The decision: which queue the team commits to for the next contract term. Success criteria: at-least-once delivery, a documented retention ceiling that meets the audit requirement, and a hosted option in your region. Scope: that region only, current vendor documentation only, no pricing beyond list. It writes those words into `docs/research/2026-09-10-event-bus-worknotes.md` as the anchor, agrees the report lands at `docs/research/2026-09-10-event-bus.md`, and finds that the repo documents a Markdown lint as a gate for `docs/`.

On Claude Code it reads `~/.codex/config.toml`, finds `web_search = "live"`, and dispatches both engines in the foreground with the same refined question. Engine 1 returns findings with URLs. Engine 2 returns a tagged list in which every `[web]` tag carries a URL the run can fetch, so it counts as a second sourced engine.

The merge fills the claim table. Both engines cite the same retention ceiling for vendor A from its docs page: agree. Engine 1 says vendor B's regional endpoint is generally available and engine 2 says it is in preview, each citing a different page: conflict, both sides kept. Only engine 1 found vendor C's delivery guarantee: single-engine. Nobody found vendor C's retention ceiling: unknown, with a gap ledger entry listing the searches already tried.

Loop 1's gap-fill finds vendor C's ceiling on a page linked from its changelog. The red team files one blocking finding: the draft recommends vendor A partly on a cost claim the table does not carry, since pricing beyond list was out of scope. The run strikes the sentence, and because that repair changed a claim, loop 2 runs the full pass on the new revision. Native checks re-fetch every URL, resolve every path and run the Markdown lint. The red team lists the claims it tried to break and could not, and the logic critique returns clean with no divergence flag. That is one clean pass with nothing outstanding, so the phase exits.

The report opens with its gate line, in the form the [README](../../README.md) shows for a clean pass:

```text
Gate: clean pass on 4a3e4ca, real run on record. No blockers open.
```

"Real run" here is the link and path check: the deliverable does not execute, so that check is its real run. The sections follow in the order above, and in chat you get the recommendation and one question: whether the worknotes file ships beside the report.

## How to invoke it

Name the doctrine and the decision:

```text
use doctrine-research: which managed message queue should the platform team adopt for the internal event bus? Recommend one, with sources.
```

It asks for the success criteria and scope bounds before it dispatches anything.

## Requirements

Nothing has to be installed. Each dependency has a fallback, and the report names every substitution.

- **On Claude Code**: the `deep-research` workflow, built into Claude Code on hosts that carry it. It is a workflow, not a skill, so it does not show in a skills list. Without it, engine 1 is a fan-out of web-search agents with per-claim adversarial verification.
- **On Claude Code**: OpenAI's codex plugin with the Codex CLI logged in, for engine 2 and the red team. `/codex:setup` checks it. For engine 2 to search, set top-level `web_search = "live"` in `~/.codex/config.toml`; otherwise it answers from model knowledge.
- **On Codex**: the Claude Code CLI (`claude`), installed and signed in, and run from a Codex shell outside Codex's per-call sandbox, for engine 2 and the red team. [docs/requirements.md](../requirements.md) says what is known on each platform.
- Without the other-model-family seat, engine 2 is a fresh-context agent with web access and the report notes reduced engine diversity. The red team becomes a fresh-context agent prompted to refute, with the verify-from-source rule in its brief: a same-model red team, and the record says so.
- superpowers, for parallel dispatch. Without it, the run dispatches parallel agents itself, each prompt assembled rather than summarised.

The install commands and what each absence costs are in [docs/requirements.md](../requirements.md). The hub's page, [doctrine.md](doctrine.md), has the full fallbacks table. To watch the agents work in live panes, see [watching a run](../watching-a-run.md).

## Red flags

Signs a run went wrong:

- Both engines "agree" and neither fetched a page.
- Engine 2 returned a job handle and the handle was merged as an answer.
- The logic critique got the merged findings without the anchor, so it graded them against themselves.
- Four citations trace to one origin and the report calls the claim corroborated.
- A gap was filled with a plausible number because the loop was otherwise clean.
- A finding filed in the last loop was filed again and waved through as "not new".
- The report shipped with a URL nobody re-fetched or a repo path nobody resolved.
- On loop 3, the gap ledger and the counters exist only in the conversation, where a compaction takes them.

The specification is [`skills/doctrine-research/SKILL.md`](../../skills/doctrine-research/SKILL.md). Trust it over this page wherever the two disagree.
