# The gate, and how it is tested

## The gate

The README summarises the gate in seven rules. The specification is [`skills/doctrine/SKILL.md`](../skills/doctrine/SKILL.md), which is the file the agent actually loads, so it is the one that stays correct. Each wrapper sits beside it under [`skills/`](../skills/) and states only its own task shape.

Four things worth knowing before you rely on the gate:

- A finding is **blocking** when someone acting on the deliverable as it stands would do the wrong thing. Three things never block: wording that carries the right meaning, any claim about the review's own instruments and history, such as a count, a coverage note or a round number, and a steering document such as the spec, the anchor or the record, unless that document is the deliverable. One exception, because it bit: a comment inside a check that ships describes product behaviour, so a wrong one blocks.
- **A pass is clean when it produces no blocking finding and leaves none outstanding**, including one carried over from an earlier pass, and when a real-environment run of the work at that revision is on record, naming the path, where it ran and its output. A non-blocking improvement is deferred and named at delivery, never held against the pass. A code repair after that pass needs a pass of its own, judged from the diff rather than from a label.
- An alarm's stop leads with what shipping now would mean, before anything about the loop.
- The doctrine is a **layer, not a fork**. It invokes other authors' skills at runtime so their updates flow through untouched. The one exception is the renamed `matts-code-review` copy.

Defects found and not yet fixed are listed in [`docs/known-issues.md`](known-issues.md), so you can tell a known one from a surprise.

## How it is tested

CI is covered below. Most of what is here is prose, though, and prose has no suite to run. Four things stand in.

- **Driven runs.** Fresh-context agents are put through each wrapper against realistic scenarios, and every ambiguity they hit gets patched. This is periodic, not per-commit, and it has not reached every wrapper. Since that original validation every wrapper has been rewritten, and the repo's history records these drives: `doctrine-project` on four fixtures on 2026-09-13, re-driven twice; `doctrine-code` end to end on 2026-09-12, and through a fixture phase on both hosts in later drives, though its brainstorm branch and UI section never have been ([#52](https://github.com/scottcrosby-securebine/doctrine-skills/issues/52)); and `doctrine-audit` in three runs in October 2026. For the other wrappers, `doctrine-orchestrate` among them, it records no drive of the current text. That text has been reviewed, which is not the same as showing that an agent can execute it.
- **[`fixtures/`](../fixtures/)** is a standing regression suite for `doctrine-gauntlet`: three generality cases, each proving something the other two cannot. Two are runnable from this repo; the third is a real bound design system, which cannot ship with it.
- **The harness code** carries a syntax gate and three-clause tamper fixtures, both defined in [`skills/doctrine-gauntlet/workflow.md`](../skills/doctrine-gauntlet/workflow.md). The syntax gate runs on every push; the fixtures run through Claude Code's Workflow tool and are rerun by hand after any change. They also run on every push through the Codex runner's selftest, `harness/round.codex.selftest.mjs`, each seat a stand-in, which checks the runner and the script's counting but not the Workflow tool.
- **The documents have a gate too.** `node tools/doc-check.mjs` reads every skill's markdown, plus the prose inside the harness's tamper fixtures, and fails on a stale fixture reference, a roster of fixture names in one sentence, a claim restated in two places, an unclassifiable fixture, a citation that no longer resolves, a sentence about claims in a rewrite that drops the refute exemption another sentence of the same document carries, or a span-copy instruction whose marker does not occur exactly once outside such instructions. It states its own blind spots in its header, and no skill loads it.

**CI runs once per change** ([`gates.yml`](../.github/workflows/gates.yml)), in one job: on every push and every pull request, where a newer push replaces the run before it and a branch's push and its pull request share one run. It runs the prose gate, the herdr decision-path lint and the gauntlet brief registry, each with its tamper test; the tamper tests over the hook scripts, the Codex host's among them; a parse of the hook manifest and of all three plugin manifests; the harness's syntax gate; and the Codex round runner's selftest.

**The mutation table is no longer run as a gate** (`node hooks/dctr-mutations.mjs`). It reverts each named repair in a copy of the tree and fails if no check notices. A whole run had reached hours, and run per push and per pull request it held the account's shared runners away from every other repository's jobs. Since 2026-11-26 a fix is proven once, when it is made, by a test that fails without it and passes with it, and no phase and no merge runs the table. CI runs only its `--anchors` mode, which checks in under a second that every entry's text still occurs exactly once in its file and that the table has not grown. The entries are kept for one job: the check a file gets when its tests are rewritten.

The CI job installs bubblewrap first: without `bwrap --unshare-pid` the pane launcher's selftest skips its namespace clauses, which are the only tests of the repairs they pin, so a host running that selftest needs it too.

What CI cannot run is the browser harness against `fixtures/`, the Workflow-tool fixtures, the doctrine band's tests (`claude plugin test .`, which needs Claude Code), the doctor (`node hooks/dctr-doctor.mjs`, which needs Codex, Claude Code and herdr and is run by hand after an update to any of them; CI runs only its verdict selftest), and the driven runs above.

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
