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

The tool returns a **run id** with the round's result. Keep it in the ledger's run-state block
beside the counters: it is the whole of what crash-resumability costs you, and a run id that
lived only in the context a crash took is a journal you cannot reach. Resuming is the same
call with that id added, and the same `args` — every agent whose prompt is unchanged replays
from the journal instead of running again:

```
Workflow({ scriptPath: '<plugin>/skills/doctrine-gauntlet/harness/round.workflow.mjs', resumeFromRunId: '<run id>', args })
```

`args`:

| key | what it is |
|---|---|
| `sections` | `[{ name, builderPrompt, criticPrompt, priorNotes? }]` — one per section; each critic prompt carries the section-review row's Present line, since it is a step-6 section review. `priorNotes` (an array of earlier rounds' rejection-note lists, oldest first) is how a resumed section's critics keep seeing what was already rejected: `sectionRejections` carries the count across rounds, this carries the content |
| `floorPrompt` | a prompt telling an agent to run the floor (`floor.md`) and every documented gate and return `{ exitCode, report, unmeasured[], failedGates[] }`; `''` is not a skip — the round blocks on a floor nobody ran unless `waived` or `inherited` names `floor` |
| `blindPrompt` | the blind comparison pass per The comparison, returning `{ winner: 'A'|'B'|'tie', why }`; `''` declares a no-reference run and is recorded, not checked — on a run that has a reference, an empty `blindPrompt` is exactly the omission step 7 warns about, and only you can see it |
| `candidateIs` | `'A'` or `'B'` — which neutral filename is the build; you randomized the pair, so only you know |
| `inherited` | names of failures step 7 rules inherited; a failed gate, unmeasured item, critic axis or red team item matching one is recorded, not blocking |
| `waived` | names the user has waived — `floor`, an `[UNMEASURED]` item's text, a critic axis, `blind pass`, `red team item 3` — recorded, not blocking; the user rules, the script only remembers. A name matches by containment, so an item's text covers both its `[UNMEASURED]` line and the critic axis made from it — and a short name can cover more than you meant, so a ruling that excused several distinct reasons comes back flagged in `recorded`, as does one that matched nothing; neither flag is itself a failure. A ruling given for an abstention also covers a fresh finding on the same axis in a later round — the flags and the `recorded` lines are where that surfaces, so re-check any recorded line you did not expect. On the same name `inherited` wins over `waived`. Step 7's unrun consumer items are an environment gap, recorded and never blocking — keep them out of the return's `unmeasured`, have the floor agent name them in `report` as prose without the `[UNMEASURED]` tag (a tagged line there re-enters the cross-check), and record them yourself per step 7 |
| `criticPrompt` | the integrated critic, assembled from the critic brief; its return carries a `recorded` list for the failures step 7 ruled inherited, checked per finding against `inherited` exactly as the red team's. The script also reads item 8's vocabulary off the roll call the way item 5's is read off the red team's: a `CLEAR` with a blocking or recorded finding under the same axis, a `BLOCKING` with no finding under it anywhere, a `CANNOT JUDGE` with a finding under it, and a recorded finding naming an axis the dispatcher never named, each block. See **Two kinds of block** below for why none of them can be waived |
| `criticAxes` | item 3's named axes and item 2's six; the script adds every `[JUDGE]` and `[UNMEASURED]` line of the floor report it just ran, hands the critic that report under item 1, and blocks on any axis missing from the return — and on a line for an axis nobody named, or named twice, which is the script's own rule: a line it cannot count is a line it will not guess about |
| `redTeamPrompt` | the red team, assembled from the red team brief |
| `redTeamItems` | the brief's four attack items, `[1, 2, 3, 4]` by default; the script appends the critic's report to the red team's prompt (item 1 attacks what the critic passed) — renders, diff and ledger you name in `redTeamPrompt` yourself |
| `tieIsPass` | `true` on a fidelity run (The brief), else `false` |
| `counters` | `{ cleanPasses, unresolvedRounds, sectionRejections, sectionResets }` from the ledger's run-state block; the script returns them updated. `sectionResets` is yours to write: when the user rules on a deadlocked section and you clear its rejections, add one there, and a second deadlock on the same section returns marked terminal |

## What each agent must return

The script enforces a JSON schema on every agent it dispatches **except the section builder**,
whose return is free text and is interpolated straight into its critic's prompt. For the other
five, a prompt that does not ask for the shape gets a retry loop instead of a return. Ask for
exactly these.

| agent | shape | notes |
|---|---|---|
| section critic | `{ accept: bool, notes: string[] }` | an accepting verdict may still carry notes; they go to the docket |
| floor | as the `floorPrompt` row above gives it | `report` is the instrument's own words and the script reads its `[JUDGE]`/`[UNMEASURED]` lines |
| blind pass | as the `blindPrompt` row above gives it | |
| integrated critic | `{ rollCall: [{axis, word, line?}], blocking: [{axis, finding}], polish: string[], recorded: [{axis, finding}] }` | |
| red team | `{ rollCall: [{item, word, line}], blocking: [{item, finding}], polish: [{item, finding}], recorded: [{item, finding}], attackList: string[] }` | |

Three differences between the two reviewers are deliberate and easy to get wrong.

**`line` is optional on the critic's roll call and required on the red team's — in the schema
only.** The schema lets a critic return a bare word, and item 8 lets it only for a `CLEAR`: a
`CANNOT JUDGE` with no line is malformed and unwaivable, because it has to name what was missing,
and a `BLOCKING` without one is a finding nobody can read. The red team's is required outright,
because item 5's `HELD` has to name the object, the defect and the evidence, and its `NOT RUN` has
to name what was missing. Read the optionality as a schema fact, never as permission.

**`polish` is untagged strings for the critic and item-tagged objects for the red team.** That is
why a `CLEAR` carrying a polish note cannot be checked and is ruled honest, while a red team
`BROKE` *is* discharged by a polish or recorded entry as well as a blocking one — a polish note on
the red team side can be attributed to its item and on the critic side cannot.

**`recorded` is required on both**, even when empty. It carries the failures **step 7** ruled
inherited — not critic item 7, which is the bar. Each reviewer's own list is defined in its own
brief: the critic's in item 8, the red team's in item 5. A finding in it that names no `inherited`
failure of this dispatch, or an axis or item nobody dispatched, blocks unwaivably.

A red team return that is empty in all four lists — no blocking, no polish, no recorded, no
attack list — blocks. An adversary that reports nothing has reported nothing, and the round would
otherwise count clean on the strength of it.

Return: `{ clean, exit, valve, counters, blocking[], recorded[], sections, floor, blind, critic,
redTeam, deadlocked }`. Each section's entry carries any notes its critic attached to the
accepting verdict — docket material, not blocking. `blocking` is every reason the round was not clean, one string
each, readable without interpretation; `recorded` is every reason that would have blocked
and was ruled inherited or waived, plus the script's own informational lines — the
blind-pass skip and the ruling flags, each labelled not a failure — so nothing silent ever
passes. `exit` is the fused gate's two consecutive clean
passes. `valve` is the four-round stop: put it to the user as doctrine step 5's diagnosis, never as a bare count. `deadlocked` is a section whose
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

## Two kinds of block

Every reason the script files is one of two kinds, and the split decides whether a user ruling
can reach it.

- **A defect in the work**, or evidence that never reached a reviewer: the floor not run, an
  `[UNMEASURED]` item, a failed gate, a critic's `BLOCKING` or `CANNOT JUDGE` on an axis, a red
  team `NOT RUN`, a finding either reviewer files, a lost blind pass. These go through `block()`
  and `inherited`/`waived` excuse them. That is what those lists are for, and each such call
  carries the **name** a ruling must match.
- **A defect in the report**: a roll call missing a line, carrying one twice, naming something
  nobody dispatched, or using a word outside its vocabulary; a reviewer's word contradicting the
  findings filed under it; a finding with no text under a word that carries its finding below; a
  finding filed against no axis or item; a recorded finding naming no inherited failure; the
  floor's report contradicting its own return, or exiting non-zero with nothing named; a dispatch
  with no axes or no items; a section deadlock; a dead agent returning nothing. These go through
  `malformed()` and **no ruling reaches them**. The list is the shape of the rule, not a
  register: `malformed()` is one function and every call to it is greppable, which is the point
  of it being a separate name.

**What the split cannot reach.** The checks read *structure* — which word, which list, whether a
text is empty. They do not read the **content** of a free-text line, so a `CLEAR` whose own line
says "I did not run this axis" passes: nothing but a reader can catch a reviewer whose prose
contradicts its own verdict. Do not read the rule above as a promise that every self-contradiction
is caught.

The rule behind the split: **the user rules on the page, never on whether a report is
well-formed.** It is not fastidiousness. Rulings match by *containment against the reason text*,
so a check whose reason quotes a reviewer's own finding is excused by an `inherited` word
appearing inside the very finding it caught — observed, not theorised. And "it already blocks"
is never a reason to skip a shape check, because "already blocks" means "blocks unless somebody
rules on it": a critic that answered `CANNOT JUDGE` on an inherited axis *and* filed a defect on
it came back clean, at `cleanPasses: 2` with `exit: true`, until the shape check existed.

**The red team's `NOT RUN` looks like the identical hole and is not, and the difference is the
one thing to carry away from this section.** Item 5 says that where only part of an item's
evidence arrived the word stays `NOT RUN`, the reviewer runs what it can, and the finding names
the partial evidence it was run against. Item 8 gives the critic no such exception. So the same
shape is a contradiction on one side and prescribed on the other, and a check added to the red
team "for symmetry" rejects honest work — which is what happened, for one round, until a reviewer
read item 5. The abstentions themselves stay waivable on both sides: an artifact that never
arrived is a fact about the run a user may rule on.

## What stays yours between rounds

Write the returned counters and every roll call to the ledger's run-state block, per step
7, and with them the per-finding lines doctrine step 5 requires: the script returns
`blocking[]` but never the artifact a finding landed in, what the class question found, what
cleared it, or whether a check was built for its class, because all four are round history
and the script carries none. Without them the valve stop above has nothing to diagnose from. Run the blast-radius check on any shared token or stylesheet the round touched — the
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
   omitting item 2 must both appear in `blocking`, and the round must not be clean. Most roll-call shape
   checks have a broken fixture of their own and each must block on its own line — which check a
   fixture is for is in its **key** and its stub prompt, not in a list here. Two are unpinned and
   named under coverage below. A `_note` says why
   the fixture is built the way it is, and several say nothing about which check they cover.
   `critic-recorded-no-axis` carries a second job: its finding text quotes the dispatch's
   inherited failure, so routing that check back through the ruling machinery makes the
   fixture fail. That is the regression it exists to catch.
2. **Known-good**: a return with every axis `CLEAR`, every item `HELD` with object,
   defect and evidence, and a non-empty attack list must be clean. The `clean` fixture
   rebuilds a section, so its incoming count resets and it ends at `cleanPasses: 1` with no
   exit; `clean-exits` runs no sections from `cleanPasses: 1`, and it must set `exit`.
   The `recorded` pair proves the inherited-recorded check both ways: `recorded-broken`'s
   red team files a recorded finding naming nothing of `inherited` and must block;
   `recorded-clean`'s names the dispatch's one inherited failure and must stay clean.
   The known-good fixtures are the ones whose `expect` carries `clean: true`, and they are not
   listed here — `_readme` gives the rule and the file gives the answer. It takes more than one:
   a known-good exercises only the guards its own roll-call word reaches, so a fixture returning
   `BLOCKING` leaves every `CLEAR` and `CANNOT JUDGE` guard unentered, and a guard that never ran
   is silent for the wrong reason. Each shape check needs a known-good whose word actually reaches
   it. **`clean`'s incoming `cleanPasses` is 1, not 0, and that is the point** — at 0 the reset a
   rebuilt section performs is a no-op, and the fixture credited with proving the reset could not
   observe it.

3. **The fixture really carries the defect**: read the stub prompts in the fixture file,
   not the script's output — and read them for **every** broken fixture, not just the first.
   The broken fixtures are the ones whose `expect` does not carry `clean: true`. Read each
   one's stub prompt against its `_note` and confirm the defect is really in the fixture rather
   than only in the script's output. **No list of them lives in this file or in `_readme`**: both
   used to carry one, both went stale as fixtures were added, and the second copy is what falls
   behind first. A `_note` is prose and is never compared, so nothing checks it for you.

### What the suite covers, and what it does not

Beyond the checks named above the fixtures pin the ruling machinery, the four-round valve, the
roll-call integrity rules, a floor `[UNMEASURED]` item, the blind pass losing, and the section
deadlock. **No enumeration of them lives here on purpose**: every earlier version of this
paragraph named a subset and went stale as fixtures were added, which reviews filed repeatedly as a defect. Read `_readme` and the `_note` on each fixture.

Three things a green run does not tell you. A `blocking_contains` substring can be satisfied by a
*different* line than the one you meant — `floor-unmeasured-blocks` anchors its substring to
`floor: ` because the critic answers the same report line as an axis, and the unanchored form
passed with the floor's check deleted. **The deadlock threshold is not pinned**: mutate
`rejections >= 3` to any larger number and every fixture still passes, because the section
deadlocks eventually either way and no fixture bounds the loop; pinning it needs a fixture that
rejects until the mutated bound is reached, which would dispatch dozens of agents, and it was
judged not worth that. **Per-check unwaivability is only partly pinned**: several broken
fixtures name their own axis or item in `waived` so that routing *those* checks back through
`block()` fails their own fixture, but most `malformed()` sites carry no such guard. And **two
roll-call checks have no fixture at all** — a roll-call line naming something the dispatcher never
named, and a line carrying a word outside the vocabulary. Every fixture's roll call uses in-vocabulary
words on dispatched keys, so neither reason has ever been emitted by the suite; delete either check
and all fixtures still pass.

Rerun all three clauses after any change that makes the script quieter as well as louder. An agent
that dies mid-round returns `null`, and the script counts that as "no return", which
blocks — a dead reviewer never reads as clean.
