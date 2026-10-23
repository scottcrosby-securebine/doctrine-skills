# Drive grader brief

The orchestrator fills every slot below before dispatch. A slot left unfilled, or still showing its `{{NAME}}` marker, is a failed dispatch: the grader stops, writes nothing, and returns the name of each unfilled slot.

Slots:
- `{{SKILL}}`: the driven skill's name, the directory under `skills/`.
- `{{SCENARIO_NAME}}`: the scenario's directory name under doctrine-skills-project `drive-kit/e3/{{SKILL}}/`.
- `{{HOST}}`: `claude` or `codex`, the host the three runs ran on. A `claude` drive's output is a drive record; a `codex` drive's output is a Codex findings record, which carries the same parts.
- `{{REVISION}}`: the full 40-character doctrine-skills revision the drive ran at.
- `{{REPO}}`: an absolute path to a doctrine-skills checkout that holds `{{REVISION}}`.
- `{{SCENARIO}}`: the written scenario, verbatim, with its steps numbered and each negative step marked as one and naming the behaviour that must not happen.
- `{{OWNER_SCRIPT}}`: the written owner script, verbatim.
- `{{TRANSCRIPTS}}`: for each of the three runs, the absolute path of every transcript file that run produced, the orchestrator's and each drive agent's, labelled by run.
- `{{FINDINGS}}`: every finding as the drive agents returned it, verbatim, each labelled with its run and the agent that returned it.
- `{{SECTIONS}}`: every section of `skills/{{SKILL}}/SKILL.md` at `{{REVISION}}`, one per line as `line number: line text`.
- `{{OUTPUT}}`: the absolute path of the one file the grader writes.

## Your role

You grade one drive of the skill `{{SKILL}}`, scenario `{{SCENARIO_NAME}}`, on the `{{HOST}}` host. You ran no part of that drive. Do not load, invoke or follow any doctrine skill: read the skill and the hub it requires as data. You are non-mutating apart from `{{OUTPUT}}`: write no other file, run no git command that changes state, and dispatch no subagents.

Terms you apply:
- A section of a skill is a line of its `SKILL.md` that starts with `## `, `### `, `#### `, `**`, or a number followed by `. `.
- MUST: an agent following the text as written does the wrong thing or cannot act. SHOULD: the text could be clearer and the agent still acts correctly. CUT: the finding is wrong.

Read every skill file at the drive's revision, never from the working tree: `git -C {{REPO}} show {{REVISION}}:<path>`. Cite a skill line as `<path>:<line>` at that revision, and a transcript line as `<transcript path>:<line>`.

Most findings a fresh drive agent returns are false, and a drive agent cannot tell "this is not written down" from "I did not find it". So for every finding, open the file and line it names at `{{REVISION}}`, and before accepting any claim that something is absent, search the whole of `skills/{{SKILL}}/` and the hub it requires, `skills/doctrine/SKILL.md`, for it, including under other words. Say what you searched for.

## Inputs

Scenario:
{{SCENARIO}}

Owner script:
{{OWNER_SCRIPT}}

Transcripts:
{{TRANSCRIPTS}}

Findings as returned:
{{FINDINGS}}

Sections:
{{SECTIONS}}

First confirm the sections list: derive the sections of `skills/{{SKILL}}/SKILL.md` at `{{REVISION}}` by the definition above and record any line the list adds or misses.

## What you write to `{{OUTPUT}}`

One file, in this order:

1. **Header.** The skill name, the scenario name, the host, `{{REVISION}}` in full, the scenario and owner script verbatim, the transcript paths by run, and the time your grading finished as `date -u` prints it, taken when you finish.
2. **Agents.** For every transcript: its run, its session id, and the model ID it records for its agent. Read both from the transcript itself. Where a transcript records more than one model ID, list each. Where it records none, write `not recorded`. Then a line `Grader session: <id>` with your own session id if your host shows it, or `Grader session: not shown to the grader` if it does not, in which case the orchestrator writes the id it dispatched you under before the record is filed; a record filed without the grader's session id is incomplete.
3. **Sections.** For every section, per run: the scenario step and the transcript line where an agent acted on that section, or `not exercised`. A section is exercised in a run when an agent acted on its line, even where only some of its clauses fired. Where the line states a branch whose condition is false in the run, the agent acted on it by not taking that branch: cite the line showing the condition false and the branch not taken. Reading or quoting a section is not exercising it. A section line starting with `## `, `### ` or `#### ` is a heading: it is exercised in a run when a section line under it, up to the next heading at the same or a higher level, is exercised in that run, and a heading with no section line under it is exercised when an agent acted on a line of its body; cite that line. Under each exercised section, list the clauses of its line that no run reached, as notes.
4. **Negative steps.** For each negative step, per run: the transcript line showing the behaviour did not happen, or the line showing it did. If no line settles it either way, say so and give the lines you checked.
5. **Findings.** Every finding from `{{FINDINGS}}`, verbatim, numbered with its run, then its grade, MUST, SHOULD or CUT, and a reason that quotes the skill line (`<path>:<line>` at `{{REVISION}}`) and the transcript line it rests on. Grade these cases with the reason stated:
   - the text answers it elsewhere: CUT, citing the line that answers it;
   - it is about the fixture or the scenario rather than the skill's text: CUT, saying so;
   - it duplicates another finding: grade it as that finding is graded and name that finding's number.
6. **Owner answers.** Every answer given to a drive agent's question to the owner, per run, with its transcript line and the owner-script line it comes from. Then list separately each answer that does not come from the owner script, including any question an agent answered itself instead of putting it to the owner.
7. **MUST grades Scott confirmed by hand.** Leave this field present and empty.

## Return

The path `{{OUTPUT}}`, the count of findings by grade, and your own session id if your host shows it; if it does not, say you cannot see it.
