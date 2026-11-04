/**
 * The injected file-system interface. Core never touches Node `fs` or the DOM; the host
 * (the Electron app, a test) supplies an implementation scoped to one project directory.
 *
 * @packageDocumentation
 */

/** One entry in a directory listing. */
export interface DirEntry {
  /** The entry's base name. */
  name: string;
  /** Whether the entry is a file or a directory. */
  kind: 'file' | 'directory';
}

/**
 * File access scoped to one project directory.
 *
 * Every path is POSIX and relative to the project root: no leading `/`, no `..`, no `.`
 * segments and no backslashes (see `assertProjectRelativePath`). The project root itself is
 * never addressed; core only reads and writes beneath it.
 */
export interface ProjectFileSystem {
  /** Reads a whole file. Rejects if the file does not exist. */
  readFile(path: string): Promise<Uint8Array>;
  /** Writes a whole file, creating parent directories as needed. */
  writeFile(path: string, data: Uint8Array): Promise<void>;
  /** Lists a directory. Rejects if the directory does not exist. */
  readDir(path: string): Promise<DirEntry[]>;
  /** Whether a file or directory exists at the path. */
  exists(path: string): Promise<boolean>;
  /** Creates a directory and its parents. A no-op if it already exists. */
  mkdirp(path: string): Promise<void>;
  /** Removes a file or directory, recursively. A no-op if nothing exists at the path. */
  remove(path: string): Promise<void>;
}
