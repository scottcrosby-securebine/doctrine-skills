# Running a round as a workflow

`harness/round.workflow.mjs` runs one fused-gate round of the gauntlet through the
Workflow tool: the builder/critic pairs, the floor and every documented gate, the blind
comparison, the integrated critic, the red team, and the counters, in that order. It is
optional, and it runs fused mode only; pure gauntlet runs in prose. Where the host has no Workflow tool, or the round needs a judgment call the
script does not model, the prose flow in `SKILL.md` is the round, unchanged.

## What the script does and does not hold

The script holds **structure and arithmetic only**: which prompt goes to which agent, in
what order, which run in parallel, what the roll calls must contain, and how the
counters move. It holds **no brief text**. It cannot: a workflow script has no
filesystem, so it cannot read `SKILL.md`, and a copy of the critic brief inside it would
be a fork the restatement law forbids. You assemble every prompt exactly as the briefs
require — the critic brief's eight items and the not-gradeable table's lines, the red
team brief's six, the builder's `## The brief`, the ledger pasted in, the settled list —
and pass them in `args`; the rule in `SKILL.md`'s workflow paragraph about what you leave
out applies to the script exactly as to you. The only prose the script adds is handover
glue — a line saying what it attached and which lines to answer, and the retry framing the
deviation paragraph below discloses — never a brief item.

## Invocation

```
Workflow({ scriptPath: '<plugin>/skills/doctrine-gauntlet/harness/round.workflow.mjs', args })
```

`args`:

| key | what it is |
|---|---|
| `sections` | `[{ name, builderPrompt, criticPrompt, priorNotes? }]` — one per section; each critic prompt carries the section-review row's Present line, since it is a step-6 section review. `priorNotes` (an array of earlier rounds' rejection-note lists, oldest first) is how a resumed section's critics keep seeing what was already rejected: `sectionRejections` carries the count across rounds, this carries the content |
| `floorPrompt` | a prompt telling an agent to run the floor (`floor.md`) and every documented gate and return `{ exitCode, report, unmeasured[], failedGates[] }`; `''` is not a skip — the round blocks on a floor nobody ran unless `waived` or `inherited` names `floor` |
| `blindPrompt` | the blind comparison pass per The comparison, returning `{ winner: 'A'|'B'|'tie', why }`; `''` declares a no-reference run and is recorded, not checked — on a run that has a reference, an empty `blindPrompt` is exactly the omission step 7 warns about, and only you can see it |
| `candidateIs` | `'A'` or `'B'` — which neutral filename is the build; you randomized the pair, so only you know |
| `inherited` | names of failures step 7 rules inherited; a failed gate, unmeasured item, critic axis or red team item matching one is recorded, not blocking |
| `waived` | names the user has waived — `floor`, an `[UNMEASURED]` item's text, a critic axis, `red team item 3` — recorded, not blocking; the user rules, the script only remembers. A name matches by containment, so an item's text covers both its `[UNMEASURED]` line and the critic axis made from it — and a short name can cover more than you meant, so a ruling that excused several distinct reasons comes back flagged in `recorded`, as does one that matched nothing; neither flag is itself a failure. A ruling given for an abstention also covers a fresh finding on the same axis in a later round — the flags and the `recorded` lines are where that surfaces, so re-check any recorded line you did not expect. On the same name `inherited` wins over `waived`. Step 7's unrun consumer items are an environment gap, recorded and never blocking — keep them out of the return's `unmeasured`, have the floor agent name them in `report` as prose without the `[UNMEASURED]` tag (a tagged line there re-enters the cross-check), and record them yourself per step 7 |
| `criticPrompt` | the integrated critic, assembled from the critic brief; its return carries a `recorded` list for item 7's inherited failures, checked per finding against `inherited` exactly as the red team's |
| `criticAxes` | item 3's named axes and item 2's six; the script adds every `[JUDGE]` and `[UNMEASURED]` line of the floor report it just ran, hands the critic that report under item 1, and blocks on any axis missing from the return — and on a line for an axis nobody named, or named twice, which is the script's own rule: a line it cannot count is a line it will not guess about |
| `redTeamPrompt` | the red team, assembled from the red team brief |
| `redTeamItems` | the brief's four attack items, `[1, 2, 3, 4]` by default; the script appends the critic's report to the red team's prompt (item 1 attacks what the critic passed) — renders, diff and ledger you name in `redTeamPrompt` yourself |
| `tieIsPass` | `true` on a fidelity run (The brief), else `false` |
| `counters` | `{ cleanPasses, unresolvedRounds, sectionRejections, sectionResets }` from the ledger's run-state block; the script returns them updated. `sectionResets` is yours to write: when the user rules on a deadlocked section and you clear its rejections, add one there, and a second deadlock on the same section returns marked terminal |

Return: `{ clean, exit, valve, counters, blocking[], recorded[], sections, floor, blind, critic,
redTeam, deadlocked }`. Each section's entry carries any notes its critic attached to the
accepting verdict — docket material, not blocking. `blocking` is every reason the round was not clean, one string
each, readable without interpretation; `recorded` is every reason that would have blocked
and was ruled inherited or waived, plus the script's own informational lines — the
blind-pass skip and the ruling flags, each labelled not a failure — so nothing silent ever
passes. `exit` is the fused gate's two consecutive clean
passes. `valve` is the four-round stop: put it to the user. `deadlocked` is a section whose
critic rejected it three times: the round returns before any gate runs, because the
counters never see section loops and the user rules. A dead builder or critic returns the
same way — that section never passed, and the gate begins only after every section does —
and either early return still carries any pre-phase `blocking` lines (an empty axis or
item set) and every section's no-return line: dispatch and agent defects, not results of
the aborted round. The Workflow tool cannot keep one
critic alive across retries, so each retry's critic is a fresh agent handed every earlier
rejection of that section — `priorNotes` plus this round's, oldest first — and told it is the same critic — the count still
means something, and the deviation from step 6's persisting critic is this one. The
builder is handed only the latest rejection, which is what it must address. A `HELD` line's adequacy — object, defect, evidence — is your read of
the line under Modes; the script can only see that a line is empty. The red team's own
recorded list (item 5: a `BROKE` on a failure its prompt named inherited) is copied into
`recorded` line by line; each recorded finding must name a failure of `inherited`, checked by the same
containment rule, since the prompt's inherited lines are written from that list — a finding
naming none of them blocks. The check reads names, not meaning: a finding that quotes an
inherited cause and smuggles a new defect beside it passes the count, so each recorded line
is yours to read as one inherited failure — split anything mixed, re-file the new half as
blocking, and reset the round yourself, exactly as with a HELD's adequacy.

## What stays yours between rounds

Write the returned counters and every roll call to the ledger's run-state block, per step
7. Run the blast-radius check on any shared token or stylesheet the round touched — the
script does not render sibling pages. The script resets `cleanPasses` on a round that was not clean and on a round that
rebuilt any section; reset it yourself for an accepted diff between rounds —
simplification included — and for a broken instrument voiding a round it passed, both of
which the Modes table names and the script cannot see. Decide the next round, or resume this one after a crash with
`resumeFromRunId` — completed agents replay from the journal, which is the point.

Sections run through `pipeline`, so pairs run concurrently up to the tool's cap. Their
builders mutate files in parallel, so doctrine step 2's isolation precondition applies to
them exactly as in the prose flow — the script creates no worktree, directory or port for
anyone, and a section prompt that does not carry its isolation carries none.

## Syntax gate

`node --check` rejects the script: the Workflow tool wraps the body in an async function,
so its top-level `return` is legal there and nowhere else. The gate is the same wrap, run
from `harness/`:

```
node -e 'const s=require("fs").readFileSync("round.workflow.mjs","utf8").replace(/^export const meta/m,"const meta");new Function("args","agent","parallel","pipeline","phase","log","budget","workflow","return (async()=>{"+s+"})()")'
```

## Tamper test

Three clauses, per the repo's law. The fixtures are `harness/round.tamper.json` — one
args set each with the result it must produce, run through the Workflow tool:

1. **Break it**: a critic return omitting one axis of `criticAxes` and a red team return
   omitting item 2 must both appear in `blocking`, and the round must not be clean.
2. **Known-good**: a return with every axis `CLEAR`, every item `HELD` with object,
   defect and evidence, and a non-empty attack list must be clean. The `clean` fixture
   rebuilds a section, so its incoming count resets and it ends at `cleanPasses: 1` with no
   exit; `clean-exits` runs no sections from `cleanPasses: 1`, and it must set `exit`.
   The `recorded` pair proves the inherited-recorded check both ways: `recorded-broken`'s
   red team files a recorded finding naming nothing of `inherited` and must block;
   `recorded-clean`'s names the dispatch's one inherited failure and must stay clean.
3. **The fixture really carries the defect**: read the stub prompts in the fixture file,
   not the script's output — the broken critic prompt lists two of three axes, the broken
   red team prompt lists items 1, 3 and 4, and `recorded-broken`'s red team stub files a
   recorded finding naming a failure its `inherited` list does not carry.

Rerun all three after any change that makes the script quieter as well as louder. An agent
that dies mid-round returns `null`, and the script counts that as "no return", which
blocks — a dead reviewer never reads as clean.
