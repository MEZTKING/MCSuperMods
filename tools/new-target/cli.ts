/**
 * The command line of `new-target`.
 *
 * Exit codes: 0 done (with `--check`: nothing newer upstream), 1 `--check` found a newer
 * version, or a run failed, 2 bad arguments.
 *
 * @packageDocumentation
 */

import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type LoadFacts, runNewTarget } from './make.ts';
import {
  checkLines,
  checkTargets,
  defaultSyncers,
  type FetchText,
  fetchText,
  pinnedTargets,
  readManifest,
  type Syncers,
} from './upstream.ts';

export const USAGE = [
  'Usage:',
  '  node tools/new-target/index.ts --from mc-<a> --version <new> [--mcdoc-ref <sha>] [--dry-run [--out <dir>]]',
  '  node tools/new-target/index.ts --repin mc-<b> --version <new> [--mcdoc-ref <sha>] [--dry-run [--out <dir>]]',
  '  node tools/new-target/index.ts --check',
].join('\n');

/** Parsed arguments. */
export type CliArgs =
  | { kind: 'check' }
  | {
      kind: 'new' | 'repin';
      base: string;
      version: string;
      mcdocRef?: string;
      dryRun: boolean;
      out?: string;
    };

const VALUED = ['from', 'repin', 'version', 'mcdoc-ref', 'out'];

/** Parses the arguments; throws an error carrying the usage line. */
export function parseArgs(argv: readonly string[]): CliArgs {
  const values = new Map<string, string>();
  let check = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--check') {
      check = true;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    const name = arg.startsWith('--') ? arg.slice(2).split('=')[0] : undefined;
    if (name === undefined || !VALUED.includes(name)) {
      throw new Error(`Unknown argument ${arg}.\n${USAGE}`);
    }
    const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
    if (value === undefined || value === '') throw new Error(`--${name} needs a value.\n${USAGE}`);
    values.set(name, value);
  }
  if (check) {
    if (values.size > 0 || dryRun) throw new Error(`--check takes nothing else.\n${USAGE}`);
    return { kind: 'check' };
  }
  const from = values.get('from');
  const repin = values.get('repin');
  const version = values.get('version');
  if ((from === undefined) === (repin === undefined)) {
    throw new Error(`Name one of --from and --repin.\n${USAGE}`);
  }
  if (version === undefined) throw new Error(`Name the new version with --version.\n${USAGE}`);
  const base = (from ?? repin) as string;
  if (!/^mc-[0-9.]+$/.test(base)) throw new Error(`A target is named mc-<version>, got ${base}.`);
  if (values.has('out') && !dryRun) throw new Error(`--out goes with --dry-run.\n${USAGE}`);
  const mcdocRef = values.get('mcdoc-ref');
  if (mcdocRef !== undefined && !/^[0-9a-f]{40}$/.test(mcdocRef)) {
    throw new Error('--mcdoc-ref is a 40-character commit sha.');
  }
  const out = values.get('out');
  return {
    kind: from === undefined ? 'repin' : 'new',
    base,
    version,
    dryRun,
    ...(mcdocRef === undefined ? {} : { mcdocRef }),
    ...(out === undefined ? {} : { out }),
  };
}

/** What `main` reads from outside; every part replaceable in tests. */
export interface CliDeps {
  root: string;
  fetcher: FetchText;
  syncers: Syncers;
  loadFacts?: LoadFacts;
  date?: string;
}

/** The repository root, from this file's place in `tools/new-target/`. */
export const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Runs the tool; returns the exit code. */
export async function main(
  argv: readonly string[],
  log: (line: string) => void = console.log,
  deps: CliDeps = { root: REPOSITORY_ROOT, fetcher: fetchText, syncers: defaultSyncers() },
): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    log((error as Error).message);
    return 2;
  }
  try {
    if (args.kind === 'check') {
      const targets = await pinnedTargets(deps.root);
      const findings = checkTargets(await readManifest(deps.fetcher), targets);
      for (const line of checkLines(targets, findings)) log(line);
      return findings.length > 0 ? 1 : 0;
    }
    const out = args.dryRun
      ? resolve(args.out ?? join(tmpdir(), `msm-new-target-${Date.now().toString(36)}`))
      : undefined;
    const result = await runNewTarget({
      root: deps.root,
      mode: args.kind,
      base: args.base,
      version: args.version,
      syncers: deps.syncers,
      fetcher: deps.fetcher,
      log,
      ...(args.mcdocRef === undefined ? {} : { mcdocRef: args.mcdocRef }),
      ...(out === undefined ? {} : { dryRunOut: out }),
      ...(deps.loadFacts === undefined ? {} : { loadFacts: deps.loadFacts }),
      ...(deps.date === undefined ? {} : { date: deps.date }),
    });
    const changed = result.facts.filter((f) => f.state === 'changed').length;
    log(
      `${result.id}: ${changed} derived facts changed; ${result.written.length} paths written in ${result.folder}.`,
    );
    return 0;
  } catch (error) {
    log(`new-target: ${(error as Error).message}`);
    return 1;
  }
}
