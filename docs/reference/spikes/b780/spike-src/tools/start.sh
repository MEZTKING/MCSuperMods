#!/bin/bash
# start.sh <server dir> <log name>: start Paper headless with a FIFO for console input; waits for Done.
set -u
dir=$1; name=$2
cd "$dir" || exit 1
rm -f console.in; mkfifo console.in
(sleep 100000 > console.in &) 
s=$(date +%s.%N)
nohup /root/jdk25/jdk-25.0.5.1+2/bin/java -Xms512M -Xmx2G ${EXTRA_JAVA:-} -jar paper.jar --nogui < console.in > "$name.out" 2>&1 &
echo $! > server.pid
for i in $(seq 1 120); do
  if grep -q 'Done (' "$name.out" 2>/dev/null; then break; fi
  if ! kill -0 $(cat server.pid) 2>/dev/null; then echo "server exited"; break; fi
  sleep 1
done
e=$(date +%s.%N)
echo "start wall $(echo "$e - $s" | bc) s; $(grep -o 'Done ([0-9.]*s)' "$name.out")"
