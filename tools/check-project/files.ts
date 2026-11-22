/**
 * The file rules of the project checker: which files a shared project folder may hold, how big
 * they may be, and the conservative rule against files that look like Mojang's own assets.
 * Pure functions over a list of files, so they are tested without a session.
 *
 * @packageDocumentation
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** One file of a project folder, by its path relative to the folder (POSIX separators). */
export interface FolderFile {
  path: string;
  bytes: Uint8Array;
}

/** A file the checker refuses, with the reason in plain words. */
export interface FileProblem {
  path: string;
  message: string;
}

/** The largest single file, except sounds (2 MiB). */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** The largest sound file (`.ogg`, 8 MiB: a music disc song of a few minutes). */
export const MAX_SOUND_BYTES = 8 * 1024 * 1024;
/** The largest whole project folder (25 MiB). */
export const MAX_FOLDER_BYTES = 25 * 1024 * 1024;

/** Files a shared folder may hold next to the project, at its top level. */
export const SHARING_FILES: ReadonlySet<string> = new Set([
  'README.md',
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'picture.png',
]);

/** The project file. */
export const PROJECT_FILE = 'msm.project.json';

/** The file endings MSM reads under `assets/<namespace>/` (as `mediaTypeForPath` knows them). */
export const ASSET_ENDINGS: readonly string[] = [
  '.png',
  '.ogg',
  '.json',
  '.mcmeta',
  '.nbt',
  '.bbmodel',
];

/** Asset endings whose bytes go into the packs and the jar as they are (checked for use). */
export const COPIED_ENDINGS: readonly string[] = ['.png', '.ogg'];

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const OGG_SIGNATURE = [0x4f, 0x67, 0x67, 0x53];

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  signature.every((byte, index) => bytes[index] === byte);

const mib = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;

/** Whether a path, or any folder on it, is hidden (starts with `.`); the loader skips those. */
export function isHidden(path: string): boolean {
  return path.split('/').some((part) => part.startsWith('.'));
}

/**
 * Every file under `root`, recursively, sorted by path. Hidden files and folders are listed
 * too (the size cap counts them); `node_modules` is not entered.
 */
export async function readFolder(root: string, prefix = ''): Promise<FolderFile[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const out: FolderFile[] = [];
  for (const entry of entries) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...(await readFolder(root, path)));
    } else if (entry.isFile()) {
      out.push({ path, bytes: new Uint8Array(await readFile(join(root, path))) });
    }
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * The files of a folder the checker refuses before it opens the project:
 *
 * - no `msm.project.json` at the top;
 * - a file at the top that is neither part of the project nor one of {@link SHARING_FILES};
 * - under `content/`, anything but `.json` element files;
 * - under `assets/<namespace>/`, anything MSM does not read ({@link ASSET_ENDINGS});
 * - any file under `assets/minecraft/`: a project keeps its pictures and sounds in its own
 *   namespace and points vanilla files at them, so a file under Minecraft's own name is most
 *   likely copied from the game;
 * - a `.png` that is not a PNG or an `.ogg` that is not an Ogg file;
 * - a file over {@link MAX_FILE_BYTES} ({@link MAX_SOUND_BYTES} for `.ogg`), or a folder over
 *   {@link MAX_FOLDER_BYTES}.
 *
 * Hidden files and folders (such as the app's `.msm/`) are skipped as the loader skips them,
 * but count towards the size cap.
 */
export function fileProblems(files: readonly FolderFile[]): FileProblem[] {
  const problems: FileProblem[] = [];
  let total = 0;
  if (!files.some((file) => file.path === PROJECT_FILE)) {
    problems.push({
      path: PROJECT_FILE,
      message: `There is no ${PROJECT_FILE} here, so this is not an MSM project folder. Copy the whole project folder (the one with ${PROJECT_FILE} in it).`,
    });
  }
  for (const { path, bytes } of files) {
    total += bytes.length;
    const lower = path.toLowerCase();
    const isSound = lower.endsWith('.ogg');
    const cap = isSound ? MAX_SOUND_BYTES : MAX_FILE_BYTES;
    if (bytes.length > cap) {
      problems.push({
        path,
        message: `This file is ${mib(bytes.length)}; the most a ${isSound ? 'sound' : 'file'} may be is ${mib(cap)}.`,
      });
    }
    if (isHidden(path)) continue;
    const parts = path.split('/');
    const top = parts[0] ?? '';
    if (parts.length === 1) {
      if (path !== PROJECT_FILE && !SHARING_FILES.has(path)) {
        problems.push({
          path,
          message: `This file is not part of an MSM project. Only ${PROJECT_FILE}, content/, assets/ and ${[...SHARING_FILES].join(', ')} belong at the top of the folder.`,
        });
      }
      continue;
    }
    if (top === 'content') {
      if (!lower.endsWith('.json')) {
        problems.push({
          path,
          message: 'Only .json element files belong under content/. Remove this file.',
        });
      }
      continue;
    }
    if (top !== 'assets') {
      problems.push({
        path,
        message: `The folder ${top}/ is not part of an MSM project. Only content/ and assets/ belong in it.`,
      });
      continue;
    }
    if (parts[1] === 'minecraft') {
      problems.push({
        path,
        message:
          "This file is under Minecraft's own name (assets/minecraft/), where files copied from the game land. Mojang's pictures and sounds may not be shared. Keep your own pictures and sounds in your project's namespace and point the vanilla model, particle or sound at them.",
      });
      continue;
    }
    if (!ASSET_ENDINGS.some((ending) => lower.endsWith(ending))) {
      problems.push({
        path,
        message: `MSM does not use this kind of file. Assets may only be ${ASSET_ENDINGS.join(', ')} files.`,
      });
      continue;
    }
    if (lower.endsWith('.png') && !startsWith(bytes, PNG_SIGNATURE)) {
      problems.push({ path, message: 'This file is named .png but is not a PNG picture.' });
    }
    if (isSound && !startsWith(bytes, OGG_SIGNATURE)) {
      problems.push({ path, message: 'This file is named .ogg but is not an Ogg Vorbis sound.' });
    }
  }
  if (total > MAX_FOLDER_BYTES) {
    problems.push({
      path: '.',
      message: `The whole folder is ${mib(total)}; the most a shared project may be is ${mib(MAX_FOLDER_BYTES)}.`,
    });
  }
  return problems;
}

/** The files the loader reads: the project file, `content/` and `assets/`, none hidden. */
export function projectFiles(files: readonly FolderFile[]): FolderFile[] {
  return files.filter(
    (file) =>
      !isHidden(file.path) &&
      (file.path === PROJECT_FILE ||
        file.path.startsWith('content/') ||
        file.path.startsWith('assets/')),
  );
}
