/**
 * Project-relative POSIX path validation, shared by the host processes and plugins.
 *
 * @packageDocumentation
 */

/**
 * Explains why a path is not project-relative, or returns `undefined` when it is.
 *
 * @param path - The path to check.
 */
function projectRelativePathError(path: string): string | undefined {
  if (path === '') return 'Project path must not be empty.';
  if (path.startsWith('/')) {
    return `Project path ${JSON.stringify(path)} must be relative, not absolute.`;
  }
  if (path.includes('\\')) {
    return `Project path ${JSON.stringify(path)} must use "/" separators.`;
  }
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') {
      return `Project path ${JSON.stringify(path)} must not contain empty, "." or ".." segments.`;
    }
  }
  return undefined;
}

/**
 * Whether a path is a POSIX path relative to the project root.
 *
 * A project-relative path is non-empty, does not start with `/`, contains no backslash, and
 * has no empty, `.` or `..` segment.
 *
 * @example
 * ```ts
 * isProjectRelativePath('content/my_mod/model/ruby.json'); // true
 * isProjectRelativePath('../outside.json'); // false
 * ```
 *
 * @param path - The path to check.
 * @returns `true` when the path is project-relative.
 */
export function isProjectRelativePath(path: string): boolean {
  return projectRelativePathError(path) === undefined;
}

/**
 * Checks that a path is a POSIX path relative to the project root.
 *
 * @param path - The path to check.
 * @throws Error If the path is empty, starts with `/`, contains a backslash, or has an empty,
 *   `.` or `..` segment.
 */
export function assertProjectRelativePath(path: string): void {
  const error = projectRelativePathError(path);
  if (error !== undefined) throw new Error(error);
}
