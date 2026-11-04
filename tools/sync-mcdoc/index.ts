/**
 * Vendors the SpyglassMC/vanilla-mcdoc symbol export for one target.
 *
 * Usage:
 *   node tools/sync-mcdoc/index.ts --ref <sha> --out <dir> [--from-generated]
 *
 * Build mode (default): shallow-fetches vanilla-mcdoc at `<sha>` into a
 * temporary directory and runs `@spyglassmc/mcdoc-cli export --ref` over it.
 * Generated mode: downloads `symbols.json` from the upstream `generated`
 * branch and requires its `ref` to equal `<sha>`.
 *
 * Writes `symbols.json` (sorted keys, 2-space), `LICENSE` and `SOURCE.json`
 * into `<dir>`, each atomically. The upstream checkout is treated as data:
 * nothing from it is executed.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import {
  fetchGitHubFile,
  type GitHubRepository,
  nowIso,
  parseJsonStrict,
  stringifySorted,
  writeFileAtomic,
} from '../shared/download.ts';

const run = promisify(execFile);

export const REPOSITORY: GitHubRepository = 'SpyglassMC/vanilla-mcdoc';
export const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
export const GENERATED_BRANCH = 'generated';
export const MIN_TYPE_COUNT = 1000;

/** Shape of the mcdoc-cli export, as far as this script checks it. */
export interface McdocSymbols {
  ref: string;
  mcdoc: Record<string, unknown>;
  'mcdoc/dispatcher': Record<string, Record<string, unknown>>;
}

export type SyncMode = 'build' | 'generated';

export interface McdocSource {
  repository: string;
  ref: string;
  mode: SyncMode;
  tool: string;
  fetchedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks the export's shape and that its `ref` is `expectedRef`.
 * Returns a list of problems; empty means valid.
 */
export function validateSymbols(value: unknown, expectedRef: string): string[] {
  if (!isRecord(value)) return ['symbols: expected a JSON object'];
  const problems: string[] = [];
  const keys = Object.keys(value).sort();
  const expectedKeys = ['mcdoc', 'mcdoc/dispatcher', 'ref'];
  if (keys.join(',') !== expectedKeys.join(',')) {
    problems.push(
      `symbols: top-level keys are [${keys.join(', ')}], expected [ref, mcdoc, mcdoc/dispatcher]`,
    );
  }
  if (value.ref !== expectedRef) {
    problems.push(
      `symbols.ref is ${JSON.stringify(value.ref)}, expected ${JSON.stringify(expectedRef)}`,
    );
  }
  const mcdoc = value.mcdoc;
  if (!isRecord(mcdoc)) {
    problems.push('symbols.mcdoc: expected an object');
  } else if (Object.keys(mcdoc).length < MIN_TYPE_COUNT) {
    problems.push(
      `symbols.mcdoc: ${Object.keys(mcdoc).length} types, expected at least ${MIN_TYPE_COUNT}`,
    );
  }
  const dispatchers = value['mcdoc/dispatcher'];
  if (!isRecord(dispatchers)) {
    problems.push('symbols["mcdoc/dispatcher"]: expected an object');
  } else {
    const resource = dispatchers['minecraft:resource'];
    if (!isRecord(resource) || !('recipe' in resource)) {
      problems.push('symbols["mcdoc/dispatcher"]["minecraft:resource"] has no "recipe" member');
    }
  }
  return problems;
}

/** Version of the installed `@spyglassmc/mcdoc-cli`, and the path of its entry point. */
async function locateMcdocCli(): Promise<{ version: string; entry: string }> {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve('@spyglassmc/mcdoc-cli/package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    version: string;
    bin: Record<string, string>;
  };
  const bin = manifest.bin.mcdoc;
  if (bin === undefined) throw new Error('@spyglassmc/mcdoc-cli has no "mcdoc" bin');
  return { version: manifest.version, entry: join(dirname(manifestPath), bin) };
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', args, {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.trim();
}

/**
 * Works around mcdoc-cli 0.1.63 listing no source files.
 *
 * mcdoc-cli calls `Project.ready()` without a file watcher, and
 * `@spyglassmc/core` 0.4.57 only lists project-root files through that
 * watcher, so the export comes out empty. Files from `env.dependencies` are
 * listed without a watcher, so the checkout's own `spyglass.json` (data in a
 * temporary directory, never committed) gets the checkout root appended as a
 * directory dependency. Verified on 2026-11-04 to reproduce the upstream
 * `generated` branch byte-for-byte after sorting.
 */
export async function registerCheckoutAsDependency(checkout: string): Promise<void> {
  const configPath = join(checkout, 'spyglass.json');
  let config: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(await readFile(configPath, 'utf8'));
    if (isRecord(parsed)) config = parsed;
  } catch {
    // Missing or unreadable config: start from an empty one.
  }
  const env = isRecord(config.env) ? config.env : {};
  const dependencies = Array.isArray(env.dependencies) ? env.dependencies : [];
  let root = pathToFileURL(checkout).toString();
  if (!root.endsWith('/')) root += '/';
  config.env = { ...env, dependencies: [...dependencies, root] };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

/** Fetches vanilla-mcdoc at `ref` and runs mcdoc-cli over it; returns the export text. */
async function buildSymbols(
  ref: string,
  cliEntry: string,
  log: (m: string) => void,
): Promise<string> {
  const work = await mkdtemp(join(tmpdir(), 'msm-sync-mcdoc-'));
  const checkout = join(work, 'vanilla-mcdoc');
  const output = join(work, 'symbols.json');
  try {
    await run('git', ['init', '--quiet', checkout]);
    await git(checkout, ['remote', 'add', 'origin', REPOSITORY_URL]);
    log(`fetching ${REPOSITORY_URL} at ${ref}`);
    await git(checkout, ['fetch', '--quiet', '--depth', '1', 'origin', ref]);
    await git(checkout, ['-c', 'advice.detachedHead=false', 'checkout', '--quiet', 'FETCH_HEAD']);
    const head = await git(checkout, ['rev-parse', 'HEAD']);
    if (head !== ref) throw new Error(`checked out ${head}, expected ${ref}`);
    await registerCheckoutAsDependency(checkout);
    log('running mcdoc-cli export');
    // `--ref` makes mcdoc-cli run `git rev-parse HEAD` in its own cwd, so cwd is the checkout.
    await run(process.execPath, [cliEntry, 'export', output, '--source', checkout, '--ref'], {
      cwd: checkout,
      maxBuffer: 64 * 1024 * 1024,
    });
    return await readFile(output, 'utf8');
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export interface SyncMcdocOptions {
  ref: string;
  out: string;
  fromGenerated: boolean;
  log?: (message: string) => void;
}

export async function syncMcdoc(options: SyncMcdocOptions): Promise<McdocSource> {
  const log = options.log ?? (() => {});
  if (!/^[0-9a-f]{40}$/.test(options.ref)) {
    throw new Error(`--ref must be a 40-character lower-case commit sha, got ${options.ref}`);
  }
  const cli = await locateMcdocCli();
  const mode: SyncMode = options.fromGenerated ? 'generated' : 'build';

  let text: string;
  if (mode === 'build') {
    text = await buildSymbols(options.ref, cli.entry, log);
  } else {
    log(`downloading symbols.json from the ${GENERATED_BRANCH} branch`);
    text = (await fetchGitHubFile(REPOSITORY, GENERATED_BRANCH, 'symbols.json', log)).text;
  }

  const symbols = parseJsonStrict(text, 'symbols.json');
  const problems = validateSymbols(symbols, options.ref);
  if (problems.length > 0) {
    throw new Error(`invalid ${mode} export:\n  ${problems.join('\n  ')}`);
  }

  log('downloading LICENSE');
  const license = (await fetchGitHubFile(REPOSITORY, options.ref, 'LICENSE', log)).text;

  const source: McdocSource = {
    repository: REPOSITORY_URL,
    ref: options.ref,
    mode,
    tool: `@spyglassmc/mcdoc-cli@${cli.version}`,
    fetchedAt: nowIso(),
  };
  await writeFileAtomic(join(options.out, 'symbols.json'), stringifySorted(symbols));
  await writeFileAtomic(join(options.out, 'LICENSE'), license);
  await writeFileAtomic(join(options.out, 'SOURCE.json'), stringifySorted(source));
  return source;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      ref: { type: 'string' },
      out: { type: 'string' },
      'from-generated': { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (values.ref === undefined || values.out === undefined) {
    throw new Error(
      'usage: node tools/sync-mcdoc/index.ts --ref <sha> --out <dir> [--from-generated]',
    );
  }
  const out = resolve(values.out);
  const source = await syncMcdoc({
    ref: values.ref,
    out,
    fromGenerated: values['from-generated'] === true,
    log: (message) => console.log(`sync-mcdoc: ${message}`),
  });
  console.log(`sync-mcdoc: wrote ${out} (mode ${source.mode}, ref ${source.ref})`);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(`sync-mcdoc: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
