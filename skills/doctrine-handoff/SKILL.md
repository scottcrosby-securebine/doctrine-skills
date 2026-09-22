---
name: doctrine-handoff
description: Use when the user asks for a handoff document, "a detailed backup and a handoff so I can clear the session", or anything that carries this session's detail to the next cleared session. Writes a new file under docs/handoffs/ tied to the plan, then runs doctrine-backup so the memory file points at it and both are red-teamed.
---

# Doctrine Handoff

Write the handoff: the verbose, tactical slice of the plan that carries this session's detail to the
next cleared session. The memory file is context; this is where the detail lives, organized under the
plan it serves. In a repo a doctrine project file tracks, the plan is that project: the epic, its
Done means items, the phase. In a repo with none, it is the repo's GitHub issues and the task at hand.

## 1. Conform first

Run `doctrine-backup` step 0 before writing anything, so the predecessor this file supersedes is
already at its standard path.

## 2. Content rules

Check `~/.claude/skills/handoff/SKILL.md`, then `.claude/skills/handoff/SKILL.md`. Read the first that
exists and apply its **content** rules: reference specs, plans, issues and commits by path or number
instead of restating them, and name the skills the next session should invoke. Take only its content
discipline; its storage instruction (a scratch file in the OS temp directory) does not apply, since
this file lives in `docs/handoffs/`. Pointing at that skill rather than copying it means its
improvements land here.

When neither path exists, say so once and continue:

> No `handoff` skill installed; writing the handoff without it. Source:
> `mattpocock/skills` → `skills/productivity/handoff/SKILL.md`.

## 3. Write the file

One file at `docs/handoffs/<YYYY-MM-DD>-<slug>.md`, where `<slug>` names the piece of work. A new file
every time this skill runs, even when one was written earlier today, beside the previous one and never
overwriting: when the name is taken, append `-2`, `-3`. No earlier handoff is edited.

**Header lines**, above section 1:

- `supersedes: <path>`: resolved before you create this file, the current handoff as `doctrine-backup`
  step 3 defines it, else `none`. It is never this file. Never the newest
  file in the directory, which on a clone is any of them.
- Then whatever header lines the skill that owns the work requires. A doctrine phase's are given in
  doctrine step 5; carry them in full, including its `invoke doctrine:doctrine first` line while the
  phase is Open or Blocked. When that skill is not loaded this session, copy the previous handoff's
  header lines below `supersedes:` forward, so the record's path stays in the chain, and refresh the
  state header and the quoted record state line with its line number from the record itself; when the
  record is not on this host, suffix the quoted line with "(copied from <previous handoff>; record not
  found <today>)".

**Sections**, in this order and no others:

1. **State in one paragraph**: where the work stands, what is live, the immediate next step.
2. **Where this sits in the plan.** In a tracked repo: the project file's path, the epic, each Done
   means item in play with its obligation exactly as the epic record states it (satisfy, contribute
   or preserve), the phase and its record's path, and the GitHub issues this work touches. In a repo
   with no project file: the GitHub issues this work touches, or that none do.
3. **Read these, in this order**: each by repo path, never "the newest file in a directory". Every
   path must exist.
4. **What is open**, grouped under the plan item or issue each serves, one line per item, each
   pointing at where the detail lives: an issue, the record's line, a spec section. Every task
   and issue this handoff names appears here, under the item it serves, or under its own heading
   when it serves none. Carry the detail here: the reasoning, the dead ends, what was tried and why
   it failed. This is what survives the clear.
5. **Do this first**: exactly one action, the first the next session takes, in one sentence with one
   thing to do. Two things joined by "then", "and" or "before" are two actions, and so is an action
   and its precondition: the precondition is the first action. Everything else due goes in section 4.
6. **Gotchas this phase produced**: the ones the memory file will not carry, including any true
   Gotcha its cap moved here.
7. **Suggested skills**: which to invoke, and which first.

This document is as long as the next session needs; the memory file's word target does not apply.
Rules, each one a failure found in a live repo:

- **Reference, never duplicate** what already lives elsewhere. Cite code by symbol, not line number.
- **No scratchpad path and no plugin-cache version path** (`~/.claude/plugins/cache/<x>/1.53.0/...`):
  the first dies on a bounce, the second on the next version bump, and both were found dead in
  committed files.

## 4. Finish with a backup

Run `doctrine-backup` from its step 1, unless this handoff was written from inside a backup, which then continues on its own. Its kickoff then names the file you wrote, its red-team seat
checks this handoff beside the memory file, and its commit lands both. A handoff is not done until
that backup is.

## Done when

The handoff is written at a new path under `docs/handoffs/`, the memory file's kickoff names it, the
red team's findings are fixed or rejected with a reason, and both files are committed or reported
local and ignored.
