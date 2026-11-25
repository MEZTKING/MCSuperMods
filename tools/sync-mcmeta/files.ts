/**
 * The index of Minecraft's own data and resource pack files for one version (ADR 0136 D11,
 * brief B823): every path under `data/` and `assets/` of mcmeta's `<version>-data` and
 * `<version>-assets` tags with the first characters of its git blob hash, read from the tags'
 * trees alone (`git fetch --depth=1 --filter=blob:none`, about a second per tag, B810 V8). No
 * file's contents are fetched or stored: paths and hashes only, so `tools/diff-targets` can say
 * which vanilla files were added, removed, moved or changed between two targets.
 *
 * Structure templates (`data/<namespace>/structure/<path>.nbt`) are left out: every one of them
 * changes with the data version in every release (B810 V8: 1,511 of 1,646 changed data files).
 *
 * Everything read is untrusted data: each path and hash is checked against a strict pattern and
 * nothing is executed.
 *
 * @packageDocumentation
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { GitHubRepository } from '../shared/download.ts';
import { stringifySorted, writeFileAtomic } from '../shared/download.ts';

const run = promisify(execFile);

/** The file the index is written to, beside the summary files. */
export const FILE_INDEX_NAME = 'files.json';

/** The two halves of the index and the mcmeta tag suffix each is read from. */
export const FILE_INDEX_SIDES = ['assets', 'data'] as const;

/** One half of the index: `assets` (resource pack files) or `data` (data pack files). */
export type FileIndexSide = (typeof FILE_INDEX_SIDES)[number];

/** How many hex digits of each blob hash are kept: enough to tell a changed file, and short. */
export const HASH_LENGTH = 12;

/** The paths left out of the index, as patterns (`<name>` is any text) for `files.json`. */
export const LEFT_OUT: readonly string[] = Object.freeze(['data/<namespace>/structure/<path>.nbt']);

/** At least this many files on each side, or the tag is not what it should be. */
export const MIN_FILES_PER_SIDE = 1000;

/** A path the index keeps: lowercase pack paths only, as Minecraft's own files are named. */
const PATH = /^(assets|data)\/[a-z0-9_.-]+(\/[a-z0-9_.-]+)+$/;
const HASH = /^[0-9a-f]{40}$/;
const STRUCTURE = /^data\/[^/]+\/structure\/.+\.nbt$/;

/** One file of a tag's tree: its path from the tag's root and its git blob hash. */
export interface TreeEntry {
  path: string;
  hash: string;
}

/** The written index (`files.json`). */
export interface VanillaFileIndex {
  /** The Minecraft version, as `version.json` `id`. */
  version: string;
  /** The mcmeta tags the two halves were read from. */
  refs: Record<FileIndexSide, string>;
  /** {@link LEFT_OUT}. */
  leftOut: string[];
  /** Every kept path to the first {@link HASH_LENGTH} hex digits of its blob hash. */
  files: Record<string, string>;
}

/** Reads one tag's tree (paths and blob hashes, no contents); injectable for tests. */
export type ReadTree = (
  repository: GitHubRepository,
  tag: string,
  log: (message: string) => void,
) => Promise<TreeEntry[]>;

/** The mcmeta tag one side of a version is read from: `26.3-data`, `26.3-assets`. */
export function fileIndexRef(version: string, side: FileIndexSide): string {
  return `${version}-${side}`;
}

/** Whether a path is left out of the index ({@link LEFT_OUT}). */
export function isLeftOut(path: string): boolean {
  return STRUCTURE.test(path);
}

/**
 * Builds the index from both sides' trees, keeping only paths under the side's own folder
 * (`assets/` from the assets tag, `data/` from the data tag) and leaving out {@link LEFT_OUT}.
 *
 * @returns The index and the problems found; the index is only to be written when there are none.
 */
export function buildFileIndex(
  version: string,
  trees: Readonly<Record<FileIndexSide, readonly TreeEntry[]>>,
): { index: VanillaFileIndex; problems: string[] } {
  const problems: string[] = [];
  const files: Record<string, string> = {};
  for (const side of FILE_INDEX_SIDES) {
    let kept = 0;
    for (const entry of trees[side]) {
      if (!entry.path.startsWith(`${side}/`)) continue;
      if (!PATH.test(entry.path) || entry.path.split('/').includes('..')) {
        problems.push(`files.json: unexpected path ${JSON.stringify(entry.path)}`);
        continue;
      }
      if (!HASH.test(entry.hash)) {
        problems.push(`files.json: unexpected hash for ${entry.path}`);
        continue;
      }
      kept++;
      if (isLeftOut(entry.path)) continue;
      files[entry.path] = entry.hash.slice(0, HASH_LENGTH);
    }
    if (kept < MIN_FILES_PER_SIDE) {
      problems.push(
        `files.json: ${kept} files in ${fileIndexRef(version, side)}, expected at least ${MIN_FILES_PER_SIDE}`,
      );
    }
  }
  return {
    index: {
      version,
      refs: { assets: fileIndexRef(version, 'assets'), data: fileIndexRef(version, 'data') },
      leftOut: [...LEFT_OUT],
      files,
    },
    problems,
  };
}

/** Parses `git ls-tree -r -z` output into blob entries (trees and links are skipped). */
export function parseLsTree(output: string): TreeEntry[] {
  const entries: TreeEntry[] = [];
  for (const record of output.split('\0')) {
    const match = /^\d+ blob ([0-9a-f]+)\t(.+)$/s.exec(record);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      entries.push({ path: match[2], hash: match[1] });
    }
  }
  return entries;
}

/**
 * The real tree reader: a throwaway bare repository in the system's temporary folder, one
 * shallow fetch of the tag without file contents (`--filter=blob:none`), `git ls-tree`, then
 * the folder is removed.
 */
export const gitReadTree: ReadTree = async (repository, tag, log) => {
  if (!/^[A-Za-z0-9_.-]+$/.test(tag)) throw new Error(`unexpected tag ${tag}`);
  const dir = await mkdtemp(join(tmpdir(), 'msm-mcmeta-tree-'));
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  try {
    log(`reading the file tree of ${tag} (no contents)`);
    await run('git', ['init', '-q', '--bare', dir], { env });
    await run(
      'git',
      [
        '-C',
        dir,
        'fetch',
        '-q',
        '--depth=1',
        '--filter=blob:none',
        `https://github.com/${repository}.git`,
        `refs/tags/${tag}:refs/tags/${tag}`,
      ],
      { env },
    );
    const { stdout } = await run('git', ['-C', dir, 'ls-tree', '-r', '-z', `refs/tags/${tag}`], {
      env,
      maxBuffer: 1 << 28,
    });
    return parseLsTree(stdout);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/** Reads both tags of a version and builds the index; throws when it has problems. */
export async function readFileIndex(options: {
  repository: GitHubRepository;
  version: string;
  readTree: ReadTree;
  log: (message: string) => void;
}): Promise<VanillaFileIndex> {
  const trees = {} as Record<FileIndexSide, TreeEntry[]>;
  for (const side of FILE_INDEX_SIDES) {
    trees[side] = await options.readTree(
      options.repository,
      fileIndexRef(options.version, side),
      options.log,
    );
  }
  const { index, problems } = buildFileIndex(options.version, trees);
  if (problems.length > 0) {
    const shown = problems.slice(0, 20);
    if (problems.length > shown.length) shown.push(`and ${problems.length - shown.length} more`);
    throw new Error(`invalid mcmeta file trees:\n  ${shown.join('\n  ')}`);
  }
  return index;
}

/** Writes the index into `<out>/files.json`, sorted, atomically. */
export async function writeFileIndex(out: string, index: VanillaFileIndex): Promise<void> {
  await writeFileAtomic(resolve(out, FILE_INDEX_NAME), stringifySorted(index));
}
