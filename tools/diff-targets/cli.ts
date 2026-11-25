/**
 * The command line of `diff-targets`: arguments, writing the files, `--check`.
 *
 * Exit codes: 0 done (or up to date), 1 `--check` found a file that differs from a fresh run,
 * 2 bad arguments or unreadable folders.
 *
 * @packageDocumentation
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { writeFileAtomic } from '../shared/download.ts';
import {
  additionsText,
  changeSetText,
  diffTargets,
  type McdocMode,
  readTarget,
  type TargetDiff,
} from './diff.ts';
import { draftText } from './draft.ts';

/** Parsed arguments. */
export interface CliArgs {
  from: string;
  to: string;
  out?: string;
  draft?: string;
  check: boolean;
  mcdoc?: McdocMode;
}

export const USAGE =
  'Usage: node tools/diff-targets/index.ts --from <target folder> --to <target folder> ' +
  '[--out <file.json>] [--draft <CHANGES-draft.md>] [--check] [--mcdoc gated|refs]';

/** Parses the arguments; throws an error carrying the usage line. */
export function parseArgs(argv: readonly string[]): CliArgs {
  const values = new Map<string, string>();
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--check') {
      check = true;
      continue;
    }
    const name = arg.startsWith('--') ? arg.slice(2).split('=')[0] : undefined;
    if (name === undefined || !['from', 'to', 'out', 'draft', 'mcdoc'].includes(name)) {
      throw new Error(`Unknown argument ${arg}.\n${USAGE}`);
    }
    const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
    if (value === undefined || value === '') throw new Error(`--${name} needs a value.\n${USAGE}`);
    values.set(name, value);
  }
  const from = values.get('from');
  const to = values.get('to');
  if (from === undefined || to === undefined) {
    throw new Error(`Name both target folders.\n${USAGE}`);
  }
  const mcdoc = values.get('mcdoc');
  if (mcdoc !== undefined && mcdoc !== 'gated' && mcdoc !== 'refs') {
    throw new Error(`--mcdoc is gated or refs.\n${USAGE}`);
  }
  if (check && values.get('out') === undefined && values.get('draft') === undefined) {
    throw new Error(`--check needs --out or --draft to compare.\n${USAGE}`);
  }
  return {
    from,
    to,
    check,
    ...(values.has('out') ? { out: values.get('out') as string } : {}),
    ...(values.has('draft') ? { draft: values.get('draft') as string } : {}),
    ...(mcdoc === undefined ? {} : { mcdoc }),
  };
}

/** The additions file beside a change set file: `generated.json` gives `generated.additions.json`. */
export function additionsPath(out: string): string {
  return out.endsWith('.json') ? `${out.slice(0, -5)}.additions.json` : `${out}.additions.json`;
}

/** The files a run writes, by path. */
export function outputs(args: CliArgs, diff: TargetDiff): Map<string, string> {
  const files = new Map<string, string>();
  if (args.out !== undefined) {
    files.set(resolve(args.out), changeSetText(diff));
    files.set(resolve(additionsPath(args.out)), additionsText(diff));
  }
  if (args.draft !== undefined) files.set(resolve(args.draft), draftText(diff));
  return files;
}

async function readOrUndefined(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

/** Runs the tool; returns the exit code. */
export async function main(
  argv: readonly string[],
  log: (line: string) => void = console.log,
): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    log((error as Error).message);
    return 2;
  }
  let diff: TargetDiff;
  try {
    const before = await readTarget(resolve(args.from));
    const after = await readTarget(resolve(args.to));
    diff = diffTargets(before, after, args.mcdoc === undefined ? {} : { mcdoc: args.mcdoc });
  } catch (error) {
    log(`Could not diff the targets: ${(error as Error).message}`);
    return 2;
  }
  const files = outputs(args, diff);
  if (args.check) {
    let stale = 0;
    for (const [path, text] of files) {
      if ((await readOrUndefined(path)) !== text) {
        log(`out of date: ${path}`);
        stale++;
      }
    }
    if (stale > 0) {
      log(`Run without --check to rewrite ${stale === 1 ? 'it' : 'them'}.`);
      return 1;
    }
    log('Up to date.');
    return 0;
  }
  if (files.size === 0) {
    process.stdout.write(changeSetText(diff));
    return 0;
  }
  for (const [path, text] of files) await writeFileAtomic(path, text);
  const set = diff.changeSet;
  const added = Object.values(set.additions).reduce((n, x) => n + x, 0);
  log(
    `${set.from} to ${set.to} (formats ${diff.mcdocMode}): ${set.changes.length} changes, ${added} additions.`,
  );
  for (const path of files.keys()) log(`wrote ${path}`);
  return 0;
}
