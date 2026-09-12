# What the doctrine should adopt from the firstmate stack

Research phase, opened 2026-09-11, round 4 revision 2026-09-12. Sources: `kunchenguid/firstmate` @
`869ae90`, `kunchenguid/no-mistakes` @ `b43ec63`, `kunchenguid/axi` @ `8a3c8d8`, read as shallow
clones, nothing executed. Our tree at `62fc297`, plugin 2.2.11. Record lines below into other repos on
this host are cited as `<repo>/<path>:<line>` under `/home/radadmin/claude/projects/`. The phase
record (claim table, 43 rejection entries, the triage table with every ruling) is local and untracked,
per this repo's convention for phase records.

## Recommendation

Adopt two sentences into the hub, `skills/doctrine/SKILL.md`. Nothing else in the firstmate stack
survives the evidence. The two bugs the comparison found in `hooks/dctr-gate.mjs` are not adoptions and
have already shipped, as plugin 2.2.11 in PR #48.

**A1. The gate's own definition is read at the fixed point** (step 3, line 36). Step 3 names the files a
gate list is read from and never says at which revision, so a phase whose diff loosens a gate reads the
loosened file and passes; `doctrine-docs` edits exactly those files (`skills/doctrine-docs/SKILL.md:19`
names CLAUDE.md as a doc tree, and its red flag at `:35` already names CLAUDE.md edited inside a sweep).
Two other hub lines bear on the sentence and it must state both. Step 5, line 67, keeps a certified
revision certified through a repair to "a gate instrument or a steering document", which exempts the
loosening edit A1 exists to catch, whether the edit is to the list that names a check or to the check's
own code. Step 5, line 79, requires that a finding class a script can catch is caught by that script
every round from then on, so a diff that adds a check is the normal shape of a phase. Adopt: the check
list, the review guidance and the documented law that judge a phase are read at the fixed point; a check
the diff adds or tightens runs and counts; a diff that loosens or removes a check, in its listing or in
its code, is reviewed as a change to the gate, never applied as the gate; and for line 67 such a
loosening is a repair to shipping code and needs its own pass. Their source:
`no-mistakes/internal/config/config.go:2343-2348` ("a pushed branch must not steer the reviewer that
gates it"), `:2394` ("never a branch authoring the extra check that clears it"), `:2396`, `:2430`. Their
rule is symmetric and ours cannot be, because line 79 makes authoring the check the phase's duty. This
was the run's one cross-engine agreement.

**A2. A finding the orchestrator cannot grade takes step 1's test, and where the work is aimed
differently depending on the answer it is a direction question and blocks** (step 5, line 63, pointing
at step 1). Step 1, line 28, already blocks an unanswered direction question, keeps as a scope edge the
case where the deliverable is acceptable under each answer, and says that where you cannot tell the
two apart it is a direction question. Step 5, line 63, files "a finding you cannot yet grade" as
non-blocking for the orchestrator to grade, and nothing in step 5 sends that grading to step 1's test,
so an orchestrator reading step 5 alone can carry the finding to delivery. Adopt one pointer in line
63, not a second stop mechanism: a finding the orchestrator cannot grade is graded by step 1's test,
and only the scope edge stays non-blocking. Their source:
`no-mistakes/internal/types/findings.go:559-572` (an unclassified finding defaults to ask-user, never
auto-fix) and `VISION.md:30`. Our evidence, which is the deciding source, is one instance and two
counter-cases. The instance: `QuoteBine/.superpowers/sdd/shared-quotes/run-state.md:110` (NB2 "grade
uncertain, owner's call", inside a seat return clean of blockers), carried to `:114` as "D3 for Scott
at delivery ... whether the COLUMN should follow is his call. Default kept", never ruled in that record,
and the phase Exited. The counter-cases, where step 1's test was applied:
`QuoteBine/.superpowers/sdd/catalog-ui/task-12-run-state.md:518` ("CARRIED TO SCOTT, needs a ruling I
should not take alone", phase held Open) and `QuoteBine/.superpowers/sdd/catalog-ui/task-17-run-state.md:381-382`
("the deliverable is acceptable under either answer, so the narrower reading stands", a scope edge
recorded as one).

Neither sentence imports their code. Each names its landing line and the hub lines it interacts with.

## What was proposed and cut, with the evidence

The round 1 draft proposed sixteen rules in seven clusters and one instrument. Scott asked that each be
tested against the phase records of the six repos that run the doctrine on this host (pdd-generator,
website_v3, doctrine-runs, sbsforge, sbsforge-platform, QuoteBine) before adoption. Read-only seats
swept those records per item. Aggregate counts from those sweeps did not reproduce under an independent
tracer, so this table states the incidents, not the totals: what a reader can open.

| item | claim | what the records show | ruling |
|---|---|---|---|
| Closed set of unrun-gate reason classes | the same unrun gate drifts between "attributed", "environment gap" and "waived" across rounds | One waiver applied outside its written scope, `website_v3/docs/careers-gauntlet-ledger.md:459` against the waiver at `website_v3/docs/RESTYLE-DOCKET.md:1668`, and the same waiver's reason revisited at `website_v3/docs/design-docket.md:520`. Everywhere else the reason is carried verbatim, e.g. `QuoteBine/.superpowers/sdd/plan-c-build/t2t3-run-state.md:1911`, unrun for the seventh round for the same reason. In the swept records no unrun gate flipped to passed. | cut |
| Delivery posture named at step 1 | seats are dispatched blind to commit and push rules, posture read at step 7 | Briefs state posture, e.g. `doctrine-runs/2026-09-05-convergence/driven/report.md:41` ("Do NOT commit"), and records state it at open, e.g. `sbsforge/docs/superpowers/specs/2026-09-10-m365-https-callback-build-run-state.md:25`. In the swept records no seat pushed or opened a PR unbidden. The one incident is the inverse: three repair briefs silent on commit and a third of a round's repair nearly dropped, `sbsforge-platform/docs/milestones/M4-brief-run-state.md:836-848`. | cut |
| Anchor self-sufficient by reference; anchor and brief as two labelled parts | verbatim and no-path rules are jointly unsatisfiable on a referring request; orchestrator constraints graded as intent | Referring anchors are resolved by quoting the referenced text beside the anchor, `pdd-generator/docs/research/2026-09-10-a3-pdf-direct-run-state.md:7-15`. The transmission defect that did exist, the anchor reaching no seat verbatim, `doctrine-runs/2026-09-05-convergence/wave1/E6.md:23`, is already answered by hub step 4. In the swept records no seat graded an orchestrator constraint as the user's intent. | cut |
| Anchor amendment appended and dated | an amended anchor overwrites the original or reaches nothing dispatched | Amendments are appended and re-scored, `QuoteBine/.superpowers/sdd/x10-x11/run-state.md:627-641`; one was revised in place with a dated note, `sbsforge-platform/docs/milestones/M2-brief-run-state.md:191`. The one near-miss was a scripted edit that failed to apply, `QuoteBine/.superpowers/sdd/catalog-ui/task-16-run-state.md:104`, caught the same round. In the swept records no reviewer graded a stale anchor. | cut |
| Escalation reconciles its blocker list | the user rules against blockers already repaired | Stale lists were corrected before the ruling, `pdd-generator/docs/research/2026-08-31-rag-consumer-audit-run-state.md:287`; escalations lead with repaired status, `pdd-generator/docs/research/2026-09-07-685-land-s5-run-state.md:367`. Silent firings exist, `QuoteBine/.superpowers/sdd/plan-c-t4/run-state.md:174`, a record gap, not a reconciliation gap. | cut |
| Third reading of a repeat finding: unrequired surface | a repair spiral over an unrequested component is never recognised at the alarm | The spiral is real, `QuoteBine/.superpowers/sdd/catalog-ui/task-12-run-state.md:1673` (two scripts "not asked for by the plan"), and every cut on record came through the existing diagnosis plus an owner ruling, `sbsforge/docs/specs/2026-08-24-m365-r1-classification-runstate.md:914-935`. A two-seat red team showed the drafted sentence would re-propose a cut Scott had closed at `task-12-run-state.md:1691-1696` and that its headline case was in-anchor. | cut |
| Execution-time clock and parked marker | the time alarm re-fires on the user's own latency | No re-fire on parked time on record; the clock is restarted at the ruling, `QuoteBine/.superpowers/sdd/plan-c-t11/run-state.md:309-311`. The pathology on record is the opposite, alarms firing late or silently, `QuoteBine/docs/handoffs/2026-09-09-x10-x11-delivery-handoff.md:85-87`, `plan-c-t4/run-state.md:174`. | cut |
| Anchor-contradiction class, ruling scope, verbatim timed rulings (bundled with A2) | no route from a contradiction finding to a direction question; rulings widen by analogy | The route exists and is used, `sbsforge-platform/docs/milestones/M6-brief-run-state.md:242-243` ("Direction question Q-N1 (F-N2, blocks that finding only) ... Put to Scott", ruled the same day). Ruling scope is written narrowly, `website_v3/docs/RESTYLE-DOCKET.md:2828-2831`; the analogy extensions are self-flagged, `QuoteBine/.superpowers/sdd/catalog-ui/ledger22-run-state.md:78`. | cut, A2 core kept |
| Seat findings to a durable path; correction-only retry | a killed seat's findings die with it; a retry re-does the work and invents | Deaths lose the return, `pdd-generator/docs/research/2026-09-03-cost-centers-p3-run-state.md:301-308`, but the dead seats had written nothing, `QuoteBine/.superpowers/sdd/catalog-ui/task-12-run-state.md:3143-3145`; a codex seat in a read-only sandbox cannot write a file at all, `doctrine-runs/2026-09-06-doctrine-pane/dossier.md:2929-2931`; the mechanism that recovers a seat is resuming it by agent id, `pdd-generator/docs/research/2026-09-05-cost-centers-p5-exit-handoff.md:122-125`. Retries re-dispatched blind failed identically, `pdd-generator/docs/research/2026-09-06-burden-rates-tier1b-run-state.md:309-315`; in the swept records none returned an invented answer. | cut |
| Write-ahead delivery record; record lock | a dead session re-delivers or reports a phantom landing; two sessions append to one record | In the swept records no duplicate PR or phantom landing; the delivery cousin is a step that silently did not complete, `website_v3/docs/RESTYLE-DOCKET.md:5363`. Sessions collide on the worktree, `sbsforge-platform/docs/milestones/M4-brief-run-state.md:2697-2703`, and the host, where a flock stopped a real double-plant at `:5052`; the nearest thing to a record collision is a stale PR that went CONFLICTING on a session-memory file with the record half recovered by hand, `website_v3/docs/RESTYLE-DOCKET.md:5268-5273`; no two sessions have contended for one phase record in the swept records. The lock primitive the draft named is session-scoped, `hooks/dctr-state.mjs:14`. | cut; lock carried forward as a host-level candidate under Scott's standing ruling |
| One prose instrument with seven sub-checks | CLAUDE.md, README and docs/ are read by nothing | Measured on this tree: counts, rosters and links have zero drift; a retired-wording ledger fires on relocation, not retirement; two sub-checks find repo sightings, `CLAUDE.md:74` citing a commit (`9a96069`) that resolves on no ref in this clone while four wrappers now carry the pointer clause it describes as three, and stand-downs with no selftest (`hooks/dctr-token.mjs`). | cut; the two defects recorded as repo sightings |

## Conflicts

None between the two engines. The differences between their design and ours, read whole:

- Their validation is independent and adversarial by design, `no-mistakes/VISION.md:37-42`. In its
  unattended mode, `axi run --yes`, a gate with no findings is approved as-is and each step is fixed at
  most once, `no-mistakes/docs/src/content/docs/reference/cli.md:150`, and a gate is approved after that
  one fix even where the finding was not cleared, `no-mistakes/internal/cli/axi_drive.go:727-735`,
  `:814-823`; attended, the run returns at the first gate for a human decision. The difference is the
  bound: one fix per step there, N rounds and a time budget here, and ours never approves an uncleared
  finding. On the orchestrator side, firstmate's contract
  delegates review to that pipeline when it is selected and otherwise forbids adding an independent
  reviewer, `firstmate/AGENTS.md:337`, with an exception for a review the captain requests, `:339`.
- Their fixer asks the class question and bounds the fix to the changed area, both at
  `no-mistakes/internal/pipeline/steps/review.go:106` (local defect or symptom of a deeper flaw, "the
  smallest correct root-cause fix within the changed area"), then fixes the instance narrowly, `:107`. Ours sweeps every site the class question turns up within the boundary. A scope difference,
  not opposite rules.
- Their reviewer turn is unattended, so a question to a human is a finding class, `review.go:271`
  (an ask-user finding for an unresolved access-policy decision) acted on in the TUI,
  `no-mistakes/README.md:107`. That is the mechanism A2 draws on. Ours asks at step 1 and blocks.

Two claims the round 1 draft made about their repos were false and are withdrawn (two more, about our own hub and about a check design, are withdrawn in the phase record). Their fixer does
carry a verify-first rule: `review.go:105`, "Always start with double checking whether the findings are
legitimate." And their contract does state the reconciliation between "never do the work yourself" and
its approved-operation exception: `firstmate/AGENTS.md:20` introduces the exception by name.

## Gaps and unknowns

- Whether a seat dispatching its own sub-seats can change a gate outcome rather than only its cost.
  Raised by the gate-design seat, failed its own candidate test, never promoted.
- Whether a lock-refused session should be read-only or refuse to resume. A ruling, not a finding,
  needed before the carried-forward lock candidate is designed.

Three gaps from round 1 closed with the cuts that contained them: the overlap between the
anchor-contradiction class and the user's-call disposition, the knowledge-versus-change split, and the
link check's zero current hits.

## Divergence notes

One, low, from the round 2 critique: the instrument that decided this phase was the sweep of our own
six repos' records, with their stack as the prompt list, and A2's deciding evidence is entirely ours.
The anchor asks what is possible to adopt, and the two sentences answer it, so no re-aim. The report
says so here rather than implying their stack carried A2.

One framing correction happened before the phase opened: the video that prompted it claimed the
supervision reasoning had been codified into bash, and source shows what is codified is transport and
routing while every judgement still returns to a model.

## Method appendix

- **Rounds**: round 1, one wave of six seats (five fresh-context finder seats on separate axes, one
  codex seat), 40 candidates and 43 rejection entries (some candidates carry more than one), then the
  logic critique (8 blocking) and the codex red team (9 blocking, four of them false claims in the draft,
  withdrawn). Scott then ruled bugs first; the bug phase shipped as 2.2.11. Round 2: a triage of the
  sixteen rules into twelve items, each ruled by Scott after a read-only sweep of the six repos' records,
  two after a two-seat red team of the drafted sentence; the rewritten report then took the full gate
  (logic critique, codex red team, fresh-context refuter) and closed with nine blocking findings, in
  three classes: selective reads of their repos, sweep totals asserted as fact, and A1 and A2 drafted
  against one hub line each. Round 3's gate found five blocking findings, all inside the round 2 repair. This revision is the repair to those five.
- **Engine diversity**: both engines read the same local clones. One source set read by two
  independent engines, not two sourced engines. An agreement corroborates a reading, never a source.
- **Designated-review slot**: the logic critique, per this wrapper.
- **Native checks**: the docs-diff form. Every citation into their repos re-read at the pinned commit
  from the clone; every `path:line` into our tree and into the six repos' records resolved on disk and
  re-read; `node tools/doc-check.mjs` run, though this file sits outside its corpus. No project gate
  applies to `docs/` here beyond that.
- **Deferred, non-blocking**: resuming a killed seat by agent id before spending a retry; the
  late-alarm class; the host-level resource lock; the two repo defects the instrument measurement
  surfaced; A1's behaviour where the fixed-point form of a gate command is itself wrong (step 3's
  substitution rule governs); M4's F-S2-M, labelled blocking at `sbsforge-platform/docs/milestones/M4-brief-run-state.md:3577`
  and carried open through a user-directed exit that "does not rest on a clean pass" at `:4311`, a
  sighting against hub line 87 rather than an A2 instance.
- **Rejected register**: 43 entries with reasons in the phase record. The three most important
  rejections stand: a byte budget over the always-loaded contract, which would reverse a settled ruling
  of ours; their internal-vocabulary translation table, prose-only by their own check's admission; and
  porting their shared refusal library, premature under our own hoist rule at one user.
