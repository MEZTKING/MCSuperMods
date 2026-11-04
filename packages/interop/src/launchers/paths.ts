/**
 * Platform-neutral path helpers for launcher roots. Paths may use `/` or `\` and may be
 * POSIX (`/home/alex`), drive-letter (`C:\Users`) or UNC (`\\server\share`) paths.
 */

/** Whether the path is absolute: POSIX `/…`, drive-letter `C:\…` or `C:/…`, or UNC `\\…`. */
export function isAbsoluteInstallPath(path: string): boolean {
  return /^\//.test(path) || /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\]/.test(path);
}

/** Whether the path looks like a Windows path (drive letter or UNC), compared case-insensitively. */
function isWindowsPath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || /^[\\/]{2}[^\\/]/.test(path);
}

/**
 * A comparison key for a path: separators turned into `/`, `.` and `..` resolved, repeated
 * and trailing separators dropped, and Windows paths lower-cased. Use it to deduplicate roots
 * and to compare a stored {@link GameLocationRef} against discovered locations; never as a
 * path to open.
 */
export function locationPathKey(path: string): string {
  const windows = isWindowsPath(path);
  const slashed = path.replace(/\\/g, '/');
  let prefix = '';
  let rest = slashed;
  if (/^\/\/[^/]/.test(slashed)) {
    prefix = '//';
    rest = slashed.slice(2);
  } else if (/^[A-Za-z]:\//.test(slashed)) {
    prefix = `${slashed.slice(0, 2)}/`;
    rest = slashed.slice(3);
  } else if (slashed.startsWith('/')) {
    prefix = '/';
    rest = slashed.slice(1);
  }
  const segments: string[] = [];
  for (const segment of rest.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length > 0 && segments[segments.length - 1] !== '..') segments.pop();
      else if (prefix === '') segments.push('..');
      continue;
    }
    segments.push(segment);
  }
  const key = `${prefix}${segments.join('/')}`;
  return windows ? key.toLowerCase() : key;
}

/** Whether `child` lies strictly inside `parent` (both compared by {@link locationPathKey}). */
export function isPathInside(parent: string, child: string): boolean {
  const parentKey = locationPathKey(parent);
  const childKey = locationPathKey(child);
  if (childKey === parentKey) return false;
  const base = parentKey.endsWith('/') ? parentKey : `${parentKey}/`;
  return childKey.startsWith(base);
}

/** Whether `name` is one safe path segment: no separators, NUL or `:`, not `.` or `..`. */
export function isSafeSegment(name: string): boolean {
  return (
    name.length > 0 && name.length <= 255 && !/[/\\\0:]/.test(name) && name !== '.' && name !== '..'
  );
}
