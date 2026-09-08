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

**Overflow and exits.** Six is the whole column. Past six, extras open as tabs in herdr's sidebar. When an agent finishes its pane closes itself, unless you are reading it at that moment, in which case it stays with a `· done` suffix. Nothing ever steals your cursor: panes and tabs open unfocused.

**Long checks get a pane too.** A gate that outlasts the ten minutes Claude Code allows a command used to vanish into the background. Doctrine runs it in a pane instead, streaming output and writing the same output to a file whose last line is `exit=N` when the check finishes. Outside herdr it runs detached with the same file, so the record is identical either way.

**Nothing to set up, and nothing breaks without it.** The hooks wake only inside a herdr pane and stand down in their first lines everywhere else. A herdr problem never changes the run; the work carries on and the reason is logged to `hook.log` in the session's temp folder. There is also an opt-in sidebar token showing a run's round and gate counters, configured in herdr's own `config.toml`.
