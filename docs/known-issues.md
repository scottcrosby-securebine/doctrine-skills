# Known issues

Defects known to the maintainers and not yet fixed. **GitHub issues are the tracker**; this file
exists so the list survives in the repo rather than only on one machine, and so an installer reading
the hooks can tell a known defect from a surprise.

It records open defects and settled questions about *external* behaviour. It is not a review record:
per CLAUDE.md, internal review history does not ship.

## Open

| Item | Site | What happens | Issue |
|---|---|---|---|
| Focused tab seat loses its record | `hooks/dctr-seat.mjs`, the `relabel` branch of the tab stop and the marker removal under `placementLock` | A tab seat the user is watching is relabelled rather than closed, `closeFailed` stays null, and the marker is removed anyway. The tab lives with nothing on disk naming it, so SessionEnd cannot reclaim it. No cap effect for a tab: `isSideSeat` is `paneId && !tabId`, so a tab marker is never counted by `seatPlacement` either way. The same branch for a PANE does under-count the column, because a spared pane stays in the layout holding a slot while appearing in neither half of `sideOccupants`. Fails safe in both cases: the thing is spared, then forgotten | [#36](https://github.com/scottcrosby-securebine/doctrine-skills/issues/36) |
| Off-beat offset read from the wrong clock | `hooks/dctr-seat.teardown.selftest.mjs`, the latency-watcher clause | The offset is measured from the parent's clock at spawn instead of the watcher's own poll beat, so the clause stops discriminating a production-interval watcher from an injected-interval one when boot latency stretches. Instrument only | [#37](https://github.com/scottcrosby-securebine/doctrine-skills/issues/37) |
| Third clause certifies a hand-copy | `tools/herdr-lint.selftest.mjs`, clauses 3a/3b/3c | They prove two hand-written functions differ on an empty reply. The checker runs against the `BROKEN_E2` fixture, which nothing ties to them, so the fixture can lose its defect while the clauses stay green. Instrument only | [#37](https://github.com/scottcrosby-securebine/doctrine-skills/issues/37) |

## Settled, with the evidence

**A herdr tab list never carries an entry without a `tab_id`, and never omits a tab that exists.**
Checked at herdr's source on 2026-09-08 against `v0.8.2` and `v0.9.0`: `TabInfo` declares `tab_id`
and `focused` as plain non-`Option` fields with no `skip_serializing_if`, and `tab_info()` is total
over the range its own caller iterates. Both hooks therefore read listed-and-absent as a real
absence, which is what `hooks/dctr-seat.mjs` and `hooks/dctr-gate.mjs` do. Re-check if `TabInfo`
ever gains an optional field.

**The mutation gate covers `hooks/` only, by decision rather than by oversight.** The reason is
written in `hooks/dctr-mutations.mjs`'s header. A repair under `tools/` is pinned by that tool's own
three-clause tamper test, which runs in CI.
