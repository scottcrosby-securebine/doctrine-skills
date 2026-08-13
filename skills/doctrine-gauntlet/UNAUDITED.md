# Pre-existing findings — surfaced 2026-08-13, not yet fixed

Eleven gate passes ran against **this session's diff only**. Pass 11 was deliberately
pointed at territory no pass had audited, and found defects in text nobody touched — twelve
as of this writing, and the count is not the point, since the list is open.
They are recorded here rather than fixed, because fixing them is a different commitment
from closing a gate scoped to a diff, and silently widening that scope would have made
the gate's own result meaningless.

Every one is verified against the file or the code. Provenance was checked: all of them
predate this session except #12, which round 11 surfaced while fixing something else.

## The dominant class, again

Almost all of them are the same defect this session spent eleven rounds on — a correct rule
sitting where the agent who must obey it never reads. That is not a coincidence: the
architecture assembles fresh-context prompts from named sections, so every rule written
in a section no prompt draws from is invisible to the agent it governs. The gate found
these in *new* text because that is what it was scoped to. Nobody had asked the same
question of the old text.

## Placement — the reviewer's brief never carries the rule

**1. `## The reader test` never reaches a critic. HIGH.**
Critic brief item 2 says "**Answer the reader test before anything else**, and let that
answer block." The test itself — *"would a human want to look at this, and does it serve
the reader it is for?"* — lives in `## The reader test`, and the critic brief's own intro
tells the orchestrator not to copy the rest ("the rest of this skill is only the reasoning
behind these lines"). Modes lists "failing the reader test" as blocking. So the gate's
blocking condition is defined by a question the agent rendering the verdict never sees.
Aggravation: item 3 names six reader-test axes as bare noun phrases — "the wall", "what
the original *does*", "deletion as a change" — with no definitions, in the same item where
this session reproduced the ruled-versus-default test *in full* on the explicit ground
that naming a test is not handing it over.

**2. The red team has no brief at all. HIGH.**
It is invoked four times and briefed zero. `## Technical floor` says "**The red team checks
print in the round it runs, and reports it as a floor item**: nothing above checks print,
so an instruction with no assignee is an instruction nobody executes." That sentence
assigns print to an agent that cannot read the assignment — it commits the exact error it
names, in its own text. The ledger's distribution list ("every builder, every critic and
the direction adversary") also omits the red team, while the ledger exists so "a reviewer
holding no fact base cannot tell an invented number from a given one".

**3. `## What a critic may conclude` reaches no critic. MEDIUM.**
Pre-filing obligations only the filer can discharge: "Grep the repo for the premise
**before filing**" a sensitivity finding; "settle a disputed measurement by cropping the
render and looking at it"; "distrust confident findings that fall outside the named axes";
"A real finding can still carry a wrong diagnosis." Two of the section's rules made it
into the brief; the rest reach the orchestrator alone. The recorded costs — four repeat
false alignment failures, one false customer-identification accusation into a permanent
record — are costs of *filing*.

**4. "A builder may not cite a PROPOSED item as a constraint" never reaches a builder.
MEDIUM.**
The docket section is orchestrator-read. The recorded incident is a builder hardening an
unconfirmed item into a ban and **deleting the client's certification logos** — the exact
failure the rule exists to stop, aimed at an agent that never hears it.

**5. The builder is told the house outranks its brief, and never given the floor. MEDIUM.**
`## The brief` says "this brief applies only where the house is silent (precedence above)"
— and "precedence above" is in the orchestrator-only background block. The only floor
content in a builder's prompt is four words: "reduced-motion honored". Meanwhile the floor
section records that "brand palettes that fail contrast are the common case, not the
exotic one", and that a 145x14 call to action "survived seven rounds of critics". The
builder authors the palette and holds no rule saying the floor beats the house.
*Counter-argument, recorded fairly:* build-then-measure is a coherent division of labour.
The cost is that every floor defect authored costs a round.

**6. The ledger is the only durable artifact with no home. MEDIUM.**
The DNA gets a path (`docs/design-dna.md`). The docket gets a path
(`docs/design-docket.md`). The ledger gets none — it is handed to more fresh contexts than
either, accumulates ruled-versus-default verdicts across rounds, and in pure-gauntlet mode
must survive orchestrator compaction. Step 4's own justification convicts it: "an
undocumented direction cannot be handed to a fresh context."

**7. The orchestrator's counters are unrecoverable by a resumed context. MEDIUM.**
Consecutive-clean-passes, unresolved-rounds, win-streak, unchanged-rounds, escalations-
spent and docket-item age exist only in the orchestrator's context. Step 7's round report
asks for "the round number, what got bolder, what the critics still rejected" — no counter
values. A compacted orchestrator cannot recover them from any artifact and cannot detect
that it lost them. Cheapest fix: add the counter values to the round report, which also
makes the state auditable by the user.

**8. The fidelity tie instruction targets an agent that cannot use it. LOW-MEDIUM.**
"tell the critic that a tie in the blind comparison counts as a pass" — but item 8 says the
comparison winner "comes from the blind pass, not from this critic", and the blind critic
gets "the subject, the reader and the job only". The rule is already the orchestrator's,
stated under The comparison. Read literally it invites putting comparison-scoring guidance
into a briefed critic's prompt, which is how a briefed critic starts returning a verdict it
is explicitly denied.

**9. The direction adversary is never asked whether the direction is buildable under the
floor. LOW-MEDIUM, contested.**
The DNA is "palette, type, motion" — the floor-relevant axes — and floor-failing brand
palettes are "the common case". A direction whose defining move cannot clear contrast is
killable only at step 5; after that every round blocks on a defect the builder cannot fix
without reopening the direction. The direction brief already carries the exact analogue for
facts ("Does it require facts that do not exist?"). One more item — "Does it require a
value the floor forbids?" — costs one line at the one moment the user is already in the loop.

## Doc-versus-code

**10. `floor.md` contradicts itself and the harness on a crop miss. HIGH.**
`floor.md` flag section: "A selector matching nothing is `[UNMEASURED]`, not silence."
`floor.md` output section: `[JUDGE]` includes "any region `--crop` could not shoot."
`harness/floor.mjs`: crop misses go to `cropNotes` (445, 447) → `handoff` (603) → printed
as `[JUDGE]` (646). Never `[UNMEASURED]`.
This is not cosmetic — the two markers are different gate law. `[UNMEASURED]` blocks and
advances the counter until waived; `[JUDGE]` never gates by itself. A reader trusting the
flag section believes a crop miss auto-blocks. Fix: `[UNMEASURED]` → `[JUDGE]` in the flag
section.

**11. `tools.md` drops an exception `SKILL.md` carries. MEDIUM.**
`tools.md`: "Write only what differs; never a wholesale replace." Stated absolutely.
`SKILL.md`: "Write only what differs — **except an empty project, where the whole set is
the diff** and a full rehydrate is the correct first sync." `tools.md` is the designated
fast path for this exact procedure, so a reader who consults only it gets a flatly wrong
instruction on first sync to an empty project.

## What this list is not

It is not exhaustive. It is one pass, by three lenses, over territory that had never been
audited — the red team's prompt, the arbiter, the builder's floor knowledge, the ledger's
storage, the orchestrator's own recoverability, and the harness manual against the harness.
A second pass over the same territory would very likely find more, and the sections nobody
has pointed a lens at yet (the direction brief, the comparison, the docket's destinations)
are the obvious next place to look.

---

## Added after the register was written

**12. `--fragment` suppresses a floor item that critic brief items 1 and 7 still demand a
ruling on. HIGH.** Found by round 11's author, outside its brief.
`floor.md` records that `--fragment` suppresses the theme-reachability judgement, and
`CLAUDE.md` states the reachability handoff prints on "every two-theme run that is not
`--single-theme` or `--fragment`". Items 1 and 7 now carry the `--single-theme` condition
(round 11) and say nothing about `--fragment`. So a card-specimen or partial gate critic
is told to rule on "a second theme no user can reach" — a floor item its report
deliberately never raises — and item 7's first rule makes an absent second theme blocking
with no carve-out for a fragment whose *host page* owns theming.
Structurally identical to the single-theme defect round 11 fixed: a prompt-conditioned
suppression with nobody told to state the condition. `--fragment` is orchestrator-chosen
too, so the fix belongs in the same critic-brief preamble sentence. It lands on exactly
the card-phase shape rounds 9 and 10 spent two rounds on.
