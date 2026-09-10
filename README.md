# Doctrine Skills

Nine skills for Claude Code that put an agent's work through a real gate: every check your project
documents, an adversary that did not write the code, and a loop that does not exit until one full
pass comes back clean.

## The problem

You already get good work out of Claude Code by pushing on it: check that again, did the linter run,
are you sure. That works, and you do it differently every time, so what you get back tracks how much
attention you had that day. The failures that survive it do not look like failures.

- The tests pass, the linter is clean, the build is green, and the code is wrong.
- The context that wrote the code reviews it and finds it reasonable.
- One defect gets fixed in the one place you were looking at.
- The fix creates the next bug, and the round that would have found it is over.
- A long run gets compacted, and the list of what still fails goes with it.

## What the doctrine does

Seven rules, applied to every job the hub and its seven wrappers run. Rules 3 to 6 are a loop rather than a sequence, which is the
point of rule 6.

1. **Ask first.** Questions reach you before work is aimed, and your answers go verbatim to every
   agent that later judges the result.
2. **Split the work** into phases with checkable exit gates, and run independent work in parallel.
3. **Run every check your project documents**, not the ones an agent thought of. A check that could
   not run is recorded as not run, never as clean.
4. **Send an adversary**: a reviewer that did not write the code, a different model if you have one
   installed. Its findings are verified against source first, because adversaries invent things too.
   Without a second model the run says so, rather than reporting a stronger gate than it ran.
5. **Ask where else.** Every blocking finding that survives verification gets one question: what else
   the same mistake would have touched. The fix goes to the cause, not just the place it showed up.
6. **Loop** until one full pass comes back clean with no blocking finding left over from an
   earlier pass. Two alarms stop the loop
   and put the decision to you rather than spending your budget without telling you.
7. **Cut what nobody asked for, then deliver** by whatever route your project normally ships work,
   and say whether what shipped is what the clean pass certified.

**What it touches.** It edits your working tree, the way Claude Code already does. It commits the way
your repo does, and where your repo documents no norm the coding workflow commits locally and asks. It
pushes or opens a PR only if that is your documented norm or you asked for one. Where it cannot write, it hands you the diff instead. A phase writes its state
to a file as it goes, so a run that is interrupted or compacted resumes from disk rather than from
whatever the conversation still remembers.

## What that catches

Three defects from real work. In each pair the first block is the defect and the second is the fix.
The code is real and the identifiers are renamed: no client, product, person or repository is named,
so these are mnemonics for the rule beside them, not citations you can follow.

### Every check was green

```ts
const pairs = (o: Record<string, unknown>) =>
  Object.entries(o).map(([key, value]) => `${words(key)}: ${value === null ? '' : String(value)}`)
```

```ts
const show = (value: unknown) =>
  value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
```

`String(x)` throws when `x` is an object whose own `toString` is not callable, and custom field names
are user-supplied. Name a field `toString`, open that record's history, and the page dies. It dies
again on every reopen, because the event is stored.

At that moment: 837 backend tests green, 492 frontend tests green, a clean build, linters green apart
from one pre-existing error the change did not cause, and a reviewer that read the whole 2,283-line
diff end to end and returned nothing blocking. A different-model adversary read it and also returned
nothing. The same adversary, run again on that unchanged revision with no memory of the first pass,
found it.

### One finding was a class

```tsx
const globalItem = poolItems.find(g => g.id === item.itemId);
const defaultValue = globalItem?.value ?? 0;
onOverride(item.itemId, defaultValue, item.calcType);
```

```tsx
const globalItem = poolItems.find((g) => g.id === itemId);
if (!globalItem) {
  setError('Re-include is unavailable: the pool could not be read. Reload and try again.');
  return;
}
const value = globalItem.value;
```

`?? 0` is the defensive default a linter and a reviewer both read as correct null handling. It is
wrong here because this zero is written to the database as a price: when a background reload failed,
clicking "Re-include" on a $5,000 benefit saved it as $0, silently.

The different-model adversary found one button. Rule 5 asked what else could reach the same code, and
the answer was five other handlers that already did, so the fix went into the shared function they all
call rather than into the button the round happened to be looking at.

### The fix was where the next bug lived

```python
labels: list[str] = []
seen = {normalize(name) for name in header}
for label in custom_labels:
    if normalize(label) not in seen:
        seen.add(normalize(label))
        labels.append(label)
```

```python
levels = {normalize(name) for name in LEVEL_COLUMNS}
labels = [label for label in custom_labels if normalize(label) not in levels]
```

De-duplicating a header against every name already in it is textbook correct, and it fixed the bug
that round had reported. But the importer resolves custom labels above ordinary field names, so
dropping the duplicate leaves the wrong column standing: export the catalog, import the same file
back unedited, and the import silently overwrites a field on every product with an unrelated
catalog value.

The first block is not the original code. It is the previous round's repair. Before it, the importer
rejected that file outright and named the duplicate header, so the repair replaced a loud refusal with
a silent write across the catalog. The next round's different-model adversary caught it by running the
real exporter and importer rather than reading them.

## How this differs from looping

Running an agent in a loop is not new and this does not claim it. Geoffrey Huntley's
[Ralph](https://ghuntley.com/ralph/) is an unconditional bash loop that pipes a prompt file into the
agent over and over. Each pass gets a fresh context and progress lives on disk, a design this borrows
rather than improves on.

What differs is what ends the loop.

Ralph's published loop has no exit condition, and the post documents no stopping rule.
[Clayton Farr's Ralph playbook](https://github.com/ClaytonFarr/ralph-playbook) adds one, an optional
iteration cap. Anthropic's own Ralph plugin adds two, an iteration counter or a phrase the working
agent emits about itself, and its README says to rely on the counter rather than the phrase.

Here the loop cannot reach a certified exit until a reviewer that did not write the work passes it,
on a revision that has actually run, with no blocking findings left over from any earlier pass. It
can still end other ways, and the report names which: stopped by you, shipped at an alarm with
findings open, or closed with a punch list of what it did not fix. What it never does is present an
uncertified ending as a clean one.

Independent review and gating are both documented practice rather than inventions here. Anthropic's
own docs describe an adversarial reviewer in a fresh context, a stop hook that blocks a turn until a
check passes, and a separate evaluator that keeps working until a goal resolves. What this adds is
the combination: the reviewer is the gate, and the gate's conditions include the real run and the
findings carried over from before.

Those conditions are also what lets a long run leave you alone. It stops at its own thresholds and
comes back to you there, rather than needing you to watch for the end.

**Scope.** Your words are written down before any work is aimed and handed to every agent that later
judges the result, and delivery walks your original request item by item.

**Where Ralph is better.** Greenfield. Huntley: "There's no way in heck would I use Ralph in an
existing code base though, if you try, I'd be interested in hearing what your outcomes are. This
works best as a technique for bootstrapping Greenfield, with the expectation you'll get 90% done with
it." That is the opposite end of the problem from this one.

One number worth carrying, from [Addy Osmani's case for adversarial
review](https://addyosmani.com/blog/agentic-code-review/): across four review tools on 146 real pull
requests, 93.4% of flagged locations were caught by exactly one tool, and none by all four. He draws
the conclusion this page draws, that heterogeneity is the point, and attaches a limit this page keeps
too: measure it on your own code, because each of those results was specific to a codebase.

## Install

```text
/plugin marketplace add scottcrosby-securebine/doctrine-skills
/plugin install doctrine@doctrine-skills
```

If the install message says to, run `/reload-plugins` or restart. A freshly installed plugin does not
always load into the session that installed it.

## Try it on one file

Do not start with a big audit. Point it at one file you suspect: `use doctrine-audit on
src/whatever.ts (scope is that file only)`. It asks what counts as a bug before changing anything,
runs whatever your repo has written down as a gate, and puts the verdict at the top of its report,
ahead of the work:

```text
Gate: clean pass on 4a3e4ca, real run on record. No blockers open.
Gate: shipped at an escalation, round 6, zero clean passes. Open: 2 blocking findings.
```

Those are two of the forms. A run can also stop for your decision, end blocked on a question you
have not answered, or close a prose job with a list of what it did not fix. The wording varies. What
the line always does is distinguish a clean pass from an ending without one, and name what is still
open.

## The nine skills

| Skill | Use it for |
|---|---|
| [`doctrine`](docs/skills/doctrine.md) | The shared posture. The seven wrappers invoke it. |
| [`doctrine-code`](docs/skills/doctrine-code.md) | Features, specs and tickets. |
| [`doctrine-debug`](docs/skills/doctrine-debug.md) | Anything broken, throwing, failing or slow. |
| [`doctrine-audit`](docs/skills/doctrine-audit.md) | Bug hunts and deep code audits. |
| [`doctrine-docs`](docs/skills/doctrine-docs.md) | Documentation sweeps. |
| [`doctrine-write`](docs/skills/doctrine-write.md) | Proposals, briefs, PRDs, reports. |
| [`doctrine-research`](docs/skills/doctrine-research.md) | Multi-source questions needing a fact-checked answer. |
| [`doctrine-gauntlet`](docs/skills/doctrine-gauntlet.md) | Web design, judged on the rendered page. |
| [`doctrine-pane`](docs/skills/doctrine-pane.md) | An interactive terminal session in a pane you can take over. Not a wrapper: it does not load the posture. |

## What it costs

More time and more tokens than a single pass, so point it at work where being wrong is expensive. No
mode skips the gate, though `doctrine-gauntlet` asks which of its two modes you want and the hub
scales the gate down for work shown to have small reach. No token figures appear here: the runs behind
this page did not measure them, and an unsourced number is what this page argues against.

## Built on other people's work

These are the disciplines the loop runs on, each published by someone who does this work. The doctrine
invokes them by name at runtime rather than copying them, so their updates flow through. All optional,
each with a fallback: [Matt Pocock's engineering skills](https://github.com/mattpocock/skills) for the build and
review disciplines; [superpowers](https://github.com/obra/superpowers), by Jesse Vincent and Prime
Radiant, for parallel dispatch and worktree isolation;
[ponytail](https://github.com/DietrichGebert/ponytail), by Dietrich Gebert, for the pass that deletes
what nobody asked for;
[writing-clearly-and-concisely](https://github.com/softaworks/agent-toolkit/tree/main/skills/writing-clearly-and-concisely),
Strunk's rules as a skill, by Josh Thomas via softaworks; [OpenAI's codex
plugin](https://github.com/openai/codex-plugin-cc) for the different-model red team;
[session-memory](https://github.com/scottcrosby-securebine/session-memory-commands) for handoffs
between sessions; and the [gauntlet loop](https://somethingbig.ai/gauntlet-loop) by Matt Shumer, whose
method `doctrine-gauntlet` builds on. One exception to invoking by name: you install Matt Pocock's
`code-review` yourself as a renamed `matts-code-review` copy, because the original name collides with
Claude Code's own `/code-review`. This plugin does not bundle it.

## Requirements

**Seven of the nine skills need nothing installed.** `doctrine-gauntlet` judges rendered pages, so it
needs a browser, and without one its harness refuses to run rather than report a pass.
`doctrine-pane` needs [herdr](https://herdr.dev) 0.8.2 or later, and outside herdr it refuses.
Neither degrades into a weaker version of itself.

Optional, each with a fallback: Matt Pocock's engineering skills, superpowers, the OpenAI codex
plugin, ponytail, writing-clearly-and-concisely, session-memory, Claude Code's `deep-research`
workflow, Claude Code's Workflow tool, Claude Design, and herdr for everything other than
`doctrine-pane`. **[docs/requirements.md](docs/requirements.md)** has the install commands and says
what happens when each is missing.

## Watching it work

A doctrine run dispatches a lot of subagents and Claude Code shows you none of them: the terminal goes
quiet and an answer appears some minutes later. Run it inside [herdr](https://herdr.dev) and every
subagent gets a live pane you can read while it works. Optional, and nothing here needs it:
[docs/watching-a-run.md](docs/watching-a-run.md).

## Limits

These rules came out of real work, and the failures behind them are ones this author hit. There is no
third-party benchmark, and the three examples are anonymized, so you cannot check them yourself.
Defects found and not yet fixed are in [`docs/known-issues.md`](docs/known-issues.md).

The specification is [`skills/doctrine/SKILL.md`](skills/doctrine/SKILL.md), the file the agent
actually loads, so trust it over this page wherever the two disagree. How the work is checked, and
what those checks cannot reach, are in [docs/how-this-is-tested.md](docs/how-this-is-tested.md).

## License

MIT
