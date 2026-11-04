/**
 * Project-relative POSIX path helpers.
 *
 * @packageDocumentation
 */

/**
 * Checks that a path is a POSIX path relative to the project root.
 *
 * @param path - The path to check.
 * @throws Error If the path is empty, starts with `/`, contains a backslash, or has an empty,
 *   `.` or `..` segment.
 */
export function assertProjectRelativePath(path: string): void {
  if (path === '') throw new Error('Project path must not be empty.');
  if (path.startsWith('/')) {
    throw new Error(`Project path ${JSON.stringify(path)} must be relative, not absolute.`);
  }
  if (path.includes('\\')) {
    throw new Error(`Project path ${JSON.stringify(path)} must use "/" separators.`);
  }
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new Error(
        `Project path ${JSON.stringify(path)} must not contain empty, "." or ".." segments.`,
      );
    }
  }
}

/**
 * Joins path segments with `/`, skipping empty segments.
 *
 * @param segments - The segments to join.
 */
export function joinPath(...segments: string[]): string {
  return segments.filter((segment) => segment !== '').join('/');
}

/**
 * The parent directory of a path, or `''` for a top-level entry.
 *
 * @param path - A project-relative path.
 */
export function parentPath(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}
