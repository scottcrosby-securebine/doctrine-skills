# State [doctrine-gauntlet shipped with a portable harness | 2026-08-11]

## Resume

`doctrine-gauntlet` — the eighth skill, fusing Shumer's gauntlet loop with the
doctrine posture — is built, reviewed over six adversarial rounds, and pushed at
v1.4.0 with its own portable floor harness. Nothing is stranded; next is the one
untested thing, an end-to-end fused-gate run.

## Active Work

| Item | Issue | Status | Key Files |
|------|-------|--------|-----------|
| Fused gate has never run end to end — every part around it is tested, the loop itself is not | — | ⏳ | `skills/doctrine-gauntlet/SKILL.md` |
| Two-clean-pass gate never closed; round 6 found 1 blocking, fixed but unverified | — | ⏳ | `skills/doctrine-gauntlet/harness/floor.mjs` |
| 19 copy-law violations in website_v3 live copy — voice calls, deliberately not made | — | 🔴 | `website_v3` `npm run lint:copy` |
| website_v3 home-page footer is the site's weakest surface (blind critic) | — | 🔴 | `website_v3/components/layout` |
| website_v3 `SESSION_MEMORY.md` claims securebine-design has 21 commits to push — stale | — | ⏳ | `website_v3/SESSION_MEMORY.md` |

## Git State

- Branch: `main` @ `a4d44ac` | clean | PRs: none | CI: none configured (`gh workflow list` empty)
- Siblings pushed this session: `securebine-design` @ `df1e040`, `website_v3` @ `c4e6b8c` (rode along on someone else's push)

## Gotchas (learned this session)

- `codex exec -i` is **variadic**: a prompt placed after `-i` is swallowed as a
  filename and the run dies waiting on stdin. Put the prompt first, after `--`,
  or on stdin. Codex also *sees* images, which is what makes it a visual red team.
- A full-page screenshot does **not** trigger lazy loading, and dev servers inject
  overlays and hydration noise. An unwarned critic grades all of it as design.
  `harness/floor.mjs` now handles all three.
- `website_v3` moves under you — another session develops it actively and pushed
  mid-work, carrying a commit of mine to origin. Re-check its HEAD before trusting
  any finding about its contents.

## Next Session Kickoff

1. Run a real fused gate on a live page (`doctrine-gauntlet`, fused mode). The
   restyled `/partners` credential wall is the natural target. This is the only
   untested mechanic.
2. Then one more verification round on `harness/floor.mjs` as **code** — the last
   two rounds found everything there, not in the prose.
3. Copy-law fixes in `website_v3` need Scott's voice call; see `docs/RESTYLE-DOCKET.md`
   conventions before rewriting anything.

Invoke: `doctrine`, then `doctrine-gauntlet`. Design system binds via the
`Design system:` line in `securebine-design/CLAUDE.md`.
