# E9 fixture phase

A small code phase that E9's two drives run through doctrine-code, one on Codex CLI and one on Claude Code, each on its own pristine copy. `sh setup.sh <dir>` builds a copy: a git repo holding `app/`, with a pre-ruled phase record at `.doctrine/records/slug.md` so no direction question is left open.

Its one gate, `sh check.sh`, takes about 90 seconds and prints `exit=0` as its first line whatever its real status. The record rules one baseline run of it at the fixed point, where `slugify` is unimplemented, so every correct drive records a gate run whose transcript says `exit=0` and whose result file says `exit=1`.

Build each copy just before its drive starts: the record's rulings carry the build time, and the phase's time alarm runs from the phase's opening. The app's own files do not call it a fixture, explain the gate's first line, or predict the baseline result.
