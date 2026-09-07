# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code plugin ("doctrine") distributing nine skills as markdown, plus a small amount of code that is not part of any skill — there is no build or lint step. **The "pure markdown" description was true until 2026-08-30 and is not any more**: `hooks/` ships a Claude Code hook set (issue #17) that gives each dispatched seat a live herdr pane while it runs — stacked beside the session up to a cap of six, its own sidebar-listed tab beyond that (Scott's ruling 2026-08-31: side-pane seats get no sidebar row). The pane closes on the seat's SubagentStop, with one exception since 2.1.0: a `codex:codex-rescue` seat's wrapper returns while the job it started runs on, so its Stop keeps the pane and the marker and runs the hook's own `--codex-tail` mode in it, which follows the job record `codexJobRecords()` in `dctr-state.mjs` finds (this workspaceRoot, created since the seat started, newest wins) and relabels the pane when the status turns terminal (Scott's ruling 2026-09-07: relabel and stay). That marker stays until the **next codex seat is placed** (Scott's ruling 2026-09-07): that placement, inside the same lock and before it counts the column, closes every finished, unfocused codex pane and removes its marker, so the slot is free for the wave that follows. A focused pane still stays, and a job whose record cannot be read is not finished, matching the watcher, which keeps waiting on one. Until another codex seat arrives, nothing sweeps and the pane still counts against the cap. Every seat pane is named from the harness's `agent-<id>.meta.json` description, read through `readMeta()`, which is the same title the status line shows and why the name in both places is identical. In a herdr session (`HERDR_ENV=1`) it panes the seat directly; with neither that nor the contained variable set it stands down in its first lines, so an installer without herdr pays one process spawn per hook event and nothing else. **That is not one per seat, and the description said so through two releases.** Claude Code fires SubagentStop for its own forked queries too (a prompt suggestion after most turns, memory extraction periodically), each carrying an `agent_id` and an empty `agent_type`; one session logged 62 of them against four seats, and a session that dispatched nothing logged eight in eleven turns. They cannot be filtered out in `hooks.json`: the dispatcher runs every matcher when the match query is empty (read from the 2.1.261 bundle, 2026-09-05). `dctr-lib.mjs` says which half of the seat test they fail. Since 1.54.0 a session running inside a container uses **pane containment**: when `DCTR_VIEW_REQUEST_DIR` is set (an allowed mount) the hook takes that path BEFORE the `HERDR_ENV` gate, writes a view-request file into that directory naming the seat's `agent_id`, and makes **no herdr call at all** — a contained agent must reach nothing on the host, so a host-side watcher reads the request and renders the seat inside the container. The pane a herdr server spawns is a host process, which is why a contained agent never drives one (Scott's containment ruling, 2026-09-01). `hooks/` also carries three non-hooks. `dctr-token.mjs` (issue #19) is an orchestrator-run one-liner the hub's step 5 names, publishing a run's round and gate counters as sidebar tokens — same stand-down rule, and dark until the user's herdr config renders `$doctrine`. `dctr-gate.mjs` (2026-09-05) is the launcher the hub's step 3 names for a native check that will outrun the Bash tool's ten-minute ceiling: inside herdr it runs the check in a pane placed under the seat rules, cap and lock (it registers a `dctr-gate-N` marker beside the seats, so a wave arriving mid-gate stacks next to it), outside herdr, or in a contained session, it runs the check detached and writes no view request, since a pane is a host process and a gate has no transcript to render; either way the output file's last line `exit=N` is both the completion signal and the record. The pane it splits is named from the launcher's label the moment it is placed and carries elapsed time while the check runs, refreshed on an interval `DCTR_ELAPSED_MS` overrides; before 2026-09-07 the split path passed no label and never renamed, so a side-column gate pane was nameless for its whole run, the completion rename firing only on a focused pane. Elapsed counts up rather than down because the launcher cannot know a check's total without imposing an output format on every check it runs. It exists because a live run pushed a 60-minute mutation gate into `setsid nohup` after the tool killed it at 48 rows, and the user then had nothing to watch. `dctr-pane.mjs` (2026-09-06) is the interactive-session launcher `doctrine-pane` names: it runs a login under `script(1)` for a real PTY — the gate launcher's piped stdio cannot serve one — in a pane the user watches and can take over. It enforces and never interprets: an earlier revision parsed the terminal to decide what a prompt was and whether a command had finished, and real hardware refuted both within two commands, so every such judgement belongs to the agent reading the bytes. Its markers live in a session-independent directory precisely so the SessionEnd sweep cannot reach them, which is why `interactivePanes()` in `dctr-state.mjs` is a **separate reader** from `liveSeats()`: placement counts these panes against the same six-pane cap, and nothing in the stop or SessionEnd path can see them. Counting and destroying need different readers, and sharing one would put the panes back under the sweep they were moved out of. The shared on-disk state and the herdr call moved to `dctr-state.mjs` so the hook and the launcher place panes under one lock; the decisions stay pure in `dctr-lib.mjs`. CI runs only the gates that need nothing installed (`.github/workflows/gates.yml`), which is every command in the block below and never the two that matter most. The machine-validated files are `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json`, plus `doctrine-gauntlet`'s harness code, whose gates are manual and run by hand: the syntax gate and tamper fixtures that `workflow.md` and `floor.md` define. `node tools/doc-check.mjs` is a separate gate over every skill's prose, not part of that harness. `hooks/dctr-mutations.mjs` is a gate over the *other* gates: it reverts each named repair in a copy of the tree and fails if no selftest clause goes red. It exists because the recurring worst finding in the pane launcher's review rounds was a check that certifies a path it does not take — a clause asserting a variable it never read, a fixture whose record shape no code writes, a fixture whose pane id the workspace filter excluded so the branch under test never ran once. **A mutation whose anchor text is missing fails rather than skipping**, because a renamed line would otherwise retire the mutation guarding it, which is the same defect one level up. It runs the mutations in parallel (`mapPool` in `dctr-lib.mjs`, `DCTR_JOBS` workers, defaulting to 8 or the host's core count, whichever is smaller), each on its own copy of the tree, and prints results in input order as they settle rather than in completion order, so a run reads the same twice. The suite list is ordered by **measured** cost and the comment saying so is a claim to re-check: `some` stops at the first suite that notices, so a mutation pays for every suite ahead of the one that catches it, and the list once read cheapest-first while a 439ms suite sat behind a 19s one. Bump `version` in `plugin.json` when shipping a change.

Skills were validated by running fresh-context agents through each wrapper against realistic scenarios and patching every ambiguity they hit — when changing a skill's flow, that's the test to rerun. **That test carries a standing debt.** The hub's step 5 was driven once, on 2026-08-27, by four fresh-context agents each executing a phase (docs, code, debug, gauntlet) on a synthetic project against `9a96069`; that run found three defects fifteen reading rounds had missed, and the rewrites of step 5 that followed it were read, not driven, until the 2026-09-05 convergence change: its step 5 was driven once on a synthetic phase before it shipped, the drive reopened the phase with two blocking findings six seat passes had missed, and the reset-trigger wording was then re-aligned twice on seat findings after the drive, so the shipping text is audited past the point it was driven. **The seven wrappers have not been driven since the original validation, and all seven have been rewritten since.** What they now say has been audited, not driven. The two find different things — an audit reads for contradiction against other text, a scenario run finds the instruction an agent cannot act on — so do not read a clean audit as coverage of this.

**One standing regression suite exists, and it is manual: `fixtures/`.** Three generality cases — `bare.html` (no design system, no repo, no package.json), `fixtures/shadcn.sh` (a recipe that builds a stock Next + shadcn install on demand; the app is deliberately not vendored, so a rebuild resolves fresh — `fixtures/README.md` records what that recipe actually holds still and what it lets float, which is what decides whether a rebuild's diff is signal or weather), and a real bound system — exist because `doctrine-gauntlet` grew up against one design system, which is how a skill acquires rules that only make sense for that system without anyone noticing. Run a gauntlet or harness change against all three; each proves something the other two cannot, and `fixtures/README.md` says what. The sharpest case is the theme probe, and the lesson is about the probe, not about any line it currently prints: the same probe output is a false alarm on one fixture and a true defect on another, because what decides it is who owns theming *outside* the specimen — which is exactly what the probe cannot see. One fixture can therefore never tell you which you are looking at. Don't record the probe's current wording here; it moves whenever the harness does, and per-fixture expectations belong in `fixtures/README.md` where a harness change is forced to walk past them.

## Commands

Each invocation is stated here once, or pointed at where it is stated once. **A green CI tick covers every command in the block below, and nothing under it.**

```
node tools/doc-check.mjs              # prose gate over every .md under skills/; exit 0 clean, 1 on any finding, 2 if --selftest found no sidecar
node tools/doc-check.mjs --selftest   # its three-clause tamper test, which lives in tools/doc-check.selftest.mjs
python3 -m json.tool .claude-plugin/plugin.json       # after editing either manifest
python3 -m json.tool .claude-plugin/marketplace.json
node hooks/dctr-seat.selftest.mjs   # three-clause tamper test for the seat hook's pure decisions
node hooks/dctr-seat.contained.selftest.mjs   # contained posture calls herdr zero times (tripwire on PATH)
node hooks/dctr-gate.selftest.mjs   # gate launcher: the check runs, the file ends exit=N, the no-herdr path calls herdr zero times
node hooks/dctr-pane.selftest.mjs   # interactive launcher: every refusal trips AND calls herdr zero times, a valid session is not refused, the fixtures are proved defective without the checker, and BOTH script(1) invocations are asserted so the macOS argument shape is checked without a Mac
node hooks/dctr-seat.teardown.selftest.mjs   # the seat hook's destructive paths, plus the one placement path that fails the same way: a close that FAILED keeps its record while one that answered `pane_not_found` (or `tab_not_found`, a different code) does not, a lookup that failed never becomes a close, an unreadable marker does not abandon the readable seats, a healthy teardown still removes everything, and a reservation that cannot be made stands down instead of spinning
node hooks/dctr-mutations.mjs       # reverts each named repair and FAILS if no clause notices — the check that answers whether the other checks pin anything
python3 -m json.tool hooks/hooks.json
```

To run the floor against `fixtures/` **from this repo**, a browser is needed here. The install is
deliberately untracked — `node_modules/`, `package.json` and `package-lock.json` are all in
`.gitignore`, because a tracked `package.json` would ship a build shape to every installer. That
reason survives the arrival of `hooks/`: a hook the harness runs is not a build step, and nothing
here is compiled, bundled or installed before use. The two commands:

```
npm i -D playwright-core axe-core
node node_modules/playwright-core/cli.js install chromium
```

**The second is not `npx playwright install`.** That belongs to the full `playwright` package and
refuses when only `playwright-core` is present, pointing you at `@playwright/test`. The README
carried the wrong command from the day it was written until 2026-08-29, when running it found out.

`node floor.mjs <url-or-file.html> <outPrefix> [dark|light|both] [--fragment] [--single-theme]
[--theme-class=NAME] [--crop=SELECTOR] [--expect=TEXT]` — run from the **target project**, not from
here, so it resolves that project's Playwright and axe. It rejects an unknown flag rather than
ignoring one. `floor.md` is the manual.

The round script's syntax gate is **not** `node --check` (see "The one skill with code in it" for
why); the one-liner is written down in `skills/doctrine-gauntlet/workflow.md` and is deliberately
not copied here, because a copy forks the first time the original is corrected. Its tamper fixtures
(`harness/round.tamper.json`) run through the Workflow tool, per the same file.

There is no single command that runs all of these. `.github/workflows/gates.yml` runs the ones that need no
install — every command in the block above, plus the workflow script's syntax gate — on every push.
**What it cannot run is the part with the most defects in it**: the floor against `fixtures/`, because
`package.json` is gitignored on purpose and CI has nothing to install from; `harness/round.tamper.json`, whose
fixtures run through the Workflow tool; and the driven fresh-context runs, which are agents rather than a
command. So a green tick means the prose gate and the parsers are clean, and says nothing about the harness or
the skills. Read it as the cheap end of the suite, never as the suite. No proportion is written down: it would rot the next time a gate is added, which is what just happened to the one that used to sit here.

## Architecture

**Layer, not fork.** The core design rule: these skills wrap other authors' skills (Matt Pocock's engineering skills, superpowers, codex, ponytail, writing-clearly-and-concisely) by invoking them **by name at runtime**, never copying or restating their content, so upstream updates flow through. The one sanctioned exception is `matts-code-review` — a renamed copy of Matt's `code-review`, because the original name collides with Claude Code's native `/code-review` (documented in README Requirements).

**Hub and spokes.** `skills/doctrine/SKILL.md` is the hub: the seven-step posture (ask questions first, phases and waves of parallel agents, native checks, red team, loop to one clean pass, simplify, deliver) and the fallback table for missing prerequisites. Eight of the nine skills are `doctrine-*`; the seven **wrappers** each begin with "REQUIRED BACKGROUND: read the `doctrine` skill first" and supply only the task shape: which external skill is the core discipline, how phases map onto it, and which review skill the phase gate uses. Don't restate posture steps inside a wrapper — reference them ("doctrine step 4").

**A hoist that is deliberately not done yet.** Two stretches of `doctrine-gauntlet` — "The docket and the arbiter" in full, plus the counter table and the rationale around it in "Modes" — are task-shape-agnostic and conceptually belong to the hub. They stay in the wrapper because **no second wrapper needs them**, and hoisting early makes all seven carry machinery one uses. A second candidate now exists and is deliberately **not** hoisted either: `doctrine-write` and `doctrine-gauntlet` both build a **claim ledger**, and the gauntlet's version cross-references the write one rather than redefining it — the predecessor-is-evidence rule is genuinely gauntlet-only, so two definitions would be wrong but one shared section is premature at two users. **The trigger is a second wrapper needing an escalation budget or PROPOSED/RULED discipline** — at that point move them up. It is a re-layering, not a cut: nothing gets deleted, and expect to generalize on the way, since the counters are written against gauntlet's two modes and the docket destinations assume a bound design system. **No size is recorded here on purpose, and neither is a certification that one was measured.** A word count in this file rots without announcing it and is then cited as fact, and "already measured, don't re-derive" is a stop-looking sign hung on the claim most likely to have rotted — the same mechanism as the "ten" in "Some rules only look redundant" that survived until an audit found roughly forty. Measure it yourself if the size bears on your decision; what this paragraph is for is the *why*.

**A second trigger exists, and it has already fired — on a third candidate neither of the two above.** The hub used the term "the anchor" in its own steps 4 and 5 and defined it nowhere; only `doctrine-write` and `doctrine-research` defined it, so the hub was instructing the other five wrappers to hand a red team an artifact nothing in their flow produced. The definition was hoisted into hub step 1 as the genus — the user's own words for what the work is for and how it will be judged — with the two wrapper definitions left in place as species, and no wrapper edited, because silence inherits the fix and a local echo forks it. The next hoist, the orchestrator-only carve-out in `9a96069`, did edit three wrappers — but with a pointer clause each ("and whatever else doctrine step 5 puts in that section"), never a restatement. A pointer inherits a correction the way silence does; it exists only because each of those wrappers enumerated its record's contents as a closed list, which silence cannot amend. So there are two triggers, pointing opposite ways: a **second wrapper needing** shared machinery, and the **hub already depending** on a term only its dependents define. The first trigger looks down the dependency edge and would never have caught the second.

**Every external reference needs a fallback.** Any skill a wrapper invokes must have a graceful-degradation path, either in the doctrine skill's Fallbacks table or stated inline in the wrapper. A reference with no fallback is a bug.

**Gate semantics are deliberate design.** The one-clean-pass exit gate (a pass certified by a context that did not write the fix, on a revision whose real-environment run is on record, with nothing outstanding from any earlier pass), the three-bucket definition of a "finding" (blocking = someone acting on the deliverable as it stands would do the wrong thing, with the instances listed after the test and never before it, while non-blocking improvements, declined nitpicks, findings the user rules closed, and red-team claims verified false from source never count against a pass, and wording that changes neither what the code does nor what it is for is not a finding at all, and the 2026-09-05 convergence run found three live repos' seats filing every imprecise sentence as a false claim because their briefs carried only the list of instances), the repair rule (a certified revision stays certified through a repair to wording, a comment, a test, a gate instrument or a steering document, and a repair to a non-comment line of shipping code, or to a claim about it, needs its own clean pass, judged from the diff and never from a label), the repair-side rule (a repair writes no counts, coverage claims or gate history into shipping artifacts, and documentation waits until after exit, since half of 696 recorded blockers sat inside the previous round's repair), the prose-deliverable exit (a named replacement the prose wrappers adopt by name, keeping only its alarm half: where no pass has come clean by the round alarm's first firing, one closing round scoped to the diff since the last fully reviewed revision, then Exited with the punch list), the two alarms (the round alarm, at every Nth round that found a blocker, N the user's figure in the anchor and 4 by default, and the time alarm, when a phase runs past the user's time budget, two hours by default, without a round closing, either of which stops the loop until a ruling given after it fires), the five terminal states a phase can end in (only one of them clean, and *Unable* is the one where resume is false), the class question asked of every blocking finding with its fix-the-class rule (deliberately **not** a label naming the cause: causation is usually unprovable and a guessed label gets counted as a fact by the diagnosis), the build-the-check-first rule, the diagnostic form of an alarm's escalation, which leads with ship risk and only then explains the loop, and the nine invariants from the 2026-08-28 three-session field audit (a pass certified against one frozen revision, only a post-firing ruling restarts an alarm, seat deadlines with liveness read from the job's own record, simplification before the certifying pass, non-mutating reviewers, the pre-delivery gate statement, the record authoritative on resume, the deleted no-path-resolves rationale, and the unresolved-template-marker rule from issue #15, which was a Red flags bullet until the hub's Red flags section went and now sits in step 2 beside the prompt-assembly rule, each one a failure observed in production transcripts) are all specified in this repo's `skills/doctrine/SKILL.md` step 5, which the README summarises and points at. Don't loosen them casually when editing skills. The terminal states, the class question and the diagnostic escalation were added after a six-round run in this repo whose rounds 5 and 6 found no code defect and kept finding prose the earlier rounds' own fixes had made stale: the gate was right to count each one, and wrong only in that nothing cheaper than a review round could see them. The class question shipped first as a fresh/fallout *label*, in `9a96069`, and was cut back to a question the same day, because a cross-model review pointed out that it made the orchestrator assert a cause it could rarely show. **Two more came from a driven 13-round run on 2026-08-28** (a prose-heavy two-repo deliverable): the pass after a repair is pointed at the repair, and an alarm's diagnosis says whether the exit condition is reachable at all and may propose a narrowed blocking definition for the user to rule on. Both are additive and neither loosens the gate: the first adds a target to a pass that was already running, the second adds a question to a diagnosis and a proposal the *user* rules on. The evidence for the first is that eight of that run's thirteen rounds found their worst blocking finding inside the previous round's fix. The evidence for the second is that the run reached round 13 without one clean pass, not because the artifact was bad but because a false claim is blocking by definition and three adversarial seats over several hundred lines of prose will find one every round, and the findings fell from state-loss defects to comment accuracy while no pass came clean. That run is also the first time the hub's own step 5 was driven end to end rather than read, which was this repo's top-ranked next move.

**Some rules only look redundant.** `doctrine-gauntlet` records a running list of pairs that read as the same rule stated twice and are not — each survives because a run can comply with one and violate the other, and several exist because the two halves reach two different agents' prompts. The register that recorded them with their distinctions was never tracked in this repo: no file under `skills/doctrine-gauntlet/` has ever been deleted, so nothing in history holds it (checked 2026-09-07, after this file claimed for a week that it was recoverable). **Do not write a count of them into this file**: it said "ten" until an audit found roughly forty, and any number here is a defect waiting to be cited as fact. Before proposing that two rules there are one, make the argument yourself against the current text: show a run that can comply with one and violate the other, and check whether the two halves reach two different agents' prompts, which is why several of them exist.

## Files that must stay in sync

Adding, renaming, or rescoping a skill touches all of:

- `skills/<name>/SKILL.md` (frontmatter `name:` must match the directory)
- Every count in `README.md`, not just the obvious one: the opening line, the skill table heading, the wrapper count in the `doctrine` row, the install line, and the Requirements lead. Grep the file for the old number rather than trusting this bullet to have listed every site.
- The wrapper list in `skills/doctrine/SKILL.md`'s intro
- Descriptions in `.claude-plugin/plugin.json` and `marketplace.json`
- `tools/doc-check.mjs`, whose corpus is every `.md` under `skills/`. A new skill enters that corpus the moment it exists, so run it; its header is a contract and a claim in it that a change makes false is a defect like any other.
- **This file.** `CLAUDE.md` states the skill count and the wrapper count in more than one place, and it is the only file no other file's checklist points at — grep it for the old numbers. This is not hypothetical: the round-18 change to the definition of a "finding" was synced into `README.md` and missed here, and the commit that fixed it says so.
- If the new wrapper brings a new external dependency: **a fallback, and a bullet in `README.md`'s Requirements section.** The fallback goes wherever the law above allows — a row in the Fallbacks table in `skills/doctrine/SKILL.md`, *or* stated inline in the wrapper; several of the current prerequisites take the inline form and are correct, so a checklist demanding a table row would be failed by this repo on the day it was written. No number is written here on purpose, for the reason this file gives twice elsewhere: a count rots silently and is then cited as fact. The README bullet has no such alternative: Requirements is the only list a user reads before installing, and a dependency missing from it is invisible. Its optional entries sit inside a `<details>` block, which browser find-in-page cannot search, so a dependency added there is invisible twice over unless it is also named in the visible lead.

## The one skill with code in it

`doctrine-gauntlet` is the only skill with bundled files: `harness/floor.mjs`
(the technical floor its critics depend on), `floor.md` (how to drive that
harness — flags, exit codes, render honesty), `harness/round.workflow.mjs` (one
fused-gate round as a Workflow-tool script: structure and counters only, never a
brief), `workflow.md` (how to invoke it and its tamper test), `tools.md` (Codex and Claude
Design invocation). The sidecars exist so
SKILL.md carries decision content and gate law while operating manuals and review
history load on demand. The split rule: if it changes what an agent *decides*, it
belongs in SKILL.md; if it changes how a tool is *invoked* or records a call already
made, it belongs in a sidecar. A third kind existed and no longer ships: a record
of rulings already made, read by a maintainer and never assembled into a prompt.
Two of those were removed on 2026-08-29 because this repo is used by people other
than its author and internal review history is not theirs to download. `harness/floor.mjs`
and `harness/round.workflow.mjs` are the only code any *skill* ships; the repo also tracks `tools/doc-check.mjs`, its sidecar `tools/doc-check.selftest.mjs`, `fixtures/shadcn.sh` and the files under `hooks/`, none of which a skill loads. One qualification since issue #19: the hub's steps 3 and 5 *name* `hooks/dctr-gate.mjs` and `hooks/dctr-token.mjs`, and `doctrine-pane` names `hooks/dctr-pane.mjs`, as commands a run invokes — invocation, not loading; no skill carries its content and the harness files stay the only code any skill ships. The hooks are loaded by the harness rather than by a skill, which is why the layer-not-fork law does not reach them and why they need their own gate. The floor is run as
`node floor.mjs` rather than executed; the workflow script is run only by the Workflow tool,
which wraps its body in an async function — so `node --check` rejects its top-level `return`
and the syntax gate is `new Function` around the body, as `workflow.md` records. `git ls-files -s`
shows exactly one mode-100755 file in the repo, and it is `fixtures/shadcn.sh`. The workflow
script carries no brief text, for the reasons and with the disclosed exceptions `workflow.md` gives, and its
tamper test is the same three-clause law as the harness's — the fixtures ship as
`harness/round.tamper.json` and run through the Workflow tool. The harness's portability
is the point: it resolves Playwright and axe from whatever the host project
has, and reports `[UNMEASURED]` rather than passing something it could not
check. Never hardcode a path into it.

Keep SKILL.md in step with what the code actually does — it claims specific
behaviour (four widths, lazy-load scrolling, overlay hiding, the flag set)
that the code must still perform.

**Two width constants, deliberately distinct.** `WIDEST` (2560) is the top of
the ladder; `DESKTOP` (1440) is the reference for "enough room available"
judgements. The inner-clip discriminator must stay anchored to `DESKTOP` — a
component clipping at 1440 and fitting at 2560 is still a defect, and anchoring
it to `WIDEST` silently re-rules every such case as a deliberate responsive
scroller. 2560 earns its two extra configurations per run because a whole
defect class lives above 1440 and no number of rounds below it can see the
class at all: seven gauntlet rounds passed a page whose nav was 13px at every
resolution up to 4K.

**Every new check ships with a tamper test, and it has three clauses** — break
the thing and confirm the check trips; run it against a known-good artifact and
confirm it stays quiet; and prove the broken fixture really carries the defect,
independently of the check. A check that silently measures nothing prints
exactly what a passing check prints. The second clause is not optional: it is
what distinguished a real layout defect from a design system's deliberate
responsive scrollers, which look identical to a check that has only seen the
broken case. **The third is the one to reach for when you are editing this
repo, because it is what the first two cannot do.** The reduced-motion check
passed both of them and was blind anyway: it read each element's own computed
`opacity`, which does not inherit but composites, so `opacity: 0` on a reveal
wrapper left every child computing `1` and nothing painted — and the fixture it
was built against happened to put the zero where the check could see it, so
both halves behaved. Reading the render is what settled it: an `h1` and nothing
else under `TECHNICAL FLOOR: PASS`. The same read condemned the fixture — its
content was `opacity: 0` in *both* renders, 7,596 non-white pixels in each, so
the "correct failure" clause one certified was the check flagging permanently
hidden content, not a motion defect. **A change that makes the harness quieter
needs the same proof as one that makes it louder**: the visibility filter
silently stopped reporting a bound system's checkboxes — correct, as it turned
out, since the label is the real target — but "a finding disappeared" and "a
blind spot appeared" print exactly the same thing, which is nothing.

**"No fixture reaches it" is a missing fixture, not a dead branch.** Before
deleting a guard whose absence no check can show, establish whether a fixture
*could* reach it. Those are two different claims and this repo conflated them
once, at cost: a reviewer showed the `pane_not_found` branch of the focus
lookup was unreachable by every fixture, it was deleted, and a second reviewer
then showed the deletion leaks a finished codex tab's marker for an entire
session, because `staleSideSeats` never judges a tab seat. Both reviewers were
right. Unreachable *by the fixtures* and unnecessary *to the code* are separate
findings, and only the second one licenses a deletion. Where the first holds
and the second does not, write the fixture. This rule had no written statement
until 2026-09-08 and was carried instead by five code comments asserting it as
repo law, which is why the deletion looked correct to the reviewer who made it.

**Target size is split across the gate and `[JUDGE]` on purpose.** WCAG 2.5.8's
exceptions are real — an isolated undersized target and an inline-in-a-sentence
link are both spec-compliant — so only a *crowded* undersized target gates, and
the exempt ones print for a critic. Do not "simplify" this into a flat 24x24
gate: that invents a rule the spec does not carry, and the harness's whole
claim is that it never passes or fails something it did not actually measure. Two flags exist because without them the
floor can never close on ordinary projects: `--theme-class=NAME` for
class-based theming (Tailwind's `dark`), and `--single-theme` for a site that
genuinely ships one. `--crop=SELECTOR` exists because a full-page screenshot is
read scaled to fit, so nothing else lets a reviewer see a figure at the size it
ships. Any new theme-application site must go through the shared
`applyTheme()` helper; a second call site setting `data-theme` directly is how
the reduced-motion pass silently measured the wrong theme.

**The harness applies the theme, so it must not certify one nobody can reach.**
The reachability handoff prints **`[JUDGE]`, never `[UNMEASURED]`**, on every
two-theme run that is not `--single-theme` or `--fragment`; what the probe found
(a media query, a toggle, a script, weak signals, or nothing) changes only the
message, not whether it prints. That is deliberate: both themes really were
rendered, so nothing went unmeasured — the possible defect is that one of them
ships to nobody, and only a critic can rule on that. The separate dead-switch
branch, where the two renders come back identical, pushes a real `[UNMEASURED]`
*and* a `[JUDGE]`. The probe is
load-bearing, not a nicety: an
instrument that creates the state it measures will otherwise pass a dead palette
exactly like a working one. Keep the probe honest if you touch theming — it is
the one check whose absence is invisible in the output.

**The prose has a gate now, and it exists because it did not.** `tools/doc-check.mjs` reads every
`.md` under `skills/` against `doctrine-gauntlet`'s fixture file and fails on a stale fixture name in a
document that names a live hyphenated one, on three or more fixture names listed inside one sentence, on
the same long claim appearing in two places, on a fixture the documents' own derivation rule cannot
classify, and on an attributed citation that no longer resolves — against the document it names where it
names one, against the corpus where it names only a section. Every one of those rules is
narrower than that sentence makes it sound, and the tool's own header is where each narrowing is
written down. **Its
header states what it does not catch, and that list is longer than what it does** — read it before
trusting a clean run. It sits outside `skills/`, so no skill loads it and the two harness files are
still the only code any skill ships; it is tracked and would be distributed with the repo like
`fixtures/shadcn.sh`. Run it with `--selftest` for its tamper test, whose third clause asserts the
synthetic inputs really carry their defects without calling the checker at all.

None of its rules is arbitrary — each is a failure that actually shipped here. A review round
found a document pointing at an enumeration deleted in the same batch. Review rounds repeatedly found a roster
that had gone stale because a fixture was added elsewhere; a roster rots whenever any
*other* fixture changes, while a claim about one named fixture rots only when that fixture does,
which is why the check counts names per **sentence** and not per paragraph. And a rule copied
into seven fixture notes forked from the original the first time the original was corrected —
the copies were found by five expensive review rounds and then, after a fix that replaced one
identical sentence with another identical sentence, by this script in under a second. **Prefer
stating a convention once and pointing at it.** Silence inherits a correction; an echo blocks it.

**Capability and accuracy outrank size.** A missing rule costs a defect in shipped work; a present one costs tokens, and those are not comparable prices. Don't compress for its own sake, don't report length as a concern, and don't cut a rule because a file feels long. The test is whether a rule **fires**, and whether it reaches the prompt of the agent who must obey it — a rule nobody has tripped, in a prompt nobody assembles, is the thing to cut. Sidecars are still right when they change *who loads what*, and wrong when they exist to make a number smaller.

## Session state, and one tracked thing that is not the plugin

`SESSION_MEMORY.md` at the root is **session state, not documentation, and it is untracked**: a
working record of where the last session stopped, what it decided and what it left open, rewritten
wholesale rather than appended. It is in `.gitignore`, so it is local to this machine and does not
ship to anyone installing the plugin. Read it to resume; never cite it as law, and never let a
claim in it outrank the code. **It was never tracked**: the 2026-08-28 commit that added it to `.gitignore` touched only
that file and this one, and no commit on any branch has carried it (checked 2026-09-05 against every commit's
file list, after this file claimed 34 such commits for a week). A fresh clone starts with no memory
file at all rather than with another machine's.

`docs/research/` held dated dossiers from investigations whose results shaped the skills, one of
them a negative result that rejected all four rules it proposed. It was removed on 2026-08-29 for
the same reason and is recoverable from history. Nothing in the repo depends on it: a dossier was
always evidence about the day it was written, never a description of how anything currently works.

## Conventions

- SKILL.md frontmatter `description:` follows the "Use when …" trigger-phrase style; it is what makes the skill fire, so write it for matching, not marketing.
- Wrappers end with a short "Red flags" section: concrete failure modes, not generic advice.
- Push to the remote only when explicitly told to.
