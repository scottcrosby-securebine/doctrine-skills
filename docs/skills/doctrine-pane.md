# doctrine-pane

The agent runs an interactive terminal session in a herdr pane beside your session, so you see what it sees and can take the keyboard at any moment. Unlike the wrapper skills, it does not load the doctrine posture, because it is usually called in the middle of other work to run a few commands. A doctrine run can call it too: `doctrine-debug` names it for a bug that lives on a device you log into.

![The doctrine-pane loop: the agent opens the pane and you answer the login, the agent reads and profiles the platform, you hand the pane over, and the agent types, judges the echo, then presses Enter in a separate call. Every send is checked, and is refused on unread output, a missing profile, a pane that is yours, a control character, a dead recorder or a check it could not make. A refusal is quoted to you verbatim](doctrine-pane.png)

## When it fires

Ask for it in its own terms: pop a pane, ssh into a box, log into a router or switch, get onto a console, or tail or monitor a log while the agent works. Those requests open a pane. Nothing else does: the skill has no heuristic for "this looks interactive".

Your request decides, never the shape of the work. Ten devices you asked to watch get ten sessions. One device you did not ask to watch gets a script. Work nobody asked to watch stays where the project already runs it, on an MCP server or a plain command, because parsed output is what makes many results comparable.

There are two kinds of pane:

- A **Session** is a login the agent may drive and you may take over.
- A **Monitor** is a stream beside the work, such as `docker logs -f` or a firewall tail, opened with the same `open` when you ask to tail or monitor something. The agent never writes to it. You interrupt it the way you interrupt any terminal, by typing in it.

## What it asks you

It asks no questions up front. It needs three things from you during the session:

- **The login.** The pane is yours from the moment it opens. The connect banner, an unknown-host-key question and any password prompt land in your window, and you answer them. The agent never types a password.
- **The handover.** The agent types only after you say, in words, that the pane is its turn. You take it back the same way.
- **A key, when it is stuck.** The agent cannot send control keys. At a half-typed line, a pager it must not dismiss, or a confirmation it must not answer, it tells you which key to press. A configuration block that must arrive as one paste is the same case: the agent shows you the exact text and you paste it.

The connect command is not the agent's to invent. The plugin carries no knowledge of any device vendor, so the agent takes the command from your project's docs, tooling or inventory, and the command reads its own credentials from its own paths. The agent handles a path, never a secret.

## How a session runs

The launcher is `node <plugin-root>/hooks/dctr-pane.mjs`, where `<plugin-root>` is two directories above the skill's own directory. It has six commands:

```text
open    <label> [<tee-file>] <connect-command>
read    <tee-file>
profile <tee-file> <what the platform is and how it behaves>
type    <tee-file> <text>
enter   <tee-file>
own     <tee-file> agent|user
```

The tee file is the transcript. `open` splits a pane, runs the connect command in it under `script(1)`, which records everything that crosses the terminal into that file, and prints the pane id. Keystroke logging is never switched on, so what you type at a password prompt does not reach the transcript. The transcript and its session record, `<tee-file>.state.json`, which holds the owner, the read position and the profile, are readable only by your user account.

The agent then works through one loop:

1. **`open`**, and you answer the login.
2. **`read`** the banner, which is how the agent learns what it is on.
3. **Profile the platform** before typing anything: what it is, how it pages, how to cancel on it, and what is destructive on it. The agent researches this and records it with `profile`. `type` and `enter` refuse until a profile exists. `profile` refuses any text under 80 characters. The launcher cannot judge the research, so it prints the profile where you can see it.
4. **You hand the pane over**, and the agent runs `own <tee-file> agent`.
5. **`type`, then `enter`, as two separate calls.** The agent reads the echo of what it typed before it presses Enter.
6. **`read` until the agent judges the command finished.**

The launcher only enforces. Reading the screen is the agent's job, and no code parses the terminal, because a shell prompt is an arbitrary string, a pager prompt looks like a device prompt, and output going quiet does not mean a command ended.

The launcher refuses to send when:

- the session has **unread output**, since those bytes may be the device, a pager, or you halfway through a command;
- the session has **no profile**;
- the pane is **yours**;
- the text holds a **control character**, since a bare carriage return is Enter;
- the **recorder has exited**, which means the connection closed and the pane is now a shell on the agent's own machine;
- it **could not check** something, since a failed lookup means "I could not look", never "safe".

The unread-output check covers what was on screen when the agent asked and anything that arrived while the launcher was checking. Output can still land in the moment between the last check and the keystroke, and no lock can prevent that, because the device is not part of the transaction.

A refusal prints `dctr-pane: <reason>` and exits 1. The agent quotes every refusal to you exactly as printed and never works around it. When `read` refuses, the agent does not open the transcript file itself. When `open` refuses, it does not start the session another way.

`own agent` does not mark your output as read, so after a handover the agent's first step is to read what you did. That transcript is its only view of your work, and it shows only what the terminal echoed. Keys that echo nothing, such as a space at a pager, Ctrl-C, an arrow or Tab, leave no trace. When the agent cannot tell what you pressed, it says so instead of guessing a sequence from the effects. When you take the pane back, the agent drops the rest of its plan, because you may have changed the device under it.

## Panes, tabs and transcripts

Six panes fit beside your session. The cap counts this session's dispatched seats and gate panes as well as interactive panes, and every placement takes the same lock. Past six, the new pane opens as a tab listed in herdr's sidebar, which you watch and take over the same way. The launcher prints `overflow=tab` when that happens. It never closes a pane to make room.

If you omit the tee file, the launcher picks one named for the label under `dctr-pane-logs` in your temporary directory and prints it as `tee=<path>`. Labels are reduced to letters, digits, dash and underscore, so two labels can share a file, and a repeated label reuses an earlier session's file. Give an explicit path whenever the transcript matters.

## One device, one connection

While a Session pane is open on a device, the agent makes no automated calls to that device, so two writers never interleave in one transcript. Pausing automated calls does not free the device. A cached connection or an operation already in flight can still hold it, and the connect then fails in the pane, where you can see it.

A Monitor stops nothing. Its main use is watching a deploy while the agent runs it, and a rule that paused the deploy until the monitor closed would defeat the point.

Inside a doctrine run, only the orchestrating session opens panes, never an agent it sent out, and never while agents it sent out are still working on that device.

## How it ends

You close the pane. The agent never does, and closing the pane kills the session inside it. The pane outlives the agent's session, so a log you are watching keeps running after the agent stops.

The transcript and its `.state.json` record stay on disk, at the default path or yours, until you remove them. Nothing in the plugin cleans them up. One thing does end a transcript: `open` on the same path empties it, once the launcher has confirmed that the pane which wrote it is gone. It refuses instead when that pane is still live, when it cannot look the pane up, or when the file holds a transcript and nothing records which pane wrote it.

There is no weaker version of the skill. When `open` refuses because the session is outside herdr or contained, a doctrine run continues by its non-interactive path, and the interactive step is recorded as not run, never as passed.

## An example

This shows the shape of a session, not a recorded one. `pane` stands for `node <plugin-root>/hooks/dctr-pane.mjs`.

You say: "pop a pane and ssh into the edge switch, I want to watch." The agent finds the connect command in the project's inventory and gives an explicit transcript path, because the label `edge` was used before.

```text
$ pane open edge /tmp/edge.log "ssh netops@edge1"
pane=ws1:12
owner=user tee=/tmp/edge.log
--- session so far (judge it yourself; nothing here was parsed) ---
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

You answer the host-key question and type the password in the pane. The agent reads the banner, sees Junos, and records a profile:

```text
$ pane profile /tmp/edge.log "Juniper Junos 21.4 CLI. Pages with ---(more)---, space advances and q quits. Ctrl-C cancels a running command. commit and request system reboot are destructive."
```

You say "it's yours." The agent runs `own /tmp/edge.log agent`, reads what you did, then types and checks the echo before pressing Enter:

```text
$ pane type /tmp/edge.log "show interfaces terse | no-more"
show interfaces terse | no-more
--- typed "show interfaces terse | no-more"; ENTER NOT SENT. Judge the echo above, then `enter`.
$ pane enter /tmp/edge.log
--- enter sent. Output may still be arriving; `read` again until you judge it finished.
```

If you then type a command yourself, the agent's next `type` is refused with `` dctr-pane: 96 bytes of unread output; run `read` and judge it before typing ``. It reads, tells you what it saw, and says so if you pressed a key that left no echo. When you are done, you close the pane.

## Requirements

- herdr 0.8.2 or later, with Claude Code or Codex CLI running inside a herdr pane. `open`, `type` and `enter` refuse unless `HERDR_ENV` is `1` and `HERDR_WORKSPACE_ID` is set, and `open` also needs `HERDR_PANE_ID`.
- A session id, `CLAUDE_CODE_SESSION_ID` or Codex's `CODEX_SESSION_ID`, so the pane counts against the same cap and lock as seats and gates. Without one `open` refuses.
- Not a contained session: with `DCTR_VIEW_REQUEST_DIR` set, `open`, `type` and `enter` refuse, because a pane is a process on the host.
- On Codex, the doctrine hooks, which you install yourself with `node <plugin-root>/hooks/dctr-codex.mjs install`. That install lets a command in Codex's sandbox reach herdr. The pane runs on the host, outside Codex's sandbox, so whatever is typed into it runs unsandboxed.

[docs/requirements.md](../requirements.md) and [docs/watching-a-run.md](../watching-a-run.md) cover the herdr setup.

## How it is checked

The skill has no review loop of its own. The launcher has a tamper test, `node hooks/dctr-pane.selftest.mjs`, which CI runs on every push. It trips the refusals for a missing profile, a bad read position, unread output, a control character, a pane that is yours, a contained session and a missing session id, and shows that each of them calls herdr zero times. It also shows that output arriving during the recorder lookup stops the send, that a valid session is not refused, that the broken fixtures are broken without the launcher, and that both the macOS and Linux forms of the `script(1)` command line are asserted. It does not trip every refusal: its stand-in herdr always reports a live recorder and every run sets herdr's environment, so the dead-recorder, outside-herdr and missing-pane refusals are not exercised. A doctrine phase that uses a pane still runs its own gate.

## Signs it is being misused

- A pane opened because the work looked interactive, when you did not ask for one.
- The agent typing before it profiled the platform, because it thought it already knew it.
- The agent reading bytes you were typing, judging them harmless, and typing over them.
- An account of what you pressed, rebuilt from backspaces and bells.
- `enter` sent before the agent read the echo of `type`.
- A vendor's pager idiom, prompt pattern or list of destructive commands written into the plugin.
- A refusal worked around instead of turned into a key for you to press.
- A run that wanted a pane, could not have one, and reported the step as passed.

The specification is [`skills/doctrine-pane/SKILL.md`](../../skills/doctrine-pane/SKILL.md). Where this page and the specification disagree, trust the specification.
