# Watching a run

When Claude Code dispatches a subagent, you cannot see what it is doing. The terminal goes quiet and some minutes later an answer appears. A doctrine run dispatches a lot of them, so that quiet gets long, and if one is off down the wrong path you find out at the end.

[herdr](https://herdr.dev) fixes that. It is a terminal multiplexer that knows which agent is running in which pane. Run Claude Code inside it (0.8.2 or later) and **every subagent gets a live pane you can read while it works**: its instructions, the files it opens, the commands it runs, as they happen. Optional, and nothing here is needed to use the skills.

Up to six panes stack beside your session, which keeps the bigger share of the screen:

```text
── doctrine seat · …/subagents/agent-4fc0a9.jsonl
» Verify every claim in README.md against the current source…
→ Read  {"file_path":"hooks/dctr-seat.mjs"}
    // doctrine — herdr seat visibility hook (issue #17).
→ Grep  {"pattern":"SIDE_CAP"}
```

**Overflow and exits.** Six is the whole column. Past six, extras open as tabs in herdr's sidebar. When an ordinary agent finishes its pane closes itself, unless you are reading it at that moment, in which case it stays with a `· done` suffix. A Codex pane is the exception: it relabels with the job's final status and stays, so you can read the result. Placing the next Codex seat closes finished Codex panes, but only unfocused ones, so the pane you are reading survives. Session cleanup then closes whatever tracked panes are left. Nothing ever steals your cursor: panes and tabs open unfocused.

**Long checks get a pane too.** A gate that outlasts the ten minutes Claude Code allows a command used to vanish into the background. Doctrine runs it in a pane instead, streaming output and writing the same output to a transcript file. When the check finishes a second file, `<transcript>.result`, appears with the exit status as its first line, `exit=N`; the transcript itself never carries a verdict, so a check printing `exit=0` cannot end the wait early. Outside herdr it runs detached with the same two files, so the record is identical either way. A check that reports as it goes shows its own progress in the pane; the mutation gate prints a line every ten seconds giving how much of the run has settled and which piece of work has been running longest, because its slowest piece spends most of its time asleep on timing waits and a pane that sits still is otherwise indistinguishable from one that has died.

**Nothing to set up, and nothing breaks without it.** The hooks wake only inside a herdr pane and stand down in their first lines everywhere else. A herdr problem never changes the run; the work carries on and the reason is logged to `hook.log` in the session's temp folder. There is also an opt-in sidebar token showing a run's round and gate counters.

**The counter token.** Each gate round the orchestrator publishes one token, `$doctrine`, whose value is `r<round>·e<exit>·v<valve>`: the round number, `e1` once a clean pass is on record for the current revision and `e0` otherwise, and the count of rounds that found a blocking finding. It renders only if your herdr `config.toml` names it in an Agent row: merge the rows below into your existing `[ui.sidebar.agents]` table, and if that table has a `rows_by_agent` entry for the agent you run, put the rows there instead, since an override replaces `rows` rather than extending it. On herdr 0.9.0 or later, rules on that row colour it: amber while a ruling is owed (below), green when a clean pass stands, red the moment a round has found a blocker while no clean pass stands for the current revision, and unstyled before any round has found one. First matching rule wins, so the order below is the logic.

**Epic, phase and a ruling owed.** In a repo tracked by [`doctrine-project`](skills/doctrine-project.md), the orchestrator also publishes `$epic`, the current epic's ID, and `$phase`, the phase it is running, both on its own pane and both 24 characters at most. It adds the suffix `·owed` to `$doctrine` while a decision waits on you: an alarm has fired and has no ruling yet, a direction question is open, or a closing round has finished. The suffix clears when you rule. Each session's orchestrator is the one writer of its pane's tokens, and it re-publishes them within the hour, so a quiet phase keeps its row. For attention it relies on herdr's own `blocked` and `done` states and the `state_icon` they drive; doctrine never registers itself as the pane's agent reporter, since a reporter would replace that detection.

```toml
[ui.sidebar.agents]
rows = [
  ["state_icon", "workspace", "tab"],
  ["agent", { token = "$doctrine", rules = [
    { contains = "·owed", fg = "#fd5", bold = true },
    { contains = "·e1·", fg = "#5f5" },
    { contains = "·v0" },
    { contains = "·e0·", fg = "#f55", bold = true },
  ] }],
  [{ token = "$epic" }, { token = "$phase" }],
]
```

The separator is U+00B7, the character the token carries, and `{ contains = "·v0" }` with no style is a deliberate stop: it keeps the default look for a run that has found nothing yet. On 0.8.2 drop `rules` and keep the rest; the value shows in one colour. Run `herdr config check`, then `herdr server reload-config`. The value appears the next time a round is recorded and disappears an hour after the last one, leaving the agent name alone on its row; that is expiry, not a config fault.

**When the rows do not show.** Four conditions decide it, and a check that the rows render should name the view and the width it used:

- Custom rows show only in the expanded sidebar.
- The client must be wider than `ui.mobile_width_threshold`, 64 columns unless you set it.
- Tokens render only in Agent rows, so a pane shows them only once herdr has detected an agent in it.
- At the default sidebar width `$epic`, `$phase` and `$doctrine` truncate if they share a row. The example keeps `$doctrine` on its own row for that reason; keep IDs short or widen `ui.sidebar_width` if the second row still cuts off.
