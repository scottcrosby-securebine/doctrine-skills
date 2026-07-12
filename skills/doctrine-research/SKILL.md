---
name: doctrine-research
description: Use when the user asks for deep research done with the doctrine: a multi-source research question that needs a grounded, fact-checked recommendation, dual-engine with red-teaming and looping until confident.
---

# Doctrine Research

Research-synthesis under the doctrine: two independent engines, one merged claim table, honest gaps, a grounded recommendation.

**REQUIRED BACKGROUND:** Read the `doctrine` skill first. There is no code diff here; the doctrine gate runs against the claim table and report instead.

## Flow

1. Ask the user what the request left open: the decision this research informs and its success criteria — write that down verbatim as the **anchor** (every drift check compares against the anchor, never against intermediate findings); scope bounds (timeframe, region, budget, constraints); and the report destination (suggest a `docs/` subfolder of the current project, e.g. `docs/research/YYYY-MM-DD-<topic>.md`).
2. **Round 1 — two engines, blind, concurrent, same refined question:**
   - Engine 1 (Claude): `Workflow({name: 'deep-research', args: '<refined question>'})` — stock, unmodified. (If the bundled deep-research workflow isn't available, substitute a fan-out of parallel web-search agents with per-claim adversarial verification.)
   - Engine 2: the codex:codex-rescue agent if the codex plugin is installed (read-only research task: answer the same question independently with its own web tools; every claim returned with a source URL or explicitly marked model-knowledge). Otherwise a fresh-context subagent with web access — note in the report that engine diversity was reduced.
   - Neither engine sees the other's output in round 1. Independence is what makes cross-examination meaningful; a second engine that critiques your draft is anchored to your frame and finds only your kind of gaps.
3. **Merge** into one claim table: **agree** (both engines) / **conflict** (keep both sides with sources — conflicts are report content, never silently resolved) / **single-engine** (unverified until a second source or check confirms) / **unknown**.
4. **Logic critique**: a dedicated agent reviews your own merged research for unsupported leaps, circular sourcing (many citations tracing to one origin), survivorship and recency bias, conflated adjacent questions, and drift from the anchor. If the data suggests the real question differs from the anchor, raise a **divergence flag to the user** — re-aim or stay is their call; never silently pivot the objective.
5. **Gap ledger**: every unknown and unverified claim gets a ledger entry: what's missing, what was already tried. Each loop iteration = targeted gap-fill fan-out (ledger items only, not a full re-run) → red-team round (refute AND extend the claim table; verify anything it adds from its cited source before it counts) → logic critique re-run on whatever changed.
6. **Exit gate** (doctrine rule 5 adapted): two consecutive loops in which the red team + logic critique surface no new material findings and every remaining gap is closed or written up as unanswerable with the attempts shown. Never fill a gap with a plausible guess — an honest "unknown" outranks an invented fact. Cap 4 loops, then escalate to the user with the ledger as-is.
7. **Deliver**: write the report to the path agreed in step 1 and commit it per the project's norms (doctrine step 7 — the destination was agreed at kickoff, so landing it needs no second ask). Report shape: **Recommendation** (BLUF, grounded in the claim table) → **Findings** ranked by confidence, each cited and tagged both-engines / single-engine / contested → **Conflicts** → **Gaps & unknowns** → **Divergence notes** (if any, and how the user ruled) → **Method appendix** (loops run, sources, red-team rounds). In chat: the recommendation plus anything that needs the user's judgment.

Not for quick fact lookups (plain search) or codebase questions (doctrine-audit).
