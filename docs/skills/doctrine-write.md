# doctrine-write

Use `doctrine-write` when the document itself is the deliverable: a proposal, a brief, a PRD, a handoff, a report, or any prose that must be clear, accurate and airtight. One author drafts from a ledger of sourced claims, the project's native checks and four review lenses check the draft, a red team reads it whole, and the run loops until one pass of the gate comes back clean or, if the round alarm fires first, one closing round ends it.

![The doctrine-write figure. Top row, before the draft: Ask records the audience and what the reader does afterward as the anchor, Ground builds a claim ledger with a source line per fact, and Draft is written in one voice. Bottom row, the gate: native checks run on the draft, and the draft and its pasted ledger fan out to four lenses (clarity, accuracy, audience fit, structure), which feed one red team, followed by the prose-deliverable exit. Notes list what blocks, that simplification runs once before the certifying pass, that a fact missing from the ledger is not asserted, and that delivery commits by the repository's norm.](doctrine-write.png)

## When it fires

It fires on a request for an important document written or rewritten "with the doctrine". It loads the `doctrine` skill first, and the hub supplies the posture this page refers to as doctrine steps 1 to 7.

It has two modes:

- **Authoring.** The run writes the document from the source material you supply.
- **Rewrite.** Your text enters as draft 1. The run tightens the words and keeps your meaning, so it never changes a claim the sources do not refute. A claim a source line contradicts is corrected to what that line says, recorded in the ledger, and named to you at delivery.

Two neighbours own nearby work. `doctrine-docs` owns sweeps of a codebase's documentation, and `doctrine-research` produces researched content. You can run `doctrine-write` after either one, for example to write a document from what `doctrine-research` found.

It is not for quick edits or informal messages. A single clarity pass covers those.

## What it asks you

Before anything is drafted, the run asks what your request left open:

- **Audience, and what the reader should know or do afterward.** Your answer is recorded verbatim as the document's anchor, and every lens grades against it.
- **Register, format and length.** A length bound is recorded in one unit only: the unit you named, or words if you named none. Every length the run measures, of your original and of each draft, is recorded with the command that produced it (`wc -w <file>` for words), so rerunning that command on the same text gives the same count.
- **Source material.** The run uses no web sources unless you authorize them.
- **Destination:** where the finished file lands.

A question whose answer changes how the work is aimed blocks the run until you answer it. It never becomes a default (doctrine step 1).

For the highest-stakes documents it also offers a **judge panel**. Two or three agents each write a whole draft in a different structure. A fresh-context judge reads the drafts under neutral filenames, so it cannot rank them by author. It asks one question: which structure gets this reader to what they must know or do, and what does each losing draft do better? The run then writes up the winner, folding in what the judge salvaged. The panel is off by default because it triples drafting cost, and if you take it, it runs after the ledger is built.

## How a run goes

1. **Ask**, as above.
2. **Ground.** The run builds a claim ledger from your sources: every fact and number the document may assert, each with its source line. A fact missing from the ledger is not the document's to assert. A gap in the sources appears in the document as an explicit unknown, never as a plausible guess.
3. **Draft in one voice.** The run writes the draft itself. It never hands sections to parallel agents, because stitched sections read as several authors. Rewrite mode skips this step.
4. **Review wave.** Four lenses run in parallel, and none of them is the author:
   - **Clarity** applies Strunk's rules through the `writing-clearly-and-concisely` skill and returns findings with line references.
   - **Accuracy** checks every checkable claim against the ledger, and each ledger line against the source it cites. An unsourced claim is cut or moved to unknowns. In rewrite mode the lens flags an unsourced claim in your own text instead of cutting it, the run puts it to you, and your ruling goes into the ledger for the next round's lenses. This lens also compares a rewrite with your original for any change in meaning.
   - **Audience fit** asks whether each section serves the anchor, and what this reader would skip, misread or push back on.
   - **Structure** checks for the bottom line first, one idea per paragraph, headings that earn their place, and length within the agreed bound.

   Once the four return, the run merges their findings, drops duplicates and edits the draft.
5. **Red team** (doctrine step 4). After the wave, an adversary reads the whole document as a hostile reader. It reports where it got confused, misled or bored, and the strongest case against the document's conclusion. Each finding is checked against the ledger and the sources before anything changes, because adversarial reviewers report false positives.
6. **Loop** until the gate exits, as described below.
7. **Deliver** (doctrine step 7), as described in "How it ends".

## The anchor and the claim ledger

Both live in one file, built before a word is drafted. By default it sits beside the destination as `<doc>-ledger.md`. It goes instead in your project's place for working notes where there is one, or in the session's scratchpad where the repository is not writable or you want no working files in it. The report names the path, and at delivery the run asks whether the ledger ships with the document or is dropped.

The file is amended and never frozen. It takes in later sources, your rulings on flagged claims, corrections to refuted claims, and every red-team finding verified or refuted. Run state, such as the round counters, goes under a trailing `## Run state (orchestrator only)` heading that no reviewer is handed.

The run pastes the file into every prompt rather than pointing at its path, along with what each reviewer grades against:

- Every lens and the red team get the list of what blocks in a document, beside the hub's general definition of a blocking finding.
- Accuracy and the red team get the source material itself. An accuracy lens handed only the draft reports that the claims look sourced, which is also what an invented fact looks like.
- Audience fit, structure and the red team get the register, length bound and format you agreed.
- In rewrite mode, accuracy and the red team get your original text.

The clarity method is resolved before any seat goes out. The run finds the installed `elements-of-style.md` and hands the lens and the red team its absolute path, with an instruction to read it. Where the skill is not installed, both seats get Strunk's core rules inline: omit needless words, use the active voice, prefer definite and concrete language, and keep one idea per paragraph.

## The gate

The gate is the hub's full three parts: native checks, the review wave, and the red team.

**Native checks** (doctrine step 3) are every check your project documents as a gate for the place the document lands. That means a prose or markdown linter such as `vale` or `markdownlint`, a docs build, or a link, spelling or frontmatter check, whatever your `CLAUDE.md`, README, review checklist or task runner lists. The run reads your `package.json` scripts or their equivalent itself, because a project with no build step still has gates. On top of those it re-verifies every edited claim against its source and checks every link and path. Where the destination has no tooling, that re-check is the whole of native checks. Because a document does not execute, this re-check also stands in for the hub's real-environment run, the "real run" the gate line below reports. The review wave does not count as native checks.

**What blocks** in a document is a false or unsourced claim, a section that does not serve the anchor, a structural defect, a change in meaning in a rewrite (a claim the sources do not refute, altered or dropped), or a failed check. A sentence that could be shorter but means the right thing is not a finding. The test is what the reader does next, not the polish of the wording.

**Simplification** runs once, before the pass meant to certify the document, and it deletes redundancy and decoration. It never runs after that pass, because a cut landed after certification ships uncertified.

**The exit** is the hub's prose-deliverable exit. The run exits on one clean pass. Two alarms bound the loop (doctrine step 5):

- **Round alarm.** It fires at every Nth round that found a blocking finding. N is your figure, or 4 by default.
- **Time alarm.** It fires when more time than your budget passes without a round closing. The budget is two hours by default, and the loop stops until you rule.

If no pass has come clean when the round alarm first fires, the run puts its diagnosis to you and then opens one closing round without waiting for your answer. Say stop if you want otherwise. That round reviews the diff since the last revision every seat fully reviewed, or the whole document where none was. A finding inside the diff is repaired, and a false claim is never left standing as written. A finding outside the diff goes on a punch list rather than blocking. The run then delivers as Shipped at an escalation, with the punch list.

## How it ends

The run writes the document to the destination you agreed. That agreement authorizes the write, so the run does not ask again. Committing follows your repository's delivery norm, from its `CLAUDE.md` or its history. Where the norm is to commit, the run commits its own paths and is not stopped by an unrelated dirty file. Only a real conflict stops it: someone else's in-flight work in the files the run touched. Where the norm is a patch handoff, it hands you the diff and says so. Agreeing a destination does not, on its own, agree a commit.

The report opens with the gate line, for example:

```text
Gate: clean pass on 4a3e4ca, real run on record. No blockers open.
```

Below that come the document's one-line thrust, anything that needs your judgment, the ledger's path and whether it ships, which clarity method the clarity lens and red team got, any corrected claims, and the deferred non-blocking items. The run's record names one of the hub's five end states: Exited (the only clean one), Stopped, Shipped at an escalation, Blocked on an unanswered question, or Unable to continue.

## How to invoke it

```text
use doctrine-write to rewrite docs/proposal.md for the finance committee; keep my meaning, sources are in docs/proposal-sources/
```

If you name the reader and the sources in the prompt, the questions step is shorter. State a round-alarm figure or a time budget too if you want other than the defaults: the alarm at every fourth round that found a blocking finding, and two hours.

## Requirements

The plugin needs nothing else installed. Optional pieces change what fills a seat:

- [`writing-clearly-and-concisely`](https://github.com/softaworks/agent-toolkit/tree/main/skills/writing-clearly-and-concisely) supplies the clarity method. Without it, the inline Strunk rules above apply.
- The red team from the other model family needs one piece per host. On Claude Code it is [OpenAI's codex plugin](https://github.com/openai/codex-plugin-cc), with the Codex CLI logged in. On Codex it is the Claude Code CLI (`claude`), installed and signed in, and run from a Codex session outside Codex's per-call sandbox. [requirements.md](../requirements.md) has the detail. Where that piece is missing, or its seat still fails after the retries the hub allows, a fresh-context subagent prompted to refute the document takes the seat. That substitute is the same model, so its blind spots overlap with the author's, and the exit statement names the substitution.

Install commands are in [requirements.md](../requirements.md). To watch the lenses and the red team as they run, see [watching a run](../watching-a-run.md).

## Red flags

If you see any of these, stop the run and ask why:

- A lens reports that the claims look sourced, and its prompt carried the draft but no ledger.
- The clarity lens is working from remembered Strunk because nobody resolved the skill's path.
- The document has a number that no ledger line accounts for.
- Every loop tightens one more sentence and the run never closes.
- A rewrite improved a claim the sources do not refute instead of the words carrying it.
- The document landed in a repository whose docs linter nobody ran.
- By the third loop the anchor and the counters exist only in the conversation, not on disk.
- Sections were drafted by parallel agents and stitched together.

The hub's page is [doctrine.md](doctrine.md). The specification is [`skills/doctrine-write/SKILL.md`](../../skills/doctrine-write/SKILL.md). Where this page and the specification disagree, trust the specification.
