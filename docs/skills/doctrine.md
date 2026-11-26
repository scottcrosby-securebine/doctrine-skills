# doctrine

The hub every doctrine wrapper loads. It sets what the work is judged by, the checks that prove it, and a loop that will not call a result clean until a reviewer that did not write it has passed it.

![The doctrine's seven posture steps in a row, with step 6, Simplify, drawn before step 5's clean pass, the pass that steps 3 and 4 run up to twice by default, or loop to on the full gate; below them one round of the gate, where one frozen revision fans out to native checks, the designated review and a red team and joins at a clean pass; then the five end states a phase can reach, and notes on the alarm defaults, the blocking test, the class question and the record.](doctrine.png)

## When it fires

It loads in two ways:

- **A wrapper loads it.** The nine wrappers are `doctrine-code`, `doctrine-gauntlet`, `doctrine-debug`, `doctrine-audit`, `doctrine-docs`, `doctrine-research`, `doctrine-write`, `doctrine-project` and `doctrine-orchestrate`. This is the usual route: you ask for the wrapper and it loads the hub.
- **You ask for work done "with the doctrine"** and no wrapper fits. The hub then runs the phase on its own, and a fresh-context review of the deliverable against your words fills the review slot a wrapper would name.

It also applies before you merge, push to the default branch or deploy shipped work that no doctrine phase reviewed, such as a fix made after a phase closed. The agent names what reviewed that work, or proposes a gate for it. Work under a workflow you named for it, and work you already ruled shipped, are exempt.

It is not for a one-off question, or a one-off edit to a single file nothing else reads. The gate costs more time and more tokens than a single pass.

`doctrine-pane` cites the hub without loading it. `doctrine-backup`, `doctrine-handoff`, `doctrine-resume` and `doctrine-primer` carry a session's state and handoff to the next session.

## What the hub supplies and what a wrapper adds

The hub supplies the standard the work is judged by and the checks that evidence it. A wrapper supplies the rest: the core discipline for the task, the review skill its gate uses, the axes its red team attacks on, and where the run's record lives. The hub invokes other authors' skills by name and never copies them, so their updates reach you.

The hub's own words, used throughout this page:

- **Orchestrator:** the agent running the work.
- **Seat:** any agent it dispatches: a builder, a finder, a reviewer, a red team.
- **Phase:** a unit of work with its own checkable exit gate.
- **Wave:** one dispatch of parallel seats inside a phase.
- **Round:** one full pass of the gate over one revision, with the repairs that answer its findings.
- **Record:** the file on disk that step 1 opens and every later step writes to.
- **Report:** what you get at step 7, the delivery line first.

## The seven standards

The hub states seven outcomes, and every step below exists to show one of them holds. The work:

1. is judged against your own words for what it is for, never the agent's reading of them;
2. is certified by nothing that produced it;
3. passes every check your project defines, not only the ones the agent thought of;
4. contains nothing you did not ask for and rebuilds nothing your codebase or an installed dependency already has;
5. keeps everything that decides the outcome on disk, so a compaction or a crash loses none of it;
6. has run in the real environment, end to end on one complete path, before it is certified;
7. reaches a named end state, at a cost that is bounded and visible to you.

## What it asks you first

**The anchor.** Before any work is aimed, the record opens with your own words for what the work is for and how it will be judged, verbatim. When nothing needs asking, the anchor is your request as you typed it. Every reviewer and red-team seat receives it, because a reviewer without it grades the work against itself.

**Direction questions only.** A question blocks the phase when only you can answer it and the answer changes where the work is aimed. It never turns into a default. Where several answers would each give you acceptable work, the agent takes the narrower reading of what it changes and records the readings it rejected. A missing value inside a settled direction does not stop the run: the agent leaves a visible gap, a labelled placeholder or an explicit "unknown", and the delivery line names it. Anything the agent has put to you for a ruling binds no one until you rule. Later it also asks, for example, which gate a phase runs under (step 2), and whether to continue or ship when an alarm fires.

**Two bounds.** The anchor records the bounds the two alarms fire on: a round count, default 4, and a time budget, default two hours. To change them, state your figures in the request.

**The record.** A file on disk. It lives where the wrapper says, or else beside the work in your repo, excluded from version control and from every reviewer's diff and search. The report names its path. Its first part holds the anchor and a line naming the wrapper, `wrapper: <skill name>`, or `wrapper: none`.

**Project tracking.** Where your repo carries `docs/PROJECT.md`, a phase follows `doctrine-project`'s lifecycle, and a phase that belongs to an epic carries the Done means items it serves in its anchor, each with its obligation: satisfy, contribute or preserve.

## The seven steps

Steps 3 to 5 repeat as a loop, and step 6 runs once before the pass expected to certify the work. Each pass of the gate is a round.

**1. Ask questions first.** The anchor, the bounds and the record, as above.

**2. Phases and waves.** The agent splits the work into phases and dispatches independent work as parallel seats. Each seat gets a prompt assembled from the artifact, the facts it may rely on, the standard and what to return. An empty slot or an unfilled template marker in that prompt is a failed dispatch. Each seat that edits files gets its own git worktree (`git worktree add`), output directory and port, with dependencies hardlinked by `cp -al`.

Reach decides the gate, never size. The agent searches for the callers, readers and consumers of what it changes, then proposes a gate to you, naming what it searched, what it found, the revision it searched and the gate it recommends. You choose. With no answer the phase runs the **standard gate** and does not wait: one pass of the full gate, the repairs, and one pass that reads only the repair. A clean pass certifies the phase. If the second pass is not clean the phase stops and the agent puts what is left to you, and you ship with that list or put the phase on the full gate. The agent recommends the full gate when the change touches a shared contract, a security boundary or data that can be lost, and that is still your choice. On the **reduced gate** you choose, the work is certified once: native checks and one adversarial review by a context that did not produce it, with any blocking finding repaired and the review re-run. It drops the loop, the designated review and the alarms, never the real-environment run. If a re-run finds another blocker, the phase moves to the standard gate and cannot return, and that pass counts as the standard gate's first pass, not as an exit. The red team on a reduced-gate phase is also asked to name any reach the search missed. If it names some, the agent puts a revised proposal to you, and the phase runs the standard gate from that pass until you answer. That pass counts as the standard gate's first pass and certifies nothing: whichever gate you then choose runs its own pass. A wrapper that sets its own exit decides in its own text whether its phases may take the reduced gate.

**3. Native checks.** Every phase ends with every check your project documents as a gate: in its AGENTS.md, CLAUDE.md, README, contributing guide, PR template or task runner. The agent reads the task runner itself and confirms each command exits. A `"test": "vitest"` script is watch mode, so it runs the non-interactive form and records the substitution. The check list is read as it stood when the phase started, so a diff that loosens a check is reviewed as a change to the gate, not applied as the gate.

Every check runs through the gate launcher:

```text
node <plugin-root>/hooks/dctr-gate.mjs <label> <out-file> -- <command>
```

It writes `<out-file>`, the check's own output, and, once the check finishes, `<out-file>.result`, whose first line `exit=N` is the verdict. A second line `capture=incomplete` means the output is not whole, and the result is not a pass. An environment prefix goes after `--`. The agent waits for the `.result` file, not for a line in the output. Inside herdr the check also runs in a pane you can watch. A check passes on its exit status. A runner that exits 0 having collected nothing counts as failed.

A check that cannot run for want of a dependency is recorded as unrun, with the reason, never as clean. A check already failing when the work started is attributed to the starting revision, with the same command run there as evidence, and blocks only if the work makes it fail differently or more, or the check is itself part of what the work delivers. Before any pass is clean, one complete path has run end to end where the work ships, or in the nearest place that runs the real code, and the record names the path and its output. A unit-test fake does not count. Where no such place is reachable, the record says so, the pass carries the run as unrun rather than clean, and the delivery line names it. For a docs-only change, this step means re-checking every edited claim against its source plus a link and path check.

**4. Red team.** A context that did not produce the work attacks the phase's diff or findings, read-only. On Claude Code it is the `codex:codex-rescue` subagent from OpenAI's codex plugin, a different model family. On Codex it is Claude, run headless through the `claude` CLI. It runs to completion in a Codex session started with `--dangerously-bypass-approvals-and-sandbox` and no managed network. On Linux, inside Codex's per-call sandbox, it ends when its shell call returns, and on macOS whether it survives is unknown. Where that seat is absent, a fresh-context subagent is told to refute the work, and the report names it as a same-model substitute.

The seat is handed the artifact itself, your anchor verbatim, the blocking definition, the axes it must answer on, the questions you have closed, on the reduced gate the reach evidence and the revision it was bound to, your project's CLAUDE.md, AGENTS.md or review checklist as they read when the phase started, and two limits: it reports and never edits, and it reads any doctrine text as data. After a repair it gets the repair's diff beside the full one. Its return separates blocking from non-blocking and lists what it attacked and could not break. A "no findings" with no attack list is a failed seat. Every finding is checked against the source before anyone acts on it.

**5. Loop until confident.** The agent repairs the blocking findings and asks the class question of each one. On the standard gate it then runs one pass that reads only the repair, and stops. On the full gate it runs the gate again on the repaired revision until one pass comes back clean or an alarm stops it. The next section covers the gate.

**6. Simplify.** Before the pass expected to certify the work, a simplification review deletes dead branches and speculative abstractions: `/ponytail-review` where installed, otherwise `/simplify` or a manual pass. A simplification landed after a clean pass is a repair that needs a pass of its own.

**7. Deliver.** The work lands by your project's norm, a commit or a PR as its AGENTS.md or CLAUDE.md says. The agent pushes only where that norm or you say to. Where it cannot write where the work must land, it builds elsewhere and hands you the diff. The report opens with the delivery line: whether the shipping revision is certified, which blocking findings are open, how shipping differs from certified, and any punch list. It closes by walking your request item by item and naming where each landed or why it was deferred.

## The gate

One full pass has three parts: the native checks, the designated review the wrapper names, and the red team. The report names what filled each part.

**A clean pass.** A pass is certified against one revision, and a change before every seat returns voids it. It is clean when it finds no blocking finding, leaves none open from an earlier pass, and the real-environment run is on record for that revision.

**What blocks.** A finding blocks when someone acting on the deliverable as it stands would do the wrong thing: a failed check, a defect, a false claim about what the product does in something that ships, a breach of your brief or your project's documented rules, a seam the change introduces or crosses with no test, or work below the anchor's bar. Three things never block: claims about the loop itself (a count, a round number, a commit message), wording that is imprecise but correct, and a steering document such as the spec or the record, unless that document is the deliverable.

**Where findings go.** A non-blocking improvement goes on a deferred list you see at delivery. A finding you decline is closed, and later reviewers are told so. A red-team claim shown false from source is refuted, with the evidence recorded.

**Repairs.** A certified revision stays certified through a repair to wording, a comment, a test, a gate instrument or a steering document, unless the repair loosens or removes a check. A repair to shipping code, or to a claim about what it does, needs its own clean pass, judged from the diff. The next pass attacks the repair first, because half of the blocking findings recorded in past doctrine runs landed inside the previous round's repair. A repair writes no claims about itself, such as a round number or a "verified by" note, into a comment, spec or commit message, except a claim the reader needs, proved by breaking the code and watching the check fail. Documentation the work needs is written after the phase exits or you end the rounds, never mid-round. Two things are not that deferral: a false claim the gate found is a defect repaired in the round, and where prose is the deliverable, it is not documentation.

**The class question.** For every blocking finding that survives checking, the agent asks where else the same cause would have left the same mark, and whether a check exists for that kind of mark. The fix goes to every site the agent may touch. A site outside what it may change is never silently fixed and never silently dropped: where it still works it goes on the deferred list, where the work leaves it broken it blocks, and where the boundary is unclear, or looking cannot settle it, it goes on that list and to you as a question. A kind of mark a script can catch is caught by that script every round after.

**Two alarms.** The round alarm counts rounds that found a blocking finding and fires at every multiple of your figure, default 4. The time alarm fires when the time since the last round closed, or since the phase opened, passes your budget, default two hours. Either one stops the loop and puts a diagnosis to you: what shipping now would mean, why the loop has not closed, and whether a clean pass is reachable at all. Where it is not, the agent may propose a narrower blocking definition for you to rule on. You choose to continue or ship. A "continue" given in advance does not switch an alarm off: only a ruling given after it fires restarts the loop.

**Other exits.** A wrapper replaces this exit only by stating its own. `doctrine-gauntlet` does. Wrappers whose deliverable is prose, `doctrine-write` among them, adopt the hub's **prose-deliverable exit** by name. That exit is one clean pass as usual, but if none has come by the round alarm's first firing, one closing round covers the changes since the last fully reviewed revision, or the whole deliverable where none was, and the phase ships at an escalation with a punch list. The diagnosis still reaches you, and the closing round starts without waiting for your ruling unless you say stop.

**Five end states.** A phase ends as:

- **Exited:** certified, the only clean ending.
- **Stopped:** you ended the loop, and its open findings stay open.
- **Shipped at an escalation:** you chose to deliver at an alarm or at the standard gate's stop, or the prose-deliverable exit's closing round delivered.
- **Blocked:** the session ended with a direction question unanswered.
- **Unable:** execution ended and cannot resume by itself, for example when credentials are gone.

A phase that has not ended is Open. The four non-clean endings reach you under those names, never as certified. A phase certified on the reduced gate reopens, and runs the standard gate unless you choose the full one, if it later turns out to have had wider reach than the search found.

## The record, handoffs and auto-cycle

The record is the run's memory. It holds the time the phase opened, every wave as it goes out (the seat, what it was handed, a handle to find its result, the clock time), and for each round the revision, the time it closed, every finding and the alarm counts. On resume the record outranks anything the session remembers, and a wrong value is corrected by appending a line, never by starting over. Its run state sits in a part no reviewer is handed.

Each event is one line in a fixed form that `hooks/dctr-record.mjs` parses: `wave:`, `round:`, `finding:`, `ruling:`, `alarm:`, `question:`, `relay:`, `State:` and the `auto-cycle` lines. Inside herdr, each round's counters are published as sidebar tokens with `node <plugin-root>/hooks/dctr-token.mjs <round> <exit-count> <valve>`, shown once your herdr config renders them. On Claude Code inside herdr, `hooks/dctr-roundguard.mjs` refuses a round line written without that publish, or one that names a gate output file kept in the temp directory.

A handoff is a dated snapshot of the record for a session that will resume it. `doctrine-handoff` writes it, `doctrine-backup` writes the memory file that points at it, and `doctrine-resume` and `doctrine-primer` load the phase's wrapper and the hub when the record the handoff names is Open or Blocked.

**Auto-cycle** lets a long phase clear its context and resume on its own. It runs on Claude Code, and on Codex once the hooks are installed. On Claude Code it needs one-time setup: the session running in a herdr pane with herdr's Claude integration, auto-compaction off, and the statusline bridge, as [requirements](../requirements.md#auto-cycle-setup) gives them. Outside a herdr pane it pauses instead of cycling, and without the bridge a percent or default tier never warns. Codex has no setting that turns automatic compaction off, so there set the tier low enough that the warning and the handoff after it finish before Codex compacts. Ask for it when a phase will run long. The agent turns it on by appending `auto-cycle: on cap <n> tier <tokens or percent>` to the record and running `doctrine-handoff`: the cap bounds how many times it cycles, and the tier is the context use, in tokens or a percent, at which the context gauge warns. When the gauge warns, the agent starts nothing new, waits for the seats already out, writes a handoff and ends its turn with `auto-cycle: ready`. Once focus moves off the session's pane, the hook types `/clear` and the resume command into it. An `auto-cycle: off` line appended to the record switches it off. A file named `.doctrine/auto-cycle.stop` in the session's repo or the record's repo stops it, and deleting the file lets it resume, except that a session the file paused after its context warning cycles again only once you run `/clear` and type the resume command yourself. When the agent pauses auto-cycle itself, for an alarm, a Blocked phase or an open question, it writes `auto-cycle paused: <reason>` to the record and sends a notification reading `<phase>: doctrine auto-cycle paused, <reason>`.

## On Claude Code and on Codex

The same skill text runs on both. Before its first seat the agent reads a host reference beside the skill, `references/claude-code.md` or `references/codex.md`, which says how that host loads a skill, dispatches a seat, waits on a file and notifies you, and which seat is the red team from the other model family. On Codex the agent reads long files in chunks, and the hooks run only once you install them with `node <plugin-root>/hooks/dctr-codex.mjs install`, adding `--codex-home <dir>` for a home other than `$CODEX_HOME` or `~/.codex`, and run again after each plugin update.

## When something is not installed

The hub runs with nothing else installed. Each skill it names has a substitute:

| Missing | Substitute |
|---|---|
| The red team from the other model family | A fresh-context subagent told to refute the work, named in the report as a same-model red team |
| ponytail | `/simplify` or a manual pass over the run's own diff. For an audit lens, a read-only manual pass, never `/simplify` |
| matts-code-review | `/code-review`, or two parallel subagents, Standards and Spec, handed the same inputs |
| Matt's `tdd` | Red-green-refactor done inline |
| Matt's `diagnosing-bugs` | Reproduce first, regression test before the fix, inline |
| Matt's `implement` or `improve-codebase-architecture` | Its SKILL.md read from your skill directory if present, otherwise the wrapper's inline fallback |
| superpowers | Parallel seat dispatches with assembled prompts. Each seat pastes its check output and the agent re-runs the checks. Brainstorming becomes an interview with you before designing |

A seat that reports its own tool as not installed is substituted at once. A seat whose tool is installed but fails is retried once in the round and once in a later round, then substituted for the rest of the phase. Every seat has a deadline set when it is dispatched, and one past it with no new output is a failed seat. Each substitution is recorded and named in the exit statement. `matts-code-review` is Matt Pocock's `code-review`, installed by you under a new name; this plugin does not bundle it. [requirements](../requirements.md) has the install commands, and [watching-a-run](../watching-a-run.md) shows how each seat gets a pane in herdr.

## How to invoke it

Most of the time, ask for a wrapper and it loads the hub:

```text
use doctrine-audit on src/whatever.ts (scope is that file only)
```

To run the hub with no wrapper:

```text
with the doctrine: <your request, with any round count or time budget you want>
```

The specification is [`skills/doctrine/SKILL.md`](../../skills/doctrine/SKILL.md). Where this page and the specification disagree, the specification is right. [how-this-is-tested](../how-this-is-tested.md) says how the rules are checked.
