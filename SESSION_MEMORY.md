# State [doctrine-gauntlet v1.5.0; the campaign's lessons absorbed | 2026-08-11]

## Resume

`doctrine-gauntlet` — the eighth skill, fusing Shumer's gauntlet loop with the
doctrine posture — is built, adversarially reviewed, and pushed at v1.5.0 with
its own portable floor harness. Its judgment layer was rewritten from the
website_v3 campaign post-mortem, and the same rulings were absorbed into the
kit. Next is the one untested thing: an end-to-end fused-gate run.

## Active Work

| Item | Issue | Status | Key Files |
|------|-------|--------|-----------|
| Fused gate has never run end to end — everything around it is tested, the loop is not | — | ⏳ | `skills/doctrine-gauntlet/SKILL.md` |
| Unverified: v1.5.0's reader test had no adversarial round, and the two-clean-pass gate never closed (last round found 1 blocking, fixed) | — | ⏳ | `skills/doctrine-gauntlet/` |
| 19 copy-law violations in website_v3 live copy — voice calls, deliberately not made | — | 🔴 | `website_v3` `npm run lint:copy` |
| website_v3 home-page footer is the site's weakest surface (blind critic) | — | 🔴 | `website_v3/components/layout` |

## Git State

- Branch: `main` @ `9e13cbf` | clean | PRs: none | CI: none configured
- Siblings, both clean and pushed: `securebine-design` @ `e11cc03`,
  `website_v3` @ its own head (another session owns it — see gotcha)

## Gotchas (learned this session)

- **A critic's coverage is exactly the axes its brief names.** Six waves passed
  every gate and were rejected as "great if you're an LLM, not so great if
  you're a human being": the one unmeasurable axis written down caught 4/4,
  unnamed axes scored 0/7 and reported nothing. Post-mortem in
  `securebine-design/docs/LESSONS.md`.
- `codex exec -i` is **variadic**: a prompt after `-i` is swallowed as a
  filename and the run dies on stdin. Put it first, after `--`, or on stdin.
  Codex also *sees* images, which is what makes it a visual red team.
- A full-page screenshot does **not** trigger lazy loading, and dev servers
  inject overlays and hydration noise; an unwarned critic grades it as design.
  `harness/floor.mjs` handles all three. Never `pkill -f` a pattern matching
  your own command line.
- `website_v3` moves under you — another session develops it and pushed
  mid-work, carrying a commit of mine to origin. Re-check its HEAD before
  trusting any finding about its contents.

## Next Session Kickoff

1. Run a real fused gate on a live page (`doctrine-gauntlet`, fused mode) —
   the restyled `/partners` wall is the natural target. It is the only
   untested mechanic and the first exercise of v1.5.0's reader test.
2. Then one verification round on `harness/floor.mjs` as **code**; the last two
   rounds found everything there, not in the prose.
3. Copy-law fixes in `website_v3` need Scott's voice call first.

Invoke: `doctrine`, then `doctrine-gauntlet`. The design system binds via the
`Design system:` line in `securebine-design/CLAUDE.md`.
