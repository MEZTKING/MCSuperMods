/**
 * The file system surface `minecraft-install/` runs over. The Electron main process injects
 * the Node adapter from `@msm/interop/node`; tests inject an in-memory implementation.
 */

/** One entry of a directory listing. */
export interface InstallDirEntry {
  name: string;
  kind: 'file' | 'directory';
}

/**
 * Asynchronous file system access over absolute paths. Paths are built with
 * {@link joinInstallPath}; the implementation maps them to the host's conventions.
 */
export interface InstallFileSystem {
  /** Whether a file or directory exists at the path. */
  exists(absPath: string): Promise<boolean>;
  /** Lists a directory. Rejects when the directory does not exist. */
  readDir(absPath: string): Promise<InstallDirEntry[]>;
  /** Reads a file. Rejects when the file does not exist. */
  readFile(absPath: string): Promise<Uint8Array>;
  /** Writes a file, replacing any existing one. The parent directory must exist. */
  writeFile(absPath: string, data: Uint8Array): Promise<void>;
  /** Creates a directory and any missing parents. */
  mkdirp(absPath: string): Promise<void>;
  /** Removes a file or directory tree. Succeeds when nothing exists at the path. */
  remove(absPath: string): Promise<void>;
  /**
   * Resolves symbolic links to the canonical absolute path. Rejects when nothing exists at
   * the path. Optional: without it, launcher discovery skips its symlink containment check.
   */
  realpath?(absPath: string): Promise<string>;
}

/**
 * Joins path parts with `/`, dropping empty parts and redundant separators at the joins.
 * The first part keeps its root (`/`, `C:\`, `\\server\share`); backslashes inside it are
 * left as they are, so a Windows `%APPDATA%` value passes through. The Node adapter
 * normalises the result to the host's separators.
 *
 * @example
 * ```ts
 * joinInstallPath('/home/alex', '.minecraft', 'versions'); // '/home/alex/.minecraft/versions'
 * joinInstallPath('C:\\Users\\Alex\\AppData\\Roaming', '.minecraft'); // 'C:\\Users\\Alex\\AppData\\Roaming/.minecraft'
 * ```
 */
export function joinInstallPath(...parts: string[]): string {
  const nonEmpty = parts.filter((part) => part !== '');
  const [first, ...rest] = nonEmpty;
  if (first === undefined) return '';
  // Keep a bare root such as '/' or 'C:\' intact; otherwise drop trailing separators.
  let result = /^(?:[/\\]+|[A-Za-z]:[/\\])$/.test(first) ? first : first.replace(/[/\\]+$/, '');
  for (const part of rest) {
    const tail = part.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '');
    if (tail === '') continue;
    result = /[/\\]$/.test(result) ? `${result}${tail}` : `${result}/${tail}`;
  }
  return result;
}
