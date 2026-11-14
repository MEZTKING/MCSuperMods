/**
 * Headless vanilla server check of the sample data pack's villager trade
 * (`fixtures/sample-datapack/README.md`, "Headless server check").
 *
 * Run with `node tools/run-fabric-server/vanilla-datapack.ts --facts <server-facts.json>` (Node
 * >= 22.18 strips types). Only erasable TypeScript syntax and `node:` imports are allowed here.
 *
 * The facts file is what `packages/exporters/test/sample-datapack.golden.test.ts` writes next to
 * the zip with `MSM_SAMPLE_DATAPACK_OUT`: `minecraft` (the target's game version) and `zip` (the
 * data pack's file name in the same folder). No version is written here.
 *
 * 1. Downloads the vanilla dedicated server for that version from Mojang's version manifest
 *    (the version's JSON and the server jar each checked against the SHA-1 the manifest and the
 *    version JSON give) into the cache folder.
 * 2. Prepares a run folder: `eula.txt`, the offline `server.properties` of `index.ts`, the
 *    server jar and a fresh `world/` whose `datapacks/` holds the zip (no Fabric, no runtime: the
 *    trade is plain data).
 * 3. Starts the server, waits for `Done (`, then runs on its console, each command waiting for
 *    its own `System chat:` answer (so a `Can't keep up!` line is never taken for one):
 *    `datapack list enabled`, hard difficulty, `max_entity_cramming 0`, the clock stopped at
 *    midnight (`advance_time false`, `time set midnight`: a zombie villager in daylight burns,
 *    which emptied the checks of a slow run), a force-loaded chunk with two barrier blocks, a
 *    `NoAI` zombie and `--villagers` (default 40) `NoAI` level 1 fletchers. A mob summoned into
 *    the just force-loaded chunk exists before `@e` can see it, so once the wolf and the horn below
 *    are summoned too it polls (at most 60 s each) until `@e` counts every fletcher, the zombie,
 *    the wolf and the horn, and only then has the zombie kill the fletchers with `damage ... by`. On hard every kill turns the villager into a zombie villager on the spot
 *    that keeps its offers, which makes it draw them from `minecraft:fletcher/level_1` without a
 *    player; it polls again until every one is a zombie villager. It also summons a `NoAI` wolf
 *    of the sample's wolf variant and a goat horn item whose `minecraft:instrument` names the
 *    sample's instrument (B255, ADR 0064): an entity or item naming an id that is not in its
 *    registry does not keep it, so finding them again by that id proves both are registered.
 *    Then five `execute if entity` checks count the zombie villagers, those offering the
 *    sample's new trade (4 spectral arrows for emeralds), those offering the vanilla arrow
 *    trade, the wolves of the variant and the horns of the call, and `stop`.
 * 4. Passes when the zip is listed as enabled, every fletcher, the zombie, the wolf and the
 *    horn were found before the kill, all five counts are above zero and the log has no `Failed to load`,
 *    `Couldn't load tag`, `Couldn't parse`, registry loading error or ERROR line. With one in
 *    two villagers drawing each trade, a false failure needs every one of 40 to miss it.
 *
 * Downloads are untrusted data: written to disk and run only as the server they claim to be.
 */
import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { cached, freePort, serverProperties } from './index.ts';

/** Mojang's version manifest: every game version with the URL and SHA-1 of its JSON. */
export const VERSION_MANIFEST_URL =
  'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

/** Everything a check needs. */
export interface DatapackOptions {
  minecraft: string;
  zip: string;
  villagers: number;
  workDir: string;
  cacheDir: string;
  java: string;
  timeoutSeconds: number;
  memory: string;
}

/** The facts file written next to the zip. */
export interface ServerFacts {
  minecraft?: string;
  zip?: string;
}

export const DATAPACK_USAGE = `Usage: node tools/run-fabric-server/vanilla-datapack.ts --facts <server-facts.json> [options]

  --facts <file>        server-facts.json (minecraft, zip) next to the data pack zip
  --zip <file>          the data pack zip (default: the facts' zip, beside the facts file)
  --minecraft <ver>     game version (overrides the facts file)
  --villagers <n>       fletchers to convert (default: 40)
  --work <dir>          run folder (default: <tmp>/msm-vanilla-datapack)
  --cache <dir>         download cache (default: ~/.cache/msm-fabric-server)
  --java <path>         java executable (default: $JAVA_HOME/bin/java, else java)
  --timeout <seconds>   whole-run limit (default: 600)
  --memory <size>       -Xmx value (default: 2G)`;

function whole(name: string, value: string | undefined): number {
  const parsed = Number(value);
  if (value === undefined || !Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} needs a whole number of 1 or more, got ${String(value)}`);
  }
  return parsed;
}

/**
 * Reads the command line; the version and the zip come from `--facts` unless a flag gives them.
 *
 * @param argv - Arguments after the script path.
 * @param facts - The parsed facts file, when `--facts` was given.
 * @param factsPath - Where the facts file is (its `zip` is beside it).
 * @param env - The environment (`JAVA_HOME`).
 */
export function parseDatapackArgs(
  argv: readonly string[],
  facts: ServerFacts = {},
  factsPath: string | undefined = undefined,
  env: Record<string, string | undefined> = {},
): DatapackOptions {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument ${arg}\n\n${DATAPACK_USAGE}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    i++;
    flags.set(arg.slice(2), value);
  }
  const known = new Set([
    'facts',
    'zip',
    'minecraft',
    'villagers',
    'work',
    'cache',
    'java',
    'timeout',
    'memory',
  ]);
  for (const name of flags.keys()) {
    if (!known.has(name)) throw new Error(`Unknown option --${name}\n\n${DATAPACK_USAGE}`);
  }
  const minecraft = flags.get('minecraft') ?? facts.minecraft;
  if (minecraft === undefined || minecraft === '') {
    throw new Error('--minecraft is required (or give it in the --facts file)');
  }
  const zipFlag = flags.get('zip');
  const zip =
    zipFlag ??
    (facts.zip === undefined || factsPath === undefined
      ? undefined
      : join(dirname(factsPath), basename(facts.zip)));
  if (zip === undefined) throw new Error('--zip is required (or give zip in the --facts file)');
  const javaHome = env.JAVA_HOME;
  return {
    minecraft,
    zip,
    villagers: flags.has('villagers') ? whole('--villagers', flags.get('villagers')) : 40,
    workDir: flags.get('work') ?? join(tmpdir(), 'msm-vanilla-datapack'),
    cacheDir: flags.get('cache') ?? join(homedir(), '.cache', 'msm-fabric-server'),
    java:
      flags.get('java') ??
      (javaHome === undefined || javaHome === '' ? 'java' : join(javaHome, 'bin', 'java')),
    timeoutSeconds: flags.has('timeout') ? whole('--timeout', flags.get('timeout')) : 600,
    memory: flags.get('memory') ?? '2G',
  };
}

/** A download named by Mojang's metadata: its URL and SHA-1. */
export interface Download {
  url: string;
  sha1: string;
}

/** The version's JSON in the version manifest. */
export function versionEntry(manifest: unknown, minecraft: string): Download {
  const versions = (manifest as { versions?: unknown }).versions;
  if (Array.isArray(versions)) {
    for (const entry of versions) {
      const record = entry as { id?: unknown; url?: unknown; sha1?: unknown };
      if (
        record.id === minecraft &&
        typeof record.url === 'string' &&
        typeof record.sha1 === 'string'
      ) {
        return { url: record.url, sha1: record.sha1 };
      }
    }
  }
  throw new Error(`Mojang's version manifest lists no ${minecraft}`);
}

/** The dedicated server jar in a version's JSON. */
export function serverDownload(version: unknown, minecraft: string): Download {
  const server = (version as { downloads?: { server?: { url?: unknown; sha1?: unknown } } })
    .downloads?.server;
  if (typeof server?.url === 'string' && typeof server.sha1 === 'string') {
    return { url: server.url, sha1: server.sha1 };
  }
  throw new Error(`Minecraft ${minecraft} has no dedicated server download`);
}

/** The new fletcher trade of the sample data pack and the vanilla one that must remain. */
export const NEW_TRADE =
  '@e[type=minecraft:zombie_villager,nbt={Offers:{Recipes:[{sell:{id:"minecraft:spectral_arrow",count:4},buy:{id:"minecraft:emerald"}}]}}]';
export const VANILLA_TRADE =
  '@e[type=minecraft:zombie_villager,nbt={Offers:{Recipes:[{sell:{id:"minecraft:arrow"}}]}}]';

/**
 * The console commands before the kill, in order. Night with the clock stopped keeps the zombie
 * villagers from burning in daylight however long the server takes to reach the checks.
 */
export function setupCommands(villagers: number): string[] {
  const villager =
    'summon minecraft:villager 0 201 0 {NoAI:1b,VillagerData:{profession:"minecraft:fletcher",level:1,type:"minecraft:plains"}}';
  return [
    'difficulty hard',
    'gamerule max_entity_cramming 0',
    'gamerule advance_time false',
    'time set midnight',
    'forceload add 0 0',
    'setblock 0 200 0 minecraft:barrier',
    'setblock 4 200 0 minecraft:barrier',
    `summon minecraft:wolf 2 201 0 {NoAI:1b,PersistenceRequired:1b,Tags:["msm_wolf"],variant:"${WOLF_VARIANT}"}`,
    `summon minecraft:item 0 201 4 {NoGravity:1b,PickupDelay:32767s,Age:-32768s,Tags:["msm_horn"],Item:{id:"minecraft:goat_horn",count:1,components:{"minecraft:instrument":"${INSTRUMENT}"}}}`,
    'summon minecraft:zombie 4 201 0 {NoAI:1b,Invulnerable:1b,PersistenceRequired:1b,Tags:["msm_killer"]}',
    ...Array.from({ length: villagers }, () => villager),
  ];
}

/**
 * Counts polled before the kill and the checks: an entity summoned into the just force-loaded
 * chunk exists before `@e` can see it, so nothing goes on until every fletcher, the zombie, the
 * wolf and the horn are found (by tag only: the checks still find the wolf and the horn by the
 * sample's ids). Fletchers count `--villagers`, the others one each.
 */
export const READY: readonly (readonly [string, string])[] = [
  ['villagers', 'execute if entity @e[type=minecraft:villager]'],
  ['the killer zombie', 'execute if entity @e[type=minecraft:zombie,tag=msm_killer]'],
  ['the wolf', 'execute if entity @e[type=minecraft:wolf,tag=msm_wolf]'],
  ['the goat horn', 'execute if entity @e[type=minecraft:item,tag=msm_horn]'],
];

/** The zombie kills every fletcher; on hard each kill converts it on the spot. */
export const KILL =
  'execute as @e[type=minecraft:villager] run damage @s 1000 minecraft:mob_attack by @e[tag=msm_killer,limit=1]';

/** Polled after the kill until every fletcher is a zombie villager. */
export const CONVERTED = 'execute if entity @e[type=minecraft:zombie_villager]';

/** The sample's wolf variant and goat horn instrument (data kinds of ADR 0064). */
export const WOLF_VARIANT = 'msm_sample_data:frost';
export const INSTRUMENT = 'msm_sample_data:frost_call';

/** The five checks, by name; each must count at least one entity. */
export const CHECKS: readonly (readonly [string, string])[] = [
  ['zombie villagers in all', 'execute if entity @e[type=minecraft:zombie_villager]'],
  ['zombie villagers with the new trade', `execute if entity ${NEW_TRADE}`],
  ['zombie villagers with the vanilla arrow trade', `execute if entity ${VANILLA_TRADE}`],
  [
    'wolves of the sample variant',
    `execute if entity @e[type=minecraft:wolf,tag=msm_wolf,nbt={variant:"${WOLF_VARIANT}"}]`,
  ],
  [
    'goat horns of the sample call',
    `execute if entity @e[type=minecraft:item,nbt={Item:{components:{"minecraft:instrument":"${INSTRUMENT}"}}}]`,
  ],
];

/**
 * `Test passed. Count: N` (or the older `Test passed, count: N`) gives N; `Test failed` gives 0;
 * any other line `undefined`.
 */
export function testCount(line: string): number | undefined {
  const passed = /Test passed[.,] [Cc]ount: (\d+)/.exec(line);
  if (passed !== null) return Number(passed[1]);
  if (/Test failed/.test(line)) return 0;
  return undefined;
}

/** What a check run showed. */
export interface DatapackOutcome {
  ok: boolean;
  failures: string[];
  counts: Record<string, number | undefined>;
}

const LOG_FAILURE =
  /Failed to load|Couldn't load tag|Couldn't parse|Registry loading errors|\/ERROR\]/;

/**
 * Checks the run: the pack listed as enabled, every count above zero, no load failure.
 *
 * @param lines - The server's output, one entry per line.
 * @param zipName - The data pack's file name (`file/<zipName>` in the enabled list).
 * @param counts - The checks' counts by name (`undefined` when a check gave no answer).
 */
export function checkDatapackRun(
  lines: readonly string[],
  zipName: string,
  counts: Record<string, number | undefined>,
): DatapackOutcome {
  const failures: string[] = [];
  if (!lines.some((line) => /data pack/i.test(line) && line.includes(`file/${zipName}`))) {
    failures.push(`the data pack file/${zipName} is not listed as enabled`);
  }
  for (const line of lines) {
    if (LOG_FAILURE.test(line)) failures.push(`log: ${line.trim()}`);
  }
  for (const [name] of CHECKS) {
    const count = counts[name];
    if (count === undefined) failures.push(`no answer to the check of ${name}`);
    else if (count <= 0) failures.push(`none found: ${name} (count ${count})`);
  }
  return { ok: failures.length === 0, failures, counts };
}

// Running ------------------------------------------------------------------------------------

function log(message: string): void {
  process.stdout.write(`[vanilla-datapack] ${message}\n`);
}

async function fetchJson(url: string): Promise<{ json: unknown; text: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}`);
  const text = await response.text();
  return { json: JSON.parse(text) as unknown, text };
}

/** Downloads (or reuses) the vanilla server jar of `minecraft`; returns its path. */
export async function serverJar(
  options: Pick<DatapackOptions, 'minecraft' | 'cacheDir'>,
): Promise<string> {
  await mkdir(options.cacheDir, { recursive: true });
  const entry = versionEntry((await fetchJson(VERSION_MANIFEST_URL)).json, options.minecraft);
  const versionPath = join(options.cacheDir, `minecraft-${options.minecraft}.json`);
  await cached(entry.url, versionPath, { algorithm: 'sha1', hex: entry.sha1 });
  const version = JSON.parse(await readFile(versionPath, 'utf8')) as unknown;
  const server = serverDownload(version, options.minecraft);
  const jar = join(options.cacheDir, `minecraft-server-${options.minecraft}.jar`);
  await cached(server.url, jar, { algorithm: 'sha1', hex: server.sha1 });
  return jar;
}

/** A running server: its lines so far, a way to send a command and wait for an answer. */
export interface Console {
  lines: string[];
  send(command: string): void;
  /** Waits for a line after `from` that matches; `undefined` after `seconds`. */
  waitFor(pattern: RegExp, from: number, seconds: number): Promise<string | undefined>;
  exited: Promise<number | null>;
}

export function startServer(
  options: Pick<DatapackOptions, 'java' | 'memory'>,
  runDir: string,
  echo = true,
): Console {
  const lines: string[] = [];
  const waiters: {
    pattern: RegExp;
    from: number;
    resolve: (line: string | undefined) => void;
  }[] = [];
  const args = [`-Xmx${options.memory}`, '-jar', 'server.jar', 'nogui'];
  log(`starting ${options.java} ${args.join(' ')} in ${runDir}`);
  const child = spawn(options.java, args, { cwd: runDir, stdio: ['pipe', 'pipe', 'pipe'] });
  const onLine = (line: string): void => {
    lines.push(line);
    if (echo) process.stdout.write(`  | ${line}\n`);
    for (const waiter of [...waiters]) {
      if (lines.length - 1 >= waiter.from && waiter.pattern.test(line)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(line);
      }
    }
  };
  createInterface({ input: child.stdout }).on('line', onLine);
  createInterface({ input: child.stderr }).on('line', onLine);
  const exited = new Promise<number | null>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolveExit(code));
  });
  return {
    lines,
    exited,
    send(command) {
      child.stdin.write(`${command}\n`);
    },
    waitFor(pattern, from, seconds) {
      const earlier = lines.slice(from).find((line) => pattern.test(line));
      if (earlier !== undefined) return Promise.resolve(earlier);
      return new Promise<string | undefined>((resolveLine) => {
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolveLine(undefined);
        }, seconds * 1000);
        const waiter = {
          pattern,
          from,
          resolve: (line: string | undefined) => {
            clearTimeout(timer);
            resolveLine(line);
          },
        };
        waiters.push(waiter);
      });
    },
  };
}

export const DONE = /\bDone \(\d/;
/**
 * A command's own answer: the dedicated server echoes command feedback as `System chat:`, so an
 * unrelated line (`Can't keep up!`, a save) is never taken for one.
 */
export const ANSWER = /System chat: /;
const TEST = /Test (passed|failed)/;
/** How long a poll may keep asking, and how long it waits between questions. */
export const POLL_SECONDS = 60;
const POLL_INTERVAL_MS = 250;

/** Runs the whole check. */
export async function runDatapackCheck(options: DatapackOptions): Promise<DatapackOutcome> {
  const zip = resolve(options.zip);
  const jar = await serverJar(options);
  const runDir = resolve(options.workDir);
  await mkdir(runDir, { recursive: true });
  for (const stale of ['world', 'logs', 'crash-reports']) {
    await rm(join(runDir, stale), { recursive: true, force: true });
  }
  await mkdir(join(runDir, 'world', 'datapacks'), { recursive: true });
  await copyFile(zip, join(runDir, 'world', 'datapacks', basename(zip)));
  await copyFile(jar, join(runDir, 'server.jar'));
  await writeFile(join(runDir, 'eula.txt'), 'eula=true\n');
  await writeFile(join(runDir, 'server.properties'), serverProperties(await freePort()));

  const server = startServer(options, runDir);
  const counts: Record<string, number | undefined> = {};
  const timer = setTimeout(() => {
    log(`timed out after ${options.timeoutSeconds} s; stopping the server`);
    server.send('stop');
  }, options.timeoutSeconds * 1000);
  const failures: string[] = [];
  if ((await server.waitFor(DONE, 0, options.timeoutSeconds)) === undefined) {
    failures.push('the server never logged "Done (" (it did not finish starting)');
  } else {
    const run = async (command: string, pattern: RegExp, seconds = 30) => {
      const from = server.lines.length;
      server.send(command);
      return server.waitFor(pattern, from, seconds);
    };
    const count = async (command: string) => {
      const line = await run(command, TEST);
      return line === undefined ? undefined : testCount(line);
    };
    /** Asks `command` until it counts `want`, for at most `POLL_SECONDS`; the last count. */
    const poll = async (command: string, want: number) => {
      const deadline = Date.now() + POLL_SECONDS * 1000;
      for (;;) {
        const found = await count(command);
        if ((found !== undefined && found >= want) || Date.now() >= deadline) return found;
        await new Promise((wake) => setTimeout(wake, POLL_INTERVAL_MS));
      }
    };
    await run('datapack list enabled', /data pack/i);
    for (const command of setupCommands(options.villagers)) {
      if ((await run(command, ANSWER)) === undefined) log(`no answer to ${command}`);
    }
    const wanted: Record<string, number> = { villagers: options.villagers };
    for (const [name, command] of READY) {
      const want = wanted[name] ?? 1;
      const found = await poll(command, want);
      log(`${name} in the world: ${String(found)} of ${want}`);
      if (found === undefined || found < want) {
        failures.push(`only ${String(found ?? 0)} of ${want} ${name} in the world before the kill`);
      }
    }
    await run(KILL, ANSWER);
    const converted = await poll(CONVERTED, options.villagers);
    log(`zombie villagers after the kill: ${String(converted)} of ${options.villagers}`);
    for (const [name, command] of CHECKS) {
      counts[name] = await count(command);
      log(`${name}: ${String(counts[name])}`);
    }
  }
  server.send('stop');
  const code = await server.exited;
  clearTimeout(timer);
  await writeFile(join(runDir, 'vanilla-datapack.log'), `${server.lines.join('\n')}\n`);
  const outcome = checkDatapackRun(server.lines, basename(zip), counts);
  outcome.failures.unshift(...failures);
  if (code !== 0) outcome.failures.push(`the server exited with status ${String(code)}`);
  outcome.ok = outcome.failures.length === 0;
  return outcome;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${DATAPACK_USAGE}\n`);
    return 0;
  }
  const factsIndex = argv.indexOf('--facts');
  const factsPath = factsIndex < 0 ? undefined : argv[factsIndex + 1];
  const facts =
    factsPath === undefined ? {} : (JSON.parse(await readFile(factsPath, 'utf8')) as ServerFacts);
  const options = parseDatapackArgs(argv, facts, factsPath, process.env);
  const outcome = await runDatapackCheck(options);
  if (outcome.ok) {
    const counts = CHECKS.map(([name]) => `${String(outcome.counts[name])} ${name}`).join(', ');
    log(`PASS: ${counts}`);
    return 0;
  }
  for (const failure of outcome.failures) log(`FAIL: ${failure}`);
  return 1;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
