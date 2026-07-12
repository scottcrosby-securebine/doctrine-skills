---
name: doctrine-write
description: Use when the user asks for an important document written or rewritten with the doctrine: proposals, briefs, PRDs, handoffs, reports, or any prose deliverable that must be clear, accurate, and airtight.
---

# Doctrine Write

Prose as the deliverable, under the doctrine. Covers authoring from scratch and rewriting existing text; in rewrite mode the existing text enters as draft 1 with the author's meaning preserved — tighten the words, don't change the claims.

**REQUIRED BACKGROUND:** Read the `doctrine` skill first. Native checks for a prose diff (doctrine step 3) = the review-lens wave plus the traceability audit below. Designated review: the `writing-clearly-and-concisely` skill (Strunk's Elements of Style; in softaworks/agent-toolkit and elsewhere) if installed — have the clarity lens Read its `elements-of-style.md`. Fallback: a clarity lens prompted with Strunk's core rules (omit needless words, active voice, definite concrete language, one idea per paragraph).

Boundaries: doctrine-docs owns codebase-doc sweeps; doctrine-research owns producing researched content. This wrapper is for when the writing itself is the deliverable; chain it after either.

## Flow

1. Ask the user what the request left open: **audience and what the reader should know or do afterward** — write that down verbatim as the doc's **anchor** (every review lens checks against it); register, format, length; source material; destination. For the highest-stakes docs, offer the **judge panel** here: 2–3 parallel drafts in genuinely different structures, judged, best one synthesized. Off by default — it triples drafting cost.
2. **Ground**: build a claim ledger from the source material — every fact and number with its source line. No web-sourced claims unless the user authorizes external sourcing. A gap becomes an explicit unknown in the doc, never a plausible guess.
3. **Draft in one voice** — written directly, not delegated section-wise: parallel agents drafting sections of one document produce Frankenstein prose. The doctrine's parallelism belongs in review, not drafting. (Rewrite mode skips this step; the provided text is draft 1.)
4. **Review wave** — parallel independent lenses, none of them the author (the author self-reviewing preserves author blindness):
   - **Clarity**: Strunk rules via writing-clearly-and-concisely (or the fallback prompt); findings with line references.
   - **Accuracy**: every checkable claim against the ledger and sources; an unsourced claim is cut or moved to unknowns. In rewrite mode, unsourced claims in the user's own text are flagged to them, not unilaterally cut, and the lens also diffs against the original for semantic drift — rewrites compress and clarify, never alter claims.
   - **Audience fit**: does each section serve the anchor? What would this specific reader skip, misread, or push back on?
   - **Structure**: BLUF first, one idea per paragraph, headings that earn their place, length within the agreed bound.
   Merge and dedupe findings; edit.
5. **Red team** (doctrine step 4): the red team reads the doc as the hostile reader — where it got confused, misled, or bored, plus the strongest case against the doc's conclusion. Verify each finding against the ledger before acting; adversarial reviewers produce false positives.
6. **Loop** (doctrine rule 5): two consecutive clean passes of lens wave + red team; after 4 loops, escalate. Simplification applies to prose: redundancy and decoration get deleted, not polished — "shorter says the same" counts as a finding.
7. **Deliver**: write the doc to the destination agreed in step 1 and commit it (doctrine step 7: work is not done until it lands). The kickoff agreement IS the authorization — do not ask again before committing, and do not downgrade to "committing only if asked". In chat: the doc's one-line thrust plus anything needing the user's judgment.

Not for quick edits or informal messages — a single clarity pass covers those.
