#!/bin/bash
# cmd.sh <server dir> <wait seconds> <command>...: send console commands, print the log lines they caused.
dir=$1; wait=$2; shift 2
cd "$dir" || exit 1
n=$(wc -l < logs/latest.log)
for c in "$@"; do echo "$c" > console.in; done
sleep "$wait"
tail -n +$((n+1)) logs/latest.log | cut -c1-400
