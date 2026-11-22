/**
 * The community repository sync: reads MSM's `examples/` mirror, builds the community
 * `examples/` folder ({@link buildExamples}) and writes it (removing files the build no longer
 * makes) or, in check mode, lists what differs. Only `examples/` of the community repository
 * is touched.
 *
 * @packageDocumentation
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExamples, EXAMPLES_DIR, type TreeFile } from './examples.ts';

/** The MSM `examples/` mirror beside this tool. */
export const DEFAULT_MIRROR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'examples',
);

/** Every file under `root`, by POSIX path relative to it, sorted; hidden entries are skipped. */
export async function readTree(root: string, prefix = ''): Promise<TreeFile[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: TreeFile[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await readTree(root, path)));
    else if (entry.isFile()) {
      out.push({ path, bytes: new Uint8Array(await readFile(join(root, path))) });
    }
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

const same = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, index) => byte === b[index]);

/** What differs between the wanted `examples/` and the one in the community repository. */
export interface SyncDiff {
  added: string[];
  changed: string[];
  removed: string[];
}

/** Compares the wanted files with the community repository's `examples/` (paths include it). */
export function diffTrees(wanted: readonly TreeFile[], current: readonly TreeFile[]): SyncDiff {
  const have = new Map(current.map((file) => [file.path, file.bytes]));
  const want = new Set(wanted.map((file) => file.path));
  const added: string[] = [];
  const changed: string[] = [];
  for (const file of wanted) {
    const bytes = have.get(file.path);
    if (bytes === undefined) added.push(file.path);
    else if (!same(bytes, file.bytes)) changed.push(file.path);
  }
  const removed = current.map((file) => file.path).filter((path) => !want.has(path));
  return { added, changed, removed };
}

/**
 * Syncs (or checks) the community repository at `repo` from the mirror at `mirror`.
 *
 * @returns The differences found before writing (all empty when it was up to date).
 */
export async function syncExamples(
  mirror: string,
  repo: string,
  options: { check?: boolean } = {},
): Promise<SyncDiff & { examples: number }> {
  const source = await readTree(mirror);
  if (!source.some((file) => file.path.endsWith('msm.project.json'))) {
    throw new Error(`${mirror} holds no MSM projects; pass the MCSuperMods examples/ folder.`);
  }
  const { files, infos } = buildExamples(source);
  const current = (await readTree(join(repo, EXAMPLES_DIR))).map((file) => ({
    path: `${EXAMPLES_DIR}/${file.path}`,
    bytes: file.bytes,
  }));
  const diff = diffTrees(files, current);
  if (options.check !== true) {
    for (const path of diff.removed) await rm(join(repo, path), { force: true });
    for (const file of files) {
      if (!diff.added.includes(file.path) && !diff.changed.includes(file.path)) continue;
      await mkdir(dirname(join(repo, file.path)), { recursive: true });
      await writeFile(join(repo, file.path), file.bytes);
    }
    await removeEmptyFolders(join(repo, EXAMPLES_DIR));
  }
  return { ...diff, examples: infos.length };
}

/** Removes folders left empty after files were removed; returns whether `dir` is now empty. */
async function removeEmptyFolders(dir: string): Promise<boolean> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  let empty = true;
  for (const entry of entries) {
    if (entry.isDirectory() && (await removeEmptyFolders(join(dir, entry.name)))) {
      await rm(join(dir, entry.name), { recursive: true, force: true });
    } else empty = false;
  }
  return empty;
}

const USAGE =
  'Usage: node tools/community-repo/sync.ts --repo <community repository> [--examples <MSM examples folder>] [--check]';

/** Runs the sync and returns the exit code (0 up to date or written, 1 out of date, 2 usage). */
export async function main(argv: readonly string[]): Promise<number> {
  let repo: string | undefined;
  let mirror = DEFAULT_MIRROR;
  let check = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') check = true;
    else if (arg === '--repo' || arg === '--examples') {
      index += 1;
      const value = argv[index];
      if (value === undefined) {
        console.error(`${arg} needs a folder.\n${USAGE}`);
        return 2;
      }
      if (arg === '--repo') repo = resolve(value);
      else mirror = resolve(value);
    } else {
      console.error(`Unknown argument ${arg}.\n${USAGE}`);
      return 2;
    }
  }
  if (repo === undefined) {
    console.error(`Name the community repository with --repo.\n${USAGE}`);
    return 2;
  }
  const result = await syncExamples(mirror, repo, { check });
  const count = result.added.length + result.changed.length + result.removed.length;
  if (check) {
    if (count === 0) {
      console.log(`The community examples are up to date (${result.examples} examples).`);
      return 0;
    }
    console.error(
      `The community examples are out of date: ${result.added.length} file(s) missing, ${result.changed.length} changed, ${result.removed.length} no longer made. Run node tools/community-repo/sync.ts --repo <community repository> in MCSuperMods and commit the result.`,
    );
    for (const path of result.added.slice(0, 20)) console.error(`  missing: ${path}`);
    for (const path of result.changed.slice(0, 20)) console.error(`  changed: ${path}`);
    for (const path of result.removed.slice(0, 20)) console.error(`  not made any more: ${path}`);
    return 1;
  }
  console.log(
    `Wrote ${result.examples} examples: ${result.added.length} file(s) added, ${result.changed.length} changed, ${result.removed.length} removed.`,
  );
  return 0;
}
