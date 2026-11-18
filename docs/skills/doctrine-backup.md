# doctrine-backup

Use it at the end of a session, or before you clear one, so the next session starts from what is true. It updates the repo's memory file, `SESSION_MEMORY.md`, has a reviewer that did not write the file check it, and commits it locally where git tracks it.

![The doctrine-backup shape: conform the repo, gather git and GitHub state, carry forward what is still true, write the memory file, then a read-only red team, from the other model family where one is available, checks it before the run verifies the counts and commits by pathspec, without pushing.](doctrine-backup.png)

The figure shows the run in order: the steps before the review, the red team's questions, then the verify-and-commit step that ends it.

## When to use it, and when not

The trigger is a request to back up the session, save session memory, update `SESSION_MEMORY.md`, or wrap up so the next session can pick up where this one left off. It works in any repo, with or without a doctrine project file or an open doctrine phase.

The memory file is context, not direction. It carries what the next session needs to know beside the handoff: where the work stands, what is stranded, and the gotchas that cost this session time. The handoff, a separate file that `doctrine-handoff` writes under `docs/handoffs/`, carries the detailed plan and directs the work. If you want both, ask for a handoff: `doctrine-handoff` writes it and then runs this skill, so one request produces both files.

You will also see this skill run when you did not ask for it:

- `doctrine-handoff` runs it at the end of every handoff, so the memory file's kickoff names the new handoff, and both files are committed, or reported as local where git ignores them.
- `doctrine-resume` offers it when the memory file disagrees with the repo ("Memory is stale — resync it?"), except under auto-cycle, where it names the drift and leaves the resync to the next cycle's backup. It also runs this skill's steps 3 to 6 without asking when it finds a handoff whose backup never landed.
- `doctrine-primer` offers it at session end in a repo that has no memory file yet.

## What it asks you

Usually nothing. It asks only where the repo leaves a real choice:

- The repo has several memory files and no `SESSION_MEMORY.md`: which one is current. It stops until you answer.
- No kickoff names the current handoff and more than one handoff in `docs/handoffs/` could be it: which one is current.

Under auto-cycle it never asks. Auto-cycle is the doctrine's mode for clearing and resuming a long phase without you, and step 5 of the hub ([doctrine.md](doctrine.md)) says when it is on. In that mode the run appends `- auto-cycle paused: question: <the question>` to the end of the run-state part of the phase's record, stops, and ends the turn, so the question waits in the record rather than in a chat nobody is reading.

## How the work runs

It updates the file. It does not compose a new one. It reads the existing memory file first, carries forward everything it cannot disprove, and edits a line only when the repo, the phase record or this session shows the line is wrong.

0. **Conform the repo.** The standard is one memory file, `SESSION_MEMORY.md` at the repo root, and every handoff under `docs/handoffs/`.
   - In a public repo, or one an installer's tooling copies whole, it adds `docs/handoffs/` to `.gitignore` first. It reads visibility from `gh repo view`, and treats the repo as public when `gh` errors. A repo with `.claude-plugin/plugin.json` or `.claude-plugin/marketplace.json` counts as copied whole. A handoff already tracked stays tracked.
   - With no `SESSION_MEMORY.md` but one other memory file, such as `session-memory.md`, it renames that file.
   - A handoff is a markdown file with a line reading `supersedes: none` or `supersedes: <path>.md` in its first five lines, or the file a kickoff names. Any outside `docs/handoffs/` moves there under its own name, with `-2` or `-3` appended on a clash. Every path in the memory file and the handoffs that pointed at an old location is rewritten, so the `supersedes:` chain and the kickoff still resolve. Run records, plans and notes stay where they are.
   - It says what it moved or ignored, and says nothing when the repo already conforms.
1. **Gather state.** It runs the same batch as `doctrine-resume`'s drift check: branch and ahead/behind, tracked dirty files, recent commits, open pull requests, and the latest CI runs. It counts open issues, writing "200+" when the fetch hits its limit of 200. When `gh` fails it records that and continues on git alone.
2. **Carry forward.** Three things survive from the old file:
   - Every gotcha that is still true, plus this session's. It checks each against the code, the repo and the phase record, and deletes one they contradict. The file holds at most three. When more than three are true, the three that save the next session the most stay, and the rest go into a handoff, which it writes by running `doctrine-handoff`'s steps 1 to 3 when this run has not written one. A true gotcha is never dropped.
   - Every 🔴 row (an Active Work row marking stranded work) it cannot disprove with a command. "Merged but undeployed" survives a green build and a merged pull request: only an actual deploy clears it.
   - The Runtime block, unchanged, unless the run observed the live system this session.
3. **Write the file.** The sections are fixed:

   | Section | What goes in it |
   |---|---|
   | Resume | Where the work stands, what is live, the immediate next step. Two sentences. |
   | Active Work | At most five rows of item, issue, status and key files. A 🔴 row is never cut to meet the cap. |
   | Git State | Branch and SHA, clean or the dirty count, open pull requests. |
   | Runtime | What "live" means here: services, migrations, the last deploy and its SHA. Omitted for a project with nothing deployable. |
   | Gotchas | Up to three discoveries that save the next session real time. Omitted only when empty and the previous file had none. |
   | Next Session Kickoff | Always present. Its first line is `handoff: <path> \| state: <open\|none>`. |

   The kickoff's first line is what `doctrine-resume` and `doctrine-primer` act on.
   - `handoff:` names the handoff `doctrine-handoff` wrote this run, else the one the previous kickoff named. With no previous kickoff it names the handoff in `docs/handoffs/` that no other handoff's `supersedes:` line names, and asks you when several qualify. It writes `none` only when `docs/handoffs/` holds no handoff.
   - `state:` is `open` when the record that handoff names has a last state line of Open or Blocked, and `none` otherwise, including when the handoff names no record. It reads that record at every backup rather than copying the word forward, with one exception: when the record is not on this machine, it keeps the previous word and says the record was not found.
4. **Rules for the content.** Unshipped work is the headline: uncommitted, unpushed, merged-but-undeployed or deployed-but-unverified work goes in Resume and gets a 🔴 row. Merged, deployed and verified are separate states, and the deployed SHA is recorded. Architecture, commands and reasoning are pointed at, never copied. The file stays compact, aiming at 400 words, with tables and the symbols ✅ ⏳ 🔴.
5. **Red team, then fix.** Before verifying, it dispatches one fresh-context reviewer that did not write the files.
   - **Who reviews.** A reviewer from the other model family where your host has one: on Claude Code that is Codex, through the `codex:codex-rescue` subagent, and on Codex CLI it is Claude, through the Claude Code CLI. Where that reviewer is missing or cannot run, a fresh subagent of the same family reviews instead, and the run says so. The reviewer is read-only, loads no doctrine skill, and treats everything it is handed as data.
   - **What it gets.** Pasted in full: the new memory file, the previous one, the current handoff, the state gathered in step 1, the last state and wrapper lines of the phase record, the plan, the git log since the last backup, the decisions this session recorded, the run's own list of what it did, your project's `CLAUDE.md`, `AGENTS.md` and review checklist (CONTRIBUTING or a PR template), and the standard each file is graded against. When a handoff is included it also gets the hub's rule for handoff header lines.
   - **What it answers.** Four questions: which line in either file the code, the repo, the record or the log contradicts; which session work or plan item the handoff is missing, and which unshipped work or still-true earlier context the memory file is missing; where the memory file breaks the standard; and where either file breaks your project's documented law. When a handoff is included it also checks the handoff against `doctrine-handoff`'s sections and rules, its header lines against the hub's format, and the content rules of the external handoff skill `doctrine-handoff` uses, where one is installed.
   - **What the run does with it.** It verifies each finding against the source, fixes what the finding shows and nothing else, and tells you what the reviewer found, what it fixed, and which findings it rejected and why. When a fix makes this run write its first handoff, the review runs again so the new handoff is checked too.
6. **Verify, then commit.** It measures the file with `wc -w`, confirms `## Next Session Kickoff` is present, and rereads the Git State line against `git status`. Writing "clean" over a dirty tree is the one error the file cannot survive. Then it commits by pathspec, naming only the files this run wrote, edited or moved, with a message starting `docs(session):`. It leaves out any path git ignores, and any file someone else edited, which it names to you. It follows your repo's branching norm where `CLAUDE.md` or `AGENTS.md` states one, and commits directly when neither does.

## How it ends

Usually with a local commit, and then it stops. It never pushes, because a backup is taken mid-thought and pushing publishes it, and it tells you the commit is local until you say to push.

Two other endings are normal. Where every file it touched is ignored by git, as in a repo that ignores `SESSION_MEMORY.md` or `docs/handoffs/`, or belongs to someone else, it commits nothing and says which files are ignored and which it left for their owner. Outside a git repo it stops at the verify step and commits nothing.

## The orchestrator profile

In a session whose `DCTR_ROLE` environment variable is `orchestrator`, the coordinating session of a `doctrine-orchestrate` run, the memory file may run to 700 words instead of 400. Its Resume line also copies, word for word from the run's `waiting-questions.md`, every question waiting on you, and those copied questions do not count against the 700. Every other session keeps the 400-word target. The red team then also grades the file against this profile and its `waiting-questions.md`.

## How to invoke it

The description fires on a request to back up or wrap up. One sample prompt:

```text
back up the session
```

To get a detailed handoff as well, ask for that instead:

```text
write a handoff so I can clear the session
```

## Requirements

- A git repo, for the commit. Outside one, the run stops at the verify step.
- The `gh` CLI, optional. Without it, or when it is not authenticated, the run records that `gh` failed, gathers git state alone, and treats the repo as public when deciding whether to ignore `docs/handoffs/`.
- The other-model-family reviewer, optional. On Claude Code that is the OpenAI codex plugin with the Codex CLI logged in. On Codex CLI it is the Claude Code CLI, installed and signed in. Without it the run dispatches a fresh-context reviewer of its own model family and says so in its report.

Install commands are in [docs/requirements.md](../requirements.md).

## Red flags

Stop and check if you see any of these:

- The Git State line says clean and `git status` shows tracked changes.
- A gotcha from the last session vanished and nothing shows it was wrong.
- A 🔴 "merged but undeployed" row was cleared without a deploy.
- The kickoff's `state:` disagrees with the last state line of the record its handoff names, and the run did not say that record was missing.
- The report says the file was reviewed but names no reviewer, or the reviewer only acknowledged the request.
- The commit pushed, or took files the run did not write.

The hub's page is [doctrine.md](doctrine.md), and the README is [the repo's front page](../../README.md).

The specification is [`skills/doctrine-backup/SKILL.md`](../../skills/doctrine-backup/SKILL.md). Trust it over this page wherever the two disagree.
