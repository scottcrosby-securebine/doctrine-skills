# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code plugin ("doctrine") distributing eight skills as pure markdown — there is no build or lint step and no CI. The machine-validated files are `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` (check with `python3 -m json.tool <file>` after editing), plus `doctrine-gauntlet`'s harness code, whose gates are manual and run by hand: the syntax gate and tamper fixtures that `workflow.md` and `floor.md` define, plus `node tools/doc-check.mjs`. Bump `version` in `plugin.json` when shipping a change.

Skills were validated by running fresh-context agents through each wrapper against realistic scenarios and patching every ambiguity they hit — when changing a skill's flow, that's the test to rerun. **That test carries a standing debt: it has not been rerun since, and the hub and all seven wrappers have been rewritten in the rounds since it last ran.** What they now say has been audited, not driven. The two find different things — an audit reads for contradiction against other text, a scenario run finds the instruction an agent cannot act on — so do not read a clean audit as coverage of this.

**One standing regression suite exists, and it is manual: `fixtures/`.** Three generality cases — `bare.html` (no design system, no repo, no package.json), `fixtures/shadcn.sh` (a recipe that builds a stock Next + shadcn install on demand; the app is deliberately not vendored, so a rebuild resolves fresh — `fixtures/README.md` records what that recipe actually holds still and what it lets float, which is what decides whether a rebuild's diff is signal or weather), and a real bound system — exist because `doctrine-gauntlet` grew up against one design system, which is how a skill acquires rules that only make sense for that system without anyone noticing. Run a gauntlet or harness change against all three; each proves something the other two cannot, and `fixtures/README.md` says what. The sharpest case is the theme probe, and the lesson is about the probe, not about any line it currently prints: the same probe output is a false alarm on one fixture and a true defect on another, because what decides it is who owns theming *outside* the specimen — which is exactly what the probe cannot see. One fixture can therefore never tell you which you are looking at. Don't record the probe's current wording here; it moves whenever the harness does, and per-fixture expectations belong in `fixtures/README.md` where a harness change is forced to walk past them.

## Architecture

**Layer, not fork.** The core design rule: these skills wrap other authors' skills (Matt Pocock's engineering skills, superpowers, codex, ponytail, writing-clearly-and-concisely) by invoking them **by name at runtime**, never copying or restating their content, so upstream updates flow through. The one sanctioned exception is `matts-code-review` — a renamed copy of Matt's `code-review`, because the original name collides with Claude Code's native `/code-review` (documented in README Prerequisites).

**Hub and spokes.** `skills/doctrine/SKILL.md` is the hub: the seven-step posture (ask questions first → phases/waves of parallel agents → native checks → red team → two-clean-pass loop → simplify → deliver) and the fallback table for missing prerequisites. The seven `doctrine-*` wrappers each begin with "REQUIRED BACKGROUND: read the `doctrine` skill first" and supply only the task shape: which external skill is the core discipline, how phases map onto it, and which review skill the phase gate uses. Don't restate posture steps inside a wrapper — reference them ("doctrine step 4").

**A hoist that is deliberately not done yet.** Two stretches of `doctrine-gauntlet` — "The docket and the arbiter" in full, plus the counter table and the rationale around it in "Modes" — are task-shape-agnostic and conceptually belong to the hub. They stay in the wrapper because **no second wrapper needs them**, and hoisting early makes all seven carry machinery one uses. A second candidate now exists and is deliberately **not** hoisted either: `doctrine-write` and `doctrine-gauntlet` both build a **claim ledger**, and the gauntlet's version cross-references the write one rather than redefining it — the predecessor-is-evidence rule is genuinely gauntlet-only, so two definitions would be wrong but one shared section is premature at two users. **The trigger is a second wrapper needing an escalation budget or PROPOSED/RULED discipline** — at that point move them up. It is a re-layering, not a cut: nothing gets deleted, and expect to generalize on the way, since the counters are written against gauntlet's two modes and the docket destinations assume a bound design system. **No size is recorded here on purpose, and neither is a certification that one was measured.** A word count in this file rots without announcing it and is then cited as fact, and "already measured, don't re-derive" is a stop-looking sign hung on the claim most likely to have rotted — the same mechanism as the "ten" in "Some rules only look redundant" that survived until an audit found roughly forty. Measure it yourself if the size bears on your decision; what this paragraph is for is the *why*.

**A second trigger exists, and it has already fired — on a third candidate neither of the two above.** The hub used the term "the anchor" in its own steps 4 and 5 and defined it nowhere; only `doctrine-write` and `doctrine-research` defined it, so the hub was instructing the other five wrappers to hand a red team an artifact nothing in their flow produced. The definition was hoisted into hub step 1 as the genus — the user's own words for what the work is for and how it will be judged — with the two wrapper definitions left in place as species, and no wrapper edited, because silence inherits the fix and a local echo forks it. So there are two triggers, pointing opposite ways: a **second wrapper needing** shared machinery, and the **hub already depending** on a term only its dependents define. The first trigger looks down the dependency edge and would never have caught the second.

**Every external reference needs a fallback.** Any skill a wrapper invokes must have a graceful-degradation path, either in the doctrine skill's Fallbacks table or stated inline in the wrapper. A reference with no fallback is a bug.

**Gate semantics are load-bearing.** The two-clean-pass exit gate, the blocking/non-blocking split that defines a "finding" (blocking = the deliverable is wrong or unfinished without a change to it; non-blocking improvements, style nitpicks declined with a reason, findings the user rules closed, and red-team claims verified false from source don't reset the counter), the four-loop escalation valve, the four terminal states a phase can end in (only one of them clean), the class question asked of every blocking finding with its fix-the-class rule (deliberately **not** a label naming the cause: causation is usually unprovable and a guessed label gets counted as a fact by the diagnosis), the build-the-check-first rule, and the diagnostic form of the valve's escalation are deliberate design (see README's posture step 5 and Design notes) — don't loosen them casually when editing skills. The terminal states, the class question and the diagnostic escalation were added after a six-round run in this repo whose rounds 5 and 6 found no code defect and kept finding prose the earlier rounds' own fixes had made stale: the gate was right to count each one, and wrong only in that nothing cheaper than a review round could see them. The class question shipped first as a fresh/fallout *label*, in `9a96069`, and was cut back to a question the same day, because a cross-model review pointed out that it made the orchestrator assert a cause it could rarely show.

**Some rules only look redundant.** `doctrine-gauntlet` records a running list of pairs that read as the same rule stated twice and are not — each survives because a run can comply with one and violate the other, and several exist because the two halves reach two different agents' prompts. They are recorded with their distinctions in `skills/doctrine-gauntlet/do-not-merge.md`, which grows every review round and is **not exhaustive**. **Do not write a count of them into this file**: it said "ten" until an audit found roughly forty, and the list is not cleanly countable anyway — some entries defend three sites at once and some are continuations of the entry above, so any number here is a defect waiting to be cited as fact. Read it before proposing a merge there; re-proposing a listed pair isn't a finding unless you can defeat the stated distinction, and an unlisted pair still needs the same argument.

## Files that must stay in sync

Adding, renaming, or rescoping a skill touches all of:

- `skills/<name>/SKILL.md` (frontmatter `name:` must match the directory)
- Every count in `README.md`, not just the obvious one: the skill table heading, the wrapper count in the `doctrine` row, **and the install line further down**. Grep the file for the old number rather than trusting this bullet to have listed every site.
- The wrapper list in `skills/doctrine/SKILL.md`'s intro
- Descriptions in `.claude-plugin/plugin.json` and `marketplace.json`
- **This file.** `CLAUDE.md` states the skill count and the wrapper count in more than one place, and it is the only file no other file's checklist points at — grep it for the old numbers. This is not hypothetical: the round-18 change to the definition of a "finding" was synced into `README.md` and missed here, and the commit that fixed it says so.
- If the new wrapper brings a new external dependency: **a fallback, and a Prerequisites bullet in `README.md`.** The fallback goes wherever the law above allows — a row in the Fallbacks table in `skills/doctrine/SKILL.md`, *or* stated inline in the wrapper; four of the current prerequisites take the inline form and are correct, so a checklist demanding a table row would be failed by this repo on the day it was written. The README bullet has no such alternative: Prerequisites is the only list a user reads before installing, and a dependency missing from it is invisible.

## The one skill with code in it

`doctrine-gauntlet` is the only skill with bundled files: `harness/floor.mjs`
(the technical floor its critics depend on), `floor.md` (how to drive that
harness — flags, exit codes, render honesty), `harness/round.workflow.mjs` (one
fused-gate round as a Workflow-tool script: structure and counters only, never a
brief), `workflow.md` (how to invoke it and its tamper test), `tools.md` (Codex and Claude
Design invocation) and `do-not-merge.md` (the pairs a reviewer must not
collapse) and `UNAUDITED.md` (what an audit of never-examined territory found and
what became of each finding — a status record, not a queue). The sidecars exist so
SKILL.md carries decision content and gate law while operating manuals and review
history load on demand. The split rule: if it changes what an agent *decides*, it
belongs in SKILL.md; if it changes how a tool is *invoked* or records a call already
made, it belongs in a sidecar. `do-not-merge.md` and `UNAUDITED.md` are both the
second kind — a record of rulings already made, not a rule any agent reads at
runtime — which is why neither is ever assembled into a prompt. `harness/floor.mjs`
and `harness/round.workflow.mjs` are the only code any skill ships; the repo also tracks `tools/doc-check.mjs` and `fixtures/shadcn.sh`, which no skill loads. The floor is run as
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

**The prose has a gate now, and it exists because it did not.** `tools/doc-check.mjs` reads
`doctrine-gauntlet`'s documents against its fixture file and fails on a document naming a fixture
that no longer exists, on three or more fixture names listed inside one sentence, on the same long claim
appearing in two places, and on a fixture the documents' own derivation rule cannot classify. **Its
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

## Two tracked things that are not the plugin

`SESSION_MEMORY.md` at the root is **session state, not documentation**: a working record of where
the last session stopped, what it decided and what it left open, rewritten wholesale rather than
appended. Commits touching only that file are backups, not changes to the plugin. Read it to
resume; never cite it as law, and never let a claim in it outrank the code.

`docs/research/` holds dated dossiers from investigations whose results shaped the skills — one of
them a **negative** result, an adoption test that rejected all four rules it proposed. They are
historical records: correct as of their date, never updated to match later code, and not a place
to look for how anything currently works. Treat a claim in one as evidence about that day.

## Conventions

- SKILL.md frontmatter `description:` follows the "Use when …" trigger-phrase style; it is what makes the skill fire, so write it for matching, not marketing.
- Wrappers end with a short "Red flags" section: concrete failure modes, not generic advice.
- Push to the remote only when explicitly told to.
