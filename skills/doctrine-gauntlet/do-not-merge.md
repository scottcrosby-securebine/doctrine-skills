# Do not merge — pairs that look redundant and aren't

A necessity pass (2026-08-12) put three agents with different mandates against this
skill. The merger's most useful output was not its merges but this list: seven pairs
that read as the same rule twice and are not. Each was checked against the campaign
record, and each survives because **a run can comply with one and violate the other**.

Read this before proposing to merge anything here. Re-proposing a pair below is not a
finding unless you can defeat the distinction stated with it.

**This list is not exhaustive**, and reading it as exhaustive is its own failure mode —
the next reviewer collapses an unlisted pair and cites this file as proof it checked.
Known-unlisted pairs of the same shape include direction brief item 3 against "The
composition claims things the copy never says", direction brief item 4 against "Test the
grammar against its subject", and builder brief item 5 against critic brief item 6. An
unlisted pair needs the same argument as a listed one, not less.

Pairs are anchored by quoted phrase, not line number — the file has been compressed
since the pass and line numbers drift.

**One entry below is not the three-prompts pattern, and says so.** The floor-versus-house
reversal ("the floor is a minimum, never a ceiling") now appears at Precedence, under
Binding the design system, in Technical floor, and in critic brief item 7. Only item 7 is
a different prompt; the other three are **one reader** — the orchestrator — reading three
places in one document. That entry therefore rests on a different argument, stated with
it, and a reviewer who applies the three-prompts test to it will correctly find it does
not pass. Read the argument, not the pattern.

## The seven

**1. "which states were compared" vs "which sections were compared."**
Near-identical wording, different axes. The first is width-and-theme coverage of a
partial reference; the second is per-section coverage when a section has no counterpart.
A run can pass one and fail the other. Merging silently drops an axis of the report.

**2. "A critic grades execution of the direction and never the direction itself" vs
"judge **execution** … not the content."**
Both say "execution", for opposite reasons. The first is a *limitation* — a critic
cannot save you from the wrong object, therefore red-team the direction upstream. The
second is an *instruction* — do not let a critic score content inside the blind
comparison. The record carries two separate failures behind them: the critic sharing
the builder's frame, and the reference-comparison scoring problem.

**3. The harness capability list vs the render-honesty rules** (both now in `floor.md`,
under "What it does" and "Render honesty").
The capability list describes what *this* harness already does. The render-honesty rules
bind **any** harness, and the skill explicitly permits another one. The rules also carry
three obligations the capability list does not: serve production output, treat hydration
warnings as noise rather than failures, and tell critics which marks are the harness.
**Note:** extracting the harness manual to `floor.md` moved these two into the same file,
about forty lines apart. They are now more temptingly adjacent than when the merger
ruled on them, not less.

**4. "thirty findings … eight of them kills" vs "a red team killed eight parts of one
plan."**
Verified as one incident — the campaign's rebuild-proposal red team, 30 findings and 8
kills, recorded in its docket. They prove
different rules: the first that red-teaming the *direction* works; the second that
composition-as-assertion findings are real even when the copy is clean. A cross-reference
naming them as the same red team is fine; collapsing them loses a rule.

**5. "Validate the instrument against a known-good control" vs "when the instrument
turns out to be wrong, the rounds it already passed are void."**
Sequential obligations at different times — before filing, and after discovering.
Neither implies the other.

**6. "Escalate the question; never promote the inference" vs "Presentation is yours;
assertion is the user's."**
Same instinct, different actors and different artifacts. The first governs what a
*critic* may conclude from pixels; the second governs what the *build* may ship.

**7. Critic brief items 1-8 vs the sections that explain them.**
The brief declares this relationship itself — the rest of the skill is the reasoning
behind those lines. Compressed-item ↔ reasoning-section is the design, not accretion.
Only exact-sentence collisions between them are findings.

## Added 2026-08-12, from the first end-to-end run

The ledger, the builder brief and the direction brief were added together, and
they deliberately restate each other into three different prompts. That is the
design: a rule reaches an agent only if it is in the prompt that agent is
assembled from, and these three agents get three different prompts.

**8. The ledger section vs builder brief item 1 vs critic brief item 4.**
The section defines what a ledger is and where its facts come from; the builder
line forbids asserting outside it; the critic line makes an unsourced claim
blocking and tells the critic to escalate rather than cut. Collapse them and two
of the three agents stop hearing it — which is the failure that produced them.

**9. Builder brief "never instruct an action the subject does not offer" vs
direction brief item 7.**
Same sentence, different scope and different moment. The builder's is per
element, while writing it. The adversary's is against the whole object, before
anything is built — and it is the one that catches a *direction* whose entire
premise is an unavailable action, which no per-element check can see.

**10. The deletion exception in the reader test vs builder brief item 3.**
Critic-facing and builder-facing halves of one rule. The critic counts net
removals and asks whether the page got better; the builder is told that an
unsourceable component goes rather than staying as an empty frame. A critic
cannot enforce the second — by the time it reviews, the empty frame is already
there with a caption explaining itself.

**11. The counter's "broken instrument voiding a round" vs the moving-instrument
rule in Technical floor.**
Detection and bookkeeping, and only the second is written down in the counter
table. The counter says what happens to the clean-pass and win-streak counts
*once you know* a round was void; the floor rule is how you find out before
filing — shoot a canvas settled and at 1:1, or verify from source. A run can
obey the counter perfectly and never discover that five of its gravest findings
were a screenshot of a drawing caught mid-animation, which is exactly what
happened.

**12. Critic brief item 3's type-scale inversions vs "type frozen above the
widest width".**
Two different comparisons that both involve type and width. Item 3 is *within*
one render — a fixed step outsizing a clamped one, visible in a single
screenshot, an inversion between two elements. The floor rule is *across*
renders — nothing inverts, everything is uniformly frozen, and it is invisible
in any single screenshot because only the delta between two viewports shows it.
A critic can satisfy item 3 completely on a page whose every control is 13px at
every resolution up to 4K.

## Settled alongside it

**Every Red flag assessed in the pass passes the silence criterion.** The pass read the
list as it stood on 2026-08-12; the section now carries eleven bullets, so re-check any
entry added since rather than reading this line as covering the current list. A count
written into prose drifts every time the list grows — that is why this sentence no
longer carries one. Two carry content found nowhere else
and are not compressions at all: the wholly unstyled page (a server started without its
build step), and the `pkill -f` / `pgrep -f` entry. The closest to failing is "a floor
item reported as passing when the harness never measured it" — `[UNMEASURED]` and exit
code 3 *are* an alarm — but the same entry covers the `[JUDGE]` path, where the harness
prints a question and nothing fails if no critic answers it. That path is genuinely
silent, so the entry stays.

## Added since the pass

**"a value the house never actually decided is not law at all" (Precedence) vs "A value
the house never ruled counts as silence" (The brief) vs "ruled-versus-default" (critic
brief item 3).**
One rule, three locations, and they are not a compression — they are three *prompts*.
Precedence is read by the orchestrator alone; The brief is handed to the builder; item 3
is assembled into every briefed critic. A run complies with one and violates the others
easily: an orchestrator that correctly refuses to treat a generator's zero-chroma
defaults as house law still dispatches a builder whose only precedence instruction says
the bound house outranks the brief — and that builder ships the defaults, and a critic
with no such axis passes them as compliant.

Merging any two of these re-creates the defect found on 2026-08-13, where the instrument
for this test lived only in "Binding the design system" — a section the flow declares
orchestrator-only — and so reached neither the agent that had to apply it nor the agent
that had to check it. That defect was first "fixed" by pointing the builder and critic at
a verdict **nothing in the document produced**, which was strictly worse than leaving it
unreachable, because the pointers also forbade re-deriving it. Both halves are load-
bearing now: the ledger records the verdict, and each reader keeps the three tests as a
fallback where no verdict was recorded. Do not delete the fallback as belt-and-braces —
it is what makes the pointer safe to trust.

**The three tests themselves are reproduced in full in three places** — the instrument
paragraph that defines them, The brief, and critic brief item 3 — and that is also not a
compression to collapse. **"In full" is the requirement; word-for-word identity is not.**
The three copies sit in three different grammars — a definition, a builder instruction, a
critic axis — so they will never be byte-identical, and the standard each must meet is that
a reader holding only that copy can run all three tests without leaving its own prompt.
Diff them against each other on any edit anyway: the 2026-08-13 round shipped a critic copy
that had lost "style name" from the provenance test, and another that lacked the
composite-preset normalisation, leaving the one agent whose job is catching an unreplaced
default unable to recognise a manifest specifying only `style: "brutalist"` and liable to
read a wrong-key lookup as no table at all. A copy that quietly drops a clause of a test is
the same defect as a cross-reference, arriving with less noise. **One clause is
deliberately *not* propagated, and that asymmetry is ruled rather than accidental**: the
fourth test — the value's own commit, under version control — stays in the instrument
paragraph alone. It is conditional on a repo existing, it is weaker than the stock-output
test that all three copies carry in full, and propagating it would turn the four "three
tests" count claims into something maintained across three dense prompts for a signal that
is redundant wherever it can fire. Ruled 2026-08-13; re-proposing it needs an argument that
a copy cannot reach a verdict without it, not merely that the copies differ.

**Critic brief item 7's floor-versus-house ordering vs the same rule under Binding the
design system.** Item 7 now carries the ratified-prose / authoritative-instrument
tie-breaker and an inline list of what the floor's own gate covers. **They duplicate two different sections, and only one of those is
orchestrator-only**: the tie-breaker also lives under Binding the design system, which the
flow does declare orchestrator-only, while the inline floor list duplicates Technical floor,
which carries no such declaration and is nonetheless never delivered to a critic either —
a critic prompt is assembled from the eight items and nothing else, so any section reaches
it only by being copied in. That is the three-prompts pattern again, not redundancy:
without the copy the critic has two rules firing on one fact pattern and nothing to
order them. Whoever de-duplicates
item 7 against that section reopens the defect found on 2026-08-13, where a crowded 20x20
control could be waved through on the grounds that the house's own harness was green. The
inline floor list is a **known** second place to update when the floor changes — that cost
was accepted deliberately, because a pointer to the floor section is precisely the fix that
failed three rounds running. Naming a test is not handing it over: the section defining it is
either declared orchestrator-only or simply never copied into a critic prompt — from a
fresh context those are the same thing — so a builder or critic pointed at it by name
receives an instruction to run something it was never given. The document states this
rule about itself ("handing over an instrument is not coverage either") and then broke it
in the same round, which is how the duplication was earned. Whoever shortens two of these
three to a cross-reference re-creates that defect exactly.

**"do not edit shared tokens or upstream components to serve one page" (Binding the design
system) vs the scope limit in The brief vs "the verdict also bounds the diff" (critic brief
item 3).** Three prompts again, and the orchestrator's copy is the one that cannot act on it:
every verb in that prohibition is a builder's, and the discriminator has to be applied at the
moment of the edit. Until 2026-08-13 the builder held only the licence half — The brief tells
it an unreplaced scaffold default is still its to replace, and "Deliberate palette ... at token
level" points it straight at the shared token block — while the limit sat in a section the
flow declares orchestrator-only and no critic axis named token scope at all. A hero tinted by
editing the primary token therefore renders correctly, passes every gate, and restyles every
future page. Collapsing any two of the three restores exactly that: the orchestrator alone
holding a rule only the builder can obey and only a critic can catch.

**Critic brief item 5's crop mechanism vs the same mechanism under Technical floor.** **Until 2026-08-13** item 5
carried the standard ("read the images at shipped size") and none of the means; `--crop`, the
other-harness region shot and the source-geometry last resort lived only in Technical floor,
which — exactly like the inline floor list in item 7 — carries no orchestrator-only
declaration and is nonetheless never delivered to a critic, because a critic prompt is the
eight items and nothing else. A critic handed full-page screenshots then reports item 5
satisfied having reviewed each figure at a tenth of its size, which is the incident that
section itself records. The Technical floor copy still earns its place: the orchestrator is
who decides to pass `--crop` when it renders for a critic. Same rule as item 7 — naming a
test is not handing it over. **Item 5 now carries all three means**, and that live duplication
is what this entry defends — it is not a record of a fix already filed away.

**Critic brief item 1's section-scope carve-out vs the Modes blocking enumeration.** Added
2026-08-13. Modes rules that an axis a critic could not assess for want of an artifact —
no floor report (item 1), no diff (item 3), no way to crop (item 5) — blocks; item 1
carries a carve-out saying that a critic **whose prompt states it is a step-6 section
review** is owed no floor report, and that the absence must not block or reject there. That reads as the same fact stated twice and is the
three-prompts pattern again: Modes is orchestrator-read and a critic prompt is the eight
items and nothing else, so a section critic hears the blocking rule only through its own
brief and can be exempted only there. It is also **not** the same rule — Modes grades a
report that exists, item 1 stops one from being written — and the round-8 wording is
predicated on "an axis the critic reported it could not assess", so the exemption has to
land at the reporting critic or it lands nowhere. Deleting the carve-out restores the
defect it was written for: a section critic correctly reports the floor report missing (it
is missing by construction — the round's gate runs once and a step-6 pair critic is not
it), blocks
on it, the builder has nothing to hand over, and the section-rejection counter reaches
three on a disagreement no one can settle. The round counters never see section loops, so
neither the four-loop valve nor the unmeasured-waiver reaches it.

**Item 1's closing clause naming items 3 and 5 as still blocking at section scope** looks
like a straight restatement of the Modes enumeration and is not: it exists to stop the
critic generalising the carve-out it has just been given. A section builder's diff exists
and a section critic can crop, so those two abstentions are real gaps at section scope,
and a critic that quietly extends "the floor report does not block here" to them stops
blocking on two axes with nothing in its output to show it happened. Cutting the clause
is invisible in exactly the way this file's silence criterion warns about.

**The trigger was re-keyed in round 10, and the re-keying is now part of what the entry
above defends.** Round 9 fired the carve-out on the *shape* of the artifact — "a single
section rather than the whole integrated page" — which is not the same set as "dispatched
in step 6". They diverge in three shapes this skill supports: a phase that is one
design-system card, a one-section job that runs no wave, and a deliverable that is a
section of a host page. In each, the round's own gate critic is looking at a single section
and a floor report exists — `--fragment` in `floor.md` is there precisely so the floor can
run on a card specimen or a partial — and the shape-keyed wording told that critic to rule
on no floor item and not to block, closing the round with the whole floor unruled, against
"`[UNMEASURED]` is not clean" and "Never report a gate you did not run". Re-keying it to
anything the critic can observe re-creates that, because the only evidence the gate ran is
the report the critic did not receive.

**Step 6's "tell each section critic it is a step-6 section review" vs critic brief item
1's condition on that statement.** Added round 10. Two halves of one rule reaching two
agents, which is the three-prompts pattern: the orchestrator reads the flow and never a
critic's assembled prompt; a critic reads the eight items and never the flow. Collapse it
either way and the rule dies. With only the step-6 line, no critic knows what the sentence
licenses and the exemption is inert. With only item 1, nothing tells an orchestrator to
state the fact, every section critic blocks on a floor report nobody can produce, and the
section-rejection counter reaches three — the round-9 defect above, restored in full.
**The polarity is ruled, not incidental**: the exemption is granted by an affirmative
statement and never by default, so a forgotten sentence stalls one section visibly and
clears on one sentence. The inverted form — exempt any critic not told it is the round's
gate — was considered in round 10 and rejected: there a forgotten sentence passes an
entire unruled floor in silence, and a silent pass ships where a visible deadlock
escalates to a human.

**The critic brief's theme-count dispatch line vs item 1's single-theme clause vs item
7's "only where the work claims two themes".** Added round 11, and the same three-prompts
pattern as the entry above with the same polarity ruling. Items 1 and 7 are *conditioned*
on a fact — this project genuinely ships one theme — that a critic cannot observe: the
renders look the same either way and the floor report is silent precisely because
`--single-theme` suppressed the check. The preamble line is the orchestrator's half; a
critic prompt is the eight items and nothing else, so the preamble never reaches a critic
and the two item-level clauses never reach the orchestrator. Collapse it either way and
the rule dies exactly as the step-6 one does: with only items 1 and 7, nothing instructs
an orchestrator to state a fact only it holds, and a genuine single-theme run has its
critic file the absent second theme as a floor failure item 7 makes blocking and
unwaivable while the floor report reads green — a disagreement with no tie-breaker and no
diff a builder can make. **The polarity is ruled, not incidental**: two themes is the
default, granted by silence; one theme is granted only by an affirmative sentence. The
inverse — assume one theme unless told otherwise — makes a forgotten sentence pass a dead
palette in silence, which is the outcome `floor.md` refuses to make waivable.

**Three sites, not two, and the third is deliberate**: the preamble line does not name a
theme, it names an *obligation to state* one. Shortening it to "see item 1" restores the
defect, because item 1 is not in the prompt the orchestrator assembles from.

**The floor-versus-house reversal at Precedence vs Binding the design system vs Technical
floor.** Added round 11, and **not** a three-prompts case: all three are orchestrator-read
and none of them is ever copied into a subagent prompt. The distinction is different in
kind. Each of the three already carried the *absolute* form — "the technical floor is the
single exception, and it outranks the law", "**The floor outranks the bound law.**" — in
bold, in a document whose agents extract bolded clauses as rules. Round 11 found the
reversal added at Precedence alone, which left two bolded absolutes standing and produced
opposite verdicts on one fact pattern: an isolated 20x20 control under a house that ruled
"every control clears 24x24, measured" ships clean by the two flat claims and blocks by
Precedence and item 7. A correction is bound to the *statement*, not to the reader, so a
rule stated in three places must be corrected in three. **Merging is not forbidden here;
leaving a bolded absolute behind is.** Consolidating to one site is legitimate only if all
three statements go at once and no shortened "see Precedence" pointer remains where a
scanner reads the bold — a pointer preserves the defect exactly, because the sentence that
misleads is the one that stays. Item 7's copy is separate and defended by its own entry
above; it is the only one a critic ever sees.

**Same argument covers the exit-condition carve-out at Precedence vs Binding the design
system** ("its exit condition and its loop are fixed by the table in Modes"). Round 11
ruled the process-doctrine "run the stricter" clause down to the blocking definition
alone, because the Modes table's sole authority is what makes the loop terminate and there
is no notation in it for a house-raised counter. Both statements of the narrowed rule are
orchestrator-read; both are kept for the same reason as the reversal, since Precedence
previously said exit conditions "collide by strictness" and a scanner reading only that
one honours a house's three-clean-reviews exit while the table says two. Re-proposing
either a merge or the wider "run the stricter" needs an argument that an orchestrator can
raise a counter without a notation for it, not merely that the two sites overlap.

## Added round 12 — four orchestrator-only rules copied to the agent that must obey them

These four pairs are one pattern, filed as one entry: a rule sat in a section only the
orchestrator reads, while the agent named in the rule — a critic, or the builder — is
assembled from a prompt that never draws on it. All four predate every review round on
this file; they were found by pointing a pass at territory no earlier pass had audited
(`UNAUDITED.md` 1, 3, 4, 5). The defence is the one the document makes about itself: **a
critic prompt is the eight numbered items and nothing else, a builder prompt is
`## The brief`, and naming a test is not handing it over.**

- **`## The reader test` vs critic brief item 2, and its six axes vs item 3's label list.**
  Item 2 made the reader test's answer *blocking* and Modes lists "failing the reader test"
  among the blocking conditions, while the question and every axis grading it lived in a
  section no critic prompt draws from. The gate's own blocking condition was defined where
  the agent rendering the verdict cannot read it. Item 3 aggravated it, listing the six axes
  as bare noun phrases in the same item where the ruled-versus-default test is reproduced
  *in full* on the explicit ground that a name is not the test. The section stays: the
  orchestrator reads it to name the target reader per surface and to decide to hand the
  critic the predecessor, neither of which a critic can do for itself.
- **`## What a critic may conclude` vs critic brief item 6.** What was copied is
  obligations discharged **before filing** — grep the premise of a sensitivity finding, crop
  before disputing a number, validate an instrument against a known-good control, distrust
  findings outside the named axes, verify the cause and not only the symptom. Only the filer
  can discharge them and only item 6 reaches the filer. **One rule was deliberately not
  propagated**: sorting an outside review into right / wrong / **stale** is the
  orchestrator's disposal of a returned review, not an act a critic performs on its own
  findings. Re-proposing it needs that argument defeated.
- **The docket's "a builder may not cite a PROPOSED item as a constraint" vs the builder's
  assert list.** Every verb in that rule is a builder's and the recorded incident is a
  builder hardening an unconfirmed item into a ban and deleting the client's certification
  logos — aimed, until now, at an agent that never heard it. The docket copy still governs
  the orchestrator's own marking, its no-renumbering rule and its escalation cap.
- **`## Technical floor` vs `## The brief`.** The builder authors the palette, the focus
  ring, the motion, the type scale and the target sizes; it was told the house outranks its
  brief and held four words of floor. **Build-then-measure was weighed and rejected as a
  defence**: a gate can catch a floor defect, but no gate can correct a builder that was
  told the *wrong precedence* — with brand palettes failing contrast "the common case, not
  the exotic one", a builder that reads the house as outranking the floor authors the
  failure as policy. The measurement half follows the floor section's own evidence: a
  145x14px call to action and 13px nav frozen to 3840 each survived seven rounds of critics
  looking straight at them.

**The accepted cost, stated so the next reviewer does not re-discover it as a defect.** The
floor's substance is now a second place to update when the floor list changes, and the
reader test's axes a second place when an axis is added — exactly the cost taken
deliberately for item 7's inline floor list and item 5's crop means. A pointer instead is
the fix that failed three rounds running. **Pair 7 does not license collapsing any of
these**: pair 7 is a compressed item against its *reasoning*, and what was copied here is a
definition, a question, and a set of obligations an item cannot be run without.

**A fifth finding of the same class was ruled the other way, and nothing was duplicated.**
`## The brief`'s fidelity procedure said "tell the critic that a tie in the blind comparison
counts as a pass". There is no critic prompt it can legitimately land in: item 8 denies the
briefed critic the comparison verdict, and the blind pass is briefed from the subject, the
reader and the job alone. It was re-aimed at the orchestrator, where `## The comparison`
already states it. Re-proposing it as a critic instruction needs an argument that survives
item 8 — the failure it invites is a briefed critic returning a verdict its own brief denies
it, which is not a placement defect but a scope one.

## Added round 13 — a fourth prompt, and one more conditioned suppression

**`## The red team brief` vs Technical floor's print rule vs the ledger section vs critic
brief item 6.** One entry, one pattern: the red team is a **fourth** assembled prompt,
alongside the builder's `## The brief`, the direction adversary's list and the critic's
eight items — and until round 13 it was dispatched with none. Three rules it is named in
lived only where it cannot read them. Print is the sharpest: Technical floor assigns print
to the red team in the same sentence that says "an instruction with no assignee is an
instruction nobody executes", which is orchestrator-read, so the skill committed the error
it names in its own text. The ledger check duplicates the ledger section and critic item 4,
and the observed / derived / assumed rule duplicates critic item 6 — same three-prompts
argument as the entries above. The orchestrator's copies still earn their place: Technical
floor is where the orchestrator learns print counts as a floor item in the round's
accounting, and the ledger section is where it learns to build and distribute one.
**What is deliberately NOT duplicated: the critic brief's axes.** Red team items 1 and 2
say the opposite — attack what the round passed, judge the set rather than the sections —
because an adversary handed the critic's axes returns the critic's findings and stops being
an adversary. Anyone merging the two briefs destroys that on contact.

**The critic brief's fragment dispatch line vs item 7's fragment carve-out.** Added round
13, and covered by the round-11 single-theme entry's argument in full: a prompt-conditioned
harness suppression, with the orchestrator holding the only fact and the critic holding the
only rule it conditions. `--fragment` suppresses the theme-reachability and frozen-type
handoffs (verified in `floor.mjs` — it suppresses no `[UNMEASURED]` line, so both themes
are still rendered and item 1's render set is untouched; the finding that prompted this
named item 1 as well and was wrong on that half). Same ruled polarity: page-owned theming
is the default granted by silence, fragment is granted only by an affirmative sentence.

**Direction brief item 8 vs `## The brief`'s floor paragraph vs `## Technical floor`.**
Three prompts, and the moments are what differ: item 8 asks whether the *direction* can be
built under the floor, before anything exists, at the one step where killing it is cheap;
The brief tells the *builder* what to author; Technical floor is the orchestrator's gate
list. Only item 8 can reach a verdict that costs nothing — after step 5 the same defect
blocks every round and its fix is reopening the direction, which is the user's question.
