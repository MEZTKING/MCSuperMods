/**
 * Project-relative POSIX path helpers. Path validation lives in `@msm/plugin-api` and is
 * re-exported here unchanged.
 *
 * @packageDocumentation
 */

export { assertProjectRelativePath, isProjectRelativePath } from '@msm/plugin-api';

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
