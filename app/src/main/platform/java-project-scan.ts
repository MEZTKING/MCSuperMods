/**
 * The read-only scan of an ejected Java project for its upgrade notes (ADR 0136 D8, brief
 * B822). The user picks the project folder (nothing records where a project was ejected, B810
 * V16); the scan reads only the build files, `msm.export.json` and the JSON and function files
 * under `src/main/resources/data` and `assets`, and counts the `.java` files without reading
 * them. It never writes, never follows a symbolic link, never leaves the picked folder
 * (real-path containment) and stops at its limits, saying so.
 *
 * Main imports no `@msm/*` code at run time (ADR 0007), so the path rules and limits mirror
 * `@msm/exporters`' `isUpgradeScanPath`, `isJavaSourcePath` and `UPGRADE_SCAN_LIMITS`;
 * `test/main-java-project-scan.test.ts` proves they agree.
 *
 * @packageDocumentation
 */

import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, normalize, relative, sep } from 'node:path';
import type { JavaProjectScan } from '@msm/exporters';

/** The scan's limits: files read, bytes per file, characters in all, folder depth. */
export interface ScanLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxDepth: number;
}

/** The scan's limits (as `@msm/exporters`' `UPGRADE_SCAN_LIMITS`). */
export const SCAN_LIMITS: Readonly<ScanLimits> = {
  maxFiles: 8000,
  maxFileBytes: 1024 * 1024,
  maxTotalBytes: 32 * 1024 * 1024,
  maxDepth: 24,
};

/** The build files the scan reads (as `@msm/exporters`' `UPGRADE_BUILD_FILES`). */
const BUILD_FILES: ReadonlySet<string> = new Set([
  'gradle.properties',
  'build.gradle.kts',
  'settings.gradle.kts',
  'gradle/wrapper/gradle-wrapper.properties',
  'src/main/resources/fabric.mod.json',
  'README.md',
  'LICENSE-NOTES.md',
  'msm.export.json',
]);

const RESOURCE_FILE =
  /^src\/main\/resources\/(data|assets)\/[a-z0-9_.-]+\/.+\.(json|mcfunction|mcmeta)$/;

/** Whether the scan reads `path` (as `@msm/exporters`' `isUpgradeScanPath`). */
export function isScannedPath(path: string): boolean {
  return BUILD_FILES.has(path) || RESOURCE_FILE.test(path);
}

/** Whether `path` is a Java source the scan counts (as `isJavaSourcePath`). */
export function isCountedJavaPath(path: string): boolean {
  return path.startsWith('src/') && path.endsWith('.java');
}

/** Folders never entered: build output and tool caches, which hold no source. */
const SKIPPED_FOLDERS: ReadonlySet<string> = new Set([
  '.git',
  '.gradle',
  '.idea',
  '.vscode',
  'build',
  'out',
  'run',
  'node_modules',
]);

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel) && !rel.startsWith(sep));
}

/** Reads at most `limit` bytes of a file; `null` when it is larger. */
async function readSmall(path: string, limit: number): Promise<string | null> {
  const handle = await open(path, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > limit) return null;
    const buffer = Buffer.alloc(info.size);
    let read = 0;
    while (read < info.size) {
      const { bytesRead } = await handle.read(buffer, read, info.size - read, read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    return buffer.subarray(0, read).toString('utf8');
  } finally {
    await handle.close();
  }
}

/**
 * Scans `folder` read-only.
 *
 * @throws Error When `folder` is not an absolute path to a folder.
 */
export async function scanJavaProjectFolder(
  folder: string,
  limits: Readonly<ScanLimits> = SCAN_LIMITS,
): Promise<JavaProjectScan> {
  if (!isAbsolute(folder)) throw new Error('The project folder must be absolute.');
  const root = await realpath(normalize(folder));
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory()) throw new Error(`${folder} is not a folder.`);
  const files: { path: string; text: string }[] = [];
  let javaFiles = 0;
  let total = 0;
  let truncated = false;
  const walk = async (at: string, depth: number): Promise<void> => {
    if (truncated) return;
    if (depth > limits.maxDepth) {
      truncated = true;
      return;
    }
    const entries = await readdir(join(root, ...at.split('/').filter((part) => part !== '')), {
      withFileTypes: true,
    });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (truncated) return;
      const path = at === '' ? entry.name : `${at}/${entry.name}`;
      // Symbolic links and anything not a plain file or folder are never followed.
      if (entry.isDirectory()) {
        if (SKIPPED_FOLDERS.has(entry.name)) continue;
        await walk(path, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isCountedJavaPath(path)) {
        javaFiles++;
        continue;
      }
      if (!isScannedPath(path)) continue;
      if (files.length >= limits.maxFiles) {
        truncated = true;
        return;
      }
      const absolute = join(root, ...path.split('/'));
      if (!isInside(root, await realpath(absolute))) continue;
      const text = await readSmall(absolute, limits.maxFileBytes);
      if (text === null) continue;
      total += text.length;
      if (total > limits.maxTotalBytes) {
        truncated = true;
        return;
      }
      files.push({ path, text });
    }
  };
  await walk('', 0);
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { folder: root, files, javaFiles, ...(truncated ? { truncated: true } : {}) };
}

/** The main-process service: a folder picker, then the scan. */
export interface JavaProjectScanService {
  /** Shows a folder picker titled `title` and scans the chosen folder; `null` when cancelled. */
  scan(title: string): Promise<JavaProjectScan | null>;
}

/** Creates the service over a native folder picker. */
export function createJavaProjectScanService(deps: {
  pickFolder(opts: { title: string }): Promise<string | null>;
}): JavaProjectScanService {
  return {
    async scan(title) {
      const folder = await deps.pickFolder({ title });
      if (folder === null) return null;
      return scanJavaProjectFolder(folder);
    },
  };
}
