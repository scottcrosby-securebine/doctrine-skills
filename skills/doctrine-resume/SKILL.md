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
bold or as a list item) and its `wrapper:` line (doctrine step 1; drop a
`doctrine:` prefix and a trailing period from the value). What the record reads
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
had you invoke it. With `wrapper: none` or no wrapper line, invoke only
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

**Handoff**: [path read | none named | named but missing] · record [<path>, last state line quoted | none named | not found] · doctrine [invoked, with the skills named | not open | not installed] [· mismatch with the kickoff's state] [· open question]

**Drift**: ✅ none | ⚠️ [specific mismatches, one per line]

**Active Work** (hydrated):
| Item | Issue | State | Key Files |
```

Add nothing beyond this skeleton — the quoted sections run as long as they run,
and truncating a verbatim Resume or Kickoff defeats the point. Carry the file's
`Key Files` column through unchanged; it is the next agent's only pointer into
the code.

## 5. Resync on drift

When the repo and the file disagree, ask: "Memory is stale — resync it?" On yes,
run `doctrine-backup`, which updates the file in place and carries forward Gotchas
and any unresolved 🔴 row. That closes the loop so the next session starts from
truth instead of inheriting the same stale file.

## Done when

Every drift check has run, every bare-`#N` cell is hydrated and every skipped
cell named, the kickoff is quoted or its absence flagged, and its first line was
acted on before anything else.
