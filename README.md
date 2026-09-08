# Doctrine Skills

Nine skills for Claude Code that put an agent's work through a real gate: every check your project
documents, an adversary that did not write the code, and a loop that does not exit until one full
pass comes back clean.

## The problem

You already get good work out of Claude Code by pushing on it. Check that again. Did the linter run.
It works, and you do it differently every time, so what you get back tracks how much attention you
had that day. The failures that survive that do not look like failures.

- The tests pass, the linter is clean, the build is green, and the code is wrong.
- The context that wrote the code reviews it and finds it reasonable.
- One defect gets fixed in the one place you were looking at.
- The fix creates the next bug, and the round that would have found it is over.
- A long run gets compacted, and the list of what still fails goes with it.

## What the doctrine does

Seven rules, applied to every job, in the same order every time.

1. **Ask first.** Questions reach you before work is aimed, and your answers go verbatim to every
   agent that later judges the result.
2. **Split the work** into phases with checkable exit gates, and run independent work in parallel.
3. **Run every check your project documents**, not the ones an agent thought of. A check that could
   not run is recorded as not run, never as clean.
4. **Send an adversary**: a reviewer that did not write the code, a different model where one is
   installed. Its findings are verified against source first, because adversaries invent things too.
5. **Ask where else.** Every surviving finding gets one question: where else would whatever produced
   this have left the same mark. The class gets fixed, not the instance.
6. **Loop** until one full pass comes back clean with nothing outstanding. Two alarms stop the loop
   and put the decision to you rather than spending your budget quietly.
7. **Cut what nobody asked for, then deliver** the way your repo delivers, and say whether what
   shipped is what the clean pass certified.

## What that catches

Three defects from real work, anonymized. Each pair is the code as it was and as it is now.

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

At that moment: 837 backend tests green, 492 frontend tests green, build clean, linter clean, and a
reviewer that read the whole 2,283-line change end to end and returned nothing blocking. A
different-model adversary read it and also returned nothing. A second adversarial pass over the same
unchanged revision found it.

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

The adversary found one button. Rule 5 asked where else that mark appears, and the answer was five
handlers already reaching the same path, so the fix went to the shared root instead of the two doors
the round happened to be looking at.

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
reserved = {normalize(name) for name in RESERVED_COLUMNS}
labels = [label for label in custom_labels if normalize(label) not in reserved]
```

De-duplicating a header against every name already in it is textbook correct, and it fixed the bug
that round had reported. But the importer resolves custom labels above ordinary field names, so
dropping the duplicate leaves the wrong column standing: export the catalog, import the same file
back unedited, and every product silently gets a field overwritten with an unrelated cost figure.

The first block is not the original code. It is the previous round's repair. Before it, that file was
refused outright as a duplicate header, so the repair replaced a loud refusal with a silent write
across the catalog. The next round's adversary caught it by running the real exporter and importer
rather than reading them.

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
runs whatever your repo documents as a gate, and opens its report with the gate before the work:

```text
Gate: clean pass on 4a3e4ca, real run on record. No blockers open.
Gate: shipped at an escalation, round 6, zero clean passes. Open: 2 blocking findings.
```

The wording varies. What that line contains does not, and there is no third form where a run that
never got clean is summarised as finished.

## The nine skills

| Skill | Use it for |
|---|---|
| [`doctrine`](skills/doctrine/) | The shared posture. The seven wrappers invoke it. |
| [`doctrine-code`](skills/doctrine-code/) | Features, specs and tickets. |
| [`doctrine-debug`](skills/doctrine-debug/) | Anything broken, throwing, failing or slow. |
| [`doctrine-audit`](skills/doctrine-audit/) | Bug hunts and deep code audits. |
| [`doctrine-docs`](skills/doctrine-docs/) | Documentation sweeps. |
| [`doctrine-write`](skills/doctrine-write/) | Proposals, briefs, PRDs, reports. |
| [`doctrine-research`](skills/doctrine-research/) | Multi-source questions needing a fact-checked answer. |
| [`doctrine-gauntlet`](skills/doctrine-gauntlet/) | Web design, judged on the rendered page. |
| [`doctrine-pane`](skills/doctrine-pane/) | An interactive terminal session in a pane you can take over. |

## What it costs

More time and more tokens than a single pass, with no lighter mode to pick, so point it at work where
being wrong is expensive. No time or token figures are published here: the runs behind this page did
not measure them, and a number this README could not source is the thing it argues against.

## Built on other people's work

Invoked by name at runtime rather than copied, so their updates flow through. All optional, each with
a fallback: [Matt Pocock's engineering skills](https://github.com/mattpocock/skills) for the build and
review disciplines; [superpowers](https://github.com/obra/superpowers), by Jesse Vincent and Prime
Radiant, for parallel dispatch and worktree isolation;
[ponytail](https://github.com/DietrichGebert/ponytail), by Dietrich Gebert, for the pass that deletes
what nobody asked for;
[writing-clearly-and-concisely](https://github.com/softaworks/agent-toolkit/tree/main/skills/writing-clearly-and-concisely),
Strunk's rules as a skill, by Josh Thomas via softaworks; [OpenAI's codex
plugin](https://github.com/openai/codex-plugin-cc) for the different-model red team;
[session-memory](https://github.com/scottcrosby-securebine/session-memory-commands) for handoffs
between sessions; and the [gauntlet loop](https://somethingbig.ai/gauntlet-loop) by Matt Shumer,
folded into `doctrine-gauntlet`.

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

## Limits

These rules came out of real work, and the failures behind them are ones this author hit. There is no
third-party benchmark. Known defects are in [`docs/known-issues.md`](docs/known-issues.md). The
specification is [`skills/doctrine/SKILL.md`](skills/doctrine/SKILL.md), the file the agent actually
loads, so it is the one that stays correct. How the work is checked, and what those checks cannot
reach, is in [docs/how-this-is-tested.md](docs/how-this-is-tested.md); the optional herdr integration
that lets you watch a run is in [docs/watching-a-run.md](docs/watching-a-run.md).

## License

MIT
