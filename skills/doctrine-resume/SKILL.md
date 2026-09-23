---
name: doctrine-resume
description: Use when the user asks to load memory, resume the session, restore state, or pick up where the last session left off. Reads SESSION_MEMORY.md and the handoff its kickoff names, loads the doctrine when a doctrine phase is open, and reports drift. State only, no codebase tour.
---

# Doctrine Resume — warm resume

Restore session state and report drift. This is the cheap path: state only, no
codebase tour. Use `doctrine-primer` when the agent needs the project explained.

## 1. Find and read saved state

`ls` the repo root first — do not assume the filename. The usual name is
`SESSION_MEMORY.md`, but a project may use another, and some carry several
scoped variants. If exactly one exists, read it. If several exist, read the
unqualified one and name the others rather than merging them.

If none exists, say so and stop: there is nothing to resume, and `doctrine-primer` is
the right command.

Parse every section: Resume, Active Work, Git State, Runtime, **Gotchas**, and
Next Session Kickoff.

Read Gotchas even though the report below only echoes them on request. Step 5 can
hand off to `doctrine-backup`, which carries forward what it was told — anything
you skipped here is a line you may help delete.

## 1b. Act on the kickoff's first line

Before any drift check, read the kickoff's first line. If it names a handoff
path, read that file in full now, by that path — never the newest file in a
directory, which on a clone is any of them.

Then read the record the handoff's `record:` header line names (doctrine step 5
gives the header lines). Resolve its path by taking the first of these that
exists: the path as written if absolute, else relative to the repo root, else
relative to the repo root's parent directory, which is where a sibling repo's
path such as `<other-repo>/.doctrine/records/<file>.md` lands. In the record,
take its last state line (a line whose text starts `State:`, in any case, bare,
bold or as a list item) and its last `wrapper:` line, else the handoff header's
`wrapper:` line (doctrine step 1; drop a `doctrine:` prefix and a trailing
period or comma from the value). What the record reads
is the first word after `State:` on that line, bold and trailing period ignored.
The record is the authority on whether a phase is open, never the kickoff: when
the record's state and the kickoff's `state:` disagree (the record reads Open or
Blocked and the kickoff reads anything but `open`, or the record reads anything
else and the kickoff reads `open`), name the mismatch in the Handoff line. Facts
a restore hook put in this session's context are a hint and never outrank the
record.

When the record reads Open or Blocked, your next tool calls are Skill tool
invocations, in this order: `doctrine:<wrapper>` (for example
`doctrine:doctrine-code`), then `doctrine:doctrine` unless the wrapper already
had you invoke it. With `wrapper: none`, or no wrapper line in the record or the handoff header, invoke only
`doctrine:doctrine`. Nothing comes before them except step 1's `ls` and the
reads this step and step 1 already made: no drift check, no `git` or `gh`, no
other file read. When it reads Blocked, also name the open question in the
Handoff line: the record's last `question: <id> opened` line with no later
`question: <id> answered` line for the same id, else the state line's own text.
When the record reads anything else (Exited, Stopped, Shipped, Unable, or no
state line at all), invoke neither, whatever the kickoff says.

When no record was read, because the handoff names none or its path resolves
nowhere (say which in the Handoff line), fall back to the kickoff: if the
kickoff line's `state:` is `open` (case-insensitive), invoke the `doctrine:doctrine` skill with the Skill
tool before any other call: the handoff describes the doctrine as it stood when
it was written, and a session that only reads about the doctrine never loads it.
`open` means a doctrine phase is open; any other value means do not. If a skill
named in this step is not installed, say so in the Handoff line and continue;
the handoff's Suggested skills section names what to load instead. The handoff is a dated
snapshot and the memory file is rewritten at every backup: where the two
disagree, the memory file's Kickoff is current and the handoff is history, and
the Handoff line says so. A
kickoff with no such line predates this rule: quote it as before and say the
line is missing. A named handoff that does not exist on disk is drift, reported
in step 4, not silence.

Two more checks follow the invocations above, or come first when none was due,
whenever the kickoff names a handoff that exists on disk.

**Interrupted backup.** The backup that should have carried the current
handoff never landed when the memory file is tracked and `git diff HEAD --
<memory file>` changes its kickoff `handoff:` line, or it is untracked and not
ignored (`git ls-files --others --exclude-standard -- <memory file>` lists it),
or a handoff under `docs/handoffs/` names the kickoff's handoff in its
`supersedes:` line (the crash fell between `doctrine-handoff` steps 3 and 4, and
that newer handoff is the one to back up: from here on, its header is the one
this step's record read and invocations follow, so re-run those on it where they
read the older one). A dirty memory file whose kickoff line is unchanged, and an
ignored one, are not this case. The
Handoff line says `interrupted: handoff written, backup not committed`, and step
5 finishes that backup. Never run `doctrine-handoff` for this case, since a
second handoff would head the `supersedes:` chain beside this one.

**First action.** The handoff's section 5, Do this first, is one action; in the
interrupted case above it is the section 5 of the handoff found interrupted, the one step 5 backs up.
Settle whether it already ran before anyone takes it:

- Done: a line in the memory file's Resume or in the record names it done.
  Do not take it again. The Handoff line says `first action: done`.
- Ambiguous: no such line, but the tree or the record shows its effect (the
  commit it names exists, the file it names exists, the `<out>.result` file of
  the check it launches exists). Take it zero times, whether or not auto-cycle
  is on. Append
  `- auto-cycle paused: first action ambiguous: <the section 5 sentence, verbatim>`
  to the record read above (the newer handoff's in the interrupted case),
  placed as `doctrine-backup`'s rule "Under auto-cycle, a question pauses the
  run" places its line, say `first action: ambiguous, paused` in the
  Handoff line, and end the turn after step 4's report. Where that rule finds no
  record, append nothing and ask the user whether it ran.
- Otherwise it is due, and the Handoff line says `first action: due`.

## 2. Check drift

**Drift** is any gap between what the file claims and what the repo shows. Batch:

- `git status -sb` — branch and ahead/behind, against the saved Git State
- `git status --short | grep -v '^??'` — tracked-only, the unit the memory file
  records; a raw listing counts untracked tooling dirs and fakes drift
- `git log --oneline -5` — what landed since the file was written
- `gh pr list --state open`
- `gh workflow list`, then the build/publish workflow's
  `gh run list --workflow "<name>" --limit 3 --json headSha,conclusion`

If `gh` errors, say so once and continue git-only. If `gh workflow list` succeeds
but is empty, the repo has no CI — say that rather than reporting a failed build.
An empty `conclusion` means the run is still going: report "running".

Trust the repo over the file. Name each mismatch specifically — "memory says
`4b172f9b`, HEAD is `8b36d9f7`" beats "state has drifted."

The backup's own commit is not drift. A backup records the SHA before it
commits, so its commit sits one past the Git State line. When
`git merge-base --is-ancestor <recorded sha> HEAD` succeeds,
`git rev-list --count <recorded sha>..HEAD` prints 1, `git log -1 --format=%s`
starts `docs(session):`, and `git show --name-only --format= HEAD` lists only
paths the pathspec of `doctrine-backup` step 6's commit line may name, report no
drift for that commit, nor for an ahead count that differs from the saved one by
that commit alone. Any other commit ahead, and a HEAD the recorded SHA is not an
ancestor of, is drift.

A green build usually means artifacts were published, not that anything was
deployed. Treat a "deployed" claim as unverified unless the repo documents a
deploy check and you run it.

## 3. Hydrate active work

Find the Active Work table's tracker column — commonly `Issue`, but it may carry
another name. Hydrate **only cells that are a bare `#N` or `N`**:

```bash
gh issue view <N> --json title,state --jq '"\(.state)  \(.title)"'
```

Skip everything else, and say what you skipped rather than silently passing:

- a placeholder — either `—` (em dash) or an ASCII `-`
- several ids in one cell
- a legacy tracker id such as `repo-a1b2` — `gh issue view` errors on these
- a **cross-repo** reference such as `otherrepo #492`. That number belongs to a
  different repo; running it here resolves against the wrong one and either
  errors or, worse, returns an unrelated issue

If the column is named for a retired tracker, its ids are dead: report them as
unhydratable and suggest migrating them, rather than guessing at counterparts.

An issue the file calls open but `gh` calls closed is drift — report it.

## 4. Report

```
## Session Restored

**Resume**: [the file's Resume, verbatim]

**Kickoff**: [the file's Next Session Kickoff, verbatim — or "absent" if missing]

**Handoff**: [path read | none named | named but missing] · record [<path>, last state line quoted | none named | not found] · doctrine [invoked, with the skills named | not open | not installed] [· mismatch with the kickoff's state] [· open question] [· interrupted: handoff written, backup not committed] [· first action: done | ambiguous, paused | due]

**Drift**: ✅ none | ⚠️ [specific mismatches, one per line]

**Active Work** (hydrated):
| Item | Issue | State | Key Files |
```

Add nothing beyond this skeleton — the quoted sections run as long as they run,
and truncating a verbatim Resume or Kickoff defeats the point. Carry the file's
`Key Files` column through unchanged; it is the next agent's only pointer into
the code.

## 5. Resync on drift

In step 1b's interrupted case, do not ask: run `doctrine-backup` steps 3 to 6 on
the handoff step 1b found interrupted, treated there as the handoff this run
wrote, so the kickoff names it, with step 2's batch as its step 1 output, its
step 2 run only where the kickoff line is unchanged (the crash fell before the
memory file was rewritten), and `git show HEAD:<memory file>` as the previous
memory file its step 5 hands the red team. That backup was already asked for,
and its commit lands the handoff and the memory file together. Do not run
`doctrine-handoff`.

Otherwise, when the repo and the file disagree, the question below is asked
under `doctrine-backup`'s rule "Under auto-cycle, a question pauses the run",
which says when it is asked and what is appended instead. Ask: "Memory is stale — resync it?" On yes,
run `doctrine-backup`, which updates the file in place and carries forward Gotchas
and any unresolved 🔴 row. That closes the loop so the next session starts from
truth instead of inheriting the same stale file.

## Done when

Every drift check has run, every bare-`#N` cell is hydrated and every skipped
cell named, the kickoff is quoted or its absence flagged, its first line was
acted on before anything else, and step 1b's interrupted-backup and first-action
checks ran.
