# State [doctrine-gauntlet v1.9.0; hardened, measured, still never run | 2026-08-12]

## Resume

Three sessions of hardening `doctrine-gauntlet` are done and pushed. Ten
red-team rounds fixed seven KILL-level defects; a three-agent necessity pass
then measured the file and found it **~94% irreducible** — nearly every rule
maps to a dated failure in the campaign record. It stays one skill: the size
asymmetry against its 295-632-word siblings is the "layer, not fork"
architecture working, because gauntlet has no upstream discipline to delegate
to. Harness detail now lives in `floor.md`, tool invocation in `tools.md`.

## Active Work

| Item | Issue | Status | Key Files |
|------|-------|--------|-----------|
| The fused gate has still never been exercised — every session so far reviewed the artifact, none ran it. Now unblocked | — | ⏳ | `skills/doctrine-gauntlet/SKILL.md` |
| Two judgment calls owed by Scott: the commit-authorization clause, and provenance for campaign citations in a public plugin | — | 🔴 | `skills/doctrine-write/SKILL.md` |
| The merger's seven "do not merge" pairs are unrecorded — a future reviewer will re-propose them | — | 🔴 | `CLAUDE.md` |
| Trigger, not a task: ~1,100 words of docket/counter machinery belong to the hub **when a second wrapper needs them** | — | ⏸ | `skills/doctrine/SKILL.md` |

## Git State

- Branch `main` @ `aa25970` | clean | pushed | PRs: none | CI: none configured

## Gotchas

- **Lane (Scott, 2026-08-12): develop the skills; do not do web development.**
  `website_v3` is a **read-only evidence corpus** for mining lessons, never a
  build target. Validating the gate needs *a* page, not *their* page — use a
  synthetic one in the scratchpad.
- **Playwright is now installed globally** (`playwright-core`,
  `@axe-core/playwright`, `axe-core`). Browsers were already cached at
  `~/.cache/ms-playwright`; `playwright-core` ships without them. Verified with
  `NODE_PATH` unset from a dir with no `node_modules`: exit 0 clean, and axe
  genuinely firing on a planted defect — not silently absent.
- **A broken instrument voids the rounds it already passed.** False passes do
  not announce themselves; only failures do.
- **Parallel agents given the same brief converge.** Three copies of one lens
  read as confidence and measure one opinion. Give diverse mandates.
- **Codex as red team**: `-c model_reasoning_effort="medium"`, a lean prompt and
  a long tool timeout. It returns capacity errors under load; re-run.

## Next Session Kickoff

1. Ask which of the four Active Work items Scott wants; do not assume.
2. If exercising the gate: synthetic page, scratchpad, no client repo.
3. Invoke `doctrine`, then `doctrine-gauntlet`.
