# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code plugin ("doctrine") distributing eight skills as pure markdown — there is no build, lint, or test tooling. The only machine-validated files are `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` (check with `python3 -m json.tool <file>` after editing). Bump `version` in `plugin.json` when shipping a change.

Skills were validated by running fresh-context agents through each wrapper against realistic scenarios and patching every ambiguity they hit — when changing a skill's flow, that's the test to rerun.

## Architecture

**Layer, not fork.** The core design rule: these skills wrap other authors' skills (Matt Pocock's engineering skills, superpowers, codex, ponytail, writing-clearly-and-concisely) by invoking them **by name at runtime**, never copying or restating their content, so upstream updates flow through. The one sanctioned exception is `matts-code-review` — a renamed copy of Matt's `code-review`, because the original name collides with Claude Code's native `/code-review` (documented in README Prerequisites).

**Hub and spokes.** `skills/doctrine/SKILL.md` is the hub: the seven-step posture (ask questions first → phases/waves of parallel agents → native checks → red team → two-clean-pass loop → simplify → deliver) and the fallback table for missing prerequisites. The seven `doctrine-*` wrappers each begin with "REQUIRED BACKGROUND: read the `doctrine` skill first" and supply only the task shape: which external skill is the core discipline, how phases map onto it, and which review skill the phase gate uses. Don't restate posture steps inside a wrapper — reference them ("doctrine step 4").

**A hoist that is deliberately not done yet.** About 1,100 words in `doctrine-gauntlet` — "The docket and the arbiter" in full, plus the counter table and the rationale around it in "Modes" — are task-shape-agnostic and conceptually belong to the hub. They stay in the wrapper because **no second wrapper needs them**, and hoisting early makes all seven carry machinery one uses. A second candidate now exists and is deliberately **not** hoisted either: `doctrine-write` and `doctrine-gauntlet` both build a **claim ledger**, and the gauntlet's version cross-references the write one rather than redefining it — the predecessor-is-evidence rule is genuinely gauntlet-only, so two definitions would be wrong but one shared section is premature at two users. **The trigger is a second wrapper needing an escalation budget or PROPOSED/RULED discipline** — at that point move them up. It is a re-layering, not a cut: nothing gets deleted, and expect to generalize on the way, since the counters are written against gauntlet's two modes and the docket destinations assume a bound design system. This was measured during a necessity pass, not guessed — don't re-derive it.

**Every external reference needs a fallback.** Any skill a wrapper invokes must have a graceful-degradation path, either in the doctrine skill's Fallbacks table or stated inline in the wrapper. A reference with no fallback is a bug.

**Gate semantics are load-bearing.** The two-clean-pass exit gate, the definition of a "finding" (anything requiring a diff change; declined nitpicks don't reset the counter), and the four-loop escalation valve are deliberate design (see README Design notes) — don't loosen them casually when editing skills.

**Some rules only look redundant.** `doctrine-gauntlet` carries ten recorded pairs that read as the same rule stated twice and are not — each survives because a run can comply with one and violate the other, and several exist because the two halves reach two different agents' prompts. They are recorded with their distinctions in `skills/doctrine-gauntlet/do-not-merge.md`, which is **not exhaustive**. Read it before proposing a merge there; re-proposing a listed pair isn't a finding unless you can defeat the stated distinction, and an unlisted pair still needs the same argument.

## Files that must stay in sync

Adding, renaming, or rescoping a skill touches all of:

- `skills/<name>/SKILL.md` (frontmatter `name:` must match the directory)
- The skill table and count ("Eight skills", and the wrapper count in the `doctrine` row) in `README.md`
- The wrapper list in `skills/doctrine/SKILL.md`'s intro
- Descriptions in `.claude-plugin/plugin.json` and `marketplace.json`

## The one skill with code in it

`doctrine-gauntlet` is the only skill with bundled files: `harness/floor.mjs`
(the technical floor its critics depend on), `floor.md` (how to drive that
harness — flags, exit codes, render honesty), `tools.md` (Codex and Claude
Design invocation) and `do-not-merge.md` (the pairs a reviewer must not
collapse). The sidecars exist so SKILL.md carries decision content and gate law
while operating manuals and review history load on demand. The split rule: if it
changes what an agent *decides*, it belongs in SKILL.md; if it changes how a
tool is *invoked* or records a call already made, it belongs in a sidecar. The harness is the only executable in the repo, and its portability
is the point: it resolves Playwright and axe from whatever the host project
has, and reports `[UNMEASURED]` rather than passing something it could not
check. Never hardcode a path into it.

Keep SKILL.md in step with what the code actually does — it claims specific
behaviour (three widths, lazy-load scrolling, overlay hiding, the flag set)
that the code must still perform. Two flags exist because without them the
floor can never close on ordinary projects: `--theme-class=NAME` for
class-based theming (Tailwind's `dark`), and `--single-theme` for a site that
genuinely ships one. `--crop=SELECTOR` exists because a full-page screenshot is
read scaled to fit, so nothing else lets a reviewer see a figure at the size it
ships. Any new theme-application site must go through the shared
`applyTheme()` helper; a second call site setting `data-theme` directly is how
the reduced-motion pass silently measured the wrong theme.

**The harness applies the theme, so it must not certify one nobody can reach.**
The reachability probe (no `prefers-color-scheme`, no `color-scheme`, no toggle,
no script touching the theme → `[UNMEASURED]`) is load-bearing, not a nicety: an
instrument that creates the state it measures will otherwise pass a dead palette
exactly like a working one. Keep the probe honest if you touch theming — it is
the one check whose absence is invisible in the output.

**Capability and accuracy outrank size.** A missing rule costs a defect in shipped work; a present one costs tokens, and those are not comparable prices. Don't compress for its own sake, don't report length as a concern, and don't cut a rule because a file feels long. The test is whether a rule **fires**, and whether it reaches the prompt of the agent who must obey it — a rule nobody has tripped, in a prompt nobody assembles, is the thing to cut. Sidecars are still right when they change *who loads what*, and wrong when they exist to make a number smaller.

## Conventions

- SKILL.md frontmatter `description:` follows the "Use when …" trigger-phrase style; it is what makes the skill fire, so write it for matching, not marketing.
- Wrappers end with a short "Red flags" section: concrete failure modes, not generic advice.
- Push to the remote only when explicitly told to.
