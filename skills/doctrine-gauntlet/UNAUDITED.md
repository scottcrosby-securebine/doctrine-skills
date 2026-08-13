# The unaudited pass — findings, and what became of them

Eleven gate rounds ran against **one session's diff**. A twelfth pass was pointed instead
at territory no earlier pass had examined — the red team's prompt, the builder's floor
knowledge, the ledger's storage, the orchestrator's own recoverability, the harness manual
against the harness — and found twelve defects in text nobody had touched. Rounds 12 and 13
fixed them.

**This file is a status record, not a queue.** It is kept because the *reasoning* is worth
more than the diffs: two fixes were ruled the other way, one finding turned out to be half
wrong, and the accepted costs are written down so a later reviewer does not rediscover them
as defects. Every claim below was verified against the file or the code, and provenance was
checked — all twelve predate the session that found them except #12.

## Why they survived eleven passes

Not severity — **attention**. Every pass asked "is the new text sound?", and these were old
text. Finding #1 is HIGH, trivially verifiable, and sat untouched through all eleven,
because scope is a filter on where people look, not on what is wrong. Widening the lens by
one step found twelve defects in about ninety minutes.

Nine of the twelve are one class: **a correct rule sitting where the agent who must obey it
never reads.** That is structural. The architecture assembles fresh-context prompts from
named sections, so any rule written in a section no prompt draws from is invisible to the
agent it governs — and nothing mechanical catches it.

## Fixed

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

## A correction to this register's own findings

**#12 was half wrong as filed.** It named critic brief items 1 *and* 7. Round 13 verified
against `floor.mjs` that `--fragment` suppresses no `[UNMEASURED]` line — a one-theme
fragment run still reports "only the X theme was rendered" unless `--single-theme` is also
passed — so **both themes really are rendered** and item 1's render set was correct as
written. Editing it would have been a false parallel to the single-theme case, in the
longest item in the file. Only item 7 needed the carve-out.

## Accepted costs, written down so they are not rediscovered as defects

- The floor's substance is now a second place to update when the floor list changes; the
  reader test's axes a second place when an axis is added. That is the same cost taken
  deliberately for item 7's inline floor list and item 5's crop means. **A pointer instead
  is the fix that failed three rounds running.**
- The red team's brief duplicates the ledger check and the observed/derived/assumed rule.
  Its axes deliberately do **not** duplicate the critic's — an adversary handed the critic's
  axes returns the critic's findings.
- Round 13 exempted a builder's forced escalation from the three-per-phase cap. The opposite
  ruling is defensible and stricter; the exemption is bound to one named clause rather than
  to "blocking questions" generally, precisely because the abuse surface is real.

## Closed since

All three items this file listed as open were fixed in round 16, and the sections it named
as unexamined were audited in round 15 — which found eleven more defects in them, listed in
`do-not-merge.md`'s round-15 entry rather than here.

- **The round report's durability** — the counters now also go to disk, in a
  `## Run state — orchestrator only` block in the ledger file, with an explicit carve-out
  that the block is handed to no agent. A critic holding *rounds since check-in: 5* has been
  told how badly this round needs to be clean.
- **`floor.md`'s `--fragment` entry** now states that it suppresses no `[UNMEASURED]` line,
  the one-theme line included — verified against the code, where that push is gated on
  `--single-theme` alone.
- **Non-text contrast's "yours"** now names the critic under item 3, with the red team free
  to re-run it under its own item 1.

## What this list is not

**Exhaustive, and it never was.** Its own prediction held: a pass pointed at `## The
comparison`, the docket's destinations and the direction brief found eleven further defects,
including a section whose central protection was delivered by an instruction two other lines
forbade executing, and a control-flow bound keyed to a verdict word the classifier was never
given. The lesson is not that the list was short — it is that **scope is a filter on where
people look, not on what is wrong**, and every widening so far has paid.
