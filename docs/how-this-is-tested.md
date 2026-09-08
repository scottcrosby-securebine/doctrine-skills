# The gate, and how it is tested

## The gate

The README summarises the gate in seven rules. The specification is [`skills/doctrine/SKILL.md`](../skills/doctrine/SKILL.md), which is the file the agent actually loads, so it is the one that stays correct. Each wrapper sits beside it under [`skills/`](../skills/) and states only its own task shape.

Three things worth knowing before you rely on the gate:

- A finding is **blocking** when someone acting on the deliverable as it stands would do the wrong thing. Two things never block: wording that carries the right meaning, and any claim about the review's own instruments and history, such as a count, a coverage note or a round number. One exception, because it bit: a comment inside a check that ships describes product behaviour, so a wrong one blocks.
- **A pass is clean when it leaves nothing outstanding**, including a finding carried over from an earlier pass. A code repair after that pass needs a pass of its own, judged from the diff rather than from a label.
- An alarm's stop leads with what shipping now would mean, before anything about the loop.
- The doctrine is a **layer, not a fork**. It invokes other authors' skills at runtime so their updates flow through untouched. The one exception is the renamed `matts-code-review` copy.

Defects found and not yet fixed are listed in [`docs/known-issues.md`](known-issues.md), so you can tell a known one from a surprise.

## How it is tested

CI is covered below. Most of what is here is prose, though, and prose has no suite to run. Four things stand in.

- **Driven runs.** Fresh-context agents are put through each wrapper against realistic scenarios, and every ambiguity they hit gets patched. This is periodic, not per-commit, so the skills can be ahead of the last full run.
- **[`fixtures/`](../fixtures/)** is a standing regression suite for `doctrine-gauntlet`: three generality cases, each proving something the other two cannot. Two are runnable from this repo; the third is a real bound design system, which cannot ship with it.
- **The harness code** carries a syntax gate and three-clause tamper fixtures, both defined in [`skills/doctrine-gauntlet/workflow.md`](../skills/doctrine-gauntlet/workflow.md). The syntax gate runs on every push; the fixtures run through Claude Code's Workflow tool and are rerun by hand after any change.
- **The documents have a gate too.** `node tools/doc-check.mjs` reads every skill's markdown, plus the prose inside the harness's tamper fixtures, and fails on a stale fixture reference, a roster of fixture names in one sentence, a claim restated in two places, an unclassifiable fixture, or a citation that no longer resolves. It states its own blind spots in its header, and no skill loads it.

**CI runs thirteen checks on every push** ([`gates.yml`](../.github/workflows/gates.yml)): the prose gate and its tamper test, a lint over the hooks' herdr decision paths and its tamper test, five tamper tests over the hook code itself, the mutation gate, two steps covering all three manifests, and the harness's syntax gate. The mutation gate is the one worth naming: it reverts each named repair in a copy of the tree and fails if no check notices, which is the check that answers whether the other checks pin anything. What CI cannot run is the browser harness against `fixtures/`, the Workflow-tool fixtures, and the driven runs above.

Here is the document gate catching a real defect. The same sentence was added to two skills, which is an unversioned fork: correcting one can no longer reach the other.

```text
$ node tools/doc-check.mjs
echo: the same 23-word claim appears in 2 places (doctrine-audit/SKILL.md; doctrine-docs/SKILL.md) — "the critic must be handed the artifact and never the filename it lives…"

1 finding(s)
$ echo $?
1
```

With the duplicate removed it prints `0 finding(s)` and exits `0`.

`doctrine-gauntlet` also cites incidents from real engagements, deliberately anonymized. No client, product, person or repository is named. They are mnemonics for the rule beside them, not citations you can follow.

It folds in the [gauntlet loop](https://somethingbig.ai/gauntlet-loop) by Matt Shumer: builder agents paired with harsh critics that judge rendered output blind against a reference.
