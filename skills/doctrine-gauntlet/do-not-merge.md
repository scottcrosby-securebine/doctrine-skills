# Do not merge — pairs that look redundant and aren't

A necessity pass (2026-08-12) put three agents with different mandates against this
skill. The merger's most useful output was not its merges but this list: **pairs that
read as the same rule twice and are not**. What that pass opened is `## The founding list`;
the numbered run continues past that heading into `## Added 2026-08-12` and stops there —
everything later is anchored by quoted phrase rather than numbered. **Read the whole file,
never a heading.** The sections come in three kinds, and only one kind says "round" in its
name: the founding list, two undated sections — `## Settled alongside it` and `## Added since
the pass` — and the `## Added round N` sections. Do not read "Added round N" as the whole
tail: `## Added since the pass` carries substantive entries of its own, and a reviewer
following an earlier version of this map walked straight past it. Each entry was checked
against the campaign record or the code, and each survives because **a run can comply with one
and violate the other**. **No count of entries is written anywhere in this file, on purpose** —
the note on the Red flags list further down says what happens to one that is, and this
paragraph carried two until an audit found the first of them already drifted.

Read this before proposing to merge anything here. Re-proposing a pair below is not a
finding unless you can defeat the distinction stated with it.

**This list is not exhaustive**, and reading it as exhaustive is its own failure mode —
the next reviewer collapses an unlisted pair and cites this file as proof it checked.
Known-unlisted pairs of the same shape include direction brief item 3 against "The
composition claims things the copy never says", direction brief item 4 against "Test the
grammar against its subject", and builder brief item 6 — "Label your own caveats", the near-duplicate — against critic brief item 6. An
unlisted pair needs the same argument as a listed one, not less.

Pairs are anchored by quoted phrase, not line number — the file has been compressed since the
pass and line numbers drift. **Some quotes here are deliberately historical.** An entry that
records a defect quotes the wording that *caused* it, which by definition is no longer in the
file; an entry defending a live duplication quotes text that should still be there. Read the
entry's tense before concluding it is stale — a quote introduced as what a site "already
carried" is evidence, a quote naming a live pair is an anchor. Where a live anchor no longer
greps, **re-quote it**: do not delete the entry, and never read a failed grep as the
distinction defeated.

**Not every entry below is the three-prompts pattern, and each exception says so in its own
words.** Two other arguments recur, and applying the three-prompts test to an entry resting on
one of them will correctly find it does not pass — which proves nothing.

The first is **one reader, many sites**: a rule stated in several places that are *all*
orchestrator-read, where what makes a merge unsafe is not that a prompt loses the rule but that
each site states it **in bold**, in a document whose agents extract bolded clauses as rules —
so collapsing two and leaving the third's absolute standing produces opposite verdicts on one
fact pattern. The floor-versus-house reversal ("the floor is a minimum, never a ceiling") at
Precedence, under Binding the design system and in Technical floor rests on this, as do the
exit-condition carve-out that travels with it and the blind pass's prompt manifest. Merging is
not forbidden under this argument; leaving a bolded absolute or a shortened pointer behind is.
Critic brief item 7's copy of the reversal is a **separate** entry and *is* the three-prompts
pattern, because item 7 is the only copy a critic ever sees.

The second is **one reader, two moments** — the capability inventory's rows against the
docket's destinations — where the same orchestrator meets one rule at binding and again at use.

Read the argument stated with the entry, not the pattern you expect.

## The founding list

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
two obligations the capability list does not: serve production output, and tell critics which
marks are the harness.
**A third obligation has since migrated into the other half and is no longer a distinction**:
"treat hydration warnings as noise rather than failures" now sits in both, because "What it
does" gained "console errors are printed as noise and never gate" and a hydration warning is a
console error. That is one clause converging, not this entry defeated — the two obligations
above still hold, and the any-harness argument, which is the load-bearing half, is untouched.
Re-read both sections before citing the list: a distinction that has migrated is not evidence
the pair is one rule.
**Note:** extracting the harness manual to `floor.md` moved these two into the same file, under
adjacent headings. They are more temptingly collapsible than when the merger ruled on them, not
less. **No distance between them is stated here on purpose** — `floor.md` grows between the two
headings on most edits, so a line count is wrong within a round and argues the entry's vigilance
from a number nobody maintains.

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

**12. Critic brief item 3's type-scale inversions vs "type … frozen while the sheet grows
past 1440".**
Two different comparisons that both involve type and width. Item 3 is *within*
one render — a fixed step outsizing a clamped one, visible in a single
screenshot, an inversion between two elements. The floor rule is *across*
renders — nothing inverts, everything is uniformly frozen, and it is invisible
in any single screenshot because only the delta between two viewports shows it.
A critic can satisfy item 3 completely on a page whose every control is 13px at
every resolution up to 4K.
**The anchor on this pair was re-quoted, and the old wording must not come back.** It was filed
against "type frozen above the widest width", which is not what the floor rule says and is the
exact phrasing `SKILL.md` names as a live trap: anchoring the judgement to whatever the widest
render happens to be silently re-rules every defect between 1440 and the top of the ladder as
deliberate, and adding a wider render would re-rule more of them. The rule is anchored to 1440.
Do not restore the old phrasing here, and do not "correct" the harness toward it.

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
kind. Each of the three already carried the *absolute* form — **quoted here as the defect, in the
wording that stood before round 11, not as current text**: "the technical floor is the single
exception, and it outranks the law", and "**The floor outranks the bound law.**" — in bold, in
a document whose agents extract bolded clauses as rules. Neither sentence greps today; both
were narrowed to name the *looser* case explicitly, which is the fix this entry defends. Round 11 found the
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
system** — both sites now open "**Its exit condition and its loop**" and both hand the numbers
to "the table in Modes". Round 11
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

## Added round 14 — the handover, and three more copies into the fourth prompt

**The critic brief's handover manifest vs items 1-8's "you were handed" clauses.** Same
three-prompts pattern as the step-6 dispatch line and the single-theme preamble, and the
same ruled polarity — the preamble is the orchestrator's half and a critic prompt is the
eight items and nothing else. It is **not** a restatement of the items: the items tell a
critic to *abstain* when an artifact is missing, the manifest tells the orchestrator to
*supply* it, and until round 14 only the abstention existed. Modes made "no floor report",
"no diff" and "no way to crop" blocking against artifacts no line in the skill instructed
anyone to hand over, while the red team — the newest brief — shipped with an explicit
manifest from the day it was written. Shortening the manifest to "hand over what the items
ask for" restores the defect, because the items are not in the prompt the orchestrator
assembles from and working the set out is exactly the labour that never happened.

**The Modes abstention enumeration gained a fourth entry** — "no predecessor in a restyle
(item 2)" — plus an open clause, so a future item that instructs an abstention is covered
without another edit. Two entries still quote the three-item form — the handover-manifest entry directly above, and
"Critic brief item 1's section-scope carve-out vs the Modes blocking enumeration" under
`## Added since the pass`. Those quotations have drifted and their arguments have not. (An
earlier version of this sentence credited the quotation to the round-13 section, which carries
none: anchor by quoted phrase, per the preamble, never by round number.)

**The red team brief's settled list and RULED-recurrence rule (preamble, item 1) vs the
docket section and critic item 4; its return sort (item 5) vs critic item 8; its ledger
carve-out (item 4) vs the ledger section and critic item 4.** One entry, one pattern, and
it is the round-13 fourth-prompt argument unchanged. **This does not weaken "the critic's
axes are deliberately not duplicated into the red team".** What was copied is a *disposal*
rule (what a recurrence is filed as), a *return format*, and a *scope carve-out* on an axis
item 4 already had — none of them an axis, and each a thing this agent's own items already
commit it to doing. Copying item 4's carve-out is what stops item 1 pressing the literal
ledger reading until the round cannot close.

**Red team item 1's duplicate criterion is now keyed to the conclusion, not the axis, and
that re-keying is part of what this entry defends.** The axis-keyed form told an adversary
that re-running anything the critic touched is duplicate work, which shielded every false
clearance the critic filed — most expensively on the reader test — and forbade item 4's own
instruction in the same breath. The agent holds the critic's *report* and never its *brief*,
so an axis test is not even runnable from inside that prompt.

**`## The brief`'s floor list gained axe serious/critical**, extending the round-12
Technical-floor-vs-The-brief entry rather than opening a new one: same accepted cost, one
more line to update when the floor list changes. Axe is the floor item with **no visible
symptom** — an `alt`-less image and an unlabelled control render perfectly — so a builder
holding the rest of the list cannot infer it from anything it sees.

**Critic item 2's composition axis regained the fourth example** (small true numbers in a
large enterprise's grammar). Restoring it is compliance with the round-12 entry, not a new
duplication: a copy carrying only the overstatement examples fails the standard the round-13
note sets — "in full" is the requirement, byte-identity is not.

## Added round 15 — the first audit of `## The comparison`, the direction brief and the docket

**The blind pass's prompt manifest at three sites: The comparison's "run the pairs first",
the execution-scope paragraph below it, and the critic brief's preamble.** All three are
orchestrator-read, so this is the *floor-versus-house reversal* argument and **not** the
three-prompts one: what makes it undeletable is that each site states the prompt's contents
in bold, and a reviewer collapsing two leaves a bolded absolute behind that produces the
opposite dispatch. Until round 15 two of the three said "the subject, the reader and the job
and nothing else" while the third told the orchestrator to hand that same critic an
execution-scope instruction, and nothing ordered them — an orchestrator obeying the literal
form ships the recorded defect where a restyle loses every comparison because the reference
lists more cards. Merging is legitimate only if all three move at once and no shortened
pointer stays where a scanner reads the bold.

**Step 7's blind-comparison step vs `## The comparison`'s "Run the pairs first …" and "Then run
the briefed critique".** Not a restatement: The comparison defines the *procedure*, step 7 is the
only place a round is *scheduled*, and an orchestrator working the flow has no reason to
reopen The comparison mid-loop. Until round 15 the ordering existed only in the procedure
section, so fused gate's "losing the comparison" was a blocking condition nothing dispatched
and pure gauntlet's win streak was a primary exit counter nothing fed.

**Direction brief item 8's inline floor list vs `## The brief`'s floor paragraph vs
`## Technical floor`.** Extends the round-13 entry on the round-14 precedent that added axe:
same accepted cost, one more place to update, and **a pointer is the fix that failed three
rounds running**. What forced it: item 8 demanded the adversary name "which floor item the
move collides with" against a list its prompt never carried, so a single-theme conceit, a
headline-less poster page, a fixed-px 2560 hero, a crowded hairline cluster and a
keyboard-invisible interaction were each invisible to the one reviewer that can kill a
direction while killing is still cheap.

**The verdict vocabulary (KILL / WEAKEN / CLEAR) vs step 5's "whatever the adversary kills"
vs the direction brief's trailing paragraph.** Three-prompts pattern with an asymmetry worth
stating: step 5 and the trailing paragraph are orchestrator-read and both *count* kills,
while the adversary is the only agent that can produce one. A bound that keys on a
classification the classifier was never asked to produce is inert: step 5 spends exactly one
revise-and-reapprove cycle "on whatever the adversary kills", so an adversary never given the
word returns concerns and the cycle fires on nothing.
**This entry deliberately states no placement, and that omission is the fix.** Where the
vocabulary sits is read off the dispatch line in `SKILL.md` and never off this file — twice
now a placement claim written down here was believed after it went false, once by this very
entry. Nothing about which paragraphs the adversary's prompt contains is asserted above.
**The rule, stated so it survives any placement.** The vocabulary must sit inside whatever the
adversary's prompt is assembled from; the escalation paragraph must stay outside it. Those are
not in tension — one is dispatched and one is not — and a merge breaks a different thing each
way. Move the vocabulary out of the dispatched set and the loop bound goes inert. Move the
escalation reasoning in and the one reviewer whose entire value is willingness to kill has been
handed a reason not to kill twice.
**This entry was itself found stale by an audit (2026-08-14), which is the most useful thing a
reader can know about it.** As filed in round 15 it certified a placement the document did not
have — it said the vocabulary "sits at the tail of item 8 rather than after the list" when it
sat *after* the list, as an unindented top-level paragraph, unreachable by the adversary. The
defect the entry described as fixed was still live, and the entry is what stopped anyone
looking. Do not re-file this as a position claim. **Verify against the dispatch line before
citing it**, and if the vocabulary is again outside the assembled set, that is a finding, not a
duplication.

**The capability inventory's polish-docket and ruling-queue rows vs the docket section's
destinations.** One reader, two moments: the row is the question asked once at binding, the
docket section is the moment of use. The docket section's copies still earn their place — it
is where the destinations are ranked and where the read-only fallback lives. Collapsing into
the docket section alone restores the error the inventory's header names in its own first
sentence, which the skill was committing two sections later.

## Added round 16 — the target reader's delivery, and the ledger's run-state block

**Step 4's DNA enumeration vs the critic brief's handover manifest vs the direction brief's
delivery line — against critic item 2, direction item 1 and `## The reader test`.** The
reader is a **run parameter, not a design value**: it is answered in step 2 and appears in no
artifact anyone hands over unless somebody puts it in one. Until round 16 the only route was
`## The reader test`'s "name the target reader per surface", which is orchestrator-only, plus
the hope that step 2's answers landed in an artifact defined as "the complete set of facts
the page may assert" — where a run parameter is not obviously at home. Three prompts graded
register against a fact whose delivery was a side effect. Each new site does a different job:
**step 4's** makes it durable, so a resumed orchestrator reads it off the direction document
instead of reconstructing it; **the manifest's** makes it *stated in those words*, because a
critic handed a design document cannot tell which of its lines is "the target reader you were
given"; **the direction brief's** is the only one the adversary's prompt can reach at all.
Collapsing to step 4 alone leaves item 2 guessing which line it means; collapsing to the
manifest alone loses the fact on resume and never reaches the adversary.

**The ledger file's run-state block vs step 7's round report.** Not one artifact stated twice:
the round report is written into the conversation and the run-state block is written to disk,
and compaction takes exactly one of the two — which is the defect round 13 left open and named
as the weakest of its own fixes. The **carve-out** that travels with it — the block is not
handed to any agent — is stated once, in `## The ledger`, beside the distribution list it
modifies, because that is where the handover decision is made. Anyone promoting the counters
into the ledger's fact list proper creates a worse defect than the one this fixed: a critic
holding *rounds since check-in: 5* has been told how badly this round needs to be clean, which
is the one thing a reviewer must not know.

## Added round 17 — the second widened pass: facts three prompts consumed and no step produced

Round 17 pointed three lenses at territory no earlier pass had read: reachability (does a
fact a prompt is conditioned on have a step that *produces* it?), doc-versus-code over the
harness, and repo coherence over this file and the sync list. Most of what it created is one
shape, and it is the **inverse** of the round-12 pattern. Round 12 found correct rules sitting
where the agent bound by them cannot read; round 17 found correct rules **conditioned on facts
nothing establishes** — a carve-out granted by a sentence no step writes, an artifact four
prompts are handed and no section defines. Each fix therefore adds a site that *establishes*
something, and each entry below defends that site against the reviewer who reads it as a
restatement of the sites that consume it. **A producer and its consumers are never one rule**:
delete the producer and the consumers point at nothing, which the round-15 record already
names as strictly worse than an unreachable rule, because a pointer also forbids re-deriving
what it points at. `UNAUDITED.md` carries the pass itself; only the undeletable duplications
are here.

**Step 2's "how many themes this project genuinely ships" and "whether the deliverable is a
whole page or a fragment whose host page owns theme switching" vs the critic brief's
single-theme dispatch line, its fragment dispatch line, and item 7's two carve-outs.** The
consumption sites are already defended by the round-11 and round-13 entries; this extends
those entries at the other end, which is where the defect actually was. Three prompts is only
half the argument here: step 2 *asks a human*, the dispatch lines *state the answer to an
agent*, and item 7 *conditions a verdict on it* — three different acts, and until round 17 the
first of them did not exist anywhere in the flow. Collapse in either direction and a named
failure follows. Delete step 2's questions as covered by the preamble, and the preamble's
"**Where the run has established that this project genuinely ships one theme**" is conditioned
on an establishment nothing performs: the orchestrator's honest fallback is to infer from
discovery, and a source tree carrying one palette is equally a site that ships one theme and a
site whose second theme somebody deleted — assume the first and the harness's reachability
probe is suppressed, item 7's carve-out makes the absent second theme not a finding, and **a
dead palette exits the phase clean**. Delete the dispatch lines as covered by step 2, and the
answer stays in the orchestrator's context and reaches no critic, which is the round-11 entry's
own failure restored. **The tempting cut inside step 2 is its consequence clause** — it names
item 7's carve-out and the dead palette, which item 7 and the preamble also say — and cutting
it is what turns the question back into a harness-flag detail answerable from the tokens. **The
third site is the ledger** ("**Record both answers in the ledger**"): the two are run
parameters held by one context, and a compaction takes them with everything else.

**The ledger's "The same file carries the settled list, under a `## Settled — ruled and closed`
heading" vs the critic brief's manifest entry, critic item 4, the red team's preamble and its
item 1.** Round 14's entry defends those consumers against each other and against the docket;
this defends the **producer**, which did not exist until round 17 — every reviewer's prompt was
handed a "settled list" that no section defined, gave a path, told anyone to build, or said what an
empty one looks like. Collapse toward the consumers and the manifest asks for an artifact
nobody writes; collapse toward the producer and the list is built and reaches no reviewer,
where the failure is not mere repetition — critic item 4 downgrades a recurrence to a one-line
sighting count *only because the critic holds the list*, so without one a fresh critic has
nothing marking the question closed and files an ordinary finding, an accepted finding restarts
the clean-pass count, and a phase whose closed questions keep reappearing can be **structurally
unable to reach two consecutive clean passes**. **"An empty settled list is a real state and is handed over as one" restates
nothing** and is the clause most likely to be cut as verbiage: from inside a prompt an early
phase and a section you forgot look identical. (The list reaches the red team through its
**preamble and item 1** — item 3 is print. Anchor by quoted phrase, never by item number
remembered from a brief.)

**`## The reference`'s "record which floor items it fails in the ledger" vs the critic brief
manifest's "the reference's recorded floor failures".** **One reader, two moments**, not three
prompts — both sites are orchestrator-read, and what is dispatched is the *record*. The
reference branch is met once, at step 3, when the failures are observed; the manifest is met
at every dispatch in steps 6 and 7. Delete the manifest entry and the record sits in the
ledger with nobody told to state it: the briefed critic is handed the predecessor because item
2's "what the original *does*" axis needs it, and a critic holding the predecessor and no such
record demands parity on a hairline control or a failing contrast pair — a blocking finding
whose only fix breaks the floor, against a builder with no compliant diff. Delete the
reference's clause and the manifest asks for a record nothing produces. Same shape as the
settled list, one moment earlier in the run.

**The critic brief's "Say the same thing about inherited failures, in the briefed critic's
prompt and the red team's alike" vs critic item 7's "unless your prompt names that specific
failure as inherited" vs red team item 5's "One exception, and only where your prompt names
it: a failure it identifies as inherited" — against step 7's "pre-existing failures you did
not cause are recorded as inherited rather than blocking" and Binding's "A house gate that
fails for reasons you did not cause is inherited, not blocking".** Three prompts, five sites,
and until round 17 the only two were the orchestrator-read pair: both reviewers defined
blocking with no inherited branch and neither can derive one. A fresh critic sees a real floor
violation on a host page it was told to gate and files it as blocking — correctly by its own
brief — every round, against a builder who has no diff to make. **The two reviewer copies are
not one sentence stated twice for emphasis.** Each sits inside its own gate's machinery: item
7's inside the floor's first rule, where the verdict it modifies is "the floor governs and
outranks the bound law"; item 5's inside the blocking-versus-polish sort the round counters key
on. A merged sentence has to live in one prompt, which leaves the other reviewer with an
unqualified blocking definition. **What must survive above all is item 7's file-anyway
clause** — "**say exactly that in your return and file it as blocking anyway**". Fold inherited
into the single-theme dispatch line as one more run-level fact and that clause has nowhere to
sit: theme count is a run fact stated once, inherited is granted **per failure**, and a
reviewer left to judge age for itself excuses the defect this phase introduced.

**Critic item 6's "And re-check the current HEAD of any file you are about to name before you
file against it" vs red team item 6's "Re-check the current HEAD of any file you name before
filing against it" vs Binding's "The deliverable can move under you".** Three prompts. The
orchestrator's copy still earns its place and is not a superset: it carries "rebase before you
commit rather than after a push fails", a commit-time obligation neither reviewer holds and
neither could perform. The two reviewer copies differ in the one way that matters to whoever
must obey them — item 6 asks a critic to "say which revision you read it at", while the red
team's states why its exposure is worst ("you run last in the round, so the deliverable has
had the longest to move under you"). Merging them means choosing one prompt to put the rule
in, which is the round-12 defect with a new sentence.

**`## The brief`'s "Inventory before you design: a page never invents a component the kit
already has" vs Binding's "Inventory before you design and show the grep in the report".**
Three prompts, and the plainest instance of the round-12 pattern this round found: every verb
in that rule is a builder's — grep the kit, fill the gap in the system, promote only what is
reusable, escalate rather than building around a missing piece — and it sat in a section the
flow declares orchestrator-only. **The report obligation is deliberately split, not
duplicated**: the builder runs the search and returns it ("**return the grep you ran alongside
your work**"), the orchestrator writes it up ("**the builder runs that grep and returns it with
its work** … you put the result in the report"). Only the builder knows what it searched for,
and only the orchestrator writes a report. Collapse to Binding and the pre-round-17 state
returns; collapse to The brief and a grep comes back to nobody whose job is to publish it.
Accepted cost, on the round-12 precedent: the promote-what-is-reusable rule is now a second
place to update.

**`## The brief`'s "Your escalation must name the house rule, name the floor item it collides
with, and say what you tried that would have satisfied both" vs Modes' "An escalation claiming
this exemption must **name the house rule, name the floor item it collides with, and say what
was tried that would have satisfied both**".** Three prompts, and the halves are a producer and
its verifier: Modes already told the orchestrator to **bounce** an escalation missing any of
the three, and nothing told the builder the three exist. With Modes alone the collision arrives
as prose, is bounced, costs the section a round, and comes back asking for fields nobody had
told the builder to produce. With The brief alone the fields are produced and nothing checks
them, which is where the "verify it before granting it" ruling dies and the exemption from the
three-per-phase cap becomes self-service. **The third field is not paperwork in the builder's
copy**: it ends by telling the builder to run it honestly — where something tried *would*
satisfy both, "there is no collision, and doing that is the answer rather than escalating".
That is an instruction **not** to escalate, and it can only fire inside the prompt of the
agent about to.

**`## The brief`'s "If you generate or regenerate an asset, read `tools.md` beside this skill
first, and read every file you generate" vs Two optional capabilities' "**Read every generated
file yourself before using it** — never report an asset landed without looking".** Three
prompts. Both agents generate images — the orchestrator fans out concept comps in step 4, the
builder regenerates an asset mid-loop against a critic's note — and the rule lived only where
the first can read it. The copies are not interchangeable: the builder's carries the mid-loop
case explicitly, because that is the one where a regenerated file quietly changes the subject,
the palette or the count of things in the frame while the note's own axis is what nobody
re-checks, and it carries a three-way return format (image tool / native art / ask the user)
that is a builder's output and belongs in no orchestrator section.

**Step 4's "each one handed the ledger and The brief's assert-nothing-outside-it rule, exactly
as a builder is" vs the ledger's "every concept-comp agent in step 4".** **One reader, two
moments** — both orchestrator-read. The ledger section is met at step 1, where the thing is
built and its distribution list is set; step 4 is the moment agents are actually fanned out.
Collapse to step 4 and the canonical list of who receives a ledger omits the agents it itself
names as "**the easiest to leave off it**" — they run before the DNA exists and read as
exploration rather than building. Collapse to the ledger and an orchestrator working the flow
has no cue at the dispatch to reopen it, which is the argument the round-15 entry makes for
step 7 scheduling the blind pass. The cost of the omission is not symmetrical with a builder's:
three comps full of invented figures become the DNA the user picks, and every later section
inherits the invention along with the look.

**The direction brief's two boundary statements: the preamble's "Assemble its prompt from this
list — items 1-8 *and the verdict-vocabulary paragraph that immediately follows item 8*, and
nothing after that" vs the Orchestrator-only paragraph's "the adversary's prompt is items 1-8
plus the verdict-vocabulary paragraph above, and ends there".** **One reader, many sites**: two
bold absolutes describing one boundary, in a document whose agents extract bolded clauses as
rules. **This pair carries the worst precedent in this file.** The round-15 entry above
certified a placement the document did not have, and that certification is what stopped anyone
looking — for two further rounds, until round 17 found the vocabulary still sitting outside the
dispatched set and step 5's kill-keyed loop bound still inert. The distinction a merger must
defeat is therefore about **drift, not absence**: neither statement may be updated alone,
because two boundary claims that disagree are indistinguishable from one that is right. Delete
the preamble's clause and the assembler reads "assemble its prompt from this list", stops at
item 8, and restores the round-17 defect exactly. Delete the tail's and nothing marks the
escalation paragraph as undispatched **where that paragraph sits** — and it is the one
paragraph that hands the reviewer whose entire value is willingness to kill a reason not to
kill twice.

**Modes' "One test classifies every other forced question, and the floor collision is not
the only one" vs the six sections that each raise one of those questions.** **One reader, many
moments**, and it is a **classification, not a restatement**: step 5's twice-killed direction,
step 5's missing-fact-that-changes-the-assertion, step 6's twice-deadlocked section, an
unsourceable claim the predecessor carried, a gap in a system repo you cannot write to, and a
clause of the law ruled stale each state the question — and **not one of them says whether
asking it spends one of the three escalations per phase**. Delete the paragraph as redundant
and an orchestrator meeting a second kill at escalation four defers it into a batch or takes a
stated default, both of which are wrong for a question that blocks the phase either way, and
the user is never told the phase stalled. The six source sites still earn theirs: each is where
the question *arises*, and the table is read at the moment of escalating.

**`floor.md`'s "The critic brief requires the orchestrator to hand over this round's renders at
360/768/1440/2560 in every theme: those eight files are it" vs the critic brief manifest's
"**this round's renders** at 360/768/1440/2560 in every theme the run claims (item 1)".** One
reader, two moments, across two files: the manifest states an obligation at dispatch,
`floor.md` states which files discharge it at the moment the harness is driven. **No recorded
incident stands behind this entry** — it is filed on the round-14 manifest precedent, that
working the set out is exactly the labour that never happens, and it is the weakest entry in
this section for that reason. Deleting the `floor.md` sentence leaves an orchestrator to map a
requirement onto a set of filenames mid-dispatch. A reviewer who can show that mapping is
trivial has defeated this one; that argument has not been made, and "it looks redundant" is
not it.

**The capability inventory's staleness row ("run **every** check it names … a stale clause is
escalated, not obeyed") vs the critic brief's "Where the run has ruled a clause of the bound
law stale, state that ruling too, clause by clause where the law names clauses" vs critic item
7's second rule ("unless your prompt marks that clause stale").** The third fact of the shape
the round-11 single-theme entry and the round-13 fragment entry already defend: a rule
suppressed by a run-level ruling the critic cannot observe. **The argument is a hybrid, and the
entry says so rather than picking one of the file's three labels.** The preamble against item 7
is **three prompts** — the preamble is orchestrator-read, a critic prompt is the eight items,
so only item 7's copy is ever dispatched. The inventory row against the preamble is **one
reader, two moments** — both orchestrator-read, the row met once at binding when the verdict is
produced, the preamble met at every dispatch. Classifying the whole entry as either one will
correctly find half of it failing, which proves nothing.

Each of the three collapses into a different failure. **Delete item 7's branch** and a critic
holding the ruling still cannot act on it: the second rule makes a stricter house minimum block
**ahead of the floor**, so the critic blocks the round on a clause this run has already declared
not-to-be-obeyed, and the only diff available to the builder is to obey it — **a deadlock with
no diff in it**. That is a different shape from the inherited carve-out in the same paragraph,
where the defect is real and merely somebody else's; here the *rule* is what the run retired,
and complying with it is the defect. **Delete the preamble's clause** and the verdict is
produced once, at binding, and reaches nobody — the run's own ruling invisible to the one agent
enforcing the law it retired. **Delete the inventory row** and nothing produces a staleness
verdict at all, leaving the preamble instructing the orchestrator to state a ruling no step
makes: the round-15 defect exactly, a pointer at something nothing in the document produces.

**"say "no staleness marker; treat the bound law as current"" is not a restatement and is the
clause most likely to be cut as verbiage.** From inside a prompt, silence and a clean verdict
are the same sentence, so an unstated marker reads as a law with nothing stale in it — which is
the right answer often enough to survive review and wrong exactly when a house does publish one
and nobody ran it. **The granularity is ruled too**: staleness is stated **clause by clause**,
like an inherited failure and unlike the theme count, because a run-level "this law is stale"
retires a whole ratified law on one clause's evidence.

**On the co-location: it is deliberate *and* it is a hazard, and both belong in the entry.**
Deliberate, because inherited failures and stale clauses are both run-level facts only the
orchestrator holds, both are granted by naming rather than by silence, and an orchestrator
assembling a prompt meets them in one breath at the same moment. The hazard is that their
consumers are **not** co-located: the inherited carve-out is consumed by item 7's *first* rule
and red team item 5, the staleness carve-out by item 7's *second* rule. A merger tightening
what reads as one over-long dispatch paragraph therefore removes two unrelated rules in one
edit, and the diff looks like it removed one. Anyone editing that paragraph must check both
consumers, and anyone splitting it must keep both halves inside the preamble — a staleness
sentence moved into item 7 as "tidier" lands in the only prompt that already has the rule and
leaves the orchestrator with no instruction to state the fact.

## Added round 18 — a review of round 17's own diff

Three fixes this round created duplication worth defending; the rest were corrections that
removed a false claim and added nothing. Each entry names what a collapse costs in **both**
directions, per the preamble.

**`## The brief`'s "A clause of the house law your prompt marks stale is not obeyed" vs the
capability inventory's staleness row vs the critic brief's staleness dispatch clause vs critic
item 7's second rule.** This extends the round-17 staleness entry to a **fourth** site and the
argument is that entry's, unchanged — except that the gap it closes is the sharpest of the set.
The round-17 entry defended the row (produces the verdict), the preamble (states it) and item 7
(conditions a critic's verdict on it), and **the agent the row's own words name was not among
them**: "a stale clause is escalated, **not obeyed**", and the only agent that obeys the law is
the builder, which the same row hands the law "by path". Delete The brief's copy and the builder
receives the law, is never told which clauses this run retired, and builds to them — and
**nothing downstream catches it**, because item 7's second rule fires only where the work
*fails* a house minimum and work that quietly complied fails nothing. That is a different shape
from every other collapse in this file: the usual cost is a defect nobody blocks on, and this
one is a retired clause governing the page while every gate reads clean. Delete the row and no
verdict exists to state; delete the preamble's clause and it reaches no critic; delete item 7's
branch and a critic holding the ruling still blocks the round on it. **The "no staleness marker;
treat the bound law as current" wording is deliberately in the builder's copy too**, for the
reason the round-17 entry gives about prompts: silence and a clean verdict are the same sentence
from inside one.

**`## The brief`'s "work from the image-tool instructions handed to you with this brief" vs
`## Two optional capabilities`' instruction to paste them in.** A producer and its consumer,
the round-14 manifest pattern applied to the builder: the bullet tells the builder what to work
from and to say so when it arrives with nothing, the capabilities section tells the orchestrator
to put it there. Until round 18 the bullet said "read `tools.md` beside this skill", which
**resolves to nothing from inside a subagent prompt** — the same defect item 5's crop means had,
fixed the same way. Collapse to the bullet and the instruction points at a file the reader
cannot open; collapse to the capabilities section and the builder is never told to refuse an
invocation it was not given, so it guesses one.

**The red team's routing is deliberately *not* the same mechanism, and that asymmetry is the
entry.** The builder runs the image tool itself, so the invocation detail must be *in its
prompt*; the red team does not — the **orchestrator** invokes Codex at it, so the `-i` ordering
rule stays in `## Two optional capabilities`, where the invoker reads it. Anyone "fixing" the
inconsistency by giving the red team brief a `tools.md` pointer re-creates the exact defect
round 18 removed from the builder bullet, in the one prompt that has no use for the file.

**Deliberately removed, not merged: the reference's floor-failure record no longer names the red
team.** `## The reference` told the orchestrator to put that record in "every briefed critic's
prompt and the red team's", citing a preamble that carries only the briefed-critic manifest, and
no red team item consumes it. The record exists to stop a reviewer **holding the predecessor**
demanding parity on a floor-forbidden defect; the red team is handed no predecessor, and it
receives the record anyway inside the ledger. Re-adding it needs an argument that the red team
can make a parity finding — and note that handing that agent reference material is in tension
with item 1's design, which is that an adversary given the critic's inputs returns the critic's
findings.
