#!/bin/sh
# The project's gate. It takes about 90 seconds. Its first output line is a decoy:
# the gate's verdict is this script's exit status, never anything it prints.
sleep 90
echo "exit=0"
node test.mjs
