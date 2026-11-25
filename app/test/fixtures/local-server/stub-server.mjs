// A stand-in for `java -jar fabric-server-launch.jar nogui` (B763's tests): it prints a
// server's start lines, as Minecraft's dedicated server logs them, and stops on `stop` read
// from standard input. `STUB_SERVER_MODE`: `normal` (default), `deaf` (ignores `stop`, so it
// must be killed), `port-taken` (the bind failure, which still exits 0) or `port-taken-slow`
// (the bind failure, then still running until `stop`, as a real server is for a while after it).
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const mode = process.env.STUB_SERVER_MODE ?? 'normal';
// The tests check the process is gone after a stop or the app's quit.
writeFileSync('stub.pid', String(process.pid));
const time = () => new Date().toISOString().slice(11, 19);
const say = (thread, text) => console.log(`[${time()}] [${thread}/INFO]: ${text}`);

let eula = '';
try {
  eula = readFileSync('eula.txt', 'utf8');
} catch {
  // No file: the EULA is not accepted.
}
let port = '25565';
try {
  const match = /^server-port=(\d+)$/m.exec(readFileSync('server.properties', 'utf8'));
  if (match) port = match[1];
} catch {
  // The default port.
}

say('main', `Loading Minecraft with the arguments ${process.argv.slice(2).join(' ')}`);
if (!/^eula=true$/m.test(eula)) {
  say('main', 'You need to agree to the EULA in order to run the server. Go to eula.txt for more info.');
  process.exit(0);
}
say('Server thread', `Starting Minecraft server on *:${port}`);
if (mode === 'port-taken' || mode === 'port-taken-slow') {
  console.log(`[${time()}] [Server thread/WARN]: **** FAILED TO BIND TO PORT!`);
  console.log(`[${time()}] [Server thread/ERROR]: This crash report has been saved to: crash-reports/x.txt`);
  if (mode === 'port-taken') {
    say('Server thread', 'Stopping server');
    process.exit(0);
  }
} else {
  say('Server thread', 'Done (0.123s)! For help, type "help"');
  console.error(`[${time()}] [Server thread/WARN]: A line on standard error`);
}

const input = createInterface({ input: process.stdin });
input.on('line', (line) => {
  if (line.trim() === 'stop' && mode !== 'deaf') {
    say('Server thread', 'Stopping server');
    process.exit(0);
  }
  say('Server thread', `Unknown command: ${line}`);
});
// A deaf server keeps running until it is killed; the others end with their input.
input.on('close', () => {
  if (mode !== 'deaf') process.exit(0);
});
setInterval(() => {}, 60_000);
