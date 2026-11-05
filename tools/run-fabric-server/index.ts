/**
 * Headless Fabric server check for a content jar (ADR 0026 D6).
 *
 * Run with `node tools/run-fabric-server/index.ts --jar <content jar> --facts <fabric-facts.json>`
 * (Node >= 22.18 strips types). Only erasable TypeScript syntax and `node:` imports are
 * allowed here.
 *
 * 1. Downloads, into a cache folder, the Fabric server launcher for the game, loader and the
 *    latest stable installer (meta.fabricmc.net `/v2/versions/loader/<game>/<loader>/<installer>/server/jar`)
 *    and Fabric API from maven.fabricmc.net, checked against its published SHA-1.
 * 2. Prepares a run folder: `eula.txt`, `server.properties` (offline, a free port, no
 *    structures), a fresh `mods/` holding Fabric API and the content jar (plus `--extra` jars), and
 *    no world or logs from earlier runs. The launcher downloads the game server and libraries
 *    into the run folder on first start and reuses them afterwards.
 * 3. Starts `java -jar fabric-server-launch.jar nogui`, waits for `Done (`, sends `stop` and
 *    waits for the process to end (killed after `--timeout`).
 * 4. Passes when the log has `Done (`, the runtime's `registered N block(s) and M item(s) ...;
 *    E error(s), W warning(s)` line with E = 0 (and W = 0 unless `--allow-warnings`), the
 *    expected counts when given, the `registered K entity type(s)` line with K as expected
 *    when `expectEntities` is given, no other `[msm_runtime]` warning or error, no GeckoLib
 *    error (nor warning unless `--allow-warnings`), no `Failed to load`, no mod resolution
 *    failure and no stack frame from `dev.mcsupermods` or `com.geckolib`.
 *
 * The facts file is what `packages/exporters/test/sample-mod.golden.test.ts` and
 * `sample-mob.golden.test.ts` write next to the sample jar: `minecraft`, `loader`,
 * `fabricApi` (from the target's Fabric facts), the optional `expectBlocks`, `expectItems`,
 * `expectEntities`, and `geckolib` (`fileName`, `url`, `sha512` from the target's GeckoLib
 * facts). Flags override it.
 *
 * GeckoLib: a content jar with entities nests GeckoLib (ADR 0029 D4), so by default the tool
 * relies on the nested copy and downloads nothing. `--separate-geckolib` (for a jar exported
 * with the separate runtime and GeckoLib option) downloads the jar named by the facts into
 * the cache, checks its SHA-512 and puts it in `mods/`.
 *
 * Downloads are untrusted data: written to disk and run only as the Fabric server they claim
 * to be, in a folder of their own.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

/** Everything a run needs. */
export interface Options {
  jar: string;
  extra: string[];
  minecraft: string;
  loader: string;
  fabricApi: string;
  /** Installer (launcher) version; `undefined` picks the latest stable one. */
  installer: string | undefined;
  expectBlocks: number | undefined;
  expectItems: number | undefined;
  expectEntities: number | undefined;
  /** GeckoLib download facts; used only with {@link Options.separateGeckolib}. */
  geckolib: GeckolibFacts | undefined;
  /** Download GeckoLib and put it in `mods/` beside the content jar. */
  separateGeckolib: boolean;
  allowWarnings: boolean;
  workDir: string;
  cacheDir: string;
  java: string;
  timeoutSeconds: number;
  memory: string;
}

/** The GeckoLib jar the facts file names (from the target's GeckoLib facts). */
export interface GeckolibFacts {
  fileName: string;
  url: string;
  /** SHA-512 as 128 lower-case hex characters. */
  sha512: string;
}

/** The facts file written next to the sample jar. */
export interface FactsFile {
  minecraft?: string;
  loader?: string;
  fabricApi?: string;
  expectBlocks?: number;
  expectItems?: number;
  expectEntities?: number;
  geckolib?: GeckolibFacts;
}

export const USAGE = `Usage: node tools/run-fabric-server/index.ts --jar <content jar> [options]

  --facts <file>        fabric-facts.json (minecraft, loader, fabricApi, expectBlocks,
                        expectItems, expectEntities, geckolib)
  --minecraft <ver>     game version (overrides the facts file)
  --loader <ver>        Fabric Loader version
  --fabric-api <ver>    Fabric API version as on maven.fabricmc.net
  --installer <ver>     Fabric installer version (default: latest stable)
  --extra <jar>         another jar for mods/ (repeatable), such as a separate msm_runtime
  --expect-blocks <n>   blocks the runtime must report
  --expect-items <n>    items the runtime must report
  --expect-entities <n> entity types the runtime must report
  --separate-geckolib   download GeckoLib (facts file's geckolib) into mods/, for a jar
                        exported without it nested
  --allow-warnings      pass with runtime and GeckoLib warnings
  --work <dir>          run folder (default: <tmp>/msm-fabric-server)
  --cache <dir>         download cache (default: ~/.cache/msm-fabric-server)
  --java <path>         java executable (default: $JAVA_HOME/bin/java, else java)
  --timeout <seconds>   whole-run limit (default: 900)
  --memory <size>       -Xmx value (default: 2G)`;

function integer(name: string, value: string | undefined): number {
  const parsed = Number(value);
  if (value === undefined || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} needs a whole number, got ${String(value)}`);
  }
  return parsed;
}

/**
 * Reads the command line. Version facts come from `--facts` unless a flag gives them.
 *
 * @param argv - Arguments after the script path.
 * @param facts - The parsed facts file, when `--facts` was given.
 * @param env - The environment (`JAVA_HOME`).
 */
export function parseArgs(
  argv: readonly string[],
  facts: FactsFile = {},
  env: Record<string, string | undefined> = {},
): Options {
  const flags = new Map<string, string>();
  const extra: string[] = [];
  let allowWarnings = false;
  let separateGeckolib = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--allow-warnings') {
      allowWarnings = true;
      continue;
    }
    if (arg === '--separate-geckolib') {
      separateGeckolib = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument ${arg}\n\n${USAGE}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    i++;
    if (arg === '--extra') extra.push(value);
    else flags.set(arg.slice(2), value);
  }
  const known = new Set([
    'jar',
    'facts',
    'minecraft',
    'loader',
    'fabric-api',
    'installer',
    'expect-blocks',
    'expect-items',
    'expect-entities',
    'work',
    'cache',
    'java',
    'timeout',
    'memory',
  ]);
  for (const name of flags.keys()) {
    if (!known.has(name)) throw new Error(`Unknown option --${name}\n\n${USAGE}`);
  }
  const jar = flags.get('jar');
  if (jar === undefined) throw new Error(`--jar is required\n\n${USAGE}`);
  const required = (flag: string, fact: string | undefined): string => {
    const value = flags.get(flag) ?? fact;
    if (value === undefined || value === '') {
      throw new Error(`--${flag} is required (or give it in the --facts file)`);
    }
    return value;
  };
  const blocks = flags.get('expect-blocks');
  const items = flags.get('expect-items');
  const entities = flags.get('expect-entities');
  if (separateGeckolib && facts.geckolib === undefined) {
    throw new Error('--separate-geckolib needs the geckolib entry of the --facts file');
  }
  const javaHome = env.JAVA_HOME;
  return {
    jar,
    extra,
    minecraft: required('minecraft', facts.minecraft),
    loader: required('loader', facts.loader),
    fabricApi: required('fabric-api', facts.fabricApi),
    installer: flags.get('installer'),
    expectBlocks: blocks === undefined ? facts.expectBlocks : integer('--expect-blocks', blocks),
    expectItems: items === undefined ? facts.expectItems : integer('--expect-items', items),
    expectEntities:
      entities === undefined ? facts.expectEntities : integer('--expect-entities', entities),
    geckolib: facts.geckolib,
    separateGeckolib,
    allowWarnings,
    workDir: flags.get('work') ?? join(tmpdir(), 'msm-fabric-server'),
    cacheDir: flags.get('cache') ?? join(homedir(), '.cache', 'msm-fabric-server'),
    java:
      flags.get('java') ??
      (javaHome === undefined || javaHome === '' ? 'java' : join(javaHome, 'bin', 'java')),
    timeoutSeconds: flags.has('timeout') ? integer('--timeout', flags.get('timeout')) : 900,
    memory: flags.get('memory') ?? '2G',
  };
}

// URLs ----------------------------------------------------------------------------------------

const META = 'https://meta.fabricmc.net/v2';
const MAVEN = 'https://maven.fabricmc.net';

/** The Fabric server launcher jar for a game, loader and installer version. */
export function serverLauncherUrl(minecraft: string, loader: string, installer: string): string {
  const part = (value: string): string => encodeURIComponent(value);
  return `${META}/versions/loader/${part(minecraft)}/${part(loader)}/${part(installer)}/server/jar`;
}

/** Fabric API's jar on maven.fabricmc.net (`.sha1` appended gives its checksum). */
export function fabricApiUrl(version: string): string {
  return `${MAVEN}/net/fabricmc/fabric-api/fabric-api/${version}/fabric-api-${version}.jar`;
}

/** The installer versions list. */
export const INSTALLER_VERSIONS_URL = `${META}/versions/installer`;

/** The first stable installer version of a meta.fabricmc.net `/versions/installer` list. */
export function latestStableInstaller(list: unknown): string {
  if (Array.isArray(list)) {
    for (const entry of list) {
      const record = entry as { version?: unknown; stable?: unknown };
      if (record.stable === true && typeof record.version === 'string') return record.version;
    }
  }
  throw new Error('meta.fabricmc.net lists no stable Fabric installer');
}

// Log analysis --------------------------------------------------------------------------------

/** What the log showed. */
export interface Analysis {
  ok: boolean;
  failures: string[];
  done: boolean;
  blocks: number | undefined;
  items: number | undefined;
  /** Entity types from the `registered K entity type(s)` line. */
  entities: number | undefined;
  files: number | undefined;
  errors: number | undefined;
  warnings: number | undefined;
  /** The lines worth printing in a summary. */
  keyLines: string[];
}

const REGISTERED =
  /\[msm_runtime\] registered (\d+) block\(s\) and (\d+) item\(s\) from (\d+) definition file\(s\); (\d+) error\(s\)(?:, (\d+) warning\(s\))?/;
const ENTITIES = /\[msm_runtime\] registered (\d+) entity type\(s\)/;
const LEVEL = /\/(WARN|ERROR|FATAL)\]/;
/**
 * A line about GeckoLib. The dedicated server's console pattern has no logger name, so
 * GeckoLib's warnings are recognised by naming it (its messages, Mixin and access widener
 * notices name `geckolib`).
 */
const GECKOLIB = /geckolib/i;
const DONE = /\bDone \(\d/;
const LOAD_FAILURE =
  /Failed to load|Mod resolution failed|Incompatible mods? found|Some of your mods are incompatible/;
const RUNTIME_FRAME = /\bat (?:dev\.mcsupermods|com\.geckolib)\./;
const MOD_LIST =
  /Loading \d+ mods:|^\s+(?:- |\\-- |\|-- )(?:msm|geckolib |fabric-api |fabricloader |minecraft )/;

/**
 * Checks a server log against the expectations of {@link Options}.
 *
 * @param lines - The server's output, one entry per line.
 * @param expect - Expected counts and whether warnings pass.
 */
export function analyseLog(
  lines: readonly string[],
  expect: Pick<Options, 'expectBlocks' | 'expectItems' | 'allowWarnings'> &
    Partial<Pick<Options, 'expectEntities'>>,
): Analysis {
  const failures: string[] = [];
  const keyLines: string[] = [];
  let done = false;
  let registered: RegExpExecArray | undefined;
  let entities: number | undefined;
  for (const line of lines) {
    if (DONE.test(line)) {
      done = true;
      keyLines.push(line);
    }
    const match = REGISTERED.exec(line);
    if (match !== null) {
      if (registered !== undefined) failures.push('the runtime reported its registrations twice');
      registered = match;
      keyLines.push(line);
      continue;
    }
    const entityMatch = ENTITIES.exec(line);
    if (entityMatch !== null) {
      if (entities !== undefined) failures.push('the runtime reported its entity types twice');
      entities = Number(entityMatch[1]);
      keyLines.push(line);
      continue;
    }
    if (MOD_LIST.test(line)) keyLines.push(line);
    const level = LEVEL.exec(line)?.[1];
    if (line.includes('[msm_runtime]') && level !== undefined) {
      keyLines.push(line);
      if (level !== 'WARN' || !expect.allowWarnings) {
        failures.push(`runtime ${level.toLowerCase()}: ${line.trim()}`);
      }
    } else if (GECKOLIB.test(line) && level !== undefined) {
      keyLines.push(line);
      if (level !== 'WARN' || !expect.allowWarnings) {
        failures.push(`GeckoLib ${level.toLowerCase()}: ${line.trim()}`);
      }
    }
    if (LOAD_FAILURE.test(line)) {
      keyLines.push(line);
      failures.push(`load failure: ${line.trim()}`);
    }
    if (RUNTIME_FRAME.test(line)) {
      keyLines.push(line);
      failures.push(`exception in msm_runtime: ${line.trim()}`);
    }
  }
  const count = (index: number): number | undefined =>
    registered?.[index] === undefined ? undefined : Number(registered[index]);
  const blocks = count(1);
  const items = count(2);
  const errors = count(4);
  const warnings = count(5);
  if (!done) failures.push('the server never logged "Done (" (it did not finish starting)');
  if (registered === undefined) {
    failures.push('no "[msm_runtime] registered ..." line: the runtime did not load or scan');
  } else {
    if (errors !== 0) failures.push(`the runtime reported ${errors} error(s)`);
    if (warnings !== undefined && warnings !== 0 && !expect.allowWarnings) {
      failures.push(`the runtime reported ${warnings} warning(s)`);
    }
    if (expect.expectBlocks !== undefined && blocks !== expect.expectBlocks) {
      failures.push(`expected ${expect.expectBlocks} block(s), the runtime registered ${blocks}`);
    }
    if (expect.expectItems !== undefined && items !== expect.expectItems) {
      failures.push(`expected ${expect.expectItems} item(s), the runtime registered ${items}`);
    }
  }
  if (expect.expectEntities !== undefined) {
    if (entities === undefined) {
      failures.push('no "[msm_runtime] registered K entity type(s)" line');
    } else if (entities !== expect.expectEntities) {
      failures.push(
        `expected ${expect.expectEntities} entity type(s), the runtime registered ${entities}`,
      );
    }
  }
  return {
    ok: failures.length === 0,
    failures,
    done,
    blocks,
    items,
    entities,
    files: count(3),
    errors,
    warnings,
    keyLines,
  };
}

/** The `server.properties` of a check run. */
export function serverProperties(port: number): string {
  return [
    'online-mode=false',
    `server-port=${port}`,
    'generate-structures=false',
    'spawn-protection=0',
    'max-players=1',
    'enable-query=false',
    'enable-rcon=false',
    'sync-chunk-writes=false',
    '',
  ].join('\n');
}

// Running ------------------------------------------------------------------------------------

function log(message: string): void {
  process.stdout.write(`[run-fabric-server] ${message}\n`);
}

async function download(url: string, path: string): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || response.body === null) {
    throw new Error(`GET ${url} returned HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const temporary = `${path}.part`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

async function digest(algorithm: 'sha1' | 'sha512', path: string): Promise<string> {
  return createHash(algorithm)
    .update(await readFile(path))
    .digest('hex');
}

/** An expected checksum: SHA-1 (Fabric's Maven) or SHA-512 (GeckoLib's facts). */
interface Checksum {
  algorithm: 'sha1' | 'sha512';
  hex: string;
}

/** Downloads `url` to `path` unless it is cached; checks `expected` when given. */
async function cached(url: string, path: string, expected?: Checksum): Promise<void> {
  if (
    existsSync(path) &&
    (expected === undefined || (await digest(expected.algorithm, path)) === expected.hex)
  ) {
    log(`cached ${basename(path)}`);
    return;
  }
  log(`downloading ${url}`);
  await download(url, path);
  if (expected !== undefined) {
    const actual = await digest(expected.algorithm, path);
    if (actual !== expected.hex) {
      await rm(path, { force: true });
      const name = expected.algorithm === 'sha1' ? 'SHA-1' : 'SHA-512';
      throw new Error(`${url}: ${name} ${actual} does not match the expected ${expected.hex}`);
    }
  }
}

/** Where `--separate-geckolib` caches GeckoLib: its own file name, so versions never clash. */
export function geckolibCachePath(cacheDir: string, geckolib: GeckolibFacts): string {
  const name = basename(geckolib.fileName);
  if (name !== geckolib.fileName || !name.endsWith('.jar')) {
    throw new Error(`geckolib.fileName must be a plain .jar file name, got ${geckolib.fileName}`);
  }
  return join(cacheDir, name);
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 25565;
      server.close(() => resolvePort(port));
    });
  });
}

async function prepare(options: Options): Promise<{ launcher: string; runDir: string }> {
  await mkdir(options.cacheDir, { recursive: true });
  const installer =
    options.installer ?? latestStableInstaller(await (await fetch(INSTALLER_VERSIONS_URL)).json());
  const launcherName = `fabric-server-mc.${options.minecraft}-loader.${options.loader}-launcher.${installer}.jar`;
  const launcher = join(options.cacheDir, launcherName);
  await cached(serverLauncherUrl(options.minecraft, options.loader, installer), launcher);

  const apiUrl = fabricApiUrl(options.fabricApi);
  const apiSha1Response = await fetch(`${apiUrl}.sha1`);
  if (!apiSha1Response.ok)
    throw new Error(`GET ${apiUrl}.sha1 returned HTTP ${apiSha1Response.status}`);
  const apiSha1 = (await apiSha1Response.text()).trim().split(/\s+/)[0] as string;
  const apiJar = join(options.cacheDir, `fabric-api-${options.fabricApi}.jar`);
  await cached(apiUrl, apiJar, { algorithm: 'sha1', hex: apiSha1 });

  const modJars = [apiJar, resolve(options.jar), ...options.extra.map((jar) => resolve(jar))];
  if (options.separateGeckolib) {
    const geckolib = options.geckolib;
    if (geckolib === undefined) throw new Error('--separate-geckolib needs geckolib facts');
    const geckolibJar = geckolibCachePath(options.cacheDir, geckolib);
    await cached(geckolib.url, geckolibJar, { algorithm: 'sha512', hex: geckolib.sha512 });
    modJars.push(geckolibJar);
  }

  const runDir = resolve(options.workDir);
  await mkdir(runDir, { recursive: true });
  for (const stale of ['mods', 'world', 'logs', 'crash-reports', 'config']) {
    await rm(join(runDir, stale), { recursive: true, force: true });
  }
  await mkdir(join(runDir, 'mods'));
  await writeFile(join(runDir, 'eula.txt'), 'eula=true\n');
  await writeFile(join(runDir, 'server.properties'), serverProperties(await freePort()));
  for (const jar of modJars) await copyFile(jar, join(runDir, 'mods', basename(jar)));
  const runLauncher = join(runDir, 'fabric-server-launch.jar');
  await copyFile(launcher, runLauncher);
  return { launcher: runLauncher, runDir };
}

/** Runs the server until it stops; returns its output lines. */
async function runServer(
  options: Options,
  launcher: string,
  runDir: string,
): Promise<{ lines: string[]; code: number | null; timedOut: boolean }> {
  const lines: string[] = [];
  const output = createWriteStream(join(runDir, 'run-fabric-server.log'));
  log(
    `starting ${options.java} -Xmx${options.memory} -jar ${basename(launcher)} nogui in ${runDir}`,
  );
  const child = spawn(options.java, [`-Xmx${options.memory}`, '-jar', launcher, 'nogui'], {
    cwd: runDir,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stopping = false;
  let timedOut = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    log('sending stop');
    child.stdin.write('stop\n');
  };
  const timer = setTimeout(() => {
    timedOut = true;
    log(`timed out after ${options.timeoutSeconds} s; killing the server`);
    child.kill('SIGKILL');
  }, options.timeoutSeconds * 1000);
  const onLine = (line: string): void => {
    lines.push(line);
    output.write(`${line}\n`);
    process.stdout.write(`  | ${line}\n`);
    if (DONE.test(line) || LOAD_FAILURE.test(line)) stop();
  };
  createInterface({ input: child.stdout }).on('line', onLine);
  createInterface({ input: child.stderr }).on('line', onLine);
  const code = await new Promise<number | null>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode) => resolveExit(exitCode));
  });
  clearTimeout(timer);
  await new Promise<void>((resolveEnd) => output.end(() => resolveEnd()));
  return { lines, code, timedOut };
}

/**
 * Runs the whole check.
 *
 * @returns The analysis, with a failure added for a time-out or a non-zero exit.
 */
export async function runCheck(options: Options): Promise<Analysis> {
  if (!existsSync(options.jar)) throw new Error(`No content jar at ${options.jar}`);
  const { launcher, runDir } = await prepare(options);
  const { lines, code, timedOut } = await runServer(options, launcher, runDir);
  const analysis = analyseLog(lines, options);
  if (timedOut)
    analysis.failures.push(`the server did not stop within ${options.timeoutSeconds} s`);
  else if (code !== 0) analysis.failures.push(`the server exited with status ${String(code)}`);
  analysis.ok = analysis.failures.length === 0;
  return analysis;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const factsIndex = argv.indexOf('--facts');
  const factsPath = factsIndex < 0 ? undefined : argv[factsIndex + 1];
  const facts =
    factsPath === undefined ? {} : (JSON.parse(await readFile(factsPath, 'utf8')) as FactsFile);
  const options = parseArgs(argv, facts, process.env);
  const analysis = await runCheck(options);
  log('key lines:');
  for (const line of analysis.keyLines) process.stdout.write(`  ${line}\n`);
  if (analysis.ok) {
    const entities = analysis.entities === undefined ? '' : `, ${analysis.entities} entity type(s)`;
    log(
      `PASS: ${analysis.blocks} block(s), ${analysis.items} item(s)${entities} from ${analysis.files} definition file(s); 0 errors`,
    );
    return 0;
  }
  for (const failure of analysis.failures) log(`FAIL: ${failure}`);
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
