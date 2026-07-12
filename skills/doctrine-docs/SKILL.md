---
name: doctrine-docs
description: Use when the user asks for a documentation sweep: reviewing the codebase so all docs reflect the current implementation, updating stale docs, covering undocumented features, then opening a PR. NOT for bug hunts or code changes.
---

# Doctrine Docs

Documentation sweep under the doctrine. Docs-only: no code changes, no bug fixing. If a doc-vs-code mismatch turns out to be a code bug, file it on the project's tracker and update the doc to describe actual behavior with an annotation ("currently does Y, see issue #N; intended X"), so the doc is neither wrong today nor silently enshrining the bug.

**REQUIRED BACKGROUND:** Read the `doctrine` skill first. Native checks for a docs diff (doctrine step 3): re-verify every edited claim against source, plus a link/path/command check. Designated review: the red-team pass in step 5 (it serves as both review and red team here; it runs once per pass, not twice).

Two axes, run as parallel sub-agents so they don't pollute each other's context:

- **Accuracy**: for each doc, verify every checkable claim (paths, commands, env vars, endpoints, flags, behavior) against the current source. Report stale claims with `doc-file:line` → evidence in code.
- **Coverage**: walk merges since the last docs sweep (ask the user for the horizon if unknowable) and the module list; find shipped features and behavior changes no doc mentions. Report gaps with the code evidence a writer needs.

## Flow

1. Ask the user the scope questions their request didn't answer: which doc trees count (README, docs/, CLAUDE.md, playbooks), the Coverage horizon, and one PR or split by area for a big sweep (default: one PR).
2. Inventory the doc surface, split into areas, and run both axes per area as parallel waves. Merge and dedupe the two axes' findings per area before editing; when they disagree, the code is the arbiter.
3. Verify every finding against source before editing: a "stale" doc that's actually correct is the false positive to fear here.
4. Edit: fix Accuracy findings, write Coverage gaps. Match each doc's existing voice and structure; use writing-clearly-and-concisely if installed, else apply Strunk's core rules (omit needless words, active voice, definite concrete language). Simplicity applies to prose too: delete redundant docs rather than maintaining duplicates. Treat agent-instruction files (CLAUDE.md, AGENTS.md) with extra care: edits there change agent behavior, so flag them separately in the PR.
5. Red team (doctrine step 4): give it the doc diff and ask it to find claims that are still wrong or newly introduced errors. Verify, fix, loop to two consecutive clean passes (doctrine gate, including its 4-loop escalation valve).
6. Open a PR with the sweep summary: docs touched, stale claims fixed, gaps filled, bugs filed.
