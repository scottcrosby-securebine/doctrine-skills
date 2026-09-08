# Known issues

Defects known to the maintainers and not yet fixed. **GitHub issues are the tracker**; this file
exists so the list survives in the repo rather than only on one machine, and so an installer reading
the hooks can tell a known defect from a surprise.

It records open defects and settled questions about *external* behaviour. It is not a review record:
per CLAUDE.md, internal review history does not ship.

## Open

| Item | Site | What happens | Issue |
|---|---|---|---|
| Off-beat offset read from the wrong clock | `hooks/dctr-seat.teardown.selftest.mjs`, the latency-watcher clause | The offset is measured from the parent's clock at spawn instead of the watcher's own poll beat, so the clause stops discriminating a production-interval watcher from an injected-interval one when boot latency stretches. Instrument only | [#37](https://github.com/scottcrosby-securebine/doctrine-skills/issues/37) |
| Third clause certifies a hand-copy | `tools/herdr-lint.selftest.mjs`, clauses 3a/3b/3c | They prove two hand-written functions differ on an empty reply. The checker runs against the `BROKEN_E2` fixture, which nothing ties to them, so the fixture can lose its defect while the clauses stay green. Instrument only | [#37](https://github.com/scottcrosby-securebine/doctrine-skills/issues/37) |

## Settled, with the evidence

**A relabelled seat keeps its marker.** Fixed 2026-09-08 ([#36](https://github.com/scottcrosby-securebine/doctrine-skills/issues/36)). `stopAction` answers `relabel` when a seat's tab or pane is focused, and both relabel branches once removed the marker anyway, leaving the thing the user was watching alive with no record: SessionEnd enumerates markers and `staleSideSeats` filters recorded seats, so neither could reach it. Verified on a live herdr server with a control that reproduced the loss without the fix.

**A herdr tab list never carries an entry without a `tab_id`, and never omits a tab that exists.**
Checked at herdr's source on 2026-09-08 against `v0.8.2` and `v0.9.0`: `TabInfo` declares `tab_id`
and `focused` as plain non-`Option` fields with no `skip_serializing_if`, and `tab_info()` is total
over the range its own caller iterates. Both hooks therefore read listed-and-absent as a real
absence, which is what `hooks/dctr-seat.mjs` and `hooks/dctr-gate.mjs` do. Re-check if `TabInfo`
ever gains an optional field.

**The mutation gate covers `hooks/` only, by decision rather than by oversight.** The reason is
written in `hooks/dctr-mutations.mjs`'s header. A repair under `tools/` is pinned by that tool's own
three-clause tamper test, which runs in CI.
