/**
 * Staged folders (ADR 0133 D2, B760 N1). A running Prism or MultiMC lists a new instance by
 * watching its instances folder, and only once the new sub-folder holds `instance.cfg`; a
 * folder made first and filled afterwards can be scanned while it is still empty and then not
 * looked at again. So every launcher writer builds the whole folder in
 * `<parent>/.msm-staging/<id>/<name>/` and moves it into `<parent>/<name>` with one rename.
 * The same is used for worlds copied into a game folder's `saves/`.
 *
 * Each `<id>` folder holds the app's marker first, so a later run removes only staging folders
 * the app made (a crash between the build and the rename leaves one behind); anything else in
 * a `.msm-staging` folder is never touched. The staging root has no `instance.cfg` or
 * `level.dat` at its top, so launchers, the game and MSM's own readers skip it.
 */

import { type InstallFileSystem, joinInstallPath } from '../minecraft-install/fs';

/** The staging folder's name inside the folder that receives the finished one. */
export const STAGING_FOLDER = '.msm-staging';

/** The stamp written first into every staging folder the app makes. */
export const STAGING_STAMP = '.msm-managed.json';

const STAGING_ID = /^[A-Za-z0-9-]{1,64}$/;

/** A fresh staging id (a random UUID from Web Crypto, present in Node and Electron). */
export function newStagingId(): string {
  return crypto.randomUUID();
}

/** A {@link InstallFileSystem} that can move a folder into place in one step. */
export type StagingFileSystem = InstallFileSystem & Required<Pick<InstallFileSystem, 'rename'>>;

/**
 * Removes the staging folders an earlier run of the app left in `parent` (those holding the
 * stamp), then the staging root itself when it is empty. Never touches anything else.
 */
export async function clearStaleStaging(fs: InstallFileSystem, parent: string): Promise<void> {
  const root = joinInstallPath(parent, STAGING_FOLDER);
  if (!(await fs.exists(root))) return;
  let entries: Awaited<ReturnType<InstallFileSystem['readDir']>>;
  try {
    entries = await fs.readDir(root);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.kind !== 'directory' || !STAGING_ID.test(entry.name)) continue;
    const dir = joinInstallPath(root, entry.name);
    if (await isStamped(fs, dir)) await fs.remove(dir);
  }
  await removeIfEmpty(fs, root);
}

async function isStamped(fs: InstallFileSystem, dir: string): Promise<boolean> {
  const path = joinInstallPath(dir, STAGING_STAMP);
  if (!(await fs.exists(path))) return false;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(await fs.readFile(path)));
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { generator?: unknown }).generator === 'MCSuperMods' &&
      (parsed as { staging?: unknown }).staging === true
    );
  } catch {
    return false;
  }
}

async function removeIfEmpty(fs: InstallFileSystem, dir: string): Promise<void> {
  try {
    if ((await fs.readDir(dir)).length === 0) await fs.remove(dir);
  } catch {
    // Already gone, or unreadable: left as it is.
  }
}

/** Why {@link buildStaged} did not move the folder into place. */
export class StagingTakenError extends Error {
  readonly target: string;

  constructor(target: string) {
    super(`Something appeared at ${target} while it was being made.`);
    this.target = target;
    this.name = 'StagingTakenError';
  }
}

/**
 * Builds `<parent>/<name>` in a staging folder with `build(stagedDir)` and moves it into place
 * with one rename (`fs.rename` is required). The staging folder is removed afterwards, whether the build succeeded or
 * not. The staging folder is made in `stagingParent` (default `parent`; on the same volume),
 * so a world can be staged outside the game's `saves/` list. Throws {@link StagingTakenError} (and moves nothing) when `<parent>/<name>` exists by
 * the time the build is done; other errors from `build` or the rename pass through.
 *
 * @returns The final folder.
 */
export async function buildStaged(
  fs: InstallFileSystem,
  parent: string,
  name: string,
  build: (stagedDir: string) => Promise<void>,
  stagingId: string = newStagingId(),
  stagingParent: string = parent,
): Promise<string> {
  if (fs.rename === undefined) throw new Error('This file system cannot move folders.');
  if (!STAGING_ID.test(stagingId)) throw new Error(`${stagingId} is not a staging id.`);
  const root = joinInstallPath(stagingParent, STAGING_FOLDER);
  const stagingDir = joinInstallPath(root, stagingId);
  const staged = joinInstallPath(stagingDir, name);
  const target = joinInstallPath(parent, name);
  await fs.mkdirp(stagingDir);
  try {
    // The stamp first, so a crash at any later point leaves a folder the next run removes.
    await fs.writeFile(
      joinInstallPath(stagingDir, STAGING_STAMP),
      new TextEncoder().encode(`${JSON.stringify({ generator: 'MCSuperMods', staging: true })}\n`),
    );
    await fs.mkdirp(staged);
    await build(staged);
    if (await fs.exists(target)) throw new StagingTakenError(target);
    await fs.rename(staged, target);
  } finally {
    await fs.remove(stagingDir);
    await removeIfEmpty(fs, root);
  }
  return target;
}
