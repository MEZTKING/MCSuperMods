/**
 * Vanilla server load check of the library's data packs (`README.md`, "Library data packs on a
 * vanilla server").
 *
 * Run with `node tools/run-fabric-server/vanilla-packs.ts --packs <packs.json>` (Node >= 22.18
 * strips types). Only erasable TypeScript syntax and `node:` imports are allowed here.
 *
 * The packs file is what `packages/exporters/test/library.test.ts` writes with
 * `MSM_LIBRARY_PACKS_OUT`: `minecraft` (the target's game version) and `packs`, each a `zip` in
 * the same folder and the `source` it was exported from (a starter, an example or an
 * `examples/` mirror project that is meant to work as a plain vanilla data pack). No version is
 * written here.
 *
 * 1. Reads every zip and puts the packs into as few worlds as it can: two packs share a world
 *    unless both write the same file outside `tags/` (tags merge; any other file of one pack
 *    would hide the other's).
 * 2. Starts the vanilla dedicated server (downloaded as `vanilla-datapack.ts` does) on each
 *    world, runs `datapack list enabled` and stops it.
 * 3. A world passes when the server logged `Done (`, lists every pack as enabled and logged no
 *    load problem: `Failed to load datapacks`, `Errors in registry`, `Registry loading errors`,
 *    `Couldn't load tag`, `Failed to load function`, `Couldn't parse` or an ERROR line. On
 *    vanilla 26.3 and later one registry file naming an unknown id stops the server starting;
 *    a tag with a missing plain entry is dropped; a function that does not parse is dropped.
 * 4. When a world fails, it bisects: first over the packs (unless the log names them), then
 *    over each failing pack's files, and names the pack, its source and the files that bring
 *    back the problem lines of the full run. A subset counts as failing only when it logs one
 *    of those lines again, so a subset that fails only because it left out a file another file
 *    needs (a placed feature without its configured feature) does not mislead the search.
 *
 * Downloads are untrusted data: written to disk and run only as the server they claim to be.
 */
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { freePort, serverProperties } from './index.ts';
import { DONE, serverJar, startServer } from './vanilla-datapack.ts';

/** Everything a check needs. */
export interface PacksOptions {
  packs: string;
  minecraft: string | undefined;
  workDir: string;
  cacheDir: string;
  java: string;
  timeoutSeconds: number;
  memory: string;
  maxRuns: number;
}

/** One pack of the packs file. */
export interface PackEntry {
  zip: string;
  source: string;
}

/** The packs file written next to the zips. */
export interface PacksFacts {
  minecraft?: string;
  packs?: PackEntry[];
}

export const PACKS_USAGE = `Usage: node tools/run-fabric-server/vanilla-packs.ts --packs <packs.json> [options]

  --packs <file>        packs.json (minecraft, packs) next to the data pack zips
  --minecraft <ver>     game version (overrides the packs file)
  --work <dir>          run folder (default: <tmp>/msm-vanilla-packs)
  --cache <dir>         download cache (default: ~/.cache/msm-fabric-server)
  --java <path>         java executable (default: $JAVA_HOME/bin/java, else java)
  --timeout <seconds>   limit for one server run (default: 300)
  --memory <size>       -Xmx value (default: 2G)
  --max-runs <n>        server runs allowed for bisecting failures (default: 60)`;

function whole(name: string, value: string | undefined): number {
  const parsed = Number(value);
  if (value === undefined || !Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} needs a whole number of 1 or more, got ${String(value)}`);
  }
  return parsed;
}

/**
 * Reads the command line.
 *
 * @param argv - Arguments after the script path.
 * @param env - The environment (`JAVA_HOME`).
 */
export function parsePacksArgs(
  argv: readonly string[],
  env: Record<string, string | undefined> = {},
): PacksOptions {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument ${arg}\n\n${PACKS_USAGE}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    i++;
    flags.set(arg.slice(2), value);
  }
  const known = new Set([
    'packs',
    'minecraft',
    'work',
    'cache',
    'java',
    'timeout',
    'memory',
    'max-runs',
  ]);
  for (const name of flags.keys()) {
    if (!known.has(name)) throw new Error(`Unknown option --${name}\n\n${PACKS_USAGE}`);
  }
  const packs = flags.get('packs');
  if (packs === undefined) throw new Error(`--packs is required\n\n${PACKS_USAGE}`);
  const javaHome = env.JAVA_HOME;
  return {
    packs,
    minecraft: flags.get('minecraft'),
    workDir: flags.get('work') ?? join(tmpdir(), 'msm-vanilla-packs'),
    cacheDir: flags.get('cache') ?? join(homedir(), '.cache', 'msm-fabric-server'),
    java:
      flags.get('java') ??
      (javaHome === undefined || javaHome === '' ? 'java' : join(javaHome, 'bin', 'java')),
    timeoutSeconds: flags.has('timeout') ? whole('--timeout', flags.get('timeout')) : 300,
    memory: flags.get('memory') ?? '2G',
    maxRuns: flags.has('max-runs') ? whole('--max-runs', flags.get('max-runs')) : 60,
  };
}

// Zips ---------------------------------------------------------------------------------------

/**
 * The files of a zip (stored or deflated entries; folders left out), read from its central
 * directory.
 */
export function zipEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not a zip: no end of central directory');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('bad zip central directory');
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (method === 0) out.set(name, data);
    else if (method === 8) out.set(name, new Uint8Array(inflateRawSync(data)));
    else throw new Error(`zip entry ${name} uses compression method ${method}`);
  }
  return out;
}

// Worlds -------------------------------------------------------------------------------------

/** Whether two packs may both write `path` in one world: tags merge, root files are per pack. */
export function mergingPath(path: string): boolean {
  return !path.startsWith('data/') || /^data\/[^/]+\/tags\//.test(path);
}

/** A pack by name with the paths it writes. */
export interface PackPaths {
  name: string;
  paths: readonly string[];
}

/**
 * Puts packs into worlds, first fit in order: a pack joins the first world where no other pack
 * writes one of its files (other than tags and root files).
 */
export function groupWorlds(packs: readonly PackPaths[]): string[][] {
  const worlds: { names: string[]; taken: Set<string> }[] = [];
  for (const pack of packs) {
    const own = pack.paths.filter((path) => !mergingPath(path));
    let world = worlds.find((candidate) => own.every((path) => !candidate.taken.has(path)));
    if (world === undefined) {
      world = { names: [], taken: new Set() };
      worlds.push(world);
    }
    world.names.push(pack.name);
    for (const path of own) world.taken.add(path);
  }
  return worlds.map((world) => world.names);
}

// Logs ---------------------------------------------------------------------------------------

/** Lines that fail a run (the brief's list plus any ERROR line). */
export const LOAD_PROBLEM =
  /Failed to load datapacks|Errors in registry|Registry loading errors|Couldn't load tag|Failed to load function|Couldn't parse|\/ERROR\]/;

/** Lines that name one failing file or element: what a bisect looks for again. */
const SPECIFIC =
  /Errors in element|Couldn't load tag|Failed to load function|Couldn't parse|Failed to parse .* from pack/;

/** What one server run showed. */
export interface RunAnalysis {
  /** Whether the server logged `Done (`. */
  done: boolean;
  /** Packs listed by `datapack list enabled` (`file/<name>`), without the `file/`. */
  enabled: string[];
  /** The lines matching {@link LOAD_PROBLEM}. */
  problems: string[];
  /** The problem lines with their context (registry error tree, exception messages). */
  details: string[];
  /** Normalised lines naming one failing file or element. */
  signatures: string[];
}

/** A log line without its `[time] [thread/LEVEL]: ` prefix and with `.zip` dropped from pack names. */
export function normalise(line: string): string {
  return line
    .replace(/^\[[^\]]*\] \[[^\]]*\]: /, '')
    .replace(/file\/([^\s)\]]+?)\.zip(?=[\s)\]:]|$)/g, 'file/$1')
    .trim();
}

/**
 * Reads a server run's output.
 *
 * @param lines - The server's output, one entry per line.
 */
export function analyseRun(lines: readonly string[]): RunAnalysis {
  const enabled: string[] = [];
  const problems: string[] = [];
  const details: string[] = [];
  let inError = false;
  for (const line of lines) {
    if (/data pack\(s\) enabled:/.test(line)) {
      for (const match of line.matchAll(/\[file\/(.+?) \((?:world|[a-z]+)\)\]/g)) {
        enabled.push(match[1] as string);
      }
    }
    const isProblem = LOAD_PROBLEM.test(line);
    if (isProblem) problems.push(line.trim());
    if (/^\[[^\]]*\] \[/.test(line)) inError = isProblem;
    if (
      isProblem ||
      (inError &&
        (/^>/.test(line) ||
          /^Caused by: /.test(line) ||
          /^[\w.$]+(?:Exception|Error)(?::|$)/.test(line)))
    ) {
      details.push(line.trim());
    }
  }
  const signatures = [
    ...new Set(details.filter((line) => SPECIFIC.test(line)).map((line) => normalise(line))),
  ];
  return { done: lines.some((line) => DONE.test(line)), enabled, problems, details, signatures };
}

/**
 * Why a run failed (empty when it passed).
 *
 * @param analysis - The run's {@link analyseRun}.
 * @param expected - The pack names put into the world (`<name>.zip` or a folder `<name>`).
 */
export function runFailures(analysis: RunAnalysis, expected: readonly string[]): string[] {
  const failures: string[] = [];
  if (!analysis.done)
    failures.push('the server never logged "Done (" (it did not finish starting)');
  for (const line of analysis.problems) failures.push(`log: ${line}`);
  if (analysis.done) {
    const enabled = new Set(analysis.enabled);
    for (const name of expected) {
      if (!enabled.has(name)) failures.push(`file/${name} is not listed as enabled`);
    }
  }
  return failures;
}

/**
 * The packs the run's lines name: `file/<pack>` (registry and tag errors), or for a function
 * that failed to load, the pack that has that function.
 *
 * @param signatures - Normalised problem lines ({@link RunAnalysis.signatures}).
 * @param packs - The packs in the run: name (without `.zip`) and paths.
 * @returns The names blamed, and whether every line named one.
 */
export function blame(
  signatures: readonly string[],
  packs: readonly PackPaths[],
): { names: string[]; complete: boolean } {
  const names = new Set<string>();
  let complete = signatures.length > 0;
  for (const line of signatures) {
    const named = [...line.matchAll(/file\/([^\s)\]:]+)/g)].map((match) => match[1] as string);
    const fn = /Failed to load function ([a-z0-9_.-]+):([a-z0-9_./-]+)/.exec(line);
    if (fn !== null) {
      const path = new RegExp(`^data/${fn[1]}/functions?/${fn[2]}\\.mcfunction$`);
      for (const pack of packs) if (pack.paths.some((p) => path.test(p))) named.push(pack.name);
    }
    const known = named.filter((name) => packs.some((pack) => pack.name === name));
    // `Errors in element` lines never name a pack; the `Failed to parse` line below them does.
    if (known.length === 0 && !/Errors in element/.test(line)) complete = false;
    for (const name of known) names.add(name);
  }
  return { names: [...names].sort(), complete: complete && names.size > 0 };
}

/**
 * The smallest groups of `items` for which `fails` holds, by halving: both halves are tried;
 * a half that fails is searched further; when neither half fails alone, the items are needed
 * together and are returned as they are.
 */
export async function culprits<T>(
  items: readonly T[],
  fails: (subset: readonly T[]) => Promise<boolean>,
): Promise<T[]> {
  if (items.length <= 1) return [...items];
  const middle = Math.ceil(items.length / 2);
  const halves = [items.slice(0, middle), items.slice(middle)];
  const found: T[] = [];
  let any = false;
  for (const half of halves) {
    if (await fails(half)) {
      any = true;
      found.push(...(await culprits(half, fails)));
    }
  }
  return any ? found : [...items];
}

// Running ------------------------------------------------------------------------------------

function log(message: string): void {
  process.stdout.write(`[vanilla-packs] ${message}\n`);
}

/** A pack placed in a world: a zip copied in, or a folder of chosen files. */
interface Placement {
  /** File or folder name under `world/datapacks/`. */
  name: string;
  zipPath?: string;
  files?: ReadonlyMap<string, Uint8Array>;
}

interface RunResult {
  analysis: RunAnalysis;
  failures: string[];
}

class Runner {
  runs = 0;
  readonly #options: PacksOptions & { minecraft: string };
  readonly #jar: string;
  readonly #runDir: string;

  constructor(options: PacksOptions & { minecraft: string }, jar: string) {
    this.#options = options;
    this.#jar = jar;
    this.#runDir = resolve(options.workDir, 'server');
  }

  /** Starts the server on a fresh world holding `placements`; keeps its log as `label`. */
  async run(placements: readonly Placement[], label: string): Promise<RunResult> {
    this.runs++;
    const runDir = this.#runDir;
    await mkdir(runDir, { recursive: true });
    for (const stale of ['world', 'logs', 'crash-reports']) {
      await rm(join(runDir, stale), { recursive: true, force: true });
    }
    const packsDir = join(runDir, 'world', 'datapacks');
    await mkdir(packsDir, { recursive: true });
    for (const placement of placements) {
      if (placement.zipPath !== undefined) {
        await copyFile(placement.zipPath, join(packsDir, placement.name));
      } else {
        for (const [path, bytes] of placement.files ?? []) {
          const file = join(packsDir, placement.name, ...path.split('/'));
          await mkdir(dirname(file), { recursive: true });
          await writeFile(file, bytes);
        }
      }
    }
    await copyFile(this.#jar, join(runDir, 'server.jar'));
    await writeFile(join(runDir, 'eula.txt'), 'eula=true\n');
    await writeFile(join(runDir, 'server.properties'), serverProperties(await freePort()));
    const server = startServer(this.#options, runDir, false);
    let exitedEarly = false;
    void server.exited.then(() => {
      exitedEarly = true;
    });
    const seconds = this.#options.timeoutSeconds;
    const done = await Promise.race([
      server.waitFor(DONE, 0, seconds),
      server.exited.then(() => undefined),
    ]);
    if (done !== undefined) {
      const from = server.lines.length;
      server.send('datapack list enabled');
      await server.waitFor(/data pack/i, from, 30);
    }
    if (!exitedEarly) server.send('stop');
    const code = await server.exited;
    const logPath = join(resolve(this.#options.workDir), `${label}.log`);
    await writeFile(logPath, `${server.lines.join('\n')}\n`);
    const analysis = analyseRun(server.lines);
    const failures = runFailures(
      analysis,
      placements.map((placement) => placement.name),
    );
    if (done !== undefined && code !== 0)
      failures.push(`the server exited with status ${String(code)}`);
    log(
      `run ${this.runs} (${label}, ${placements.length} pack(s)): ${failures.length === 0 ? 'ok' : `${failures.length} problem(s)`}`,
    );
    return { analysis, failures };
  }

  get exhausted(): boolean {
    return this.runs >= this.#options.maxRuns;
  }
}

/** A pack read from disk. */
interface LoadedPack {
  name: string;
  zip: string;
  zipPath: string;
  source: string;
  files: Map<string, Uint8Array>;
}

const stem = (zip: string): string => zip.replace(/\.zip$/, '');

/**
 * Whether a subset run brings back one of `wanted` (or, when `wanted` is empty, fails at all).
 */
function reproduces(result: RunResult, wanted: readonly string[]): boolean {
  if (wanted.length === 0) return result.failures.length > 0;
  return result.analysis.signatures.some((line) => wanted.includes(line));
}

/** Names the failing packs and files of a failed world. Returns report lines. */
async function bisect(
  runner: Runner,
  packs: readonly LoadedPack[],
  first: RunResult,
  worldLabel: string,
): Promise<string[]> {
  const wanted = first.analysis.signatures;
  const report: string[] = [];
  const { names, complete } = blame(
    wanted,
    packs.map((pack) => ({ name: stem(pack.zip), paths: [...pack.files.keys()] })),
  );
  let bad: LoadedPack[];
  if (complete) {
    bad = packs.filter((pack) => names.includes(stem(pack.zip)));
    log(`the log names ${bad.map((pack) => pack.zip).join(', ')}`);
  } else {
    let step = 0;
    bad = await culprits(packs, async (subset) => {
      if (runner.exhausted) return false;
      const result = await runner.run(
        subset.map((pack) => ({ name: pack.zip, zipPath: pack.zipPath })),
        `${worldLabel}-packs-${++step}`,
      );
      return reproduces(result, wanted);
    });
  }
  for (const pack of bad) {
    const name = stem(pack.zip);
    const own = wanted.filter((line) => line.includes(`file/${name}`));
    const target = own.length > 0 ? own : wanted;
    const root = [...pack.files].filter(([path]) => !path.startsWith('data/'));
    const data = [...pack.files.keys()].filter((path) => path.startsWith('data/')).sort();
    let step = 0;
    const files = await culprits(data, async (subset) => {
      if (runner.exhausted) return false;
      const chosen = new Map(root);
      for (const path of subset) chosen.set(path, pack.files.get(path) as Uint8Array);
      const result = await runner.run([{ name, files: chosen }], `${name}-files-${++step}`);
      return reproduces(result, target);
    });
    report.push(`pack ${pack.zip} (${pack.source})`);
    if (runner.exhausted) report.push('  files not narrowed down (no server runs left)');
    else if (files.length === data.length && data.length > 1) {
      report.push('  files: only all of them together bring the problem back');
    } else for (const path of files) report.push(`  file ${path}`);
    for (const line of target) report.push(`  log: ${line}`);
  }
  if (runner.exhausted)
    report.push(`(bisect stopped after ${runner.runs} server runs; raise --max-runs)`);
  return report;
}

/** Runs the whole check; returns the failure report (empty when every world passed). */
export async function runPacksCheck(options: PacksOptions): Promise<string[]> {
  const packsPath = resolve(options.packs);
  const facts = JSON.parse(await readFile(packsPath, 'utf8')) as PacksFacts;
  const minecraft = options.minecraft ?? facts.minecraft;
  if (minecraft === undefined || minecraft === '') {
    throw new Error('--minecraft is required (or give it in the --packs file)');
  }
  const entries = facts.packs ?? [];
  if (entries.length === 0) throw new Error(`${packsPath} lists no packs`);
  const packs: LoadedPack[] = [];
  for (const entry of entries) {
    const zipPath = join(dirname(packsPath), entry.zip);
    const files = zipEntries(new Uint8Array(await readFile(zipPath)));
    packs.push({ name: stem(entry.zip), zip: entry.zip, zipPath, source: entry.source, files });
  }
  const worlds = groupWorlds(
    packs.map((pack) => ({ name: pack.zip, paths: [...pack.files.keys()] })),
  );
  log(`${packs.length} packs for Minecraft ${minecraft} in ${worlds.length} world(s)`);
  const full = { ...options, minecraft };
  await mkdir(resolve(options.workDir), { recursive: true });
  const runner = new Runner(full, await serverJar(full));
  const report: string[] = [];
  for (const [index, names] of worlds.entries()) {
    const label = `world-${index + 1}`;
    const inWorld = packs.filter((pack) => names.includes(pack.zip));
    const first = await runner.run(
      inWorld.map((pack) => ({ name: pack.zip, zipPath: pack.zipPath })),
      label,
    );
    if (first.failures.length === 0) continue;
    report.push(`${label} (${inWorld.length} packs):`);
    for (const failure of first.failures) report.push(`  ${failure}`);
    for (const detail of first.analysis.details) {
      if (!first.analysis.problems.includes(detail)) report.push(`    ${detail}`);
    }
    report.push(...(await bisect(runner, inWorld, first, label)).map((line) => `  ${line}`));
  }
  return report;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${PACKS_USAGE}\n`);
    return 0;
  }
  const report = await runPacksCheck(parsePacksArgs(argv, process.env));
  if (report.length === 0) {
    log('PASS: every pack loaded with no problem and is enabled');
    return 0;
  }
  for (const line of report) log(`FAIL: ${line}`);
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
