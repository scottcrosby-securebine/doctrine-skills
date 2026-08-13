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

**Critic brief item 5's crop mechanism vs the same mechanism under Technical floor.** Item 5
carried the standard ("read the images at shipped size") and none of the means; `--crop`, the
other-harness region shot and the source-geometry last resort lived only in Technical floor,
which — exactly like the inline floor list in item 7 — carries no orchestrator-only
declaration and is nonetheless never delivered to a critic, because a critic prompt is the
eight items and nothing else. A critic handed full-page screenshots then reports item 5
satisfied having reviewed each figure at a tenth of its size, which is the incident that
section itself records. The Technical floor copy still earns its place: the orchestrator is
who decides to pass `--crop` when it renders for a critic. Same rule as item 7 — naming a
test is not handing it over.
