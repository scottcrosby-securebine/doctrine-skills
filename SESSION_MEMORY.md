# State [doctrine-gauntlet v1.11.0; run once, twelve defects found and fixed | 2026-08-12]

## Resume

The gauntlet had been reviewed for three sessions and never executed. Running it
once, end to end, against a synthetic page in the scratchpad surfaced **twelve
defects in the skill itself** — and nine were one repair: a rule that lived in
flow prose and never reached the prompt of the agent who had to obey it. All
twelve are fixed, red-teamed (five KILLs, all addressed) and committed.

The four items that were on this board are all closed: the gate has been
exercised, both judgment calls ruled, the do-not-merge pairs recorded, the hoist
trigger written down.

## Active Work

| Item | Issue | Status | Key Files |
|------|-------|--------|-----------|
| The gate has run **one round**, not to exit. Two clean passes, the four-round valve, simplification re-entry and delivery are still unexercised | — | ⏳ | `skills/doctrine-gauntlet/SKILL.md` |
| ~~SKILL.md grew +20%~~ **CLOSED, ruled: capability and accuracy outrank size (Scott, 2026-08-12).** Do not run compression passes for their own sake; the declined trim stays declined | — | ✅ | `skills/doctrine-gauntlet/SKILL.md` |
| Trigger, not a task: docket/counter machinery belongs to the hub when a second wrapper needs it. **The claim ledger is now a second candidate** — two wrappers define one, cross-referenced rather than shared | — | ⏸ | `skills/doctrine/SKILL.md` |

## Git State

- Branch `main` @ `bde93ad` | clean | PRs: none | CI: none configured

## Gotchas

- **Lane (Scott, 2026-08-12): develop the skills; do not do web development.**
  `website_v3` is a **read-only evidence corpus**, never a build target. The
  fixture for exercising the gate is synthetic and lives in the scratchpad.
- **The Skill tool resolves `doctrine:*` to plugin cache 1.2.0, which has no
  gauntlet in it.** Testing the skill means reading the repo copies directly.
- **The harness applies the theme itself**, so it cannot certify one a user can
  reach — that is why reachability is `[JUDGE]`, not `[UNMEASURED]`.
  `[UNMEASURED]` is waivable; a floor failure is not, and a dead palette must
  not be waivable.
- **A full-page screenshot is read scaled.** A broken illustration passed my own
  inspection that way. Use `--crop=SELECTOR`.
- The run log with all twelve findings and their evidence lived in the session
  scratchpad and is **ephemeral**. The findings themselves are now embodied in
  the skill and in `bde93ad`'s commit message, which is the durable record.

## Next Session Kickoff

1. Ask what Scott wants; do not assume. The board is nearly empty by design.
2. If running the gate again: synthetic page, scratchpad, no client repo — and
   run it to *exit* this time, since that is the untested half.
3. Read the repo's `skills/doctrine-gauntlet/SKILL.md`, not the plugin cache.
