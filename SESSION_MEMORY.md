# State [doctrine-gauntlet; gate widened to the whole document | 2026-08-14]

## Resume

The gate ran 16 rounds and then changed shape. Eleven passes against this session's **diff**
converged to a clean pass — and a twelfth pass, deliberately pointed at territory no earlier
pass had audited, found **twelve defects in text nobody had touched**. Scott ruled: fix
everything, so the exit condition is now the whole artifact rather than the diff. A widened
pass then returned **30 findings**, all fixed across rounds 14–16. See
`skills/doctrine-gauntlet/UNAUDITED.md` for the register and `do-not-merge.md`'s five
"Added round N" sections for every duplication and the argument defending it.

**🔴 Seven commits are unpushed** (`17c9d2c`…`d81a7aa`). Nothing else is stranded; tree clean.
The widened scope has had one round of fixes and **zero clean passes**.

## Active Work

| Item | Issue | Status | Key Files |
|------|-------|--------|-----------|
| 🔴 Seven commits unpushed — push was never authorised this session | — | 🔴 | — |
| Widened gate needs **two consecutive clean passes** and has had none. Every widening so far has paid; expect findings | — | 🟡 | `skills/doctrine-gauntlet/SKILL.md` |
| Phase 3 field test, staged all session and never run: clone @ `21bc6d4`, deps installed, Playwright resolving, port 3177 free | — | ⏳ | `skills/doctrine-gauntlet/harness/floor.mjs` |
| `--expect` asserts identity, never freshness — a server on a **deleted** build passes it. Rule needed: own the server you measure | — | ⏳ | `harness/floor.mjs`, `floor.md` |
| Section render breadth unscoped: 8 renders per section per retry. Cost, not correctness — must not drop 2560 | — | ⏸ | `SKILL.md` critic item 1 |

## Git State

- Branch `main` | tree clean | **ahead 7, unpushed** | PRs: none | open issues: none | CI: none configured
- Session commits: `17c9d2c` `4fee93a` `fe30362` `b3ecbab` `8b92311` `d81a7aa` (+ this backup)
- HEAD is always the backup commit; compare against the list, not HEAD.

## Gotchas

- **Scope is a filter on where people look, not on what is wrong.** Eleven passes, three
  lenses each, all honest — and structurally blind to the gate's own blocking condition
  (the reader test) being defined where no critic could read it. A green result means
  exactly what its scope means.
- **The document is stratified by age.** The newest brief had the best handover discipline;
  the oldest had none. Auditing recent changes inspects the stratum least likely to be wrong.
- **Passive voice hides a missing instruction.** "The floor report, which is handed to you"
  read as documentation of an arrangement that did not exist. In a prompt-assembling spec,
  "X is handed to you" is always *two* obligations. Grep for it.
- **A partial check is worse than a missing one.** The reduced-motion pass gated one theme
  and certified two; `[reduced-motion] ok` looked identical to full coverage. Tamper-test
  all three clauses — including *confirm the broken half is actually broken*.
- **Fresh authors beat fresh reviewers.** Rounds 1–4 (one author) each produced the next
  defect; rounds 5–16 (fresh author per round) repeatedly rejected their own briefs and were
  right. A reviewer can say a rule is wrong; only a new author can say the framing is.
- `pkill -f "codex exec"` kills your own wrapper shell; `codex exec` needs `< /dev/null` in
  non-TTY; `/codex:status` is user-invocation only.

## Next Session Kickoff

1. **Ask whether to push the seven commits.** Repo norm is push only when told; it was never
   said this session.
2. Then: the widened gate's second pass — three lenses, whole document, and point them at
   sections still unexamined rather than re-walking cleared ground. That is what found 12
   and then 30.
3. Phase 3 is the oldest debt and needs no gate: it is read-only against `website_v3` @ `21bc6d4`.
4. Read the repo's `skills/doctrine-gauntlet/`, never the plugin cache. Read `UNAUDITED.md`
   and `do-not-merge.md` **before** proposing any merge or simplification.
5. Standing rule: everything outside `doctrine-skills` is read-only; design deficits are
   reported, never fixed. Do not re-litigate the sibling-repo registers.
6. Skills: `doctrine` (hub) before any `doctrine-*` wrapper.
