# Known issues

Defects known to the maintainers and not yet fixed. Defects are filed as GitHub issues, and each one gets its epic or backlog destination in the private companion project named in CLAUDE.md; this file
exists so the list survives in the repo rather than only on one machine, and so an installer reading
the hooks can tell a known defect from a surprise.

It records open defects and settled questions about *external* behaviour. It is not a review record:
per CLAUDE.md, internal review history does not ship.

## Open

**Moving a seat's pane leaks it** ([#100](https://github.com/scottcrosby-securebine/doctrine-skills/issues/100)). When the seat hook places a seat it drops the marker of every side seat whose pane is not in the session tab's layout (`staleSideSeats` in `hooks/dctr-lib.mjs`), without asking herdr whether the pane still exists elsewhere. A seat pane you move to another tab therefore loses its marker on the next placement, and its SubagentStop closes nothing, so the pane stays open until you close it. Until it is fixed, leave seat panes where the hook put them.

**`dctr-project.mjs board` overwrites whatever `board.md` is** ([#101](https://github.com/scottcrosby-securebine/doctrine-skills/issues/101)). It writes `<Records>/board.md` whole and unconditionally, so a phase record of that name would be replaced, and a `board.md` that is a symlink has its target overwritten, which can lie outside the records folder. No record is named `board.md` today, since records are date-prefixed.

**On macOS a Codex background command run through a system binary always reads as running.** On Codex, auto-cycle tells live background work by its environment, read from `ps` on macOS, and `ps` shows no environment for a system binary such as `/bin/sleep` or `/bin/zsh`. Such a command holds a Stop back, and after 60 seconds the record gets a paused line saying the doctrine could not tell. The README's Codex section has the detail.

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

**A nested spawn inside a codex seat can fail while reporting success, on the Linux host it was probed on.** Probed
2026-09-12 under `codex:codex-rescue` in `--sandbox read-only`. The seat ran this repo's gates
directly without trouble (`node tools/doc-check.mjs` exit 0 with its findings count, and
`node hooks/dctr-seat.selftest.mjs` exit 0 with its PASS lines). What failed was a spawn from inside
a node process: `spawnSync(process.execPath, ["tools/doc-check.mjs"])` returned
`error: spawnSync /usr/bin/node EPERM` together with `status: 0` and empty stdout and stderr. The same
call in an unsandboxed shell on the same host returns `status: 0` with the gate's real output and no
error, which is the control. A runner that spawns its own workers (most test runners do) can therefore
come back looking green with nothing behind it, depending on whether it reads the spawn error; the status alone does not separate the two, the error and the absent output do.
**What is not established**: the enforcing mechanism. That host sets
`apparmor_restrict_unprivileged_userns=1` and `unshare -Ur true` fails in a plain shell there, but the
same command returned 0 inside the seat, so the user-namespace restriction is not a sufficient
explanation and no second host has been tested. Do not write a rule that asserts codex cannot spawn.
