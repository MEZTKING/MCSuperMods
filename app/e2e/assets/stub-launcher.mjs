/**
 * A stand-in for Prism Launcher plus the `msm_runtime` client dev hooks (ADR 0084 D3 to D5,
 * B374), used by `play-path.spec.ts`. The test copies this file into a fake Prism data folder
 * and starts it through a `prismlauncher` wrapper script there, so main finds and spawns it as
 * it would the real program (`<prismRoot>/prismlauncher --launch <instance>`).
 *
 * It plays the runtime's part in the dev files of the instance's game folder:
 *
 * - writes `msm-dev/status.json` (`{format 1, handled, runtime, state, time, world}`) at start
 *   and every 500 ms, carrying over the last run's `handled`;
 * - at the "title screen" reads `play.json`, deletes it and "opens" its world;
 * - reads `request.json` when its time or size changes and its `seq` is new: `reload` and
 *   `reopen` are handled in the world; `quit` writes `handled` once and stops;
 * - appends one JSON line per event to `<prismRoot>/stub-log.jsonl` (what it saw, for the test).
 *
 * It stops by itself when `<prismRoot>/stop` appears or after five minutes. Plain Node, no
 * dependencies.
 */

import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const launchAt = args.indexOf('--launch');
const instance = launchAt >= 0 ? args[launchAt + 1] : undefined;
const RUNTIME = 'stub';
const STATUS_EVERY_MS = 500;
const POLL_MS = 100;
const LIFETIME_MS = 300_000;

function log(event, extra = {}) {
  appendFileSync(
    join(root, 'stub-log.jsonl'),
    `${JSON.stringify({ event, pid: process.pid, time: Date.now(), ...extra })}\n`,
  );
}

if (instance === undefined) {
  log('bad-arguments', { args });
  process.exit(2);
}

const gameDir = join(root, 'instances', instance, 'minecraft');
const devDir = join(gameDir, 'msm-dev');
const paths = {
  info: join(devDir, 'dev.json'),
  play: join(devDir, 'play.json'),
  request: join(devDir, 'request.json'),
  status: join(devDir, 'status.json'),
};

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Every file under `dir`, relative to the game folder, sorted. */
function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.push(relative(gameDir, path).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

const previous = readJson(paths.status);
let handled = previous?.handled ?? null;
let state = 'title';
let world = null;
let lastRequestStamp = null;
let lastStatusAt = 0;

function lastHandledSeq() {
  return handled?.seq ?? 0;
}

function writeStatus() {
  const status = { format: 1, handled, runtime: RUNTIME, state, time: Date.now(), world };
  const temp = `${paths.status}.tmp`;
  writeFileSync(temp, `${JSON.stringify(status, null, 2)}\n`);
  renameSync(temp, paths.status);
  lastStatusAt = Date.now();
}

log('start', {
  args,
  mods: existsSync(join(gameDir, 'mods')) ? readdirSync(join(gameDir, 'mods')).sort() : [],
});
writeStatus();

const startedAt = Date.now();

function tick() {
  if (existsSync(join(root, 'stop')) || Date.now() - startedAt > LIFETIME_MS) {
    log('stopped');
    process.exit(0);
  }
  if (state === 'loading') {
    state = 'world';
    writeStatus();
  }
  // The title screen handles a play request once.
  if (state === 'title' && existsSync(paths.play)) {
    const play = readJson(paths.play);
    rmSync(paths.play, { force: true });
    const info = readJson(paths.info);
    if (play !== null && play.seq > lastHandledSeq() && info !== null) {
      world = play.world;
      state = 'loading';
      handled = { ok: true, seq: play.seq };
      log('play', {
        seq: play.seq,
        world,
        infoWorld: info.world,
        setup: existsSync(join(devDir, 'setup.mcfunction')),
      });
      writeStatus();
    }
  }
  if (existsSync(paths.request)) {
    const stat = statSync(paths.request);
    const stamp = `${stat.mtimeMs}:${stat.size}`;
    if (stamp !== lastRequestStamp) {
      lastRequestStamp = stamp;
      const request = readJson(paths.request);
      if (request !== null && request.seq > lastHandledSeq()) {
        if (request.action === 'quit') {
          handled = { ok: true, seq: request.seq };
          state = 'title';
          world = null;
          writeStatus();
          log('quit', { seq: request.seq });
          process.exit(0);
        }
        if (state !== 'world') {
          handled = { message: 'Not in a world.', ok: false, seq: request.seq };
          log('refused', { seq: request.seq, action: request.action });
        } else {
          handled = { ok: true, seq: request.seq };
          log(request.action, {
            seq: request.seq,
            assets: request.assets,
            changes: request.changes,
            files: [
              ...filesUnder(join(gameDir, 'saves', world, 'datapacks', 'msm-dev')),
              ...filesUnder(join(devDir, 'overlay')),
              ...filesUnder(join(gameDir, 'resourcepacks', 'msm-dev')),
            ],
          });
        }
        writeStatus();
      }
    }
  }
  if (Date.now() - lastStatusAt >= STATUS_EVERY_MS) writeStatus();
}

setInterval(tick, POLL_MS);
