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

## Settled alongside it

**All ten Red flags pass the silence criterion.** Two carry content found nowhere else
and are not compressions at all: the wholly unstyled page (a server started without its
build step), and the `pkill -f` / `pgrep -f` entry. The closest to failing is "a floor
item reported as passing when the harness never measured it" — `[UNMEASURED]` and exit
code 3 *are* an alarm — but the same entry covers the `[JUDGE]` path, where the harness
prints a question and nothing fails if no critic answers it. That path is genuinely
silent, so the entry stays.
