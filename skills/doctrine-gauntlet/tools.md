# Tool reference — Codex and Claude Design

Invocation detail for the two optional capabilities in `doctrine-gauntlet`. Read the
relevant half before using that capability; the skill itself carries only when to
reach for them, the authorization boundary, and the fallback.

## Codex — generating images

```bash
codex exec --sandbox workspace-write --skip-git-repo-check -C <target-repo> \
  "<art direction>. Save it to <path inside that repo>."
```

Run with `-C` at the repo you are writing into and name a destination inside it.
`workspace-write` does not authorize arbitrary paths elsewhere; `--add-dir` widens it.

Optimize and commit generated assets as local files. Nothing is fetched from a CDN
at runtime.

## Codex — as a visual red team

Codex **sees** images, which is what makes it usable as an adversary on rendered work:

```bash
codex exec --sandbox read-only --skip-git-repo-check "<what to attack>" \
  -i contact-sheet-dark.png -i contact-sheet-light.png
```

`-i` is **variadic**: put the prompt *before* the flags, after a `--` separator, or on
stdin. A prompt trailing after `-i` is swallowed as another filename and the run dies
asking for input.

Attach contact sheets covering every viewport and theme plus the reference — not a
token pair of shots. A red team judging two images has judged two images.

Long reviews on high reasoning effort can exceed a harness's command timeout. Prefer
`-c model_reasoning_effort="medium"` with a lean prompt, and give the call a generous
timeout rather than discovering the limit at minute twenty.

## Claude Design — the write sequence

Order matters; `write_files` is rejected without a `planId`.

`list_projects` → `create_project` **only with the user's explicit go-ahead** →
`list_files` / `get_file` → diff → `finalize_plan` (returns the `planId`) →
`write_files` / `delete_files` with that `planId` → re-list to verify.

Write only what differs; never a wholesale replace — **except an empty project, where the
whole set is the diff** and a full rehydrate is the correct first sync, not the wholesale
replace this rule warns against.

Where each capability is used in the flow:

- **Discovery** — `list_projects` / `list_files` can show that a project exists and
  what it renders. A project is never itself the design-system binding: resolve it
  back to the repo behind it and bind there (ladder rung 4). With no repo behind it,
  the run has no house system and the DNA comes from comps, not from the project.
- **Mid-loop** — push each round's finished sections so the user can watch the
  gauntlet progress in the Design pane.
- **Deliver** — push the approved set.
