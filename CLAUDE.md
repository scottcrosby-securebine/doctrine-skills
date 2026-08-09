# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code plugin ("doctrine") distributing eight skills as pure markdown — there is no build, lint, or test tooling. The only machine-validated files are `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` (check with `python3 -m json.tool <file>` after editing). Bump `version` in `plugin.json` when shipping a change.

Skills were validated by running fresh-context agents through each wrapper against realistic scenarios and patching every ambiguity they hit — when changing a skill's flow, that's the test to rerun.

## Architecture

**Layer, not fork.** The core design rule: these skills wrap other authors' skills (Matt Pocock's engineering skills, superpowers, codex, ponytail, writing-clearly-and-concisely) by invoking them **by name at runtime**, never copying or restating their content, so upstream updates flow through. The one sanctioned exception is `matts-code-review` — a renamed copy of Matt's `code-review`, because the original name collides with Claude Code's native `/code-review` (documented in README Prerequisites).

**Hub and spokes.** `skills/doctrine/SKILL.md` is the hub: the seven-step posture (ask questions first → phases/waves of parallel agents → native checks → red team → two-clean-pass loop → simplify → deliver) and the fallback table for missing prerequisites. The seven `doctrine-*` wrappers each begin with "REQUIRED BACKGROUND: read the `doctrine` skill first" and supply only the task shape: which external skill is the core discipline, how phases map onto it, and which review skill the phase gate uses. Don't restate posture steps inside a wrapper — reference them ("doctrine step 4").

**Every external reference needs a fallback.** Any skill a wrapper invokes must have a graceful-degradation path, either in the doctrine skill's Fallbacks table or stated inline in the wrapper. A reference with no fallback is a bug.

**Gate semantics are load-bearing.** The two-clean-pass exit gate, the definition of a "finding" (anything requiring a diff change; declined nitpicks don't reset the counter), and the four-loop escalation valve are deliberate design (see README Design notes) — don't loosen them casually when editing skills.

## Files that must stay in sync

Adding, renaming, or rescoping a skill touches all of:

- `skills/<name>/SKILL.md` (frontmatter `name:` must match the directory)
- The skill table and count ("Eight skills", and the wrapper count in the `doctrine` row) in `README.md`
- The wrapper list in `skills/doctrine/SKILL.md`'s intro
- Descriptions in `.claude-plugin/plugin.json` and `marketplace.json`

## Conventions

- SKILL.md frontmatter `description:` follows the "Use when …" trigger-phrase style; it is what makes the skill fire, so write it for matching, not marketing.
- Wrappers end with a short "Red flags" section: concrete failure modes, not generic advice.
- Push to the remote only when explicitly told to.
