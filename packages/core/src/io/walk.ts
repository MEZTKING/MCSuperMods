/**
 * Recursive directory listing over a {@link ProjectFileSystem}.
 *
 * @packageDocumentation
 */

import type { ProjectFileSystem } from '../fs/project-file-system';

/**
 * Lists every file beneath a directory, recursively, as project-relative paths in sorted
 * order. Entries whose name starts with `.` (such as `.DS_Store`) are skipped. Returns an
 * empty list if the directory does not exist.
 *
 * @param fs - The file system.
 * @param directory - The directory to walk.
 */
export async function walkFiles(fs: ProjectFileSystem, directory: string): Promise<string[]> {
  if (!(await fs.exists(directory))) return [];
  const result: string[] = [];
  const visit = async (path: string): Promise<void> => {
    const entries = await fs.readDir(path);
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const child = `${path}/${entry.name}`;
      if (entry.kind === 'directory') await visit(child);
      else result.push(child);
    }
  };
  await visit(directory);
  return result.sort();
}

/**
 * Lists the immediate subdirectories of a directory, sorted. Returns an empty list if the
 * directory does not exist.
 *
 * @param fs - The file system.
 * @param directory - The directory to list.
 */
export async function listDirectories(fs: ProjectFileSystem, directory: string): Promise<string[]> {
  if (!(await fs.exists(directory))) return [];
  const entries = await fs.readDir(directory);
  return entries
    .filter((entry) => entry.kind === 'directory' && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}
