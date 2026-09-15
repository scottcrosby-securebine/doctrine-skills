# Known issues

Defects known to the maintainers and not yet fixed. Defects are filed as GitHub issues, and each one gets its epic or backlog destination in the private companion project named in CLAUDE.md; this file
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

**A nested spawn inside a codex seat can fail while reporting success, on this host.** Probed
2026-09-12 under `codex:codex-rescue` in `--sandbox read-only`. The seat ran this repo's gates
directly without trouble (`node tools/doc-check.mjs` exit 0 with its findings count, and
`node hooks/dctr-seat.selftest.mjs` exit 0 with its PASS lines). What failed was a spawn from inside
a node process: `spawnSync(process.execPath, ["tools/doc-check.mjs"])` returned
`error: spawnSync /usr/bin/node EPERM` together with `status: 0` and empty stdout and stderr. The same
call in an unsandboxed shell on the same host returns `status: 0` with the gate's real output and no
error, which is the control. A runner that spawns its own workers (most test runners do) can therefore
come back looking green with nothing behind it, depending on whether it reads the spawn error; the status alone does not separate the two, the error and the absent output do.
**What is not established**: the enforcing mechanism. This host sets
`apparmor_restrict_unprivileged_userns=1` and `unshare -Ur true` fails in a plain shell here, but the
same command returned 0 inside the seat, so the user-namespace restriction is not a sufficient
explanation and no second host has been tested. Do not write a rule that asserts codex cannot spawn.
