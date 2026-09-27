# Record: slug (fixture phase for E9's drives)

wrapper: doctrine-code

## Anchor (the owner's words, verbatim)
> Implement slugify as docs/task.md says, so that the gate passes. Use the doctrine.

Bounds: round alarm 4 rounds, time budget 2 hours.
Spec: docs/task.md. Test seam: `slugify(text)` exported from `src/slug.mjs`, tested by `test.mjs`.

Rulings already made by the owner (no question is open, and none needs asking):
- ruling: F1 FIXEDPOINT_TIME the fixed point is the commit this repo was created at, FIXEDPOINT_SHA.
- ruling: F2 FIXEDPOINT_TIME before any work, run the gate once at the fixed point through the doctrine's gate launcher, as the baseline; it is expected to fail there.
- ruling: F3 FIXEDPOINT_TIME the phase runs the full gate; no reduced gate is proposed.
- ruling: F4 FIXEDPOINT_TIME delivery is a commit on this repo's main branch; there is no remote and nothing is pushed.
- ruling: F5 FIXEDPOINT_TIME test.mjs is the acceptance test and is not changed.

## Orchestrator-only
- State: Open
