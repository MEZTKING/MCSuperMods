// B780 spike (throwaway): the server side of a scenario: console commands through the FIFO, the log read as it grows.
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Server {
  constructor(dir) {
    this.dir = dir;
    this.log = join(dir, 'logs/latest.log');
    this.offset = statSync(this.log).size;
  }
  cmd(...lines) {
    for (const line of lines) writeFileSync(join(this.dir, 'console.in'), `${line}\n`);
  }
  /** New log text since the last read. */
  read() {
    const buf = readFileSync(this.log);
    const text = buf.subarray(this.offset).toString('utf8');
    this.offset = buf.length;
    return text;
  }
  /** Sends `command` and waits for a log line matching `re` (after the send); returns the match. */
  async ask(command, re, ms = 5000) {
    this.read();
    this.cmd(command);
    return this.waitFor(re, ms);
  }
  async waitFor(re, ms = 5000) {
    const end = Date.now() + ms;
    let seen = '';
    while (Date.now() < end) {
      seen += this.read();
      this.seen = seen;
      const m = re.exec(seen);
      if (m) return m;
      await sleep(50);
    }
    return null;
  }
  /** Runs the console commands and returns the log text they caused within `ms`. */
  async run(commands, ms = 400) {
    this.read();
    this.cmd(...commands);
    await sleep(ms);
    return this.read();
  }
}

export class Results {
  constructor() {
    this.rows = [];
  }
  check(test, name, pass, detail = '') {
    this.rows.push({ test, name, pass: Boolean(pass), detail: String(detail).slice(0, 300) });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${test} :: ${name}${detail ? ` -- ${String(detail).slice(0, 200)}` : ''}`);
  }
  note(test, name, detail) {
    this.rows.push({ test, name, pass: null, detail: String(detail).slice(0, 400) });
    console.log(`NOTE ${test} :: ${name} -- ${String(detail).slice(0, 300)}`);
  }
}
