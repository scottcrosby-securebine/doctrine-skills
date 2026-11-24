"""Types one text into a herdr-core terminal, and nothing else (issue #111, phase B). Run by dctr-host.mjs's hcHost.typeText.

    python3 -I dctr-attach.py <terminal> <cols> <rows>      the text arrives on stdin, so no command line carries it

`hc keys` cannot spell every character and `hc send` always presses Enter, so the text goes through `hc attach`, which
needs a terminal on its stdin: a pty of the size given, which must be the terminal's own, or the attach resizes it.

The exit code is the answer, and the caller reads nothing else:
    0  attached, typed, detached
    3  NOTHING was typed: the attach never happened
    anything else  the text MAY have been typed. Never resent here; a detach that fails kills the attach.
"""
import fcntl, os, pty, select, signal, struct, sys, termios, time

NEVER, MAYBE = 3, 4
# Measured on hc 0.1.21: an attach queries its terminal at once and swallows what it reads while it waits for answers,
# then, once it is on the terminal, turns focus reports on and draws the screen. One refused prints an error instead.
ATTACHED = b'\x1b[?1004h'
DETACH = b'\x1c'                      # ctrl+\
ATTACH_S, WRITE_S, DETACH_S = 8, 5, 3   # each under the caller's own bound on this process, together with the pauses
SETTLE_S = 0.3                        # for the attach to pass the text on before it is told to leave

term, cols, rows = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
text = sys.stdin.buffer.read()
code = NEVER
signal.signal(signal.SIGTERM, lambda *_: sys.exit(code))

pid, fd = pty.fork()
if pid == 0:
    try:
        fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
        os.execvp('hc', ['hc', 'attach', term])
    finally:
        os._exit(127)

seen, status = b'', None


def ended():
    """Whether the attach has exited, reaping it. `status` is then its wait status."""
    global status
    if status is None:
        done, s = os.waitpid(pid, os.WNOHANG)
        if done:
            status = s
    return status is not None


def pump(seconds, until=lambda: False):
    """Reads what the attach draws, which it cannot exit without, until `until` or the attach ends or time is up."""
    global seen
    end = time.monotonic() + seconds
    while not ended() and not until() and time.monotonic() < end:
        if select.select([fd], [], [], 0.05)[0]:
            try:
                got = os.read(fd, 65536)
            except OSError:   # Linux's end of file on a pty
                got = b''
            if not got:
                time.sleep(0.01)
            seen += got


def write(data):
    """All of `data`, or an OSError. Non-blocking, so an attach that stops reading cannot hold this process."""
    end = time.monotonic() + WRITE_S
    while data:
        if time.monotonic() > end:
            raise TimeoutError('the attach stopped reading')
        if select.select([], [fd], [], 0.05)[1]:
            data = data[os.write(fd, data):]


try:
    pump(ATTACH_S, lambda: ATTACHED in seen)
    if ATTACHED in seen and not ended():
        os.set_blocking(fd, False)
        code = MAYBE
        write(text)
        pump(SETTLE_S)
        if not ended():
            write(DETACH)
            pump(DETACH_S)
            if ended() and status == 0:
                code = 0
    if code == NEVER:
        sys.stderr.write(seen[-300:].decode('utf-8', 'replace').replace('\x1b', ''))
except OSError as e:
    sys.stderr.write(f'{e}\n')
finally:
    if not ended():
        os.kill(pid, signal.SIGKILL)
        os.waitpid(pid, 0)
sys.exit(code)
