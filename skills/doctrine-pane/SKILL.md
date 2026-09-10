---
name: doctrine-pane
description: Use when the user asks you to pop a pane, ssh into a box, log into a router or switch, get onto a console, or tail or monitor a log while you work — any interactive terminal session they want to watch live and be able to take over. Not for automated work, which stays on its MCP server or a plain command.
---

# doctrine-pane

An interactive terminal session in a herdr pane, so the user sees exactly what you see and can take
the keyboard whenever they want it.

This skill does **not** require the `doctrine` hub. You are usually invoked mid-task, and loading
the whole posture to run two commands would be wrong. A doctrine run may still reach for this skill;
`doctrine-debug` names it.

## When this fires, and when it does not

**Interactive → a pane. Automated → whatever the project already uses.** That split is the user's
and it is not yours to re-decide. A bulk read you were not asked to watch belongs on an MCP server or
a script, because parsed output is what makes many results comparable. If the user asks to see the
connects, that is a request and it gets panes. **The axis is the request, never the shape of the
work**: ten devices you were asked to watch is ten sessions, and one device you were not is still a
script. A pane is for the session a human wants to watch or join.

**Never open a pane the user did not ask for.** There is no heuristic here and there should not be:
an ask in the description's own terms (pop a pane, ssh into, log into, get onto the console, tail or
monitor a log while you work) is a request, and everything else is not.

Two kinds, and only one has any state:

- **Session** — a login you may drive and the user may take over.
- **Monitor** — a stream beside the work, `docker logs -f` or a firewall tail. You never write to
  it. The user interrupts it the way they interrupt any terminal, by typing in it.

## The launcher

`node <plugin-root>/hooks/dctr-pane.mjs`, two directories above this skill's own base directory.

```
open  <label> [<tee-file>] <connect-command>
read  <tee-file>
profile <tee-file> <what the platform is and how it behaves>
type  <tee-file> <text>
enter <tee-file>
own   <tee-file> agent|user
```

Omit the tee path and it defaults to a file under the temporary directory, named for the label,
and prints the path it chose. Know two things about that default before relying on it. Nothing
here removes it when the session ends, so transcripts accumulate and a repeated label reuses a
name from an earlier session. And a label is sanitized down to letters, digits, dash and
underscore, so two labels can land on one file. Give an explicit path whenever the transcript
matters: when it must be kept, when it must not be, or when two sessions could collide.

Six panes fit beside the session, and that cap counts your dispatched seats and gate panes alongside
interactive ones, placed under the same lock they use. **Past it, a session opens as a tab instead**
— listed in herdr's sidebar, watched and taken over the same way, just not at a glance. Four routers
is four panes; ten is ten sessions, which no column holds and which six unreadable panes would not
serve. The launcher prints `overflow=tab` when that happens, so you can say which it was. It still
cannot close anything for you.

It refuses when it cannot tell which session it belongs to, because the cap is counted against that
session. It reads `CLAUDE_CODE_SESSION_ID` from the environment — the same variable the gate
launcher reads, deliberately, since a second accepted name would let the two lock different
sessions and a lock that is not the same lock is not a lock.

It refuses outside herdr and inside a contained agent, because a pane is a host process and an
interactive session nobody can watch has no purpose. In a doctrine run that refusal is recorded as
a step that **did not run**, never as one that passed, and the run continues by its non-interactive
path (doctrine step 3).

**The connect command is not yours to invent.** This plugin carries no device-vendor knowledge and
must work in any repo. Take the connect command from the project you are working in — its docs, its
tooling, its inventory — and let it read its own credentials from its own paths. You handle a path,
never a secret.

## The loop

1. `open`. The pane belongs to the **user** from the moment it exists. The connect banner, an
   unknown-host-key question and any password prompt all land inside that window, and none of them
   are yours to answer. If a password is wanted, the user types it.
2. `read`. This is also how you find out what you are on.
3. **Stop and profile it.** Before you type anything, work out what platform this is from the
   banner, then go and find out how it pages, how to cancel on it, and what is destructive on it.
   Record that with `profile`. `type` and `enter` refuse until you have, and `profile` refuses a
   one-liner: it enforces a length floor because it cannot judge the research. You cannot run commands to
   learn how to run commands safely, so this comes from the banner plus real research.
4. The user hands you the pane in words. `own <tee> agent`.
5. `type`, judge the echo yourself, then `enter`. They are separate calls on purpose.
6. `read` until **you** judge the command finished. Nothing here decides that for you.

## What the launcher decides, and what you decide

The launcher enforces; you interpret. Do not ask it to parse a terminal and do not add code that
does. An earlier version decided in code what a prompt was and whether a command had finished, and
it was wrong on real hardware within two commands: `PS1` is an arbitrary string, a pager prompt is
indistinguishable from a device prompt by shape, and output stopping does not mean a command ended.
You read bytes and judge. That is what you are for.

What it refuses, and none of it is advisory:

- Typing while the session has **unread output**. Bytes you have not looked at may be the device,
  may be a pager, may be the user mid-command. Run `read` and judge them. This covers what was on
  screen when you asked and anything that arrived while the launcher was checking — not the instant
  of the send itself, which no lock can cover, because the device is not in the transaction.
- Typing before the session has a **profile**.
- Typing when the pane is the **user's**.
- Any **control character** in the text, because a bare CR is Enter and one write would then carry
  a command you never judged.
- Writing when the **recorder has exited** — the connection has closed and that pane is now a shell
  on your own machine.
- Writing when it **could not observe** something. A failed stat or a failed pane lookup is "I could
  not look", never "safe".

## Ownership

The pane is the user's after connect, and after every handover back. They give it to you in a
sentence; you never take it with a gesture. When they take it, you abandon the rest of your
sequence rather than resuming — they may have changed the device under you, and a plan written
against the old state is how a wrong command gets sent.

`own agent` deliberately does **not** clear unread output, so the first thing you must do after a
handover is read what the user did. Do that. It is the only view you have of their work: their
typing is recorded only where the terminal echoed it, and keys that produce no echo — a space at a
pager, Ctrl-C, arrows, tab — leave no trace at all. **When you do not know what they pressed, say
so.** Do not reconstruct a plausible sequence from the effects; that has already produced a
confident wrong account of what the user did.

## When you are stuck, ask for a keystroke

You cannot send control keys, by design, because they are the dangerous ones: Ctrl-C, Ctrl-D,
Escape at a confirmation, a single key at a pager. A launcher that could send them could answer a
prompt the human never saw.

So when you are stuck — a half-typed line, a pager you must not dismiss, a confirmation you must
not answer — **tell the user which key to press.** Never work around it, and never acquire the
capability.

**A block that must arrive as one paste is the same case.** `type` refuses newlines and carriage
returns because a bare CR is Enter, and there is no waiver: a device that wants a whole configuration
block in a single paste gets it from the user, not from you. Put the exact text in front of them,
say it must go as one paste, and let them paste it. You keep the transcript either way, because the
tee records whatever crosses the terminal no matter who typed it.

## One device, one connection

Opening a **Session** pane on a device means you stop making automated calls to it until that pane
closes. Two agents driving one connection interleave into a transcript neither of them can read back.
Say plainly what that does and does not buy: you stop calling it; the device does not thereby become
free. A cached connection or an operation already in flight can still hold it, and your connect will
then fail in the pane where the user can see it. That is the right place for it to fail.

**A Monitor pane does not stop anything, and must not.** It is a stream you never write to, and the
case it exists for is watching a deploy while you run it — the user's own example is `docker logs -f`
on the server you are deploying to. A rule that suspended the deployment until the monitor closed
would defeat the only thing the monitor was opened to show. Read the rule as what it is: a bound on
having two writers on one session, not on looking.

Inside a doctrine run, only the orchestrator opens panes — never a dispatched seat, which runs
unattended and already has a pane of its own — and not while a wave that touches that device is
still out.

## Lifetime

Never close a pane. The user closes it, and closing it kills the session inside. The pane survives
your session ending, so a log they are watching does not die when you stop. Its transcript survives
too: neither the default path nor an explicit one is cleaned up here. That is deliberate for a pane
meant to outlive the session, and it means a transcript you want gone is yours to remove.

One thing does end a transcript: opening again on the same path. A repeated label reuses the same
default file, and the next `open` truncates it once it has established that no live pane is using
it. A transcript that must be kept needs a path of its own.

## Red flags

- A pane opened because the work looked interactive, rather than because the user asked.
- Typing before profiling the platform, on the grounds that you already know the platform.
- Reading unread bytes, judging them harmless, and typing — when they were the user mid-command.
- Reporting what the user pressed, from backspaces and bells, instead of saying you cannot see it.
- `enter` sent without having read the echo that `type` returned.
- A vendor's pager idiom, prompt pattern, or destructive-command list written into this plugin.
- A refusal worked around instead of handed to the user as a keystroke to press.
- A run that wanted a pane, could not have one, and reported the step as passed.
