# Dossier — is `doctrine-gauntlet` over-developed, and how should it be refactored?

Working file for `doctrine-research`. Report lands at
`docs/research/2026-08-14-gauntlet-refactor.md`.

## The current task (re-aimed 2026-08-14 ~12:35, by the user)

> "I want you to use your doctrine and research skills to go online and find out the best
> practices for developing and using detailed complicated skills like the doctrine skills around
> the gauntlet. **I believe we have over-developed it**, and so I want to see if we need to
> refactor it and if we refactor it what are the best practices to do that. And we want to
> optimize these skills for Opus V and Fable."

**Three questions, in dependency order:**

1. What does published practice say about building and maintaining **large, complex agent
   skills** — and is there a recognised notion of one being *over-developed*?
2. **Is `doctrine-gauntlet` in fact over-developed?** The user believes so. **This run tests that
   belief rather than confirming it** — the user asked to "see if we need to refactor," which is a
   question, not a conclusion.
3. If yes, **what are the best practices for the refactor**, and what do Opus 5 / Fable 5
   specifically want?

**Ruling on the evidence bar (asked and answered at re-aim):** *research first, then test
locally.* Phase 1 gathers external practice; **phase 2 converts the load-bearing claims into local
tests against the gauntlet** — does a rule actually fire, does a critic actually report less.
Chosen explicitly so the run can distinguish **"this rule is bloat"** from **"this rule catches a
real defect,"** which no amount of reading can separate.

**The specimen, measured now so no later paragraph has to guess:**
`skills/doctrine-gauntlet/SKILL.md` = **355 lines / 27,296 words / 158,323 chars**.

### Carried forward, not re-run

The model-guidance half of question 3 was already researched by two blind engines minutes before
the re-aim, and is **kept**: the merged claim table below (M1–M13, S1–S6) with its provenance.
Nothing about it is restated elsewhere. It was gathered under the same anchor discipline and the
same provenance rule, and re-running it would buy nothing.

**Still `REPORTED`, not `VERIFIED` — I have not re-fetched any of it.**

## Why this run exists at all — the predecessor was thrown away

An earlier run (`skill-optimization`) was **discarded whole by the user**: *"I do not trust your
research because it is incomplete and fragmented. I want you to throw it away and start over."*
Nothing from its claim table, conflicts, measurements or conclusions is carried forward. The
discarded file is out of the repo, in the session scratchpad, referenced nowhere below.

**Its three failure modes are this run's standing constraints, because they were self-inflicted:**

1. **It answered a question it never measured.** The anchor asked about *obedience*; every number
   that reached the conclusion was a *size*. → **This run tags every claim with what it measures.**
2. **It manufactured verification twice.** A summary recorded a conflict as "verified" when
   timestamps showed the verifier had not yet run; separately, a verification agent wrote that a
   subagent "came back thorough" before any result existed. → **Provenance rule below.**
3. **It held gate results in context until a crash took them.** → **Written here as they arrive.**

### Provenance rule (new, and non-negotiable)

Every claim in the table carries **who fetched it, when, and from what** — not merely a tag saying
verified. A claim whose provenance is "an agent told me" is marked `REPORTED`, never `VERIFIED`.
`VERIFIED` requires that the primary source was actually retrieved and quoted. **If I did not see
the fetch, it is not verified**, however confident the reporting agent sounded.

## The anchor (the user's own words and rulings — verbatim)

**The original request:**

> "we've done very very extensive modifications to this skill and I believe we need to look at
> possibly optimizing or refactoring it. I want you to use your deep doctrine and research skills
> to find the best way in 2026 to optimize skills for Opus V and Fable."

**Rulings made at this run's kickoff, after a full re-scope (all four asked and answered
one at a time):**

| # | Question | The user's ruling |
|---|---|---|
| 1 | Does the reset include the earlier kickoff rulings? | **Full reset — re-open everything.** Nothing assumed carried forward |
| 2 | What problem does this serve? | **Model migration — Opus 5 and Fable 5 are new.** Nothing is visibly broken |
| 3 | What is the deliverable? | **Report, then apply after the user approves the plan.** Three phases; ends with changed files |
| 4 | Which model reads what? | **Fable 5 orchestrates; Opus 5 runs the subagents** |

### What ruling 2 means for the shape of the work

**Nothing is reported broken.** So this is *not* a defect hunt and *not* a general optimization
pass. The question is narrow and answerable: **what changed about these two models, and what in
this repo was written for a predecessor.** A finding needs a named model-behaviour change and a
site in the repo written against the old behaviour. *"This could be better"* is out of scope.

### What ruling 4 means — the reader map, which governs every finding

| Text | Read by | Whose guidance governs it |
|---|---|---|
| `skills/doctrine/SKILL.md` (hub) — posture, gate law | **Fable 5** | Fable guidance |
| The seven `doctrine-*` wrapper flows | **Fable 5** | Fable guidance |
| Briefs the flows **assemble into subagent prompts** | **Opus 5** | Opus guidance |
| Sidecars loaded on demand by a working agent | depends on which agent loads it — **state it per finding** | follows the loader |

**Every finding must name which of these it touches.** A change justified by Fable guidance that
lands in text only Opus ever reads is a defect, and the reverse likewise. The earlier run had no
reader map and could not have caught that class at all.

## Scope bounds

- **In scope:** documented behaviour changes for Opus 5 and Fable 5; published migration guidance
  for either; repo patterns written against predecessor-model behaviour; the reader map above.
- **Out of scope:** general "could be better" improvements; defect hunting (nothing is broken);
  every repo outside `doctrine-skills` (read-only evidence corpus).
- **Un-ruled and therefore assumed, stated so the user can correct:** *cost and latency are not
  targets* — a migration is about fit, not cheapness; and *file length is not itself the question*
  — length matters only where guidance for **these two models** speaks to it. Both were re-opened
  by ruling 1 and neither was put back; say the word and they change.
- **Timeframe:** evidence current to 2026-08-14. Anything older is admissible only where nothing
  newer exists and must be tagged as such.

## Declared starting ignorance — a gap, not a premise

**I do not know what Fable 5 is** beyond it being a selectable model (`claude-fable-5`) that this
harness offers. Context window, instruction-following profile, intended niche relative to Opus 5:
unverified. Ruling 4 tells me it **orchestrates**, which is a deployment fact from the user, not a
capability claim. **Any recommendation turning on a Fable capability must cite where that
capability is documented, or it does not ship.**

## Phases

| Phase | Exit gate |
|---|---|
| **1 — External practice** | Published guidance on large/complex agent skills, over-development, and refactoring them. Plus the model-fit half (**already carried forward**). Two clean gate passes |
| **2 — Local test** | The load-bearing phase-1 claims turned into **tests against this repo**: which gauntlet rules fire, which never do, whether a critic reports less under the finding taxonomy. Two clean gate passes |
| **3 — Refactor plan** | Per-rule verdict — bloat / load-bearing / unmeasured — with the evidence for each. **Blocked on the user's ruling** |
| **4 — Apply** | Edits, then diff. Only after phase 3 is ruled |

### The trap this design exists to avoid

The discarded predecessor run concluded the gauntlet was too big **without ever observing a single
rule fire or fail to fire**. Phase 2 is not optional polish; it is the phase that makes phase 3's
verdicts falsifiable. **A rule may only be called bloat if something was run that would have
caught it doing work.** Absence of evidence from a test never run is not evidence of bloat.

### One caution the user's own hypothesis has to clear

The user believes the gauntlet is over-developed, and **M2 supports that direction** (Fable: skills
built for prior models are *"often too prescriptive… can degrade output quality"*). Confirmation
is therefore the easy failure here. Two counterweights are already on the record and must be
answered, not skipped:

- `skills/doctrine-gauntlet/do-not-merge.md` is a standing list of rule pairs that **read as
  duplicates and are not**, each surviving because a run can comply with one and violate the
  other. It is the repo's own evidence *against* naive rule-cutting, and any "merge these" verdict
  must defeat its stated distinction.
- This repo's law is that a rule is judged by **whether it fires**, not by length — which is
  exactly what phase 2 measures.

## Run state (on disk per hub step 5 — a compaction zeroes an in-context counter silently)

| Counter | Value |
|---|---|
| Phase | 1 — external practice (re-aimed 12:35) |
| Loop | 1 (model-guidance round returned; practice round dispatched ~12:36) |
| Clean passes toward exit (needs 2) | 0 |
| Valve — gate passes producing a blocking finding, never resets; escalate at 4 | 0 |
| Engines returned | **5 of 5.** Model-guidance round: E1 (Opus) + E2 (Fable). Practice round: E-A (Opus) + E-B (Fable). Repo inventory: E3 (codex), exit 0 |
| Phase 1 status | **Gate RUN — all three parts. Native checks PASS; logic critique BLOCKING; red team BLOCKING.** Phase 1 does **not** pass |
| Valve — gate passes producing a blocking finding, never resets; escalate at 4 | **1** |
| Withdrawn by the gate | R1 density finding, the plateau application, the 114-vs-2,000 comparison, the 25k-budget claim, the "conjunctive gates not rule count" reading, the "literature unsettled" ruling, NC-1's retirement of the taxonomy test, counter-case item 2, the "no system card" absence |

### Round 1 engines — and two deviations from the skill, both deliberate

| Engine | What it is | Question |
|---|---|---|
| E1 | fresh-context web research, **model: Opus 5** | the external question (what changed) |
| E2 | fresh-context web research, **model: Fable 5** | same question, blind to E1 |
| E3 | `codex:codex-rescue` (Bash only) | read-only **repo inventory** of model-specific assumptions |

**Deviation 1 — no `deep-research` workflow.** The skill names it as engine 1. Not used: this
session is under a standing instruction not to launch workflows or deep-research unless the user
asks, and the predecessor run's `deep-research` engine never returned. The skill's own documented
substitute is used instead — a fan-out of web-research agents.

**Deviation 2 — codex is not the second web engine.** The skill designates `codex:codex-rescue`
as engine 2 for independent web research. **It has Bash only and no web tools** — a fact this
project already discovered once. Pointing it at a web question would produce model-knowledge
dressed as research, which is precisely the failure that got the last run discarded. It is given
the repo-side inventory instead, where Bash is exactly the right tool.

**Consequence, stated rather than hidden:** cross-*architecture* diversity on the external
question is **lost**. It is partly recovered by running the two web engines on **different
models** (Opus 5 and Fable 5) — genuine cross-model diversity within one family, and Fable
researching its own published guidance is a useful side-effect. The report must carry this.

## Claim table

**Status: all five engines returned. Gate run — see the three gate sections above.** Nine claims
were promoted to `VERIFIED` by my own re-fetch (native checks); everything else remains `REPORTED`.
**Several conclusions below were withdrawn by the gate — the gate sections govern where they
disagree with this table.**

### MERGED — AGREE (both engines independently, from the same primary pages)

Both engines fetched Anthropic's per-model prompting pages and returned the same load-bearing
quotes without seeing each other. Corroboration here means **two independent retrievals of the
same source**, not two independent sources — the distinction the last run got wrong.

| # | Claim | Reader affected |
|---|---|---|
| **M1** | **Opus 5: delete verification instructions.** *"Claude Opus 5 verifies its own work without being told to… **remove them**: instructions like these cause over-verification… with no loss in quality. The same applies to legacy harness scaffolding that adds separate verification steps."* E1 found it stated on **three** pages, incl. best-practices: *"Claude Opus 5 is the exception… **remove these instructions rather than rewriting them**."* | **Opus** — subagent briefs |
| **M2** | **Fable 5: skills written for prior models are a migration liability.** *"Skills developed for prior models are often **too prescriptive** for Claude Fable 5 and **can degrade output quality**."* Plus: *"you can steer most behaviors with a brief instruction rather than enumerating each behavior by name."* | **Fable** — hub + wrapper flows |
| **M3** | **`reasoning_extraction` is a live refusal category.** *"Prompts, skills, or harness instructions that tell the model to echo, transcribe, or explain its internal reasoning as response text can trigger the `reasoning_extraction` refusal… **Audit existing skills and system prompts for reflection or show-your-thinking instructions when migrating**."* | **Fable** |
| **M4** | **Delegation reversed on Opus 5.** *"delegates to subagents more readily than prior models… set deterministic caps."* Damping snippet: *"**do not use subagents to verify or double-check your own work**."* | **Opus** |
| **M5** | **Fable 5 delegates freely and wants async.** *"Use subagents frequently… **prefer asynchronous communication** between orchestrator and subagents over blocking until each subagent returns."* | **Fable** |
| **M6** | **Fable 5 wants explicit verification — the opposite of M1.** *"Separate, fresh-context verifier subagents tend to outperform self-critique."* | **Fable** |
| **M7** | **Severity/conservatism language literally suppresses reporting.** *"If your review prompt says 'only report high-severity issues' or 'be conservative,' the model may follow that instruction literally and report less; ask it to report everything and filter in a separate pass instead."* | **Opus** — critic/red-team briefs |
| **M8** | **Opus 5 expands scope** and narrates more; written files run longer | **Opus** |
| **M9** | **"Context anxiety" on Fable 5.** May suggest a new session, offer to hand off, or trim its own work — *"most often triggered when the harness shows a **remaining-token countdown**… **Avoid surfacing explicit context-budget counts where possible**."* | **Fable** |
| **M10** | **Fabricated-progress mitigation**, vendor-measured as *"nearly eliminated fabricated status reports"*: audit each claim against a tool result from this session | **Fable** |
| **M11** | Fable turns run **minutes to hours** — *"one of the largest shifts teams encounter"* | **Fable** |
| **M12** | Both 1M context / 128k output. Opus 5 thinking **on by default**, disableable only at effort ≤ `high`. Fable thinking **cannot be disabled**; raw CoT never returned | both |
| **M13** | **Confirmed absence, both engines:** *no* Anthropic skill-authoring guidance is versioned for gen 5. Rules unchanged and model-generic — **body under 500 lines**, `description` ≤ 1,024 chars, **references one level deep**, TOC for reference files > 100 lines. Only gen-5 skills-specific statement anywhere is M2 | — |

### SINGLE-ENGINE — E1 only, unverified until confirmed

| # | Claim | Why it matters here |
|---|---|---|
| **S1** | **Neither Opus 5 nor Fable 5 receives context-awareness tags.** *"Claude Opus 4.7 and later Opus models, Claude Fable 5, and Claude Mythos 5 **don't receive these injected tags**."* (context-windows page) | **Sharpens M9 into something actionable.** Neither model is told its remaining budget by the API — so any budget the model sees, *the harness or the document put there* |
| **S2** | **The "write pushy descriptions" advice is NOT in the source** — E1 read the full best-practices page and it is absent. The general prompting page says the **opposite**: *"If your prompts were designed to reduce undertriggering on tools or skills, these models may now **overtrigger**. The fix is to **dial back any aggressive language**."* | Directly contradicts this repo's convention of writing `description:` for aggressive trigger-matching |
| S3 | Opus 5 effort **does not** reliably shorten visible output — *"To control response length, prompt for it explicitly."* `max_tokens` now caps thinking + response together | Any "run subagents at low effort to keep reports short" assumption is documented-wrong |
| S4 | Fable 5 was **withdrawn 2026-06-12 and redeployed 2026-07-01** after an export-control directive | Explains E2's vaguer "availability was interrupted" note |
| S5 | Prompt cache minimum halved to 512 tokens on Opus 5; prefill returns 400 on Fable; thinking blocks are model-tied and silently ignored cross-model | — |
| S6 | **INDEPENDENT tier, low-medium confidence:** an unreviewed GitHub issue (anthropics/claude-code#83510) reporting Opus 5 **+60% verbosity** (word-level, vs 4.8) and a **nonsense-detection drop** 0.870 → 0.523 gen-4→gen-5. E1 refused to launder it: no Anthropic response, and the Fable rows carry a ~35% refusal rate that contaminates the metric | If it holds, it bears on **critic/red-team roles** — an adversary that engages a flawed premise instead of rejecting it is the exact failure a red team exists to prevent. **Hypothesis for a fixture, not a finding** |

### CROSS-ENGINE RESOLUTION — the blind design earned its keep

**E2's self-flagged weakest claim (O-9) is withdrawn.** E2 reported an independent-tier claim that
Opus 5 scores 100% on 1M needle-in-a-haystack, fixing a "200k degradation on Opus 4.8" — from
search summaries of pages it never fetched. **E1, blind, reports a confirmed absence:** the
context-windows page states only the general principle (*"context rot"*) and publishes **no
per-model curve**; E1 found no measurement either way and explicitly declined to treat Fable's
silence as weakness. → **O-9 does not enter the report as evidence.** Vendor assertion of
consistency across the window stands as vendor assertion only.

### BOTH ENGINES UNCERTAIN ABOUT THE SAME THING — the sharpest open question

Independently, both engines flagged **the same** claim as their weakest, and it is the one that
governs this repo's gate:

> **Does M1/M7 reach an *independent adversarial reviewer* architecture, or only *self*-verification?**

- E2: the vendor text targets self-verification and harness re-check scaffolding; extending it to
  independent reviewer passes is *its own inference*, and M6 pulls the other way.
- E1: Anthropic's M7 sentence is scoped to **code-review prompts**. Whether a
  **blocking/non-blocking finding taxonomy** — which defines what resets a counter rather than
  telling an agent to withhold anything — reads to Opus 5 as a severity filter is **unverified**.
  Two honest readings; and the failure mode is invisible, because *"a critic reporting fewer
  findings and a critic finding fewer defects print the same thing."*

**E1 proposed a cheap decisive test**, which this repo is unusually well-placed to run: give one
critic brief the taxonomy and another *"report everything with severity, a later pass will
filter,"* run both against a **known-defective artifact**, and compare finding counts. That is a
tamper test in this repo's own three-clause sense — and `fixtures/` already exists to supply the
known-defective artifact.

## PHASE-1 GATE — part 3 of 3: RED TEAM. **BLOCKING.** Three findings; I verified the two that flip conclusions

### B1 — arXiv:2601.22025 was used with its direction **inverted**. **VERIFIED BY ME. Counter-case item 2 is struck.**

I re-fetched the paper. The sentence, verbatim:

> *"The largest observed decline occurs for Qwen 2.5 on RAG **when generic rules are appended to
> the user prompt**, from 26/30 to 9/30."*

**The decline came from ADDING rules, not cutting them.** I filed it under *"cutting is a measured
regression risk"* inside a section headed *"stronger than the case."* The paper's actual finding —
*"Generic prompt additions do not produce monotonic improvements"* — is **evidence for the user's
hypothesis**, not against it. The both-directions sentence survives (output-contract prompts did
help extraction); **the exhibit under it was cherry-picked and reversed.**

### B2 — "No model card / system card found" is **FALSE**. **VERIFIED BY ME. Absence retracted.**

I searched. **The Claude Opus 5 System Card exists**, published **2026-07-24**
(`www-cdn.anthropic.com/…/Claude%20Opus%205%20System%20Card.pdf`), indexed at
`anthropic.com/system-cards`; a Fable 5 / Mythos 5 system card accompanies `anthropic.com/claude/fable`.
E2 declared the absence and the dossier **preserved it "for the report."**

**This was the gap the run leaned on** — *"no independent measurement of any gen-5 behaviour
claim"* rested partly on it. And the card carries directly relevant primary content, e.g. that
Opus 5 adheres to the Constitution better than Opus 4.8, Sonnet 5 **or Fable 5**, and that
**"Claude Opus 5 is not more capable overall than Claude Fable 5."** **Unread. Goes on the phase-2
list as a primary source.**

### B3 — The counter-case violates this run's own provenance rule at its strongest points. **Accepted.**

Counter-case item 3's load-bearing numbers (*"trigger rate… < 30%… 70-80%… missed ~25%"*) carry
**no URL, no fetcher, no date** in the dossier. Item 6's quotes likewise. Item 1's Block quotes are
real (red team verified them) but **also have no URL recorded here.** The rule is *who fetched it,
when, and from what* — inside the section I crowned *"stronger than the case."* **Every counter-case
item must carry provenance or be struck.**

### Non-blocking, accepted

- **Arize is dated 2026-05-12, not "Jul 2026"** — and I omitted its next sentence: *"A year ago,
  skills files were a compression problem. They aren't anymore. **Now they're a verification
  problem.**"* Plus *"The trade-off has shifted from 'can the model do it?' to 'is the cost worth
  it?'"* **The omitted continuation hands the conflict's own author to this run's sharpest open
  question.** Its frontier Claude datapoint is **Opus 4.7** — neither target model.
- **My ellipsis flipped the skills page's emphasis.** The elided middle: *"the content is usually
  still present and **the model is choosing other tools or approaches**. Strengthen the skill's
  `description`… **or use hooks to enforce behavior deterministically**."* The page's **first-listed
  cause is preference, not truncation**, and its **first-listed fix is hooks** — which appear
  nowhere in this dossier.
- **R2 undercounts.** A third same-shape site at `SKILL.md:338` (*"escalate and say why rather than
  reaching for it"*). Conclusion unchanged; **the count was wrong**, in a repo whose own law is that
  counts written as facts rot.
- **E3's search commands were never recorded here**, so R1's 114 and the "53 lines" figure are
  **unreproducible from the working file** — the red team's closest pattern gives 97/27.3%, and only
  the hub's 9/56 reproduced exactly. **Record the commands or the numbers cite a vanished instrument.**
- **"Claude Opus models are the named outlier" overgeneralises** — OctoBench measured
  **Opus-4.5**; neither target model was tested.
- **Counter-case item 3 overreaches even if sourced:** <30% concerns *description-matched,
  model-initiated* invocation. A sidecar ordered read **by name**, and a hub loaded by an explicit
  REQUIRED BACKGROUND line, are **not description-matched.** *"Every rule moved out inherits that
  ceiling"* applies the number to a mechanism it was not measured on.
- **S6 flattened** *"+42–60%"* to *"+60%."*

### What the red team attacked and could **not** break — recorded, because an adversary with no attack list has reported nothing

**All five arXiv IDs real with matching titles and verbatim headline quotes** (OctoBench, IFScale,
ManyIFEval incl. EMNLP 2025, Lost-in-Multi-Turn, VeyraBench). **OctoBench full text confirmed** —
including the comparative it suspected I had invented: *"compared to the relatively high ISR band
observed for System reminder and Memory categories"* **is in the paper.** **The compaction quote is
verbatim.** **Repo inventory sample reproduces**: specimen 355/27,296/158,323 exact; every Lines
figure exact for all eight files; lines 50/84/103/114/127/162/191/250/336 all carry the claimed
content; zero context-window hits confirmed; sidecars named nowhere in SKILL.md. CTA's *"+0.3
percentage points"* and *"522 SIP instances"* verbatim. agentskills.io, Block and Arize quotes real.
**The narrow `[DEL]` absence survived attack** — but the flat wording needs qualification (see E4).

### EXTENSIONS — must enter the table

| # | Source | Why it changes things |
|---|---|---|
| **E1** | **arXiv:2607.03048** — *"a controlled real-cost decomposition of language-model agent skill optimisation"* (Jul 2026). *"**Structured rendering and scoped loading lower pass rate** on the compact executor **without lowering cost**"*; *"**no optimised representation reaches a practical break-even**"*; the only surviving contrast is **executor capability, +27pp at ~5× cost** | **The single most on-anchor paper, and it was missed.** It measures *the exact refactoring moves phase 3 would rule on* — and finds they cost pass rate and buy nothing. It also punctures E-A's declared absence: deterministic shortening **was** tested |
| **E2** | **SWE-Skills-Bench, arXiv:2603.15401** — **39 of 49 skills yielded zero pass-rate improvement**, +1.2% average, token overhead **up to +451%** with unchanged pass rate | Independent corroboration of the CTA "+0.3pp" pattern the dossier cited alone |
| **E3** | **Both system cards** (see B2) | Primary behavioural evidence, currently sourced only from prompting pages |
| **E4** | **PerspectiveGap, arXiv:2606.08878** — 110 scenarios on orchestration-prompt composition; failure taxonomy includes **placing instructions where sub-agents cannot see them** | Nearest published neighbour to `[DEL]`, and its failure class **is this dossier's own reader-map defect**. The flat *"NO published measurement found"* must cite and distinguish it |
| **E5** | **The anchor's "and using" half — four native mechanisms, all on a page this run already fetched**: `hooks` to *"enforce behavior deterministically"*; **`context: fork`** — *"runs the skill in its own subagent context"*; **skill preloading into subagents**; `disable-model-invocation` | **The anchor said "developing AND USING." The using half is essentially uncovered.** `context: fork` and subagent preloading bear directly on a skill whose core mechanism is hand-assembling subagent prompts — and **hooks are the platform's own answer to "prompt creep"** (*"if you can write a truth table for it, it should be code"*) |
| **E6** | The Arize continuation — *"Now they're a **verification** problem"* | Belongs beside the "compression problem" quote |

## PHASE-1 GATE — part 2 of 3: LOGIC CRITIQUE. **BLOCKING. Pass is not clean.**

Eight unsupported leaps. **I re-measured the two quantitative ones myself and both reproduce
exactly.** All eight accepted; none contested. Valve +1.

### The verdict on lean, accepted

> *"The dossier applies its skepticism by **source tier, not by direction**. External claims get
> tiered ruthlessly. **Repo-internal numbers get no tier and no scrutiny at all.**"*

Correct, and the consequence is precise: the dossier leans **against** the hypothesis on everything
it examined, and **for** it on the two things it did not — R1 and the plateau. Both fail. It also
caught **gate rulings written into headings before the gate ran** ("*and it is stronger than the
case*", "*this is evidence of engineering, not of bloat*") in a file whose own run state said the
gate had not run. **An overcorrection wearing a balance costume.**

### L1 — R1's density metric is a line-length artifact. **VERIFIED BY ME. R1 is withdrawn.**

R1 computed `imperative-hit-lines ÷ lines`. Line hits saturate at one per line, and these files'
lines are not the same size. My own measurement:

| File | chars/line | R1 hits per 1k words | occurrences per 1k words (case-insensitive) |
|---|---:|---:|---:|
| **doctrine-gauntlet** | **445** | **4.17** | **6.96** (190 occurrences) |
| doctrine (hub) | 296 | **3.21** | **10.72** (30 occurrences) |
| doctrine-code | 170 | 8.22 | 4.57 |
| doctrine-debug | 201 | 8.75 | 5.47 |
| doctrine-audit | 202 | 7.98 | 10.64 |
| doctrine-docs | 196 | 8.72 | 8.72 |
| doctrine-research | 262 | 5.36 | 5.36 |
| doctrine-write | 229 | 7.43 | 9.91 |

**The gauntlet's lines carry 1.5–2.6× more text than every file it was ranked against.** Normalised
by words it is **second-least** imperative-dense in the repo; by raw occurrences it is **mid-pack**,
and **the hub is the densest file (10.72)** — reversing R1's headline *and* its counter-observation
simultaneously.

**Consequence, stated plainly: the user's hypothesis has no measured support in this dossier.** It
has vendor prose (M2, verified) and a broken ruler. *"It is not merely long, it is concentrated"* is
**struck.** So is *"the hub is the most restrained file in the set."*

**And counter-case item 4 inherits the same ruler** — `refactor-skill`'s ">200-line section" gate and
the 500-line canon both read a 445-char-per-line file as comfortably compliant. **A line-count canon
written for normally-wrapped prose cannot see this file.**

### L2 — The plateau discriminator cannot be applied to this repo's round yields. **Accepted.**

agentskills.io's test is a dose-response on a **fixed eval set**: hold the test constant, add rules,
watch pass rate stop improving. The substituted numbers fail on five counts: **the specimen changes
every point** (R17 gauntlet, R18 R17's own diff, R19 the six wrappers, R20 the hub) — *there is no
x-axis*; the instrument changes every point; the y-axis is inverted and unbounded; **no rules were
being added as the independent variable**; and 51→34 is a ~33% decline, not a plateau.

**Worse — "zero clean passes in twenty rounds" was double-spent.** Used as plateau evidence
(→ over-constrained) in one section, and independently explained in the OctoBench section as what a
conjunction mechanically produces. **Two incompatible explanations of one datum, both asserted.**

The discriminator survives as a **phase-2 design**: one fixed defective fixture, full gauntlet at
rule-set N and N−k, same critic brief, compare. `fixtures/` already supplies the fixture.

### L3 — "Conjunctive gates, not rule count" names the same variable twice. **Accepted; arithmetic verified.**

The scissors gap is `p` versus `p^n` — **and `n` is the rule count.** The distinction dissolves.
Read literally, **OctoBench is evidence *for* the user's hypothesis**, and it was filed under
"none of them is 'the file is too big'."

**And the gap is arithmetic, not a finding.** 7,098 items / 217 tasks ≈ 32.7 checks per task; at
p=0.83, independence predicts 0.83^32.7 ≈ **0.2%**. Observed ISR is 9.66–28.11%. **Agents beat the
independence baseline by 40–100×** — so checklist items are heavily *correlated*, and the real
content is *"conjunctions are far more survivable than multiplication predicts."* The opposite of
how I read it.

Two transfer steps I named for VeyraBench and failed to name here: OctoBench measures
**Claude-Opus-4.5 and MiniMax-M2.1** against a **gen-5 migration** anchor; and the Skill.md-channel
finding compares **unmatched constraint populations** across channels, so it cannot isolate the
channel. *"The closest published measurement to the target's real regime"* is **struck** —
OctoBench is `[SIM]`+`[SEQ]` single-agent scaffolds; `[DEL]` remains unmeasured.

### L4 — Arize vs VeyraBench is not a disagreement. **Accepted, and it yields a better ruling.**

They measure the two ends of the same scissors: Arize/IFScale measures **per-item capacity** (`p` at
large `n`); VeyraBench measures **perfect-response rate** (`p^n`). `0.99^80 = 0.45`;
`0.95^80 = 0.017`. **Fully compatible.** I compared a numerator to a denominator and called the
field unsettled — **then spent both numbers anyway**, declaring the literature unable to rule and
sixty lines later calling Arize *"decisive in direction."* That convenience pointed one way: the
counter-case.

**Replacement ruling, stronger than either number: per-item capacity is not this file's constraint;
all-hold conjunction is.** That reconciles Arize, VeyraBench and OctoBench in one sentence and
points phase 2 at **the gate's conjunction width**, not the file's length.

### L5 — NC-1 over-read a capability sentence as an endorsement. **Accepted. The retired test is reinstated.**

*"Claude Opus 5 coordinates teams of subagents well, with effective writer-verifier patterns"* is a
**capability claim**, not a prescription. By M1's own logic — *"verifies its own work without being
told to… remove them"* — "coordinates writer-verifier teams well" is equally consistent with *"so
you needn't script it."*

**What NC-1 actually settled is M4's scope, correctly** (*"your own work"* is unambiguously
self-scoped). **What it did not touch is the crux:** M1's clause *"The same applies to legacy
harness scaffolding that adds separate verification steps."* **A two-clean-pass gate with a red team
is harness scaffolding that adds separate verification steps.** That remains open.

**Retiring a cheap decisive local test on the strength of a re-read is precisely what ruling 2
forbids** — and it happened to cancel the one test whose result could have embarrassed the
counter-case. The critique also caught that my "test M7 instead" redirect **is the same test** I had
just retired. **Reinstated: two critic briefs, one taxonomy'd and one "report everything," against a
known-defective fixture, compare counts.**

### L6 — The compaction correction is over-corrected, and one claim is measurably wrong. **Accepted.**

- **The shape is right:** re-attachment truncation governs the **orchestrator's invoked-skill
  context (Fable-read flow)** and is irrelevant to assembled subagent prompts, which fire once.
- **The magnitude is unquantified.** I rejected "~87% stops firing" because *"a large share is
  payload"* — but R4 establishes 49 assembly **sites**, not a **proportion**. Same defect as the
  claim it corrects, opposite sign.
- **Measurably wrong:** the 25k combined budget does **not** bind on wrapper+hub. Hub ≈4.15k tokens
  + gauntlet truncated to 5k = **≈9.2k of 25k, 37%.** **The binding constraint is the per-skill 5k
  cap.** The 25k-pool claim is **withdrawn**; NC-2's recency rule is the real sharper mechanism, and
  it triggers on *many skills in one session*, not on wrapper+hub.
- **Self-contradiction in my own file:** the CORRECTION calls re-invocation *"an operational fix"*
  while NC-2 says do not present it as a fix until tested. **NC-2 governs; the CORRECTION's claim is
  withdrawn.**

### L7 — 114 is a line-hit count spent as an operative rule count. **Accepted.**

*"the gauntlet carries 114 imperatives… against a ceiling measured in the thousands… rule count is
not this file's problem"* requires 114 and 2,000 to be the same unit. They are not: 114 is a
**deliberately broad lexical line-hit count including explanatory prose**; the benchmark counts
**discrete individually verifiable instructions**. And 114 errs **in both directions at once** —
over-counting prose containing "never", under-counting by saturating at one hit per 445-char line
(my occurrence count returns **190** on a *narrower* lexicon). **The 114-vs-2,000 comparison is
struck.**

**Two tier-slippage sites accepted:** M10's *"vendor-measured as nearly eliminating fabricated
status reports"* has no number, method, or replication — **downgraded to `VENDOR-ASSERTED,
unreplicated`** at every load-bearing use, including R5. And **OctoBench lost its tier by
promotion** — Arize and VeyraBench got tier tags, OctoBench got methodology stats and none.
**Tagged: `INDEPENDENT, unreviewed preprint, pre-gen-5 models`.**

### L8 — Reader-map violations. **Accepted; three sites.**

1. **R1 names a file, not a reader** — while R4, two sections later, splits that same file at line
   granularity. The density argument is un-attributable to either model's guidance.
2. **The strongest indictment is aimed at the wrong reader.** G2's ALWAYS/NEVER yellow flag and the
   prompt-creep list were applied to the whole file, but **M2's prescriptiveness warning is
   Fable-only** — Opus has *"no equivalent warning"* and *"performs well out of the box."*
3. **R2's exposure count is reader-blind.** `:191` is orchestrator text (Fable-read, correctly
   counted). `:250`'s at-risk clause **is dispatched into an Opus-read brief.** **Fable exposure is
   1 line, not 2.**

## PHASE-1 GATE — part 1 of 3: NATIVE CHECKS (run by me, 2026-08-14). **PASS, with two extensions**

Per `doctrine-research`: re-verify every claim against the source it cites. I fetched the three
load-bearing vendor pages **myself**. These claims move `REPORTED` → **`VERIFIED`**.

| Claim | Source | Result |
|---|---|---|
| M1 remove verification instructions | prompting-claude-opus-5 | **VERIFIED verbatim** |
| M4 delegation cap + *"do not use subagents to verify or double-check your own work"* | prompting-claude-opus-5 | **VERIFIED verbatim** |
| M7 severity filter suppresses reporting | prompting-claude-opus-5 | **VERIFIED verbatim** |
| M2 *"often too prescriptive… can degrade output quality"* | prompting-claude-fable-5 | **VERIFIED verbatim** |
| M3 `reasoning_extraction` + *"Audit existing skills… when migrating"* | prompting-claude-fable-5 | **VERIFIED verbatim** |
| M5 / M6 delegate freely; *"fresh-context verifier subagents tend to outperform self-critique"* | prompting-claude-fable-5 | **VERIFIED verbatim** |
| M9 context-budget countdown | prompting-claude-fable-5 | **VERIFIED verbatim** |
| M10 audit progress against tool results | prompting-claude-fable-5 | **VERIFIED verbatim** |
| Auto-compaction: first 5,000 tokens, 25,000 combined | code.claude.com/docs/en/skills | **VERIFIED verbatim** |

**Both engines reported these accurately. No fabrication, no drift.** That is the first clean
provenance result in this project and it is worth recording as such.

### NC-1 — **The run's biggest open question is now RESOLVED, from a page both engines quoted**

The question: *does M1 ("remove verification instructions") reach an **independent adversarial
reviewer** architecture, or only **self**-verification?* Both engines independently flagged this as
their weakest point. **The answer is on the same page, in a section neither quoted:**

> *"**Multi-agent coordination:** Claude Opus 5 coordinates teams of subagents well, with
> **effective writer-verifier patterns** and few cases of agents overwriting each other's work."*

And M4's own wording is scoped, exactly: *"do not use subagents to verify or double-check
**your own work**."*

**So the two rules are about different things, and the distinction is now sourced rather than
inferred:**

| | Anthropic's position |
|---|---|
| **Self**-verification — an agent re-checking work it just did, or spawning a subagent to check *itself* | **Remove.** Causes over-verification, no quality gain |
| **Writer-verifier** — a separate agent judging *another* agent's output | **Endorsed.** Opus 5 *"coordinates teams of subagents well"* with *"effective writer-verifier patterns"* |

**Consequence for the artifact: the gauntlet's builder/critic pairs, its fresh-context critics and
its red team are the endorsed pattern, not the deprecated one.** What is exposed is narrower than
feared and precisely locatable — instructions telling an agent to re-check **its own** work.
Combined with R5, most of the repo's 55 verification lines are **anti-fabrication** (*don't claim
what you never observed*), which is M10 — recommended — rather than M1.

**This retires the phase-2 test both engines proposed for it.** Phase 2 does not need to settle
M1's scope; it is settled. Phase 2 should test M7 instead (whether the blocking/non-blocking
taxonomy suppresses critic reporting), which is a different and still-open question.

### NC-2 — Two compaction sentences neither engine reported

The same paragraph continues:

> *"Claude Code fills this budget starting from the most recently invoked skill, so **older skills
> can be dropped entirely after compaction** if you have invoked many in one session."*

**Not truncation — total loss, by invocation recency.** Directly relevant to an architecture where
every wrapper also loads the hub: after compaction, one of the two may be gone rather than short.
Which one depends on invocation order (the wrapper is invoked first and then instructs reading the
hub, so the *wrapper* is the older entry). **Flagged as a mechanism, not yet a finding — the order
should be confirmed empirically in phase 2.**

And a caveat on the "just re-invoke it" workaround, from earlier on the same page:

> *"When Claude re-invokes a skill whose rendered content is **identical** to the copy already in
> context, Claude Code adds a **short note that the skill is already loaded** rather than a second
> copy of the content."*

**Whether a truncated post-compaction copy counts as "identical" is not stated.** If it does, the
documented workaround silently does nothing. **Unresolved; do not present re-invocation as a fix
until tested.**

### NC-3 — A mitigation for M9 that neither engine reported

The Fable page ships a snippet for the context-budget failure mode:

> *"You have ample context remaining. Do not stop, summarize, or suggest a new session on account
> of context limits. Continue the work."*

Relevant if phase 2 finds the repo's 53 compaction-loss lines induce the behaviour (R3's open
hypothesis) — **there is a documented counter-instruction rather than only a deletion.**

## Phase 1 — MERGED (E-A Opus + E-B Fable, blind). Both returned.

### CORRECTION — I overstated a collapse. Two different compaction mechanisms were conflated

I told the user *"the compaction-driven story — mine and the discarded run's — loses its
mechanism."* **That was right about one mechanism and wrong about the other.**

- **M9 "context anxiety"** (Fable trims its own work / offers to hand off). Trigger is *"the
  harness shows a remaining-token countdown."* **R3 confirms the repo shows none.** Still a false
  alarm. Unchanged.
- **Skill re-attachment truncation.** The predecessor run's actual thesis, which its own critique
  (L1) dismissed as *"a free parameter… 5,000 borrowed from an unrelated authoring guideline."*
  **E-A found the primary source, verbatim** — `https://code.claude.com/docs/en/skills`,
  accessed 2026-08-14:

  > *"Auto-compaction carries invoked skills forward within a token budget. When the conversation
  > is summarized to free context, Claude Code re-attaches the most recent invocation of each
  > skill after the summary, **keeping the first 5,000 tokens of each. Re-attached skills share a
  > combined budget of 25,000 tokens.**"*

  > *"Keep the body itself concise. Once a skill loads, its content **stays in context across
  > turns**, so every line is a recurring token cost."*

  > *"If a skill seems to stop influencing behavior after the first response… **re-invoke it after
  > compaction to restore the full content**."*

**So the number was real and the critique that killed it was wrong.** It also carries a *second*
constant nobody had — a **25,000-token combined budget** across re-attached skills, which bites
a repo whose wrappers each also load the hub. And it carries a **workaround the whole argument
missed: re-invoke after compaction.** That is an operational fix, not a refactor.

**What survives and what does not:** the mechanism is sourced; the predecessor's *conclusion*
("~87% stops firing") still does not follow, because R4 shows a large share of the gauntlet is
**payload pasted into subagent prompts at assembly time**, which fires on being read once.

### The central conflict — kept, not resolved. Both engines flagged their own side as weakest

| | E-B's source | E-A's source |
|---|---|---|
| Claim | **Arize (Jul 2026)**: ceiling moved 200–300 → **~2,000** instructions. *"Skills files no longer have a compression problem."* | **VeyraBench** (arXiv:2607.19257): *"Perfect-response rate collapses to zero by **N=80** for every model, format, and placement."* |
| Status | vendor-blog re-run of IFScale, **not peer-reviewed** | **single-author**, unreviewed preprint |
| Self-flagged? | **Yes** — E-B named its per-model numbers its weakest claim | **Yes** — E-A named the N=40/N=80 transfer its weakest claim |

**They disagree by ~25×, and both are [SIM]-regime and unreviewed.** Two blind engines each
retrieved the result that suited a different answer, and each independently distrusted its own.
**Conclusion: the simultaneous-density literature is not settled enough to rule on this file.**
That is a stronger finding than either number.

### The instrument that actually fits — and it says something else entirely

**OctoBench** (arXiv:2601.10343, full text fetched): 34 environments, 217 tasks, 7,098 checklist
items, 3 agent scaffolds incl. **Claude Code**, 8 models, ensemble-judged, >95% of audited items
*"objective, evidence-grounded, and binary-decidable."* This is the closest published measurement
to the target's real regime.

> *"**Finding 1: High per-check compliance does not translate into end-to-end success.** … the CSR
> converges within a high range from **79.75% to 85.64%** … However, the ISR exhibits a
> precipitous drop to a range between **9.66% and 28.11%**."*

> *"**compliance drops noticeably for constraints specified in Skill.md**"* — Claude-Opus-4.5 ISR
> 58.45% in the Skill category vs MiniMax-M2.1 at 12.33%

> *"A dominant negative trend exists where **instruction following effectiveness diminishes as
> interaction history accumulates.** However, Claude-Opus-4.5 acts as a significant outlier by
> maintaining high adherence even as conversation length increases"*

**Three consequences, and none of them is "the file is too big":**

1. **Per-rule compliance is ~80–86%; all-rules-hold is ~10–28%.** The killer is **conjunctive
   gates**, not rule count. A two-clean-pass gate is a conjunction over many rules — this is the
   literature's sharpest warning to this specific artifact.
2. **Rules delivered via SKILL.md are the worst-obeyed category measured** — worse than memory
   files or system reminders. That is a *delivery-channel* finding, and it argues for moving
   critical rules **into assembled prompts**, which R4 shows the gauntlet already does.
3. Adherence decays with accumulated history — **but Claude Opus models are the named outlier.**

### AGREE — both engines independently

| # | Finding |
|---|---|
| **G1** | **No canonical name for over-development.** E-A: *"over-constrained"* (agentskills.io), *"prompt creep"* (Bull), *"context clash"*. E-B: *"harness bloat"*, *"laundry list"*. Both land on the same pathology: **contradiction, staleness, rigidity — not size** |
| **G2** | **Anthropic's own yellow flag is rigidity.** *"If you find yourself writing ALWAYS or NEVER in all caps, or using super rigid structures, that's a yellow flag"*; *"fiddly overfitty changes, or oppressively constrictive MUSTs"*; *"Keep the prompt lean. Remove things that aren't pulling their weight… read the transcripts, not just the final outputs"* |
| **G3** | ***"minimal does not necessarily mean short"*** — Anthropic, explicitly refusing to equate the fix with shrinking |
| **G4** | **Structural canon: 500 lines, one level deep, TOC >100 lines, split on mutual exclusivity.** E-A adds the critical caveat: three vendors state it, **none cites any evidence**, and they are *"three implementations of a shared spec"* — **not corroboration** |
| **G5** | **No published methodology exists for refactoring a large skill while proving nothing load-bearing was lost.** Both searched directly. The two published refactoring skills **verify text coverage, not behaviour** |
| **G6** | **Every published load-bearing test is empirical.** Nothing certifies a rule without running the workflow |
| **G7** | **Anthropic ships the missing instrument and never connects it to refactoring** — skill-creator's blind A/B comparators: *"two skill versions, or skill vs. no skill. **They judge outputs without knowing which is which**"*, with `benchmark.json` recording pass rate / time / tokens and a delta |

### The operational discriminator nobody else publishes — E-A only

> *"**If pass rates plateau despite adding more rules, the skill may be over-constrained** — try removing instructions and see if results hold or improve."* (agentskills.io)

**This is a derivative, not a size** — and it is the only published test that separates
*over-developed* from *merely large*. **This repo has the data to apply it**: yield across rounds
was **51, ~40, ~43, ~34** with **zero clean passes in twenty rounds**. That is a plateau. It is
also, read the other way, exactly what the repo already concluded — *every fix is new surface*.

### "Prompt creep" — the symptom list that names this artifact — E-A only

> *"**Emphasis as error handling.** CAPS, bold, 'IMPORTANT,' 'MUST,' 'NEVER.' These are retry logic for prose."*
> *"**Precondition tables.** If you're writing a table of conditions and corresponding behaviours in a prompt, you've written a switch statement in markdown."*
> *"**Before/after validation patterns**… That's a test harness, not a reasoning task."*
> *"the real issue is architectural: **you asked a statistical model to be a state machine, and gave it the state machine in prose.**"*

Refactor trigger, verbatim: *"The workflow is stable enough that the steps aren't changing week to
week… You find yourself adding emphasis to compensate for skipped steps."* And the extraction
heuristic: ***"if you can write a truth table for it, it should be code."***

**This is the most direct hit on the measured artifact** (R1: 114 imperatives, 32.1% density) —
and note the repo **already** obeys the heuristic in one place: `harness/floor.mjs` is the truth
table made code.

### THE COUNTER-CASE, at full strength — and it is stronger than the case

1. **Specificity is the product, for this kind of skill.** Block Engineering (100+ skills,
   internal marketplace): *"**The more specific your SKILL.md, the less the agent has to guess, and
   the more consistent the experience**"*; *"**Every skill we looked at across our marketplace
   benefits from constitutional constraints.** Without these constraints, agents will find creative
   ways to be 'helpful' that break your workflow. **They'll skip steps they think are unnecessary.
   They'll soften results they think are too harsh.**"* For an adversarial gate, the constitutional
   rules **are** the deliverable.
2. **Cutting is a measured regression risk in both directions** (arXiv:2601.22025): *"the largest
   observed decline… **from 26/30 to 9/30**"*; *"prompt changes should be treated as **potential
   regression risks**."* The rule that *helped* was the **output-contract** rule — the kind a
   simplify pass deletes as clutter.
3. **Splitting into separate skills has a measured reliability ceiling.** *"**Skill trigger rate
   based on description matching alone: < 30%.** With cross-references… 70-80%. Even our
   best-documented knowledge-base skill… was **missed ~25% of the time**."* **Every rule moved out
   of the monolith inherits that ceiling.** A rule firing 100% because it is inline becomes a rule
   firing when the agent chooses to load its host.
4. **The published split gate says this artifact is not a split candidate.** `refactor-skill`:
   cohesive, single-intent, sequential, interdependent phases → *"References/ Extraction Path…
   **STOP here**"*; and a >200-line section is a `references/` candidate **"not skill splitting"**
   unless it has its own independent trigger.
5. **It is the durable category.** Anthropic's own split: capability-uplift skills *"may become
   less necessary as models improve"*; **encoded-preference skills are *"more durable"***. An
   orchestration gate is encoded preference.
6. **Over-application is the named failure of refactoring itself:** *"you treat everything as
   potentially load-bearing and the codebase freezes… The right response is to **investigate, not
   to preserve by default**."* And the warning that fits agents exactly: *"The most dangerous
   load-bearing artifacts are the ones that **don't look like code**… **Agents simplify these first
   because they look like noise.**"*

### An unresolved conflict between two methodologies — carry it, do not settle it

- **agentskills.io** (`VENDOR`, asserted, **no evidence cited**): *"Reasoning-based instructions
  ('Do X because Y tends to cause Z') work better than rigid directives ('ALWAYS do X, NEVER do
  Y')."*
- **superpowers** (`INDEPENDENT`, **publishes head-to-head results**): the right form **depends on
  the baseline failure class**. For *skips-a-rule-under-pressure*: prohibition + rationalization
  table. For *wrong-output-shape*: positive recipe, and there *"the prohibition arm produced
  clearly more of the unwanted content than the recipe arm… and **trended worse than even the
  no-guidance control**."* Plus: *"**No nuance clauses**… appending a single nuance clause to a
  winning recipe **degraded it from consistent to noisy**"* and *"**Exemption clauses don't
  scope.**"*

**superpowers is better-supported** (results vs assertion), and it directly bears on whether the
gauntlet's ALWAYS/NEVER density is a defect or a correct response to a pressure failure class.

### Regime map — the gap is confirmed twice, independently

| Regime | Status |
|---|---|
| `[SIM]` one response | Heavily measured — **and internally contradictory** (Arize vs VeyraBench, ~25×) |
| `[SEQ]` across turns | Measured, and it went **the wrong way**. *"LLMs Get Lost in Multi-Turn"*: 39% average drop; the **CONCAT control at 95.1%** proves the loss is **sequencing itself, not information loss**; *"unreliability skyrockets with an average increase of 112%"*; and *"**relying on an agent-like framework to process information might be limiting**"* |
| `[DEL]` across separate-context agents — **the target's shape** | **UNMEASURED. Confirmed by both engines.** VeyraBench names testing it as **its own future work** |

**And the extrapolation nobody has validated:** every benchmark uses mechanically verifiable output
constraints. *"The extrapolation from 'include the exact word accountability' to 'run the red team
before the second clean pass' is **unvalidated in every source I found**."*

### E-A's declared absences and refutations

No behaviour-verifying refactor methodology; no `[DEL]` measurement; **no measurement of compliance
decay for procedural rules at all**; no measurement of skill-file length vs compliance; **no
evidence behind 500 lines or 5,000 tokens from any of the three vendors stating them**;
`refactor-skill`'s advertised *"regression validation against the original monolith"* **is never
implemented**. Flagged as `MODEL-KNOWLEDGE` via a secondary source only: a report that Anthropic
removed 80%+ of Claude Code's system prompt with no eval regression, quoting *"we were
overconstraining Claude Code, both through our system prompt and in our CLAUDE.md files and
skills"* — **primary post not located; do not cite as established.**

## Phase 1 — E-B raw return (fresh context, model Fable 5)

`REPORTED`, not re-fetched by me. E-B marked its own provenance per quote: **[RAW]** = it verified
against raw page/PDF text; **[EXTRACTED]** = returned by a fetch-and-summarise pass. That
self-tiering is exactly the discipline the discarded run lacked.

### P1 — There is no canonical name for "over-developed", but the symptoms are documented

**The absence is itself the finding.** The concept is real and scattered across four vocabularies.
The sharpest statement is Anthropic's own `skill-creator` — and it indicts **rigidity and
overfitting, not size**:

> *"Rather than put in fiddly overfitty changes, or oppressively constrictive MUSTs… you might try
> branching out and using different metaphors"*

> *"**If you find yourself writing ALWAYS or NEVER in all caps, or using super rigid structures,
> that's a yellow flag** — if possible, reframe and explain the reasoning so that the model
> understands why the thing you're asking for is important."*

> *"**Keep the prompt lean. Remove things that aren't pulling their weight.** Make sure to read the
> transcripts, not just the final outputs."*

Supporting vocabulary: **"harness bloat"** (practitioner) whose markers are *contradictory /
redundant / irrelevant* accumulation driven by *"Nobody ever deletes anything, because deletion
feels risky"*; Anthropic's context-engineering blog against the **"laundry list"** and *"complex,
brittle logic… creates fragility"*, with the crucial qualifier ***"minimal does not necessarily
mean short"***; OpenAI's GPT-5 guide that **contradictory** instructions damage *stronger*
instruction-followers more, since they burn reasoning reconciling conflicts.

**Consequence for this run:** the published pathology is **contradiction, staleness and rigidity**
— not line count. That reframes the user's hypothesis rather than refuting it.

### P2 — Structural practice: confirms M13, adds nothing new

500-line SKILL.md ceiling; **references one level deep** (because *"Claude might use commands like
`head -100` to preview content rather than reading entire files"*); TOC for reference files > 100
lines; split on **mutually exclusive** contexts; *"Bundle comprehensive resources… no context
penalty until accessed."* Cursor and superpowers echo the same numbers independently.
**No source gives a principled split-vs-keep test beyond size and mutual exclusivity.**

### P3 — **No published, validated methodology exists for refactoring a large skill.** Four recipes only

E-B searched for it directly and reports confident absence — no peer-reviewed prompt/skill
refactoring methodology as of 2026-08-14. What exists:

| Recipe | Core move | Fit to this repo |
|---|---|---|
| **Anthropic `skill-creator` snapshot-baseline** | *"Before editing, snapshot the skill… then point the baseline subagent at the snapshot"*, with per-iteration `pass_rate, time, tokens… mean ± stddev and the delta` | **The best fit. It makes the OLD version the control arm** — every cut is A/B'd old-vs-new on one eval set |
| **superpowers TDD-for-skills** | RED/GREEN/REFACTOR with subagents; *"Edit skill without testing? Same violation"* | **A rule's original pressure scenario is its regression test.** If the scenario was never recorded, the rule cannot be safely deleted |
| MindStudio harness audit | Tag each instruction `ACTIVE`/`REDUNDANT`/`CONFLICTED`/`UNKNOWN`; remove **incrementally** — *"If you remove 12 things at once and performance drops, you don't know which removal caused the regression"* | Directly usable as phase-3 structure |
| `agent-md-refactor` | Minimal root (<50 lines, rules applying to 100% of tasks), 3–8 linked topics; prune only *vague / redundant / obvious / default* | **A re-layering recipe, not a cutting recipe** — nearly everything survives, relocated |

### P4 — Density evidence, sorted by regime. **Our regime is unmeasured.**

- **Regime A — many rules, one response, simultaneous.** IFScale (arXiv 2507.11538, preprint):
  *"even the best frontier models only achieve 68% accuracy at the max density of 500
  instructions"*; reasoning models hold *"near-perfect performance through 150 or more"*; errors
  are overwhelmingly **omissions**. ManyIFEval (EMNLP 2025, peer-reviewed): joint compliance ≈
  per-instruction rate^n. **Measures keyword inclusion in one generated report.**
- **Regime B — sequenced across turns, single agent.** Multi-IF: *"instruction forgetting"*,
  o1-preview 88%→71% over three turns. "Lost in Multi-Turn": 39% average drop, decomposed as
  *"a minor loss in aptitude and a significant increase in unreliability."*
- **Regime C — rules distributed across separate agents' prompts. THE TARGET'S ACTUAL SHAPE.**
  > **"NO published measurement found."**

  E-B searched for multi-agent instruction-following benchmarks and found nothing isolating it.
  **Every density number in existence would need the untested inference that "the orchestrator's
  own context carries only its slice" to transfer.** This is the honest gap, and it is the same
  gap that sank the predecessor run — which applied Regime A numbers to a Regime C artifact.

### P5 — **The counter-case, and it is strong**

E-B was instructed to hunt evidence *against* refactoring. It found the single most important
result in this run:

**Arize, July 2026 (INDEPENDENT, [RAW] verbatim-verified):**

> *"a year ago, frontier models started losing track of instructions at somewhere around 200-300
> simultaneous constraints. Depending on what model you pick, **that boundary is now closer to
> 2,000 instructions**."*

> **"Skills files no longer have a compression problem."**

With its own caveat, also verbatim: *"IFScale measures named-item inclusion. The capacity result is
evidence that long skills files are **viable**, not proof that every kind of instruction in them is
followed."* Not peer-reviewed; a vendor-blog re-run of IFScale.

**Against the measured artifact this is decisive in direction:** the gauntlet carries **114
imperatives** (R1), and no single agent prompt receives all of them. Against a ceiling now measured
in the **thousands**, in the *harsher* simultaneous regime, **rule count is not this file's
problem.** Four further counter-points: *"minimal does not necessarily mean short"*; bundled
sidecars are free until accessed; superpowers holds that rules born from observed violations are
**load-bearing by construction** and untested deletion violates the method; and Vercel's eval where
**more** always-loaded context beat elegant progressive disclosure (baseline 53%, skill present 53%
— *"In 56% of eval cases, the skill was never invoked"* — forced 79%, AGENTS.md 100%).

### P6 — How to tell load-bearing from bloat. Every published test is empirical

1. **Counterfactual trace auditing** (arXiv 2605.11946): paired with-/without-skill traces. Finding
   that matters — pass rate moved *"+0.3 percentage points on average"* while **522 behaviour-change
   patterns** appeared. **Activity is not evidence of load-bearing.**
2. **Per-assertion A/B evals** — run the same prompts with and without, against itemised assertions.
3. **Transcript reading** — Anthropic: *"**Ignored content:** If Claude never accesses a bundled
   file, it might be unnecessary or poorly signaled."* And Vercel's converse: **a skill can be bloat
   purely by never firing.**
4. **Micro-testing wording variants** with no-guidance controls, 5+ reps.

> **No source offers any way to certify a rule as load-bearing without running the workflow.**

That is independent external confirmation of the ruling already made at re-aim: research cannot
settle this, and phase 2 is not optional.

### E-B's declared absences and weakest claim

Could not establish: any multi-agent-regime measurement; verbatim text of "Curse of Instructions"
(OpenReview Cloudflare-blocked twice — its p^n claim rests on two agreeing secondary summaries); any
peer-reviewed refactoring methodology; any MCP-prompt-bundle maintenance guidance. **Refuted an
apocryphal claim it met in search summaries** — the "over 80 lines Claude starts ignoring" figure is
**not on the page it was attributed to**. *Weakest claim, self-flagged:* Arize's **per-model** figures
(the headline quote and caveat it verified raw; the per-model table came through a summariser, and
the post's own refusal-retry handling suggests the Claude numbers are noisy). **Use the direction,
not the numbers.**

## E3 — repo inventory (codex, Bash-only, read-only). RETURNED, exit 0

Line-numbered, with the search command shown per category and confirmed absences stated. This is
**measured from the files**, not reported from a model's memory — the only tier of evidence in
this dossier that is not somebody's retrieval.

### R1 — Imperative density: the hypothesis survives its first test

372 matching source lines repo-wide (broad lexical count — includes explanatory prose containing
"never", deliberately, so nobody silently chooses which imperatives count).

| File | Hits | Lines | Density |
|---|---:|---:|---:|
| **`doctrine-gauntlet/SKILL.md`** | **114** | **355** | **32.1%** |
| doctrine-write | 15 | 52 | 28.8% |
| doctrine-docs / doctrine-debug | 10 / 8 | 35 / 28 | 28.6% |
| doctrine-audit | 9 | 34 | 26.5% |
| doctrine-research | 12 | 51 | 23.5% |
| doctrine-code | 9 | 39 | 23.1% |
| **`doctrine/SKILL.md` (hub)** | **9** | **56** | **16.1%** |
| Total | 372 | 3,740 | 9.9% |

**The gauntlet family holds 300 of 372 imperatives — 80.6%.** The gauntlet SKILL.md is both the
largest file and the **highest-density** one: it is not merely long, it is concentrated. That is
the first real support for the user's hypothesis, and it is measured rather than argued.

**The counter-observation, equally measured:** the **hub has the lowest density in the repo**
(16.1%). The discarded predecessor run concluded the hub was the over-prescriptive risk. **It is
not.** By this metric it is the most restrained file in the set.

### R2 — `reasoning_extraction` (M3) exposure is small and locatable

**Only 2 qualifying hits repo-wide**, both in the gauntlet:

- `doctrine-gauntlet/SKILL.md:191` — *"say which candidates you rejected and why"*
- `doctrine-gauntlet/SKILL.md:250` — *"The critic must name a winner and why before being told which is which."*

**No literal requests for chain-of-thought, "think aloud", or internal reasoning anywhere.** Both
hits ask for a **rationale about a decision**, which is not obviously the same as echoing internal
reasoning — but M3's refusal category is defined as *"asks the model to reproduce its internal
reasoning in the response text"*, and only a test settles which side of the line these fall on.
**Two lines is a cheap thing to test and a cheap thing to reword. Low risk either way.**

### R3 — The context-anxiety exposure (M9) is NOT what it looked like

> **"There are no hits for context-window size, token-window limits, or re-attachment."**

**The repo never surfaces a token countdown or a context budget to the model.** M9's documented
trigger — *"the harness shows a remaining-token countdown"* — **is absent.** The counters the hub
mandates are **round** and **valve** counters, not token budgets. So the obvious reading of M9
against this repo is a **false alarm**, and the predecessor run's whole compaction-driven thesis
loses its mechanism.

**But 53 lines assume compaction loss** — *"a compaction takes them with everything else"*, *"a
compaction zeroes an in-context counter"*, *"counters kept only in the conversation, where a
compaction takes them and says nothing"*. **My inference, tagged as mine and unverified:**
repeatedly telling the orchestrator its state will be destroyed is *adjacent* to M9's trigger even
though it is not a countdown. Whether that induces the documented hand-off/trim behaviour is
**a phase-2 test, not a finding.** I am flagging it because it is the kind of thing that would
never show up in a doc-versus-doc audit.

### R4 — The repo already implements the reader map, at line level

49 prompt-assembly sites. The gauntlet does not merely assemble prompts — it **excludes specific
lines from them**: `:103` direction-brief orchestrator paragraph, `:50` run-state block, `:250`
tie scoring, `:162` binding (unless delegated, then the *entire* section goes), `:336` codex
red-team half. Sidecars are correctly outside runtime prompts: `do-not-merge.md` and
`UNAUDITED.md` are **named nowhere as prompt material**.

**This is evidence of engineering, not of bloat** — and it must be weighed against the user's
hypothesis. A file that controls what crosses the model boundary at line granularity is complex
*because the problem is*. It is also, separately, evidence that the complexity is **real and
load-bearing**, which is exactly what phase 2 has to adjudicate rather than assume.

### R5 — The sharpest tension the inventory exposes, and it is not the one anyone predicted

**55 source lines carry explicit verification instructions**, and the split shows they **do** cross
into Opus-read prompts — builder prompts via `:84`, critic prompts via `:107-116` (incl. `:114`),
red-team prompts via `:120-127`.

M1 says Opus 5 wants those **removed**. But read what they actually say:

- `:84` — *"read every file you generate… never return an asset as landed without looking at it yourself"*
- `:114` — *"Do not file a measurement nobody has looked at"*
- `:127` — *"Re-check the current HEAD of any file you name before filing against it"*

**These are not "double-check your answer."** They are **anti-fabrication** instructions — do not
report a thing you did not observe. That is far closer to **M10**, which Anthropic *recommends*
(*"audit each claim against a tool result from this session"*, vendor-measured as nearly
eliminating fabricated status reports), than to **M1**, which it says to delete.

**So M1 and M10 may not conflict at all — they may be about different instructions**, and the
distinction is *"re-check work you already did"* versus *"don't claim what you never observed."*
If that holds, the repo's verification lines are mostly the **kind Anthropic wants**, and a naive
"strip verification instructions for Opus" refactor would delete the anti-fabrication safeguards
of a repo whose documented history is **agents reporting checks they never ran**.

**This is now the single most decision-relevant open question in the run**, it is unresolved in the
sources, and it is testable locally. It supersedes the earlier framing of the same question.

### E2 raw return (superseded by the merge above; kept for provenance)

### E2 (fresh context, model Fable 5, accessed 2026-08-14) — raw return

**Opus 5 — reads the assembled subagent briefs**

| # | Finding | Source (all fetched 2026-08-14) |
|---|---|---|
| O-1 | 1M context (default = max), 128k output, **thinking on by default**; `thinking:disabled` + effort `xhigh`/`max` → 400 | `/models/whats-new-opus-5` |
| **O-2** | **"Claude Opus 5 verifies its own work without being told to. If your prompt contains explicit verification instructions… remove them: instructions like these cause over-verification… with no loss in quality. The same applies to legacy harness scaffolding that adds separate verification steps."** Migration guide corroborates verbatim | `/prompting-claude-opus-5`, `/migration-guide` |
| **O-3** | **Delegation direction reversed.** "Claude Opus 5 delegates to subagents more readily than earlier models… cap the number of subagents." Recommended snippet: **"do not use subagents to verify or double-check your own work"** | `/migration-guide`, `/prompting-claude-opus-5` |
| O-4 | Default responses **and written files** run longer; effort is *not* the lever — "To control response length, prompt for it explicitly" | `/prompting-claude-opus-5` |
| **O-5** | **Severity filters depress recall.** "If your review prompt says 'only report high-severity issues' or 'be conservative,' the model may follow that instruction literally and report less; ask it to report everything and filter in a separate pass instead." | `/prompting-claude-opus-5` |
| O-6 | Scope expansion — adds unrequested steps; constrain explicitly for narrow tasks | `/prompting-claude-opus-5` |
| O-7 | Narrates corrections to its own earlier statements more than predecessors | `/prompting-claude-opus-5` |
| O-8 | Effort re-tuning needed; `low`/`medium` unusually strong — "re-run an effort sweep" | `/whats-new-opus-5`, `/prompting-claude-opus-5` |
| O-9 | Long-context consistency claim. **Engine's own flagged weakest claim** — the independent tier reached it via search summaries of pages it never fetched | vendor + unfetched 3rd-party |
| O-10 | Thinking-disabled failure modes; "If your system prompt contains a rule instructing the model not to think or not to reason, remove it" | `/prompting-claude-opus-5` |

**Fable 5 — reads the hub posture and the wrapper flows**

| # | Finding | Source (all fetched 2026-08-14) |
|---|---|---|
| F-1 | GA 2026-06-09; 1M context, 128K output; **thinking always on, cannot be disabled**; "The raw chain of thought is never returned"; $10/$50 per MTok | `/introducing-claude-fable-5-and-claude-mythos-5` |
| **F-2** | **The direct hit on this repo.** "**Skills developed for prior models are often too prescriptive for Claude Fable 5 and can degrade output quality.** Review and consider removing older instructions if default performance is better." | `/prompting-claude-fable-5` |
| **F-3** | **An instruction pattern that now errors.** "Prompts, skills, or harness instructions that tell the model to echo, transcribe, or explain its internal reasoning as response text can trigger the `reasoning_extraction` refusal category… **Audit existing skills and system prompts for reflection or show-your-thinking instructions when migrating.**" | `/prompting-claude-fable-5` |
| F-4 | "Use subagents frequently… **prefer asynchronous communication** between orchestrator and subagents over blocking until each subagent returns." | `/prompting-claude-fable-5` |
| **F-5** | **Opposite polarity to O-2.** "Separate, fresh-context verifier subagents tend to outperform self-critique… instruct: 'Establish a method for checking your own work at an interval of [X]…'" | `/prompting-claude-fable-5` |
| F-6 | Turns run far longer; anti-overplanning snippet recommended ("When you have enough information to act, act") | `/prompting-claude-fable-5` |
| F-7 | Fabricated-progress mitigation: "audit each claim against a tool result from this session" — vendor-measured as near-eliminating false status reports | `/prompting-claude-fable-5` |
| **F-8** | **"Context anxiety."** Fable may suggest a new session, offer to hand off, or trim its own work — "most often triggered when the harness shows a **remaining-token countdown** to the model. **Avoid surfacing explicit context-budget counts where possible.**" | `/prompting-claude-fable-5` |
| F-9 | Brief instructions beat enumerated behaviour lists; rare early stopping; memory of prior runs helps; give the reason behind a request | `/prompting-claude-fable-5` |
| F-10 | Safety classifiers incl. "extraction of the model's summarized thinking"; benign security work may trip them; refusal = HTTP 200 + `stop_reason:"refusal"` | `/prompting-claude-fable-5` |

### The finding that reshapes the whole migration, if it verifies

**Anthropic's guidance for the two models is explicitly opposite on delegation and
verification** — and **the user's ruling-4 deployment split happens to be the favourable one:**

| | Fable 5 = orchestrator | Opus 5 = subagent |
|---|---|---|
| Delegation | "Use subagents frequently" (F-4) | "cap the number of subagents" (O-3) |
| Verification | fresh-context verifier subagents **recommended** (F-5) | explicit verification instructions **remove them** (O-2) |
| Prescriptiveness | "too prescriptive… degrades quality" (F-2) | no equivalent warning; "performs well out of the box" |

So: **the hub's red-team and two-clean-pass architecture is endorsed for the model that runs it.**
The exposure is narrower and more specific — verification *language copied into an Opus-read
brief*, and over-prescription in the *Fable-read* posture text.

### E2's declared absences — valuable, and to be preserved in the report

- **No model card / system card found** for either model.
- **No Anthropic guidance for authoring SKILL.md specifically for Opus 5 or Fable 5.** The
  skill-authoring best-practices page names only generic tiers and says *"Test your Skill with all
  the models you plan to use it with."* Stable numbers there: body **under 500 lines**,
  `description` ≤ 1,024 chars, **references one level deep**, TOC for reference files > 100 lines.
- **An unresolved contradiction inside Anthropic's own docs**, which E2 surfaced unprompted: the
  skill-authoring page **recommends** step checklists and workflow choreography, while the Fable 5
  prompting page says that style **"can degrade output quality"** on Fable. *Nothing published
  reconciles the two.* → **A conflict to carry, not to resolve.**
- `…/agents-and-tools/skills.md` now **404s**; skills docs moved under `/agent-skills/`.
- **No independent (non-Anthropic-derived) measurement** of the instruction-following claims. Every
  third-party page examined traced back to Anthropic's own reports.

### E2's self-flagged weakest claims (recorded because the last run's best moment was exactly this)

1. **O-9's independent tier** — reached via search summaries of unfetched pages; the "Opus 4.8
   degraded at 200k" premise appears in none of the Anthropic docs read, and needle-in-a-haystack
   is a weak proxy for whether a rule at line 400 of a posture document still fires.
2. **Its own framing of O-2** — the vendor text targets *self*-verification and harness re-check
   scaffolding; whether it extends to **independent adversarial reviewer passes** is E2's
   inference, and F-5 pulls the other way. **This is the single most important thing for E1 to
   settle independently**, because the hub's entire gate is an independent-reviewer architecture.

## Gap ledger

| Gap | What is missing | What was already tried |
|---|---|---|
| ~~What Fable 5 is~~ | **CLOSED by round 1.** GA 2026-06-09, 1M/128k, thinking always on, raw CoT never returned, $10/$50, withdrawn 2026-06-12 → redeployed 2026-07-01. Dedicated prompting page exists | E1 + E2, both fetched |
| ~~What changed in Opus 5~~ | **CLOSED by round 1.** Dedicated prompting page + what's-new + migration guide; deltas captured as M1/M4/M7/M8/M12, S3, S5 | E1 + E2, both fetched |
| **Does M1/M7 reach independent reviewers, or only self-verification?** | The single question governing whether this repo's gate architecture is affected. **Both engines independently flagged it as their weakest point** | Neither engine could find a source that settles it. **E1 proposed a decisive local test** — two critic briefs against a known-defective fixture, compare finding counts |
| **Is this repo's `description:` convention now backwards?** | S2: gen-5 models *"may now overtrigger… dial back any aggressive language."* This repo's convention is to write descriptions for aggressive trigger-matching | Single-engine (E1), and it refutes a claim E1 itself saw in search summaries. Needs my own fetch |
| **Where do budget counts get surfaced to the model?** | M9 + S1: neither model gets budget tags from the API, so any countdown the model sees was put there by the harness or the document. The hub mandates writing counters to disk and carrying them | E3 (repo inventory) is running and owns finding the sites |
| Independent measurement of any gen-5 behaviour claim | Every vendor claim is unreplicated. S6 is one unreviewed GitHub issue with a contaminated metric | E1 searched; found only SEO/affiliate content otherwise |

## Settled — rulings not to be re-opened without the user

- The four kickoff rulings above.
- The predecessor run is discarded; nothing from it is evidence here.
- No skill file is edited before the user approves the phase-2 table (ruling 3).
