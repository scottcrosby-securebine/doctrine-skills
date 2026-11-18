# doctrine-gauntlet

Use it for web design under the doctrine. Agents build each section of a page. Critics render the result and judge it beside a reference. A browser harness measures what a screenshot cannot show, and the loop runs until the page passes a gate that includes the question "would a human want to look at this?"

![The doctrine-gauntlet shape in three rows: discovery, questions and a red-teamed direction before any builder; one builder and critic pair per section; then the integrated gate of technical floor, blind comparison, fresh critic and red team, run once per round until the mode's exit counter fires.](doctrine-gauntlet.png)

## When to use it, and when not

The skill fires when you ask for web design or front-end visual work done with the doctrine or "the gauntlet". That covers building or restyling a page, a hero, a landing page, or a design-system card. The deliverable is what a person sees in a browser.

It does not cover the logic behind the page. Application code and data wiring belong to [`doctrine-code`](doctrine-code.md). It does not suit a one-off CSS tweak either: the run asks questions before it starts, dispatches a pair per section, and runs a gate every round, and none of that scales down.

It needs something that can render the page. If nothing can, the run stops and tells you rather than reviewing source. It may fall back to your project's documented preview or post-deploy check, the latter only with your explicit go-ahead. A critic that cannot look is the failure this skill exists to prevent.

## What it asks you first

The run first reads your repo without asking anything. It looks for a design system, a reference, a way to render the deliverable, and whether it may write where the work must land. It starts a ledger of the facts the page may assert before any design direction exists to bend it. It never asks what reading the repo answers.

Then it asks, one topic at a time:

- **Which mode.** It asks every run and never assumes. The two modes differ in how they end. See [What the gate is for this shape](#what-the-gate-is-for-this-shape).
- **Whether it read the repo right.** It confirms what discovery inferred, including any design-system binding it inferred, and names the candidates it rejected and why.
- **The page's one job and its audience.** The named reader goes into every critic's prompt, because a critic first asks whether the page serves that reader.
- **The comparison target, and whether to exceed or match it.** "Make it look like that brand" often means matching that quality, not beating that site. Under *match*, the critic's bar becomes fidelity, and a faithful match is a pass rather than timid work.
- **Where the work lands** and the repo's delivery norm.
- **How many themes the project ships.**
- **Whether the deliverable is a whole page, or a fragment** whose host page owns theme switching and the type scale.
- **Whether it will ever be printed or saved to PDF.**

The last three are asked, never inferred, and recorded in the ledger. A source tree with one palette could be a site that ships one theme or a site whose second theme somebody deleted. If the run wrongly assumes one theme, a dead second palette exits the phase clean. The answers set the harness flags and the exemptions written into every critic's prompt.

### Binding a design system

Discovery first sweeps the repo and its neighbours for a design system, then walks a ladder and stops at the first rung that holds:

1. A system your prompt names.
2. A `Design system:` line in the project's `AGENTS.md` or `CLAUDE.md`, or in a candidate's, where that candidate demonstrably serves this deliverable.
3. A convention sniff: a tokens file, a law document, a harness, a published manifest, pinned reference renders.
4. An existing Claude Design project. It is a rendering, never a binding, so the run resolves it back to the repo it renders.
5. Nothing that holds. This is the ordinary case: most work has no house system, and the skill's own brief is enough on its own.

A rung holds only on a readable law, meaning rules somebody decided. A token file alone is a vocabulary, not a law. Before binding, the run probes whether a candidate is a dated snapshot or has been superseded. Once a system is bound, its design law outranks the skill. Its exit condition and its loop do not: those come from this skill's mode table. A value the house never decided, such as an unreplaced scaffold default, is not law. The run tests each value for provenance against the generator that produced it, and the ledger records which values were ruled and which are defaults. At binding the run also records what the system publishes, such as law documents, mandatory gate commands, its own harness, a package or a polish docket. Each one present changes how the run works. Each one absent has a fallback. A bound system also changes what builders may edit. Before building a component, a builder searches the system for one that already exists and reports the search. A genuine gap is filled in the system first, and only where the component is reusable. Where the system repo cannot be written to, the builder escalates instead of building around the gap. A builder may replace a value that is only a scaffold default, but never edits a ruled shared token to serve one page, and never fixes a vendored copy of a component. A ruled value that looks wrong is escalated to you as a rule-amendment candidate. Where the run found a binding and your `CLAUDE.md` is absent or silent about it, the run writes the `Design system:` line there as one of its steps. Without write authority, the line goes in the diff it hands you instead.

### The reference

Every comparison inherits the reference, so the run checks it first:

- **A page it can load:** rendered and put through the floor. A reference that fails the floor is still valid visual direction. Its failures are recorded and handed to the critic and red team, so neither demands parity on a defect the floor forbids the build to copy.
- **A static image:** looked at and confirmed. Pinned reference renders are used as they are, unless the house declares a different artifact canonical, which then wins.
- **A source file that must be built:** built first, because shot raw it renders plausible garbage.
- **A brand name with no artifact:** there is no reference, and the run creates the design direction instead.

A restyle normally has two candidates: the page that exists, which is the floor not to regress, and the work it should rival. The run asks which one the blind comparison judges against. A reference that cannot be made trustworthy is dropped for the next one the run has, so in a restyle the predecessor becomes the comparison target. A reference covers only the widths and themes it actually provides. The run compares those and grades the rest against the brief.

## How the work runs

The run follows the hub's posture (see [doctrine](doctrine.md)). A phase is a page, or one design-system card. A wave is the builder and critic pairs inside it, one pair per section, such as hero, nav, feature blocks, pricing and footer.

**The ledger.** It holds every fact the page may assert, each with its source. The facts come from your prompt, the repo and, in a restyle, the predecessor page itself. Every builder, concept-comp agent, critic and adversary is handed it, except its run-state block. A builder asserts nothing outside it. A missing value becomes a visibly labelled placeholder, never a plausible guess. Content the predecessor carried is escalated to you, never deleted. The ledger lives at `docs/design-ledger.md` in the deliverable repo, in the bound system's docs location, or in a scratch directory where neither is writable. It also carries the questions you have already ruled on, so a fresh critic does not reopen them, and the run's counters, which no reviewer sees.

**The direction.** With no reference, the run fans out three concept comps. Each is a rendered candidate, built in its own worktree or one at a time and handed the ledger. You pick one, reject all three or ask for a blend. A full rejection gets one re-fan. A second rejection is settled in conversation, not with more comps. The chosen direction is written to `docs/design-dna.md`, the bound system's location, or the scratch directory. A direction derived from a reference is written down the same way.

Next the run puts the concept to you: what each section *is*, not how it will look. Once you approve it, the run renders the untouched page through the floor. Then a direction adversary attacks the plan before any builder touches it. It is handed the failures the page already carried, so it does not blame them on the new direction. It answers eight questions with KILL, WEAKEN or CLEAR. Does the direction serve that reader and that job? Does it need facts that do not exist? What does the composition assert? Does the register suit the subject? What does it do with risk to people? What does it structurally prevent? Does it tell the reader to do something the subject does not offer? Does it need a value the floor or the bound law forbids? A killed direction gets one revise-and-reapprove cycle, and a second kill is your question. The direction that survives is written back to the direction document before anyone builds from it.

A missing direction blocks the phase. A missing value inside a settled direction does not: the component is built with a labelled placeholder. A missing fact that changes what the composition claims, such as whether a wall of logos means partners or customers, counts as direction.

**The pairs.** Before the first builder, the run runs every documented gate on the untouched revision. Failures outside what you asked to change are recorded as inherited, so nobody is told to fix them or blamed for them. Then one builder per section, each paired with a fresh-context critic. A critic renders its section at 360, 768, 1440 and 2560 pixels wide, in every theme the run claims. Where a section has no route of its own, the critic renders the whole page and crops. A critic rejects with specific art-direction notes, and a section passes when its critic accepts with nothing blocking. The critic stays with its section across retries. If it rejects the same section three times, the run puts the disagreement to you. Your ruling for the builder passes the section. A ruling for the critic resumes the pair once. A second deadlock sends the section back to direction, because the object is wrong rather than its execution.

Builders never share a file. Sections in one file are built one at a time, or the file is split with your approval. Builders that share a build directory or dev server each get their own worktree, with dependencies hardlinked (`cp -al`) rather than symlinked, and the copied tool caches (`node_modules/.vite`, `node_modules/.cache`) deleted, since a hardlinked cache file is still shared. Otherwise every URL keeps answering while serving another builder's page.

**The integrated gate.** When every section has passed, the run assembles the page and runs one round of the gate, in this order:

1. **Native checks:** the technical floor, plus every gate your project documents, whether or not the project compiles. A project with no build step still has gates. A declared script that never exits, such as `vitest` in watch mode, is run in its non-interactive form. A gate whose dependency is missing is recorded as unrun, not failed.
2. **The blind comparison**, wherever the run has a reference. Candidate and reference are shown as matched pairs, at the same width and theme, under neutral filenames A and B in random order. A single-use critic names a winner and says why before being told which is which. It judges execution only (type, color, space, hierarchy), not the content a restyle is forbidden to change, and it names motion unjudged, since a still shows none. The orchestrator scores a tie: a loss when the run aims to exceed, a pass under fidelity. A run with no reference skips this step and says so, and its gate is weaker.
3. **A fresh critic on the integrated page.** It answers the reader test first, and that answer can block: would a human want to look at this, and does it serve its reader? A page that passes every check and bores its reader has failed. It re-checks sections that already passed, because a shared stylesheet edit reopens them. It returns a roll call with one line per axis: `CLEAR`, `BLOCKING` or `CANNOT JUDGE`.
4. **The red team**, from the other model family where available. It attacks what the round passed and judges the sections as a set: two heroes competing, or one bold moment spent three times. It checks print, which nothing else in the run checks, and checks what the page asserts against the ledger, pixels included. Its roll call marks each of its four attacks `BROKE`, `HELD` or `NOT RUN`.

The orchestrator also checks the blast radius. When a round's diff touches a shared token block, a global stylesheet or a component outside the page, it renders every other page that consumes it, at 1440 in every theme, and names those it could not render. If the bound system publishes a package or registry, the gate also runs against a consumer of it. A run with no consumer builds the smallest one. If the system publishes a structural contract, the diff is checked against it every round. When the deliverable is a fragment of a host page, the gate runs on the host page.

Every round's report gives the round number, what got bolder, what critics still rejected, every counter, escalations spent, and how long each open docket item has been open. The run writes that block to the ledger's run-state section, so a compacted or crashed session can resume from disk.

**Simplify.** At the first round that finds nothing blocking, the run deletes decoration that survived the rounds, collapses one-off styles into tokens and drops dead variants. That diff resets the counters, so the passes that close the phase certify what remains.

**The docket and your attention.** Polish does not force another round, because taking a polish fix restarts the clean-pass count. Polish goes to the project's existing backlog in the deliverable or system repo, or `docs/design-docket.md`, or the scratch directory. Docket items are marked PROPOSED or RULED, and a builder may not treat a PROPOSED item as a constraint. A RULED veto applies to the whole pattern, not only the instance you named. Docket numbers never move once assigned. Bold but arguable taste calls go to you as the arbiter, at most three escalations per phase, batched into one sitting. A docket item open for two phases is ruled or takes a stated default, and only polish or presentation may take a default. Questions that block the phase whichever way they are answered go up at once and do not count against the three. Examples are a direction killed twice, a deadlocked section, content the predecessor carried that the ledger cannot source, a clause of the house law ruled stale, and a house rule that can only be met by failing the floor. The run may overrule a critic, but it records the dissent and shows it to you.

**Deliver.** The run commits to the deliverable repo by that repo's norms and lands the docket. After the gate line, it walks your brief item by item, naming the diff that carried each one or its explicit deferral, checked against the page itself. If it cannot write where the work must land, it builds in a scratch directory and hands you the diff, the renders and the docket together.

## What the gate is for this shape

The hub exits a phase on one clean pass. This skill replaces that exit with two modes of its own, and the hub names the fused-gate exit as a replacement that stands. Both modes run the same gate. They differ in what ends the loop. Choose fused gate for a bounded deliverable. Choose pure gauntlet when the critics should keep pushing and you accept hours of run time.

**Fused gate** is bounded. The phase exits on two consecutive clean passes of the integrated gate. A round blocks on any of:

- a floor failure or a failing documented gate that the work caused (an inherited failure is recorded, not blocking)
- a violation of the bound system's law, unless the run marked that clause stale
- a measured geometry or contrast error
- a false claim printed on the page
- losing the blind comparison
- failing the reader test
- an `[UNMEASURED]` floor line
- a critic axis marked `CANNOT JUDGE`
- a red team item marked `NOT RUN`
- the critic's verdict that the work is timid, off-grammar or generic

That last item is the point of the skill. Without it, "this is mediocre" is filed as polish and a page nobody rates exits clean. A roll call with a missing line, or one that contradicts the findings under it, also blocks, and no ruling can waive it. The round alarm counts unresolved rounds, the rounds that found something blocking. At every multiple of N it stops the loop and puts a diagnosis to you. N is your figure, 4 by default. If you say continue, it fires again at the next multiple: with the default, 8, then 12.

**Pure gauntlet** is long-running, and the run warns that it can take hours and burn heavy tokens. The critics decide when the work is done. The phase exits after three consecutive rounds in which a fresh critic picks the candidate over the reference with nothing blocking, or after two consecutive rounds that change nothing and leave nothing blocking. With no reference, or with fidelity as the whole run's bar, no critic can pick the candidate *over* the reference, so only the second exit can fire. The run says so when you choose this mode. This mode overrides the round alarm on purpose. Instead it reports every round, and every sixth round it stops, summarizes what is still being rejected and asks whether to continue.

Both modes keep the hub's time alarm: the phase stops with the same diagnosis when your time budget, two hours by default, passes without a round closing.

| Counter | Mode | Fires at |
|---|---|---|
| consecutive clean passes | fused | 2: the phase exits |
| unresolved rounds | fused | every multiple of N (4 by default): escalate to you |
| critic win streak | pure | 3: the phase exits |
| unchanged rounds | pure | 2: the phase exits |
| section rejections | both | 3: put to you; a second deadlock goes back to direction |
| rounds since check-in | pure | 6: stop, summarize, ask |

## The technical floor

The floor runs on the integrated page every round, in both modes:

- zero axe serious or critical violations, in both themes
- text contrast measured, not assumed
- non-text contrast on charts, icons and focus indicators, which no automated check catches, so the critic judges it
- a visible focus indicator on every interactive element
- reduced motion that is static, not merely shorter
- exactly one `h1` and no skipped heading levels
- no layout break at 360, 768, 1440 or 2560
- every crowded control at least 24x24 CSS pixels (WCAG 2.5.8)
- where the work claims two themes, a second theme a real user can reach

Print is a floor surface too, and the red team is the one that checks it. Performance is measured only where the project has the tooling. Otherwise it is reported as unmeasured, never as a pass. A bound system's minimum that is stricter than the floor binds ahead of it. One that is looser loses to the floor and is escalated to you, never built.

A width of 2560 is rendered because type set at fixed pixel sizes stays frozen while the layout keeps growing. Seven rounds at narrower widths once passed a page whose nav links were 13px at every resolution. Target size is measured on the region that takes a pointer, not the painted box. A link inline in a sentence is exempt. An undersized control fails when crowded, and an isolated one goes to the critic. A component that clips its own content inside a scroll container is a defect at 1440 or wider, unless it is a carousel by design. The exact thresholds are in [`floor.md`](../../skills/doctrine-gauntlet/floor.md).

### Running the harness

The harness ships beside the skill. Run it from the target project so it uses that project's Playwright and axe:

```text
node <skill-dir>/harness/floor.mjs <url-or-file> <outPrefix> [dark|light|both]
    [--fragment] [--single-theme] [--theme-class=NAME] [--crop=SELECTOR] [--expect=TEXT]
```

It renders each width in each theme asked for. The 360 render runs as a phone, so a page with no working viewport tag fails as `NO MOBILE VIEWPORT`. A fragment is the exception, rendered in a plain 360px window, because its host page owns the viewport tag. It scrolls first so lazy images load and hides dev-server overlays. It checks heading structure, layout, target size and type scale across widths, and runs axe where it can find it. Uncaught page errors fail a configuration. A reduced-motion pass, at 1440 only, fails on text that reduced motion hides and on any CSS or Web Animations animation still running in the document. Its count of running animations does not look inside shadow roots, though its hidden-text check does, and motion driven by script or canvas goes to the critic. A focus pass, once per theme at 1440, presses Tab from the top up to 40 times and shoots each focused element at 1:1, so a critic has a focused state to look at. The focus pass never gates.

The flags, and what each decides:

- `--single-theme`, with `dark` or `light` as the theme argument: the project ships one theme. Without it, the missing theme is an `[UNMEASURED]` line that never clears, and the gate can never close.
- `--fragment`: a host page owns theme switching and the type scale, as for a design-system card. A missing `h1` is not a defect, and the theme-reachability and frozen-type questions are suppressed. It suppresses no `[UNMEASURED]` line, so a single-theme fragment needs both flags.
- `--theme-class=NAME`: toggles a class on both `<html>` and `<body>`, for projects that theme that way, such as Tailwind's `dark`. Without it those projects report a false "theme switch had no effect".
- `--crop=SELECTOR`: also shoots that element at 1:1 for each width and theme. A full-page shot is viewed scaled down, so this is the only way to see a figure at its shipped size.
- `--expect=TEXT`: refuses to measure unless that text appears in the rendered page, in the first theme at 360. Use it on any `http://` target, because a URL answering 200 is no proof it served the page you meant. Point it at text that changes with the build and it doubles as a freshness check.

An unknown flag, or a fourth positional argument, is refused with exit 2.

Output files: `<outPrefix>-<theme>-<width>.png` per configuration, `<outPrefix>-reducedmotion-<theme>.png` per theme, `<outPrefix>-<theme>-<width>-crop.png` where `--crop` matched, and `<outPrefix>-focus-<theme>-NN.png` per focus stop. Critics grade these files.

The verdict line on stdout has three forms, and none can be misread as a pass:

| Verdict | Exit |
|---|---|
| `=== TECHNICAL FLOOR: PASS ===` | 0 |
| `=== TECHNICAL FLOOR: N failing configuration(s) ===` | 1 |
| `=== TECHNICAL FLOOR: NOT CLEAN — nothing failed, but N item(s) went unmeasured ===` | 3 |

When nothing could be measured, it prints `FLOOR: CANNOT RUN` on stderr instead and exits 2.

Every run that rendered anything also prints a `[MEASURED]` line naming the URL, title, first `h1` and text length, which catches a server holding the wrong page. Two markers in the report carry gate law. `[UNMEASURED]` is a gap in this run, and it blocks until you waive it. Examples are axe missing or timing out, a theme switch with no effect, a navigation answering HTTP 400 or worse, a stylesheet, font or image that never arrived, a page still changing after it was measured, text painted into a canvas, and content inside a frame. `[JUDGE]` is a question the harness hands to the critic. Three print on every run: non-text contrast, visible focus, and canvas-driven motion under reduced motion. The others print under their own conditions, such as theme reachability, content clipped in a scroll container, a spec-exempt target, or frozen type. A `[JUDGE]` line never gates by itself, but the critic's answer does: a critic who finds the second theme unreachable has found a floor failure.

The run still opens the first render and looks at it before dispatching any critic. A harness reports only what it went looking for.

## A round as a script

One fused-gate round can run as a journaled, crash-resumable script, `harness/round.workflow.mjs`. It holds the dispatch order and counter arithmetic, and no brief text. The orchestrator assembles every prompt as the briefs require and passes them in. [`workflow.md`](../../skills/doctrine-gauntlet/workflow.md) defines the arguments and what each agent must return. Pure gauntlet runs in prose.

Two runners exist. The deciding factor is the round's red team, the one call that must reach the other model family:

- **`harness/round.codex.mjs`** runs the script unchanged and hands every agent call back to the orchestrator. The call keyed `red-team#` goes to the other-family seat. Use it on Codex, and on Claude Code wherever that seat is present:

  ```text
  node <plugin-root>/skills/doctrine-gauntlet/harness/round.codex.mjs <args.json> <journal-dir>
  ```

  Exit 3 lists pending calls to answer, exit 2 names what it refused, and exit 0 leaves the round's result in `<journal-dir>/result.json`. Exit 1 means the script threw. Re-running the same command after a crash resumes. Each round needs a new journal directory.
- **Claude Code's Workflow tool** runs the script itself, so it cannot route the red team to another model family. Use it only where that seat is absent. Its red team is then recorded as a same-model substitute. A round's run id is kept in the ledger and passed back as `resumeFromRunId` to resume.

With neither runner, the prose flow is the round, unchanged. The script differs from the prose in one place: each section-critic retry is a fresh agent handed every earlier rejection, not one critic kept alive.

## A worked example

This example is illustrative. It shows the shape of a run, not a recorded one.

You ask: "restyle the marketing landing page with the gauntlet; the old page is the reference, and the new one should beat it." Discovery finds no design system, so nothing is bound and the skill's own brief is the law. The README documents `build`, `lint` and `test` as gates. `test` is `vitest` in watch mode, so the run uses `vitest run` and records the substitution. The ledger takes the company name, four plan tiers and prices, two certifications and a support address from your prompt and the existing page.

It asks. You pick fused gate. The one job is turning a visiting engineer into a trial sign-up. The comparison target is the existing page, to be exceeded. The work lands in this repo by pull request. The site has two themes with a toggle, is a whole page, and is never printed. The run floors the existing page and records that its footer links fail contrast, so no critic will demand parity on them. It puts four sections to you and you approve them. The direction adversary returns seven CLEAR and one WEAKEN, on a wall of copy under the hero at 360, and the direction is amended in place.

Four pairs go out, each in its own worktree. The pricing critic rejects once, because the tier cards clip their last row at 1440, and passes the rebuild.

Round 1. The floor exits 3: nothing failed, but the display font never arrived, so the report carries an `[UNMEASURED]` line. The blind comparison picks the candidate. The critic marks the wall `BLOCKING`: at 360 the first image sits below six paragraphs. The red team marks item 4 `BROKE`, because the page says "trusted by 400 teams" and the ledger has no such figure. Repairs serve the font from the project, move the image up, and replace the invented figure with the real one you supply.

Round 2 is clean, so the simplification pass runs. It removes a decorative gradient and folds two one-off spacing values into tokens. That diff resets the clean-pass count to 0. Rounds 3 and 4 are clean on the simplified page, and the phase exits on two consecutive clean passes. The report opens with the gate line, then walks your request item by item, then lists the docket's polish items and the pull request.

## How to invoke it

A sample prompt:

```text
use doctrine-gauntlet to restyle src/app/page.tsx; the current page is the reference and the new one should beat it
```

The floor needs a browser in the target project. From that project:

```text
npm i -D playwright-core axe-core
node node_modules/playwright-core/cli.js install chromium
```

Not `npx playwright install`: that command belongs to the full `playwright` package and refuses when only `playwright-core` is present. Where Playwright and axe live outside the project, `NODE_PATH` points the harness at them. A project with no `package.json` can place `axe.min.js` beside the harness instead.

## Requirements

- **A browser, through `playwright-core`, and `axe-core`.** Without a browser the harness refuses to run and prints the install line. Without axe, accessibility is reported as unmeasured, never passed, and that line blocks until you waive it.
- **The `doctrine` hub.** It ships with this plugin, and the skill loads it first.
- **The Codex CLI**, on Claude Code. Codex is the visual red team and the image generator for concept comps and assets. As the red team it runs as a visible seat inside a herdr session and as `codex exec` outside one. Image generation always runs as `codex exec`, writing only inside the target repo, and widening that with `--add-dir` is your call. Without Codex, the red team is a fresh-context subagent that must be able to see the screenshots, and the run says the red team was same-model. Art is then built natively in CSS, SVG or canvas, or you are asked for assets, and the run says which. If no red team can see images, the red team works from the diff and the critic reports, and the gate is reported as weaker than it claims. On Codex the red team is Claude.
- **Claude Code's Workflow tool.** Optional. It runs a round as a script where the other-family red-team seat is absent. See [A round as a script](#a-round-as-a-script).
- **Claude Design.** Optional sync of finished work. Git stays the source of record. A project is created only with your go-ahead, and without one the run says the sync was skipped.
- **superpowers** for parallel dispatch and worktrees, and **ponytail** for the simplification pass. Without them, the hub's fallbacks apply: parallel agent calls with `git worktree add`, and `/simplify` or a manual YAGNI pass.

[Requirements](../requirements.md) has the install commands for every skill.

## Red flags

These failures arrive with no alarm attached. Watch for them in the report.

- A critic passed a section it only read the source of. If it did not render it, it reviewed nothing.
- A critic prompt was assembled ad hoc instead of from the critic brief. Whatever was left out came back perfect.
- Every gate is green and nobody asked whether a human wants to look at the page.
- A content rule was checked against text nodes while the banned thing sits in a photograph or a canvas.
- An item of your brief that no diff claims, noticed only after the phase closed.
- A floor item reported as passing when the harness never measured it.
- A dev-server overlay, a hydration warning or an unstyled page graded as a design defect instead of a broken harness.
- A measurement dispute settled with a better number instead of a crop.
- An instrument found broken, with the rounds it already passed left standing. Those rounds are void.
- Two builders in one repo sharing a build directory or a dev server.
- `pkill -f` or `pgrep -f` with a pattern that matches the run's own command line.

How the harness is tested, and what those tests cannot reach, is in [how this is tested](../how-this-is-tested.md) and [the generality fixtures](../../fixtures/README.md). The hub's page is [doctrine](doctrine.md), and the project overview is the [README](../../README.md).

The specification is [`skills/doctrine-gauntlet/SKILL.md`](../../skills/doctrine-gauntlet/SKILL.md). Trust it over this page wherever the two disagree.
