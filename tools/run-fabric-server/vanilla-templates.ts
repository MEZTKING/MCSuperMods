/**
 * Headless vanilla server check of MSM's structure templates (spike B547, Y12): the sample
 * worldgen project's templates, exported by MSM, are placed with `place template` and every
 * block is read back.
 *
 * Run with `node tools/run-fabric-server/vanilla-templates.ts --facts <template-facts.json>`
 * (Node >= 22.18 strips types). Only erasable TypeScript syntax and `node:` imports are allowed
 * here.
 *
 * The facts file is what `packages/exporters/test/sample-worldgen.golden.test.ts` writes next to
 * the zip with `MSM_SAMPLE_WORLDGEN_OUT`: `minecraft` (the target's game version), `zip` (the data
 * pack's file name in the same folder) and `templates`, each with its `id`, `size` and `blocks`
 * (`[x, y, z, block state]`, taken from the element, not from the exported file). No version is
 * written here.
 *
 * 1. Downloads the vanilla dedicated server as `vanilla-datapack.ts` does and prepares a run
 *    folder whose fresh `world/datapacks/` holds the zip (no Fabric: templates are plain data).
 * 2. Starts the server, waits for `Done (`, then runs on its console, each command waiting for its
 *    own answer: `datapack list enabled`, `forceload add` over the placing area, one
 *    `place template <id> <x> <y> <z>` per template (side by side along x, high in the air, so
 *    nothing of the world is in the way), then one `execute if block <x> <y> <z> <state>` per
 *    block of every template, and `stop`.
 * 3. Passes when the zip is listed as enabled, every template was placed, every block reads back
 *    as its state (properties included) and the log has no load failure or ERROR line.
 *
 * Before the B547 fix every template wrote its palette as `{ Name, Properties }` at the target's
 * own data version, which 26.x reads as no block: it loaded, placed, and
 * every block read back as air, so this check failed on every non-air block.
 *
 * Downloads are untrusted data: written to disk and run only as the server they claim to be.
 */
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeError, freePort, serverProperties } from './index.ts';
import {
  DONE,
  KNOWN_VANILLA_ERRORS,
  LOG_FAILURE,
  serverJar,
  startServer,
} from './vanilla-datapack.ts';

/** One template of the facts file: its id, size and blocks as `[x, y, z, block state]`. */
export interface TemplateFact {
  id: string;
  size: [number, number, number];
  blocks: [number, number, number, string][];
}

/** The facts file written next to the zip. */
export interface TemplateFacts {
  minecraft?: string;
  zip?: string;
  templates?: TemplateFact[];
}

/** Everything a check needs. */
export interface TemplatesOptions {
  minecraft: string;
  zip: string;
  templates: TemplateFact[];
  workDir: string;
  cacheDir: string;
  java: string;
  timeoutSeconds: number;
  memory: string;
}

export const TEMPLATES_USAGE = `Usage: node tools/run-fabric-server/vanilla-templates.ts --facts <template-facts.json> [options]

  --facts <file>        template-facts.json (minecraft, zip, templates) next to the data pack zip
  --zip <file>          the data pack zip (default: the facts' zip, beside the facts file)
  --minecraft <ver>     game version (overrides the facts file)
  --work <dir>          run folder (default: <tmp>/msm-vanilla-templates)
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
 * Reads the command line; the version and the zip come from `--facts` unless a flag gives them,
 * the templates always from `--facts`.
 *
 * @param argv - Arguments after the script path.
 * @param facts - The parsed facts file.
 * @param factsPath - Where the facts file is (its `zip` is beside it).
 * @param env - The environment (`JAVA_HOME`).
 */
export function parseTemplatesArgs(
  argv: readonly string[],
  facts: TemplateFacts = {},
  factsPath: string | undefined = undefined,
  env: Record<string, string | undefined> = {},
): TemplatesOptions {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument ${arg}\n\n${TEMPLATES_USAGE}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    i++;
    flags.set(arg.slice(2), value);
  }
  const known = new Set([
    'facts',
    'zip',
    'minecraft',
    'work',
    'cache',
    'java',
    'timeout',
    'memory',
  ]);
  for (const name of flags.keys()) {
    if (!known.has(name)) throw new Error(`Unknown option --${name}\n\n${TEMPLATES_USAGE}`);
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
  const templates = facts.templates ?? [];
  if (templates.length === 0) throw new Error('The --facts file lists no templates');
  const javaHome = env.JAVA_HOME;
  return {
    minecraft,
    zip,
    templates,
    workDir: flags.get('work') ?? join(tmpdir(), 'msm-vanilla-templates'),
    cacheDir: flags.get('cache') ?? join(homedir(), '.cache', 'msm-fabric-server'),
    java:
      flags.get('java') ??
      (javaHome === undefined || javaHome === '' ? 'java' : join(javaHome, 'bin', 'java')),
    timeoutSeconds: flags.has('timeout') ? whole('--timeout', flags.get('timeout')) : 600,
    memory: flags.get('memory') ?? '2G',
  };
}

/** The height every template's lowest layer is placed at: high in the air, under the build limit. */
export const PLACE_Y = 200;
/** Blocks of air between two templates along x. */
export const GAP = 2;

/** Where each template goes: side by side along x from 0, at {@link PLACE_Y}, z 0. */
export function layout(templates: readonly TemplateFact[]): [number, number, number][] {
  const origins: [number, number, number][] = [];
  let x = 0;
  for (const template of templates) {
    origins.push([x, PLACE_Y, 0]);
    x += template.size[0] + GAP;
  }
  return origins;
}

/** One block to read back: the command and what it expects. */
export interface BlockCheck {
  template: string;
  pos: [number, number, number];
  state: string;
  command: string;
}

/**
 * The console commands of a check: `forceload add` over the area, one `place template` per
 * template and one `execute if block` per block.
 */
export function templateCommands(templates: readonly TemplateFact[]): {
  forceload: string;
  place: string[];
  checks: BlockCheck[];
} {
  const origins = layout(templates);
  const maxX = templates.reduce(
    (end, template, index) =>
      Math.max(end, (origins[index] as [number, number, number])[0] + template.size[0]),
    1,
  );
  const maxZ = templates.reduce((end, template) => Math.max(end, template.size[2]), 1);
  const place: string[] = [];
  const checks: BlockCheck[] = [];
  templates.forEach((template, index) => {
    const [ox, oy, oz] = origins[index] as [number, number, number];
    place.push(`place template ${template.id} ${ox} ${oy} ${oz}`);
    for (const [x, y, z, state] of template.blocks) {
      const pos: [number, number, number] = [ox + x, oy + y, oz + z];
      checks.push({
        template: template.id,
        pos,
        state,
        command: `execute if block ${pos.join(' ')} ${state}`,
      });
    }
  });
  return { forceload: `forceload add 0 0 ${maxX - 1} ${maxZ - 1}`, place, checks };
}

/**
 * `place template`'s answer when it placed the template (`Loaded template "<id>" at x, y, z` on
 * the 26.3 and 26.4-snapshot-7 servers, 2026-11-22). It says the same when every block placed as
 * air, so only the block checks prove the template.
 */
export const PLACED = /System chat: Loaded template "[^"]+" at /;
/** Any answer to a command: the feedback line, or an error line the console echoes. */
export const ANY_ANSWER = /System chat: |Unknown|Incorrect|Invalid|Failed|failed|not loaded/;
/** `execute if block`'s answer. */
export const BLOCK_TEST = /Test (passed|failed)/;

/** What a check run showed. */
export interface TemplatesOutcome {
  ok: boolean;
  failures: string[];
  placed: number;
  passed: number;
  checked: number;
}

/**
 * Checks the run: the pack enabled, every template placed, every block read back, no load
 * failure in the log.
 *
 * @param lines - The server's output, one entry per line.
 * @param zipName - The data pack's file name (`file/<zipName>` in the enabled list).
 * @param placeAnswers - Each `place template`'s answer line, `undefined` when none came.
 * @param checks - The block checks with their answer lines.
 */
export function checkTemplatesRun(
  lines: readonly string[],
  zipName: string,
  place: readonly { command: string; answer: string | undefined }[],
  checks: readonly (BlockCheck & { answer: string | undefined })[],
): TemplatesOutcome {
  const failures: string[] = [];
  if (!lines.some((line) => /data pack/i.test(line) && line.includes(`file/${zipName}`))) {
    failures.push(`the data pack file/${zipName} is not listed as enabled`);
  }
  for (const line of lines) {
    if (!LOG_FAILURE.test(line)) continue;
    if (KNOWN_VANILLA_ERRORS.some((known) => known.test(line.trim()))) continue;
    failures.push(`log: ${line.trim()}`);
  }
  let placed = 0;
  for (const { command, answer } of place) {
    if (answer !== undefined && PLACED.test(answer)) placed++;
    else failures.push(`${command}: ${answer === undefined ? 'no answer' : answer.trim()}`);
  }
  let passed = 0;
  const wrong: string[] = [];
  for (const check of checks) {
    if (check.answer !== undefined && /Test passed/.test(check.answer)) passed++;
    else {
      wrong.push(
        `${check.template} block ${check.state} at ${check.pos.join(' ')}: ${check.answer === undefined ? 'no answer' : 'not there'}`,
      );
    }
  }
  if (wrong.length > 0) {
    failures.push(
      `${wrong.length} of ${checks.length} blocks did not read back as placed, such as ${wrong.slice(0, 5).join('; ')}`,
    );
  }
  return { ok: failures.length === 0, failures, placed, passed, checked: checks.length };
}

// Running ------------------------------------------------------------------------------------

function log(message: string): void {
  process.stdout.write(`[vanilla-templates] ${message}\n`);
}

/** Runs the whole check. */
export async function runTemplatesCheck(options: TemplatesOptions): Promise<TemplatesOutcome> {
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

  const { forceload, place, checks } = templateCommands(options.templates);
  const server = startServer(options, runDir, false);
  const timer = setTimeout(() => {
    log(`timed out after ${options.timeoutSeconds} s; stopping the server`);
    server.send('stop');
  }, options.timeoutSeconds * 1000);
  const failures: string[] = [];
  const placeAnswers: { command: string; answer: string | undefined }[] = [];
  const checkAnswers: (BlockCheck & { answer: string | undefined })[] = [];
  const run = async (command: string, pattern: RegExp, seconds = 30) => {
    const from = server.lines.length;
    server.send(command);
    return server.waitFor(pattern, from, seconds);
  };
  if ((await server.waitFor(DONE, 0, options.timeoutSeconds)) === undefined) {
    failures.push('the server never logged "Done (" (it did not finish starting)');
  } else {
    log(`${(await run('datapack list enabled', /data pack/i)) ?? 'no answer to datapack list'}`);
    log(`${forceload}: ${(await run(forceload, ANY_ANSWER)) ?? 'no answer'}`);
    for (const command of place) {
      const answer = await run(command, ANY_ANSWER);
      log(`${command}: ${answer ?? 'no answer'}`);
      placeAnswers.push({ command, answer });
    }
    for (const check of checks) {
      checkAnswers.push({ ...check, answer: await run(check.command, BLOCK_TEST) });
    }
  }
  server.send('stop');
  const code = await server.exited;
  clearTimeout(timer);
  await writeFile(join(runDir, 'vanilla-templates.log'), `${server.lines.join('\n')}\n`);
  const outcome = checkTemplatesRun(server.lines, basename(zip), placeAnswers, checkAnswers);
  outcome.failures.unshift(...failures);
  if (code !== 0) outcome.failures.push(`the server exited with status ${String(code)}`);
  outcome.ok = outcome.failures.length === 0;
  return outcome;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${TEMPLATES_USAGE}\n`);
    return 0;
  }
  const factsIndex = argv.indexOf('--facts');
  const factsPath = factsIndex < 0 ? undefined : argv[factsIndex + 1];
  const facts =
    factsPath === undefined ? {} : (JSON.parse(await readFile(factsPath, 'utf8')) as TemplateFacts);
  const options = parseTemplatesArgs(argv, facts, factsPath, process.env);
  const outcome = await runTemplatesCheck(options);
  if (outcome.ok) {
    log(
      `PASS: ${outcome.placed} template(s) placed, ${outcome.passed} of ${outcome.checked} blocks read back`,
    );
    return 0;
  }
  log(
    `${outcome.placed} template(s) placed, ${outcome.passed} of ${outcome.checked} blocks read back`,
  );
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
      process.stderr.write(`${describeError(error)}\n`);
      process.exitCode = 1;
    },
  );
}
