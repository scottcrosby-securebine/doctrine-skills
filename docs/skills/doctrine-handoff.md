# doctrine-handoff

Use it when you are about to clear the session and the next one must pick up the work with nothing lost. It writes a dated handoff document under `docs/handoffs/`, organised by the plan the work serves, then runs `doctrine-backup` so the memory file points at it and a red team checks both before they are committed, or reported local where ignored.

![The doctrine-handoff shape in three rows: conform the repo, take the installed handoff skill's content rules, and write a new dated file with its header lines and seven sections; then a backup points the memory file's kickoff at it, a read-only red team checks both files, and the files are committed, or reported local where ignored; then the next session, after /clear, follows kickoff, handoff and record, and loads the phase's wrapper.](doctrine-handoff.png)

The figure shows the three stages this page walks through: writing the handoff, the backup that finishes it, and the next session that reads it.

## When to use it, and when not

The trigger is a request for a handoff document, a request like "a detailed backup and a handoff so I can clear the session", or anything that carries this session's detail to the next cleared session.

It is one of four continuity skills, and each owns a different file or moment:

- `doctrine-backup` writes the memory file, `SESSION_MEMORY.md`: survivable context held to about 400 words. It does not direct the work.
- `doctrine-handoff` writes the handoff: the verbose, tactical slice of the plan. The handoff is where the detail lives, and it has no word target.
- `doctrine-resume` and `doctrine-primer` read both in the next session.

So ask for a backup when the memory file is all the next session needs, and for a handoff when it needs the reasoning, the dead ends and the exact next step.

You do not always have to ask. Inside a doctrine phase the hub runs this skill itself at two moments (doctrine step 5): when auto-cycle is switched on, since the context gauge finds the phase's record only through the chain a handoff writes, and when the gauge warns that context is running low, after which the session ends its turn with `auto-cycle: ready`.

A backup also runs this skill's first three steps when it finds more than three true gotchas, more than the memory file holds, and it wrote no handoff, so the extras have somewhere to go.

## What it asks you first

Nothing of its own. It has no question round, because it writes down the state the session already holds.

Two questions can come from the `doctrine-backup` rules it borrows. The repo conforming step (backup step 0) asks which memory file is current when the root holds several. Backup step 3, which picks the handoff the `supersedes:` line names, asks which handoff is current when no kickoff names one and several handoffs are each named in no other handoff's `supersedes:` line. Under auto-cycle neither is put to you. The run appends an `auto-cycle paused: question:` line to the phase record and ends its turn instead.

## How it runs

The plan the handoff is tied to depends on the repo. In a repo that a doctrine project file tracks, the plan is that project: the epic, its Done means items, and the phase. There, a plan item is a Done means item, never the phase or the epic that holds it. In a repo with no project file, the plan is the repo's GitHub issues and the task at hand.

1. Conform the repo. Before writing anything it runs `doctrine-backup` step 0, which brings the repo to one standard: one `SESSION_MEMORY.md` at the root, and every handoff under `docs/handoffs/`. In a public repo, or one an installer's tooling copies whole, `docs/handoffs/` goes into `.gitignore` first, so a handoff not yet tracked stays local. A handoff already tracked stays tracked. This plugin's own repo ignores it for that reason. A handoff found elsewhere is moved there with its name kept, or with `-2`, `-3` appended where the name is taken, and every path that pointed at its old location is rewritten, in the memory file and in every handoff. That path rewrite is the only change made to an existing handoff. The point is that the handoff this one supersedes is already where the chain expects it.
2. Apply the content rules. It looks for an installed `handoff` skill, first in your host's user skill directory and then in the project's, and takes only that skill's content discipline: reference specs, plans, issues and commits by path or number instead of restating them, and name the skills the next session should invoke. It ignores that skill's storage rule, which puts the file in the OS temp directory. If no `handoff` skill is installed it says so once, names the source (`mattpocock/skills`, `skills/productivity/handoff/SKILL.md`), and continues.
3. Write the file at `docs/handoffs/<YYYY-MM-DD>-<slug>.md`, the slug naming the piece of work. Every run writes a new file, even when one was written earlier the same day: a taken name gets `-2`, then `-3`. No earlier handoff is otherwise edited. The header lines, sections and rules below say what goes in it.
4. Finish with a backup, described under "How it ends".

### The header lines

The file opens with machine-read lines above its title. The first is always `supersedes: <path>`, naming the current handoff. That is the one the memory file's kickoff names. The kickoff is the `## Next Session Kickoff` section of `SESSION_MEMORY.md`, whose first line names a handoff. With no kickoff, the current handoff is the one in `docs/handoffs/` that no other handoff's `supersedes:` line names. Only when there is none does the line read `supersedes: none`. It is never this file, and never simply the newest file in the directory, which on a fresh clone could be any of them.

When the work is a doctrine phase, four more lines follow, each on its own line and in the form the hub's step 5 gives:

```text
phase: <name> <state> ...
record: <path> :<line> "<the record's last state line, quoted>"
wrapper: <skill name>
invoke doctrine:doctrine first
```

The `...` after the state stands for anything else the phase line carries. The last line appears only while the phase is Open or Blocked. It tells a session that did not come in through `doctrine-resume` or `doctrine-primer` to load the doctrine before acting.

Two cases change how those lines are filled in. If the record is on this host and has no `wrapper:` line, the skill appends one to the record's end, because a record is appended to and never edited, and it says so in its report. The name comes from the record's title line, else the superseded handoff, else the wrapper this session invoked, else `none`. If the skill that owns the work is not loaded in this session, it copies the previous handoff's header lines forward, refreshes the state, the quoted record line and the wrapper from the record, and marks the quoted line as copied when the record is not on this host.

### The seven sections

The body has these sections, in this order and no others:

1. **State in one paragraph**: where the work stands, what is live, and the immediate next step.
2. **Where this sits in the plan**: in a tracked repo, the project file's path, the epic, each Done means item in play with its obligation (satisfy, contribute or preserve) exactly as the epic record states it, the phase and its record's path, and every GitHub issue the work touches with the plan item it serves, or "none". In an untracked repo, the issues, or that none are touched.
3. **Read these, in this order**: every file by its repo path. Every path must exist.
4. **Work by plan item**: one heading per plan item or issue, plus one heading, "Serves no plan item", for the rest. Every task appears under exactly one heading, one line each, with its status and a pointer to where its detail lives. A closed issue or a discrepancy stays under the item it serves. This section carries the reasoning, the dead ends and what failed, which is what survives the clear.
5. **Do this first**: exactly one action, in one sentence. Two things joined by "then", "and" or "before" count as two actions, and when an action has a precondition, the precondition is the one action. Everything else due goes in section 4.
6. **Gotchas this phase produced**: the ones the memory file will not carry, including any true gotcha its three-line cap moved here.
7. **Suggested skills**: which to invoke, and which first.

### Rules for the whole file

The handoff is as long as the next session needs, and the memory file's word target does not apply. Three rules come from failures found in live repos: reference what already lives elsewhere instead of copying it, cite code by symbol rather than line number, and never write a scratchpad path or a versioned plugin-cache path. A scratchpad path dies when the session ends, and a plugin-cache path dies at the next version bump. Both were found dead in committed files.

### The orchestrator profile

In the orchestrator session of a `doctrine-orchestrate` run (its `DCTR_ROLE` is `orchestrator`), three things change. Section 5 is always "read the last 20 lines of `<run>/events.log`", where `<run>` is the directory `DCTR_RUN` names, so a restarted orchestrator learns what the run did while it was gone before it acts. Section 4 opens with a roster: one row per lane and one for the merge session, each read live from its record's last state line, the state herdr reports for its pane, and its held and inbox files, with `unknown` for anything that could not be read. Every question waiting on you is copied word for word from `<run>/waiting-questions.md` into the roster, beside the lane that asked it.

## How it ends

A handoff is not done until a backup has landed it. The skill runs `doctrine-backup` from its step 1, unless the handoff was written from inside a backup, in which case that backup carries on. The backup does three things:

- It rewrites the memory file so its kickoff's first line names the new handoff: `handoff: docs/handoffs/<file>.md | state: open`, where `state` is `open` while the phase record reads Open or Blocked and `none` otherwise. When that record is not on this host, the previous state word is kept and the report says the record was not found.
- It dispatches one read-only red-team seat, from the other model family where one is installed (Codex, on Claude Code), and a fresh-context seat of the same family otherwise. The seat is handed both files pasted in full, with the record's state and wrapper lines, the plan, the git log, the project's law and the standards each file is graded against. It answers on correctness, completeness, the memory file's standard, the project's law, the handoff's sections and rules, the header lines and the content rules. Each finding is verified before it is fixed, and a rejected finding is named with its reason.
- It commits the files it wrote by pathspec as `docs(session): <what changed>`, and never pushes. It leaves out every ignored path, so where the memory file and `docs/handoffs/` are both ignored, as in this plugin's own repo, neither file is committed and the report says both are local and ignored. A move or a `.gitignore` line from step 1 is still committed, and only when nothing is left to name does the backup commit nothing.

The skill is done when the handoff sits at a new path under `docs/handoffs/`, the memory file's kickoff names it, the red team's findings are fixed or rejected with a reason, and both files are committed or reported local and ignored.

The next session closes the loop. `doctrine-resume` reads the kickoff, opens the handoff by the path it names, reads the record that the `record:` line names, and, where that record reads Open or Blocked, loads the phase's wrapper and the doctrine before it does anything else. It then settles section 5's one action as done, due or ambiguous. Ambiguous means the action's effect is visible, a commit or a file it names, but nothing records it done, so resume runs it zero times and pauses, under auto-cycle too, and asks you whether it ran when no record was read. After a `/clear`, the plugin's restore hook, `dctr-restore.mjs`, follows the same chain and, only when the record reads Open or Blocked, puts the phase, the record path, its last state line, the wrapper and the current handoff into the new session's context. With auto-cycle on, the resumed session carries on with the phase in the same turn, unless the action is ambiguous or the record reads Blocked. With it off, the session ends its turn with the report and you take the next step.

## A worked example

This example is illustrative: it shows the shape of a run, not a recorded one.

You are mid-way through a `doctrine-code` phase that adds rate limiting to an API, in a repo with no doctrine project file. Context is getting long, and you say: "do a detailed backup and a handoff so I can clear the session."

The run conforms the repo first. The memory file is already `SESSION_MEMORY.md`, and the repo is private, so nothing is moved or ignored. It finds Matt Pocock's `handoff` skill installed and takes its content rules. It writes `docs/handoffs/2026-11-18-rate-limit.md`, with `supersedes:` naming the handoff the kickoff named. Because the phase is Open, the header carries its `phase:`, `record:`, `wrapper: doctrine-code` and `invoke doctrine:doctrine first` lines. Section 2 lists issue #41, the task. Section 4 holds, under #41, the reason the token bucket moved from memory to Redis and the test that failed before it did. Section 5 says one thing: rerun the integration suite against the Redis branch.

The backup then points the kickoff at the new file, the Codex seat reports that section 3 names a file that was renamed in the last commit, the run fixes that path, and one commit lands both files. You run `/clear`, then `/doctrine:doctrine-resume`. The new session loads `doctrine-code` and the doctrine, then reports the handoff, the record, and that the first action is due. Auto-cycle is off, so the session ends its turn with that report, and you tell it to rerun the suite.

## How to invoke it

```text
do a detailed backup and a handoff so I can clear the session
```

Naming what the next session is for, as in "handoff for the migration work", gives the run a slug and a focus. It does not change the sections.

## Requirements

Nothing needs to be installed. Two optional pieces change what the run gets, and the report says which it had.

- Matt Pocock's `handoff` skill, from `mattpocock/skills` at `skills/productivity/handoff/SKILL.md`, supplies the content rules. Without it the run says so once and writes the handoff without it.
- On Claude Code, the OpenAI Codex plugin, with the Codex CLI logged in, supplies the red-team seat from the other model family. On Codex, the Claude Code CLI supplies it. Without it the backup uses a fresh-context seat of the same family and says so. Both installs are in [docs/requirements.md](../requirements.md).

## Red flags

Stop and ask if you see any of these:

- A `supersedes:` line that names the newest file in `docs/handoffs/` rather than the current handoff.
- An earlier handoff edited beyond the step 1 path rewrite, or a handoff written over one that already had that name.
- A section 5 that holds two actions.
- A path under a scratchpad or a versioned plugin-cache directory anywhere in the file.
- A handoff reported done with no backup run, so the kickoff still names the old file.

The hub's page is [doctrine.md](doctrine.md), and the README is [README.md](../../README.md).

The specification is [`skills/doctrine-handoff/SKILL.md`](../../skills/doctrine-handoff/SKILL.md). Trust it over this page wherever the two disagree.
