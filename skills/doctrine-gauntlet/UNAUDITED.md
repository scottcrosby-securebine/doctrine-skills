# The unaudited passes — findings, and what became of them

Two passes so far have been pointed not at a session's diff but at **territory no earlier pass
had examined**. Both paid, and the second paid harder than the first.

- **The first**, after eleven gate rounds against one session's diff, read the red team's
  prompt, the builder's floor knowledge, the ledger's storage, the orchestrator's own
  recoverability and the harness manual against the harness. Twelve defects in text nobody had
  touched. Rounds 12 and 13 fixed them.
- **The second** was round 17: three lenses, about **fifty findings**, six of them HIGH. All
  fixed in the same round.

**This file is a status record, not a queue.** It is kept because the *reasoning* is worth more
than the diffs: findings that were ruled the other way, findings that turned out half wrong,
and the costs accepted on purpose so a later reviewer does not rediscover them as defects. The
duplications either pass created are recorded in `do-not-merge.md` instead; what is here is
what was *wrong*, and what was decided about it.

## Why they survive

Not severity — **attention**. Every gate round asks "is the new text sound?", and this was old
text. The first pass's finding #1 is HIGH, trivially verifiable, and sat untouched through all
eleven rounds. **Scope is a filter on where people look, not on what is wrong.**

Round 17 sharpened that lesson in the worst possible way. Its third HIGH had been **recorded as
already fixed** — `do-not-merge.md`'s round-15 entry certified a placement the document did not
have, and the certification is precisely what stopped anyone looking for two further rounds. A
register is a lens too, and a wrong one is worse than none.

---

## The first widened pass — twelve findings, fixed in rounds 12 and 13

Nine of the twelve are one class: **a correct rule sitting where the agent who must obey it
never reads.** That is structural. The architecture assembles fresh-context prompts from named
sections, so any rule written in a section no prompt draws from is invisible to the agent it
governs — and nothing mechanical catches it. Every claim was verified against the file or the
code, and provenance checked: all twelve predate the session that found them except #12.

| # | Finding | Fix landed |
|---|---|---|
| 1 | `## The reader test` never reached a critic, while Modes made failing it blocking. Item 3 listed its six axes as bare noun phrases | round 12 — the question and all six axes are now inside critic brief item 2, runnable as written; item 3 points at item 2, inside the same prompt |
| 2 | The red team had **no brief at all** — invoked four times, briefed zero — while Technical floor assigned it print duty in a section it never receives, in the same sentence that says "an instruction with no assignee is an instruction nobody executes" | round 13 — a fourth brief section, `## The red team brief`, six items; step 7 now assembles from it; the ledger's distribution list gained the red team |
| 3 | `## What a critic may conclude` reached no critic, though its rules are discharged *before filing* | round 12 — copied into critic brief item 6. The right/wrong/**stale** triage was deliberately **not** copied: that is the orchestrator's disposal of a returned review |
| 4 | "A builder may not cite a PROPOSED item as a constraint" never reached a builder — the recorded incident is a builder deleting a client's certification logos on an unruled item | round 12 — a bullet in the builder's assert list |
| 5 | The builder was told the house outranks its brief, pointed at precedence it cannot read, and given four words of floor | round 12 — the precedence fact and the floor's authorable substance now sit in `## The brief`. Build-then-measure was weighed as a defence and rejected: no gate can correct a builder told the wrong precedence |
| 6 | The ledger was the only durable artifact with no path, while being handed to more fresh contexts than the DNA or the docket | round 13 — `docs/design-ledger.md`, or the bound system's docs location, or the scratchpad |
| 7 | The orchestrator's counters existed only in its own context, unrecoverable after compaction and undetectable when lost | round 13 — the round report now carries every counter value, escalations spent, and docket-item age |
| 8 | The fidelity tie instruction targeted a critic that item 8 denies the comparison verdict | round 12 — **ruled the other way and re-aimed**, not duplicated. Only the orchestrator can act on it |
| 9 | The direction adversary was never asked whether the direction is buildable under the floor | round 13 — direction brief item 8, appended so nothing renumbers |
| 10 | `floor.md` said a `--crop` miss is `[UNMEASURED]`; the code routes it to `[JUDGE]`, and `floor.md`'s own output section agreed with the code | round 13 — corrected against `floor.mjs`, and the correction names where the real block comes from |
| 11 | `tools.md` stated "never a wholesale replace" absolutely while `SKILL.md` carves out the empty-project case — and `tools.md` is the designated fast path | round 13 — the exception now travels with the rule |
| 12 | `--fragment` suppresses theme-reachability and frozen-type, and no rule told the orchestrator to state that condition | round 13 — the critic-brief preamble states it; item 7's first rule carries the carve-out |

### A correction to that pass's own findings

**#12 was half wrong as filed.** It named critic brief items 1 *and* 7. Round 13 verified
against `floor.mjs` that `--fragment` suppresses no `[UNMEASURED]` line — a one-theme fragment
run still reports "only the X theme was rendered" unless `--single-theme` is also passed — so
**both themes really are rendered** and item 1's render set was correct as written. Editing it
would have been a false parallel to the single-theme case, in the longest item in the file.
Only item 7 needed the carve-out.

### Accepted costs

- The floor's substance is now a second place to update when the floor list changes; the reader
  test's axes a second place when an axis is added. That is the same cost taken deliberately
  for item 7's inline floor list and item 5's crop means. **A pointer instead is the fix that
  failed three rounds running.**
- The red team's brief duplicates the ledger check and the observed/derived/assumed rule. Its
  axes deliberately do **not** duplicate the critic's — an adversary handed the critic's axes
  returns the critic's findings.
- Round 13 exempted a builder's forced escalation from the three-per-phase cap. The opposite
  ruling is defensible and stricter; the exemption is bound to one named clause rather than to
  "blocking questions" generally, precisely because the abuse surface is real. **Round 17
  widened it anyway** — see the forced-question set below — which is the kind of drift this
  entry exists to make visible.

### Closed since

All three items that pass listed as open were fixed in round 16, and the sections it named as
unexamined were audited in round 15 — which found eleven more defects in them, listed in
`do-not-merge.md`'s round-15 entry rather than here.

- **The round report's durability** — the counters now also go to disk, in a `## Run state —
  orchestrator only` block in the ledger file, with an explicit carve-out that the block is
  handed to no agent. A critic holding *rounds since check-in: 5* has been told how badly this
  round needs to be clean.
- **`floor.md`'s `--fragment` entry** now states that it suppresses no `[UNMEASURED]` line, the
  one-theme line included — verified against the code, where that push is gated on
  `--single-theme` alone.
- **Non-text contrast's "yours"** now names the critic under item 3, with the red team free to
  re-run it under its own item 1.

---

## The second widened pass — round 17, about fifty findings

Three lenses, each aimed at territory no prior pass had examined:

- **Reachability** over `Binding the design system`, `Modes`, `The reference` and `Flow` — for
  every fact a prompt is *conditioned* on, which step produces it?
- **Doc versus code** over the harness — does `floor.md` describe what `floor.mjs` does?
- **Repo coherence** over `do-not-merge.md` and the files `CLAUDE.md` says must stay in sync.

The dominant class is the **inverse** of the first pass's. That pass found correct rules where
their agent cannot read them; this one found correct rules **conditioned on facts nothing
establishes** — a carve-out granted by a sentence no step writes, an artifact four prompts are
handed and no section defines. A rule nobody can trigger fails as quietly as a rule nobody
receives, and it fails looking like compliance.

### The six HIGH

| # | Finding | Ruling / fix |
|---|---|---|
| 1 | The single-theme and fragment facts are consumed by **three prompts** and produced by **no step**. Nothing asked the user, so the orchestrator infers from discovery — and a source tree with one palette is equally a one-theme site and a site whose second theme somebody deleted. Guess "one" and the reachability probe is suppressed, item 7's carve-out makes the absent second theme not a finding, and **a dead palette exits the phase clean** | step 2 now asks both, in words, with discovery's evidence as input and not as the answer; both are recorded in the ledger because they are run parameters a compaction takes |
| 2 | Cross-page blast radius had an ambiguous assignee and produced no artifact: the integrated critic is handed this deliverable's renders and nothing else, so a sibling page comes back silently perfect | step 7 assigns it to the orchestrator explicitly — grep the consumers of any shared token, stylesheet or component the round touched, render each at 1440 in both themes, look, and **name in the round report every consuming page you could not render** |
| 3 | The direction adversary's **KILL / WEAKEN / CLEAR** vocabulary sat *outside* the "items 1-8 and nothing after them" boundary, so the classifier was never asked to classify — and step 5's one revise-and-reapprove cycle, which fires on "whatever the adversary kills", was bound to a verdict nobody could file. **The whole loop bound was inert.** `do-not-merge.md` recorded this as fixed in round 15, on a placement claim the file did not have | the boundary now names the vocabulary paragraph explicitly at both sites; the round-15 entry is rewritten as a live warning rather than a certification |
| 4 | axe's **`incomplete`** bucket was discarded. "Ran the rule and could not decide" is the definition of unmeasured, and undeterminable contrast printed *identically to measured-and-clean* while the skill told the orchestrator contrast had been measured and not assumed | the bucket is read and split — contrast ids to `[UNMEASURED]`, everything else to `[JUDGE]` |
| 5 | `floor.md` said the `[JUDGE]` lines "always print". False for five of eight. A critic told to expect a line it never receives has grounds to declare an abstention, and an abstention blocks exactly like an unmeasured floor item | the Output section now splits unconditional from conditional and states each condition |
| 6 | Failed images printed an undocumented `?` and gated nothing | `[UNMEASURED]`, with the `?` documented — see the ruling below |

### The axe finding was confirmed in the field, and the confirmation was wrong the first time

A live production build returned `color-contrast x124` in `incomplete` at 1440 **in both
themes**, while the harness printed no contrast line at all and exited `0 PASS`.

**The first empirical measurement of that reported `x1`** — and that is the most useful thing
in this register. `resultTypes: ['violations']` does **not** suppress the incomplete bucket; it
truncates every entry in it to a single node. **The verifying instrument carried the same
defect it was verifying**, and reported a number that was an artifact of its own options
object. The fix names `'incomplete'` in `resultTypes` **for its node counts**, not to fetch the
bucket, and the code says so where the next reader will meet it. Any count this harness prints
that can be changed by the options object is a count it must not print.

### Rulings that went a particular way, and why

- **Contrast-incomplete blocks; every other incomplete id goes to a critic.** The floor list
  requires text contrast *measured*, so a contrast nobody could compute is a floor item this
  run does not have. The rest of the bucket names no floor item and carries real noise, and a
  blanket block would make the gate **unclosable on ordinary pages** — which teaches people to
  waive `[UNMEASURED]` by reflex, at which point the contrast line gets waived with everything
  else. The split is what keeps the one that matters expensive.
- **Failed images are `[UNMEASURED]`, not a gate failure.** The harness cannot distinguish a
  dev-server 404 from a dead source — but under *either* reading the renders every critic is
  about to grade **are not the artifact**, which is a gap in this run rather than a design
  question. Graded as design instead, it becomes the campaign whose client's complaint was that
  the pages had no identifiable photographs. Two cases are deliberately not counted, both
  verified in Chromium: an `<img>` with no `src` is deliberate blank markup, and a sizeless SVG
  reports the 150x150 default rather than 0.
- **`--expect` freshness was refused.** Nothing observable from inside a rendered page
  distinguishes a current build from a stale one unless the build itself put it there, so a
  freshness flag would measure **the caller's promise** — the one thing this harness exists not
  to do. The zero-code answer is documented instead: point `--expect` at a string that changes
  with the build. One residue is stated honestly rather than papered over — where the change is
  purely visual, `--expect` cannot see it at all.

### One gate was deliberately loosened

"Run the gate against a *consumer* of a distributable artifact" previously blocked with **no
possible satisfying artifact** on a card phase against a registry-publishing kit: nothing in
the flow produces a consumer, and a blocking gate item nothing in the run can satisfy fails the
phase forever while looking like rigour. It now has a build-the-minimal-consumer path — a
throwaway page importing through the published entry point, gated like any other — and a
record-as-unrun fallback **bounded to "none exists and none can be built"**. The capability
inventory's own rule governs: every absent line is a fallback, not a blocker.

This is the one loosening in the round, and it is the kind worth watching: the fallback is
correct and the bound is what keeps it honest.

### Accepted costs

- **Exit 3 becomes common on image-heavy sites.** That is the intended behaviour and also the
  risk: **watch for reflexive waiving**, because a habit of waiving `[UNMEASURED]` is what would
  make this patch worse than useless — it would take the contrast line with it.
- **`inc.startsWith('color-contrast')` is a prefix test.** If axe renames the rule, contrast
  silently demotes from `[UNMEASURED]` to `[JUDGE]`. Nothing tests for that today.
- **Three in-browser caps were removed** so the totals could be printed with the capped lists —
  crowded undersized targets, spec-exempt lone targets, and the reduced-motion hidden list.
  Three arrays grow to full length before they are trimmed at print time; the clipped-elements
  cap was deliberately kept inside the page and made to return its total alongside its three. Capping in the page
  threw the total away before anyone could state it, and a silent cap is how a builder fixes
  "the 6 undersized targets", ships the seventh, and reads the next round's identically-capped
  report as a fresh finding.
- **`floor.md` grew by roughly ninety lines**, and its Output section is now the longest thing
  in it. That is the price of the doc-versus-code lens: five of eight `[JUDGE]` lines needed
  their conditions written down, and a prefix table needed to exist at all.
- **The forced-escalation set was generalised** from the single named clause round 13 bound it
  to, into a six-item classification in Modes. Round 13's entry above argues the narrow binding
  was deliberate. This is a considered widening, not an oversight — but it is the entry to
  re-read if forced escalations start outnumbering the three-per-phase cap.

### The field test ran too

The harness passed clean on a **real project it was never developed against**, and the binding
rule's three clauses each fired live: a declared relative path that does not resolve from a
clone, an override variable unset in a fresh context, and docs giving a concrete value in a
gate table. A rule that has only ever fired against the design system it grew up beside is not
yet a general rule.

---

## Round 18 — a review of round 17's own diff

Round 17 fixed about fifty findings in one round. Round 18 pointed a fresh reader at **that
round's diff** rather than at new territory, and what it found is the class a large single-round
fix produces: text that is internally correct and **wrong about the document around it** — a
position claim about a boundary that had just moved, an attribution to critic item 4 of the
instruction item 4 forbids, a fallback bound looser than the round that recorded it, a
definitional sentence orphaned by an insertion above it, and new pointers aimed at files the
prompts holding them cannot open.

Three findings are worth carrying whatever else the round does:

- **The file's own worst failure mode, reproduced inside the entry that records it.**
  `do-not-merge.md`'s verdict-vocabulary entry was rewritten in round 17 *because* its old
  placement claim was false — and the rewrite carried a new one, contradicted by both live
  boundary statements sixteen lines above the warning that says to check them. The entry now
  states no placement at all. "A register is a lens too" is not a lesson this project has
  finished paying for.
- **A ruling that reached every reader except the one who acts on it.** The staleness verdict
  reached the orchestrator and the critic and never the **builder** — the agent that obeys the
  law, and the one the inventory row's "not obeyed" is about. Nothing downstream catches a
  builder that *complied* with a retired clause, because the critic's rule fires on work that
  fails a house minimum. `## The brief` now carries it.
- **The one loosening of round 17 had drifted looser still.** The consumer-gate fallback is
  recorded above as bounded to "none exists and none can be built"; the text shipped listing
  "no write authority" as an impossibility, which step 9's scratchpad path equips — so any
  read-only run could cite it verbatim and record a runnable gate item as unrun. Retightened
  against the bound recorded here. The register was right and the document was wrong, which is
  the direction this file is for.

Nothing above should be read as a closed count. What is recorded is what the diff review found.
The audit of the hub and the wrapper set ran separately, and its findings are below.

## Round 19 — the six remaining wrappers, and a restatement is worse than silence

`doctrine-code`, `doctrine-debug`, `doctrine-audit`, `doctrine-docs`, `doctrine-research` and
`doctrine-write` had never been read critically. About forty-three findings, nine HIGH, all
fixed in `d434e92`. The class that ran through most of them: **a wrapper that restates a hub
rule locally has forked it.** Silence inherits the base rule and sends the reader to the source;
a truncated echo reads as authoritative and stops them going. `doctrine-code` said parallel
waves need "disjoint files or worktrees" and stopped one clause before the correction that
matters — in the one wrapper whose verification is a screenshot. `doctrine-research`
re-installed the "no *new* findings" test the hub had just removed. `doctrine-write`'s valve
counted loops rather than blocking rounds, the exact failure the hub names by hand.

The generalisation, which is why it is recorded here rather than in a commit message: **when a
base rule is corrected, the fix does not propagate — the stale copy actively blocks it.** Grep
every dependent for restatements before calling a base fix done.

## The hub gained an anchor; this wrapper's critic list does not name it

Round 20 hoisted **the anchor** into hub step 1 and made it *"handed to every dispatched agent
whose job is to judge work against intent."* A critic is exactly that, and `## The critic brief`
opens with a **closed** assembly list that never uses the word. Deliberately left alone: the
gauntlet's equivalents are already in that list under their own names — the named target reader,
the one job for this surface, the DNA, the brief — so nothing is missing from any prompt, and
adding a synonym to a closed enumeration buys a reader nothing but a second name for what they
already hold. Recorded because a closed list that omits a generally-stated obligation is the
shape that later reads as a gap: if a future round adds an anchor line here, check first that it
is not the fifth name for the same artifact.

## A cost accepted on purpose — section-level render breadth

Filed round 9, ruled round 20: **no change**. Critic brief item 1's eight configurations reach
every step-6 section critic (the preamble's *"only the floor report differs"*), so a 5-section
page with two retries each renders 120 configurations against a 3-round gate's 24. The filing
read that as 5x the integrated gate; on **images read into an agent context** it is 1.25x — and
the reason matters, because the obvious one is wrong. A gate round is *not* one 8-file set read
three times over; that would be 24 a round, 72 across a three-round exit, and 1.67x. The blind
pass reads **matched pairs** (The comparison), so a reference round is 16 paired images plus 8
for the integrated critic plus 8 for the red team — 32 a round, 96 in all. On a **no-reference**
run there are no pairs to build, so the round is 16 and the ratio is 2.5x. Every narrowing was
priced against the reset rule: the largest defensible one (drop 768 at section scope) removes 2
configurations from each of 15 section renders — **30 images, not the 15 that a count forgetting
the second theme gives** — against ~96 on a single miss, since a blocking finding at step 7 costs
the round plus two fresh clean rounds. Break-even is one in 3.2: the narrowing must be right
three times in four merely to pay for itself, which makes it a bet rather than a cost
optimisation. Rejected in full — including narrowing the *retries* to the width a finding named,
which item 2 refutes directly (*"judge any fix at 360 before 1440"*) and which would also
destroy the persisting critic's own before/after delta.

**One honest cost is accepted here, and it is not the spend.** The 2560 section render buys one
of the two defects that live above 1440, not both: growing images are visible in a single
render, but frozen type needs the 1440-to-2560 delta the harness prints as `[JUDGE]`, and there
is no floor report at section scope. That class surfaces at step 7 and nowhere earlier. It stays
that way because its fix is the root font size — a page-level edit a section builder is not
sanctioned to make.

---

## What this list is not

**Exhaustive, and it never was.** Its own prediction has now held twice. The first pass
predicted more, and round 15 found eleven further defects in `## The comparison`, the docket's
destinations and the direction brief — including a section whose central protection was
delivered by an instruction two other lines forbade executing. Round 17 then found about fifty
in territory nobody had aimed at, six of them HIGH, in a file that had been reviewed sixteen
times.

The lesson is not that any list was short. It is that **scope is a filter on where people look,
not on what is wrong** — every widening so far has paid, and the second paid more than the
first. Round 17 adds the sharper half: **a register is a lens too.** Its worst finding was one
this project had already certified as fixed, and the certification is what kept anyone from
looking. Verify an entry against the document before citing it, here and in `do-not-merge.md`
alike, and treat "already handled" as the claim most worth re-testing.
