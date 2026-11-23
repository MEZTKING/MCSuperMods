#!/bin/bash
dir=$1
cd "$dir" || exit 1
echo stop > console.in
for i in $(seq 1 60); do kill -0 $(cat server.pid) 2>/dev/null || break; sleep 1; done
kill -0 $(cat server.pid) 2>/dev/null && kill $(cat server.pid)
pkill -f 'sleep 100000' ; rm -f console.in
echo stopped
