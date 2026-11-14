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
 *    when `expectEntities` is given, the `loaded S script(s); 0 error(s)` line with S as expected
 *    when `expectScripts` is given, no other `[msm_runtime]` warning or error, no GeckoLib
 *    error (nor warning unless `--allow-warnings`), no `Failed to load`, no mod resolution
 *    failure and no stack frame from `dev.mcsupermods` or `com.geckolib`.
 *
 * GameTests (`--gametest <jar>`, ADR 0033 D5): the test jar and Fabric API's
 * `fabric-gametest-api-v1` module (not nested in the `fabric-api` jar; its version is read from
 * Fabric API's POM) go into `mods/`, and the JVM gets `-Dfabric-api.gametest=true` and
 * `-Dfabric-api.gametest.report-file=<report>`. Fabric API then starts the vanilla GameTest server
 * instead of the dedicated server: it runs every registered test (Minecraft's own
 * `minecraft:always_pass` included), writes a JUnit-like XML report and exits with the number of
 * failed required tests (`GameTestServer.onServerExit`; -1 when no tests could be selected, 1 on a
 * crash). It never logs `Done (` and needs no `stop`. The run passes when the exit status is 0,
 * the report exists, lists at least one test outside the `minecraft` namespace and has no
 * failure, and the log rules above (other than `Done (`) hold. `--no-runtime` (ejected jars) skips
 * the runtime's registration lines and fails on any `[msm_runtime]` line instead.
 *
 * The facts file is what `packages/exporters/test/sample-mod.golden.test.ts` and
 * `sample-mob.golden.test.ts` write next to the sample jar: `minecraft`, `loader`,
 * `fabricApi` (from the target's Fabric facts), the optional `expectBlocks`, `expectItems`,
 * `expectEntities`, `expectScripts` and `geckolib` (`fileName`, `url`, `sha512` from the
 * target's GeckoLib facts). Flags override it.
 *
 * `--gametest-filter <selector>` runs only the GameTests matching a test selector (Fabric API's
 * `fabric-api.gametest.filter`, Minecraft's resource selector: `*` and `?` wildcards, such as
 * `msm_parity_tests:sample_mod_*`), so one test jar can hold the tests of several samples.
 *
 * GeckoLib: a content jar with entities nests GeckoLib (ADR 0029 D4), so by default the tool
 * relies on the nested copy and downloads nothing. `--separate-geckolib` (for a jar exported
 * with the separate runtime and GeckoLib option) downloads the jar named by the facts into
 * the cache, checks its SHA-512 and puts it in `mods/`.
 *
 * Two runs (`--runs <n>`): the server is started n times on the same run folder, so the world
 * kept from one run is loaded by the next (ADR 0062: `msm.storage` across a restart). Every run
 * must pass on its own; `--expect-line <text>` (repeatable) requires a log line ending with the
 * text in every run, with `{run}` replaced by the run's number (1, 2, ...), such as the sample
 * script's start counter `msm_sample_script:start_counter: start counter: {run}`.
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
import { basename, dirname, join, resolve } from 'node:path';
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
  /** Script files the runtime must report loading, with no script error. */
  expectScripts: number | undefined;
  /** A GameTest mod jar: run Fabric API's production GameTest server instead of a plain start. */
  gametest: string | undefined;
  /** Only the GameTests matching this selector run (`fabric-api.gametest.filter`). */
  gametestFilter: string | undefined;
  /** Where the GameTest report goes (default `<work>/gametest-report.xml`). */
  report: string | undefined;
  /** No `msm_runtime` in the run (an ejected jar): skip the registration checks. */
  noRuntime: boolean;
  /** Starts of the server on the same world (2 or more keep the world between runs). */
  runs: number;
  /** Text a log line must end with in every run; `{run}` is replaced by the run's number. */
  expectLines: string[];
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
  expectScripts?: number;
  geckolib?: GeckolibFacts;
}

export const USAGE = `Usage: node tools/run-fabric-server/index.ts --jar <content jar> [options]

  --facts <file>        fabric-facts.json (minecraft, loader, fabricApi, expectBlocks,
                        expectItems, expectEntities, expectScripts, geckolib)
  --minecraft <ver>     game version (overrides the facts file)
  --loader <ver>        Fabric Loader version
  --fabric-api <ver>    Fabric API version as on maven.fabricmc.net
  --installer <ver>     Fabric installer version (default: latest stable)
  --extra <jar>         another jar for mods/ (repeatable), such as a separate msm_runtime
  --expect-blocks <n>   blocks the runtime must report
  --expect-items <n>    items the runtime must report
  --expect-entities <n> entity types the runtime must report
  --expect-scripts <n>  script files the runtime must report loading, with 0 errors
  --gametest <jar>      run the GameTests of this mod jar on a production GameTest server
                        (adds Fabric API's fabric-gametest-api-v1 module to mods/)
  --gametest-filter <selector>
                        run only the GameTests matching this selector (* and ? wildcards,
                        such as msm_parity_tests:sample_mod_*)
  --report <file>       GameTest report file (default: <work>/gametest-report.xml)
  --runs <n>            start the server n times on the same world (default: 1); every run
                        must pass (not with --gametest)
  --expect-line <text>  a log line must end with this text in every run (repeatable);
                        {run} is replaced by the run's number (1, 2, ...)
  --no-runtime          the jar has no msm_runtime (an ejected project): skip the
                        registration checks and fail on any [msm_runtime] line
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
  const expectLines: string[] = [];
  let allowWarnings = false;
  let separateGeckolib = false;
  let noRuntime = false;
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
    if (arg === '--no-runtime') {
      noRuntime = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument ${arg}\n\n${USAGE}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    i++;
    if (arg === '--extra') extra.push(value);
    else if (arg === '--expect-line') expectLines.push(value);
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
    'expect-scripts',
    'gametest',
    'gametest-filter',
    'report',
    'work',
    'cache',
    'java',
    'timeout',
    'memory',
    'runs',
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
  const scripts = flags.get('expect-scripts');
  if (flags.has('report') && !flags.has('gametest')) {
    throw new Error('--report needs --gametest');
  }
  if (flags.has('gametest-filter') && !flags.has('gametest')) {
    throw new Error('--gametest-filter needs --gametest');
  }
  const runs = flags.has('runs') ? integer('--runs', flags.get('runs')) : 1;
  if (runs < 1) throw new Error('--runs needs 1 or more');
  if (runs > 1 && flags.has('gametest')) {
    throw new Error('--runs needs a plain start: a GameTest server makes its own world');
  }
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
    expectScripts:
      scripts === undefined ? facts.expectScripts : integer('--expect-scripts', scripts),
    gametest: flags.get('gametest'),
    gametestFilter: flags.get('gametest-filter'),
    report: flags.get('report'),
    noRuntime,
    runs,
    expectLines,
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

/** Fabric API's POM, which names the version of each of its modules. */
export function fabricApiPomUrl(version: string): string {
  return `${MAVEN}/net/fabricmc/fabric-api/fabric-api/${version}/fabric-api-${version}.pom`;
}

/** One Fabric API module's jar on maven.fabricmc.net (`.sha1` appended gives its checksum). */
export function fabricApiModuleUrl(module: string, version: string): string {
  return `${MAVEN}/net/fabricmc/fabric-api/${module}/${version}/${module}-${version}.jar`;
}

/** The GameTest module, which the `fabric-api` jar lists in its POM but does not nest. */
export const GAMETEST_MODULE = 'fabric-gametest-api-v1';

/**
 * The version of a Fabric API module as Fabric API's POM names it.
 *
 * @param pom - The text of `fabric-api-<version>.pom`.
 * @param module - The module's artifact id, such as {@link GAMETEST_MODULE}.
 */
export function moduleVersionFromPom(pom: string, module: string): string {
  for (const match of pom.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const body = match[1] as string;
    if (body.includes(`<artifactId>${module}</artifactId>`)) {
      const version = /<version>\s*([^<\s]+)\s*<\/version>/.exec(body)?.[1];
      if (version !== undefined) return version;
    }
  }
  throw new Error(`Fabric API's POM names no version of ${module}`);
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
  /** Script files from the `loaded S script(s); E error(s)` line. */
  scripts: number | undefined;
  files: number | undefined;
  errors: number | undefined;
  warnings: number | undefined;
  /** The lines worth printing in a summary. */
  keyLines: string[];
  /** The GameTest report's test cases (GameTest runs only). */
  gametests?: GameTestCase[];
}

const REGISTERED =
  /\[msm_runtime\] registered (\d+) block\(s\) and (\d+) item\(s\) from (\d+) definition file\(s\); (\d+) error\(s\)(?:, (\d+) warning\(s\))?/;
const ENTITIES = /\[msm_runtime\] registered (\d+) entity type\(s\)/;
/** `ScriptHost`'s load line: S counts every script file found, E the load-time errors. */
const SCRIPTS = /\[msm_runtime\] loaded (\d+) script\(s\); (\d+) error\(s\)/;
/** A script's own `msm.log` line (`[msm_runtime] <script id>: <message>`), shown as a key line. */
const SCRIPT_LOG = /\[msm_runtime\] [a-z0-9_.-]+:[a-z0-9_./-]+: /;
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
/**
 * A stack frame from MSM or GeckoLib code. On a Fabric server frames read `at knot//<class>`;
 * frames of the parity GameTest mod (`dev.mcsupermods.parity`) are test failures, which the
 * GameTest report carries, so they do not count here.
 */
const RUNTIME_FRAME = /\bat (?:knot\/\/)?(?:dev\.mcsupermods\.(?!parity\.)|com\.geckolib\.)/;
/** The GameTest server's crash line (`GameTestServer.onServerCrash`). */
const GAMETEST_CRASH = /Game test server crashed/;
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
    Partial<Pick<Options, 'expectEntities' | 'expectScripts' | 'noRuntime'>> & {
      /** A GameTest run: the server exits after the tests and never logs `Done (`. */
      gametest?: boolean;
    },
): Analysis {
  const noRuntime = expect.noRuntime === true;
  const failures: string[] = [];
  const keyLines: string[] = [];
  let done = false;
  let registered: RegExpExecArray | undefined;
  let entities: number | undefined;
  let scripts: RegExpExecArray | undefined;
  for (const line of lines) {
    if (DONE.test(line)) {
      done = true;
      keyLines.push(line);
    }
    if (noRuntime && line.includes('[msm_runtime]')) {
      keyLines.push(line);
      failures.push(`msm_runtime is loaded, but --no-runtime says it is not: ${line.trim()}`);
      continue;
    }
    if (GAMETEST_CRASH.test(line)) {
      keyLines.push(line);
      failures.push(`the GameTest server crashed: ${line.trim()}`);
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
    const scriptMatch = SCRIPTS.exec(line);
    if (scriptMatch !== null) {
      keyLines.push(line);
      if (scripts === undefined) {
        scripts = scriptMatch;
      } else if (expect.gametest !== true) {
        failures.push('the runtime reported loading its scripts twice');
      } else if (scriptMatch[1] !== scripts[1] || scriptMatch[2] !== '0') {
        // A GameTest may /reload, which loads the scripts again: the same files, no errors.
        failures.push(`the scripts loaded again differently: ${line.trim()}`);
      }
      continue;
    }
    if (MOD_LIST.test(line) || SCRIPT_LOG.test(line)) keyLines.push(line);
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
  if (!done && expect.gametest !== true) {
    failures.push('the server never logged "Done (" (it did not finish starting)');
  }
  if (noRuntime) {
    // An ejected jar: no registration lines to check (any [msm_runtime] line failed above).
  } else if (registered === undefined) {
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
  if (expect.expectEntities !== undefined && !noRuntime) {
    if (entities === undefined) {
      failures.push('no "[msm_runtime] registered K entity type(s)" line');
    } else if (entities !== expect.expectEntities) {
      failures.push(
        `expected ${expect.expectEntities} entity type(s), the runtime registered ${entities}`,
      );
    }
  }
  if (expect.expectScripts !== undefined && !noRuntime) {
    if (scripts === undefined) {
      failures.push('no "[msm_runtime] loaded S script(s); E error(s)" line');
    } else {
      const loaded = Number(scripts[1]);
      const scriptErrors = Number(scripts[2]);
      if (loaded !== expect.expectScripts) {
        failures.push(`expected ${expect.expectScripts} script(s), the runtime loaded ${loaded}`);
      }
      if (scriptErrors !== 0) failures.push(`the runtime reported ${scriptErrors} script error(s)`);
    }
  }
  return {
    ok: failures.length === 0,
    failures,
    done,
    blocks,
    items,
    entities,
    scripts: scripts === undefined ? undefined : Number(scripts[1]),
    files: count(3),
    errors,
    warnings,
    keyLines,
  };
}

/**
 * The `--expect-line` texts no line of a run ends with (trailing white space ignored), with
 * `{run}` replaced by the run's number.
 *
 * @param lines - The run's output, one entry per line.
 * @param expectLines - The texts, as given.
 * @param run - The run's number, from 1.
 */
export function missingLines(
  lines: readonly string[],
  expectLines: readonly string[],
  run: number,
): string[] {
  const missing: string[] = [];
  for (const template of expectLines) {
    const text = template.replaceAll('{run}', String(run));
    if (!lines.some((line) => line.trimEnd().endsWith(text))) missing.push(text);
  }
  return missing;
}

/** The output file of a run: the first keeps the usual name, later ones get their number. */
export function runLogName(run: number): string {
  return run === 1 ? 'run-fabric-server.log' : `run-fabric-server-run${run}.log`;
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

// GameTest report ----------------------------------------------------------------------------

/** One test case of a GameTest report. */
export interface GameTestCase {
  /** The test id, such as `msm_parity_tests:sample_mod_parity_test_ruby_ore_is_registered`. */
  name: string;
  /** The test environment's structure, such as `fabric-gametest-api-v1:empty`. */
  classname: string;
  /** The failure message, when the test failed. */
  failure: string | undefined;
  /** The skip message, when the test was skipped. */
  skipped: string | undefined;
}

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (whole, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return XML_ENTITIES[entity] ?? whole;
  });
}

function attribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attributes);
  return match === null ? undefined : decodeXml(match[1] as string);
}

/** The message of a `<failure>` or `<skipped>` child: its `message`, else its text. */
function childMessage(body: string, element: 'failure' | 'skipped'): string | undefined {
  const match = new RegExp(`<${element}(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${element}>)`).exec(body);
  if (match === null) return undefined;
  const message = attribute(match[1] ?? '', 'message');
  const text = decodeXml((match[2] ?? '').trim());
  return message ?? (text === '' ? element : text);
}

/**
 * Reads the JUnit-like XML report that Fabric API's GameTest runner writes
 * (`fabric-api.gametest.report-file`): `<testsuite><testsuite time=".." timestamp="..">` holding
 * one `<testcase classname=".." name=".." time=".."/>` per test, with a
 * `<failure message=".."/>` child for a failed test (and `<skipped message=".."/>` for a skipped
 * one).
 */
export function parseGameTestReport(xml: string): GameTestCase[] {
  const cases: GameTestCase[] = [];
  const testcase = /<testcase(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  for (const match of xml.matchAll(testcase)) {
    const attributes = match[1] ?? '';
    const body = match[2] ?? '';
    cases.push({
      name: attribute(attributes, 'name') ?? '(unnamed)',
      classname: attribute(attributes, 'classname') ?? '',
      failure: childMessage(body, 'failure'),
      skipped: childMessage(body, 'skipped'),
    });
  }
  return cases;
}

/** What a GameTest run showed, from its report and exit status. */
export interface GameTestOutcome {
  ok: boolean;
  failures: string[];
  /** Every test case of the report. */
  tests: GameTestCase[];
}

/**
 * Checks a GameTest run: the server must exit with status 0 (the number of failed required
 * tests), the report must exist and list at least one test outside the `minecraft` namespace
 * (Minecraft always adds `minecraft:always_pass`), and no test may fail.
 *
 * @param report - The report's text, or `undefined` when the server wrote none.
 * @param code - The server's exit status (`null` when it was killed).
 */
export function checkGameTests(report: string | undefined, code: number | null): GameTestOutcome {
  const failures: string[] = [];
  const tests = report === undefined ? [] : parseGameTestReport(report);
  if (report === undefined) {
    failures.push('the GameTest server wrote no report (it did not get to run the tests)');
  } else if (!tests.some((test) => !test.name.startsWith('minecraft:'))) {
    failures.push('the GameTest report lists no test from the --gametest jar');
  }
  for (const test of tests) {
    if (test.failure !== undefined) failures.push(`GameTest failed: ${test.name}: ${test.failure}`);
  }
  if (code !== 0) {
    const meaning =
      code === null
        ? 'it was killed'
        : code === 255
          ? 'no tests could be selected, or the server failed to start'
          : 'the number of failed required tests, or 1 for a crash';
    failures.push(`the GameTest server exited with status ${String(code)} (${meaning})`);
  }
  return { ok: failures.length === 0, failures, tests };
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
export interface Checksum {
  algorithm: 'sha1' | 'sha512';
  hex: string;
}

/** Downloads `url` to `path` unless it is cached; checks `expected` when given. */
export async function cached(url: string, path: string, expected?: Checksum): Promise<void> {
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

/** A free local TCP port for the server. */
export async function freePort(): Promise<number> {
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

/** Downloads a text file (a POM or a `.sha1`). */
async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}`);
  return response.text();
}

/** The first token of a Maven `.sha1` file. */
async function fetchSha1(url: string): Promise<string> {
  return (await fetchText(`${url}.sha1`)).trim().split(/\s+/)[0] as string;
}

/** Where a GameTest run writes its report. */
export function reportPath(options: Pick<Options, 'report' | 'workDir'>): string {
  return resolve(options.report ?? join(options.workDir, 'gametest-report.xml'));
}

/**
 * The server's command line after `java`: `-Xmx`, the GameTest properties when `report` is
 * given (with `fabric-api.gametest.filter` when `filter` is), `-jar <launcher> nogui`.
 */
export function serverArguments(
  memory: string,
  launcher: string,
  report?: string,
  filter?: string,
): string[] {
  const gametest =
    report === undefined
      ? []
      : [
          '-Dfabric-api.gametest=true',
          `-Dfabric-api.gametest.report-file=${report}`,
          ...(filter === undefined ? [] : [`-Dfabric-api.gametest.filter=${filter}`]),
        ];
  return [`-Xmx${memory}`, ...gametest, '-jar', launcher, 'nogui'];
}

async function prepare(options: Options): Promise<{ launcher: string; runDir: string }> {
  await mkdir(options.cacheDir, { recursive: true });
  const installer =
    options.installer ?? latestStableInstaller(await (await fetch(INSTALLER_VERSIONS_URL)).json());
  const launcherName = `fabric-server-mc.${options.minecraft}-loader.${options.loader}-launcher.${installer}.jar`;
  const launcher = join(options.cacheDir, launcherName);
  await cached(serverLauncherUrl(options.minecraft, options.loader, installer), launcher);

  const apiUrl = fabricApiUrl(options.fabricApi);
  const apiSha1 = await fetchSha1(apiUrl);
  const apiJar = join(options.cacheDir, `fabric-api-${options.fabricApi}.jar`);
  await cached(apiUrl, apiJar, { algorithm: 'sha1', hex: apiSha1 });

  const modJars = [apiJar, resolve(options.jar), ...options.extra.map((jar) => resolve(jar))];
  if (options.gametest !== undefined) {
    // The fabric-api jar does not nest the GameTest module; its POM names the matching version.
    const version = moduleVersionFromPom(
      await fetchText(fabricApiPomUrl(options.fabricApi)),
      GAMETEST_MODULE,
    );
    const moduleUrl = fabricApiModuleUrl(GAMETEST_MODULE, version);
    const moduleJar = join(options.cacheDir, `${GAMETEST_MODULE}-${version}.jar`);
    await cached(moduleUrl, moduleJar, { algorithm: 'sha1', hex: await fetchSha1(moduleUrl) });
    modJars.push(moduleJar, resolve(options.gametest));
  }
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
  if (options.gametest !== undefined) {
    await mkdir(dirname(reportPath(options)), { recursive: true });
    await rm(reportPath(options), { force: true });
  }
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
  run = 1,
): Promise<{ lines: string[]; code: number | null; timedOut: boolean }> {
  const lines: string[] = [];
  const output = createWriteStream(join(runDir, runLogName(run)));
  const gametest = options.gametest !== undefined;
  const args = serverArguments(
    options.memory,
    launcher,
    gametest ? reportPath(options) : undefined,
    gametest ? options.gametestFilter : undefined,
  );
  log(`starting ${options.java} ${args.join(' ')} in ${runDir}`);
  const child = spawn(options.java, args, {
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
    // A GameTest server stops by itself after the tests and never logs "Done (".
    if ((DONE.test(line) && !gametest) || LOAD_FAILURE.test(line)) stop();
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
  if (options.gametest !== undefined && !existsSync(options.gametest)) {
    throw new Error(`No GameTest jar at ${options.gametest}`);
  }
  const { launcher, runDir } = await prepare(options);
  const gametest = options.gametest !== undefined;
  const runs = options.runs;
  let combined: Analysis | undefined;
  for (let run = 1; run <= runs; run++) {
    if (runs > 1) log(`run ${run} of ${runs} (the world is kept between runs)`);
    const { lines, code, timedOut } = await runServer(options, launcher, runDir, run);
    const analysis = analyseLog(lines, { ...options, gametest });
    if (timedOut) {
      analysis.failures.push(`the server did not stop within ${options.timeoutSeconds} s`);
    } else if (gametest) {
      const path = reportPath(options);
      const report = existsSync(path) ? await readFile(path, 'utf8') : undefined;
      const outcome = checkGameTests(report, code);
      analysis.gametests = outcome.tests;
      analysis.failures.push(...outcome.failures);
    } else if (code !== 0) {
      analysis.failures.push(`the server exited with status ${String(code)}`);
    }
    for (const text of missingLines(lines, options.expectLines, run)) {
      analysis.failures.push(`no log line ends with "${text}"`);
    }
    if (runs > 1) {
      analysis.failures = analysis.failures.map((failure) => `run ${run}: ${failure}`);
      analysis.keyLines = [`(run ${run})`, ...analysis.keyLines];
    }
    combined =
      combined === undefined
        ? analysis
        : {
            ...analysis,
            failures: [...combined.failures, ...analysis.failures],
            keyLines: [...combined.keyLines, ...analysis.keyLines],
          };
  }
  const result = combined as Analysis;
  result.ok = result.failures.length === 0;
  return result;
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
  if (analysis.gametests !== undefined) {
    log(`GameTests (${reportPath(options)}):`);
    for (const test of analysis.gametests) {
      const status =
        test.failure === undefined ? (test.skipped === undefined ? 'pass' : 'skip') : 'FAIL';
      const detail = test.failure ?? test.skipped;
      process.stdout.write(
        `  ${status} ${test.name}${detail === undefined ? '' : `: ${detail}`}\n`,
      );
    }
  }
  if (analysis.ok) {
    const entities = analysis.entities === undefined ? '' : `, ${analysis.entities} entity type(s)`;
    const scripts = analysis.scripts === undefined ? '' : `, ${analysis.scripts} script(s)`;
    const runtime = options.noRuntime
      ? 'no msm_runtime'
      : `${analysis.blocks} block(s), ${analysis.items} item(s)${entities}${scripts} from ${analysis.files} definition file(s); 0 errors`;
    const tests =
      analysis.gametests === undefined ? '' : `; ${analysis.gametests.length} GameTest(s) passed`;
    const runs = options.runs > 1 ? `; ${options.runs} runs on one world` : '';
    log(`PASS: ${runtime}${tests}${runs}`);
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
