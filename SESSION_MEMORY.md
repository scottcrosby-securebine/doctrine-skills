# State [doctrine-gauntlet v1.12.0; fourteen defects found by running it | 2026-08-12]

## Resume

The gauntlet had been reviewed for three sessions and never executed. Executing
it found **fourteen defects in the skill itself**, all fixed, red-teamed and
committed. Two runs produced them:

1. **A synthetic page** (twelve findings). Nine were one repair: a rule that
   lived in flow prose and never reached the prompt of the agent who had to
   obey it. The skill had a critic brief and no builder brief, named axes for
   critics and none for the direction adversary, an assertion rule with no
   ledger to enforce against.
2. **A mock conversion of a real app panel to a real design system**
   (`pdd-generator` ECR list → `securebine-design`), which found two more the
   synthetic run structurally could not: the theme-reachability probe misfiring
   on fragments and contradicting its own fingerprint (F1-F13 era), and **F14 —
   the floor's layout check reads the document, so a component clipping 88px at
   1440 inside `overflow-x` passed all six configurations**.

**Ruled: capability and accuracy outrank size** (Scott, 2026-08-12) — now a
rule in `CLAUDE.md`. Do not compress for its own sake.

## Active Work

| Item | Issue | Status | Key Files |
|------|-------|--------|-----------|
| The gate has run **one round**, not to exit. Two clean passes, the four-round valve, simplification re-entry and delivery are still unexercised | — | ⏳ | `skills/doctrine-gauntlet/SKILL.md` |
| **PhaseMU migration deficits (7) are recorded but have no durable home** — Scott wants them in a separate session. They were handed over as a file; they are NOT in any repo | — | 🔴 | (handed to Scott) |
| The law-as-critic-axis is still untested — a bound design system exists now, but no critic has been run against its law | — | ⏳ | `skills/doctrine-gauntlet/SKILL.md` |
| Trigger, not a task: docket/counter machinery belongs to the hub when a second wrapper needs it. **The claim ledger is now a second candidate** — two wrappers define one, cross-referenced rather than shared | — | ⏸ | `skills/doctrine/SKILL.md` |

## Git State

- Branch `main` @ `0b35ba4`+ | clean | pushed | PRs: none | CI: none configured
- Session commits: `76c4b7a` `bde93ad` `58281fe` `fde22f7` `fb49ce9` `0b35ba4`

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
- **Scratchpad artifacts are ephemeral.** The run log (14 findings with
  evidence), the synthetic fixture and the ECR conversion mock all lived there.
  The findings are embodied in the skill and in the commit messages of
  `bde93ad`, `fde22f7` and `fb49ce9`, which is the durable record; the fixtures
  are gone with the session and are cheap to rebuild.
- **`pdd-generator` and `securebine-design` were read-only.** Nothing was
  written to either. Scott's ruling: develop the skill only; design deficits get
  reported for a separate session, and `securebine-design` is not to be extended.
- **PhaseMU renders via its own `/__preview?el=…` harness** (`npx vite`, port of
  your choice — skip `predev`, it fetches from the network). Six ECR components
  are renderable; the other 42 surfaces need auth. That constraint is migration
  deficit D5 and shapes any future conversion work.

## Next Session Kickoff

1. Ask which of the four board items Scott wants; do not assume.
2. **The cheapest remaining skill test is the law-as-critic-axis** — a bound
   design system exists now (`securebine-design`), and no critic has ever been
   run against its law. Rebuild the ECR conversion mock (an hour) and put a
   critic on it with the law named by path, per critic brief item 3.
3. If running the gate again, run it to *exit* — two clean passes, the
   four-round valve and simplification re-entry are the untested half.
4. Read the repo's `skills/doctrine-gauntlet/SKILL.md`, not the plugin cache.
5. Everything outside `doctrine-skills` is read-only. Design deficits are
   reported, never fixed.
