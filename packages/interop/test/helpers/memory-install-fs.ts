/**
 * An in-memory {@link InstallFileSystem} over POSIX-style absolute paths, for tests.
 */

import type { InstallDirEntry, InstallFileSystem } from '../../src/index';

function normalise(path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '' && segment !== '.');
  return `/${segments.join('/')}`;
}

function parentOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index <= 0 ? '/' : path.slice(0, index);
}

export class MemoryInstallFileSystem implements InstallFileSystem {
  readonly files = new Map<string, Uint8Array>();
  readonly dirs = new Set<string>(['/']);
  /** Every write and remove, in order, for asserting write ordering. */
  readonly log: string[] = [];

  /** Adds a file and its parent directories directly, without logging. */
  seed(path: string, data: Uint8Array | string): this {
    const abs = normalise(path);
    this.addDirs(parentOf(abs));
    this.files.set(abs, typeof data === 'string' ? new TextEncoder().encode(data) : data);
    return this;
  }

  private addDirs(path: string): void {
    let current = normalise(path);
    while (!this.dirs.has(current)) {
      this.dirs.add(current);
      current = parentOf(current);
    }
  }

  async exists(absPath: string): Promise<boolean> {
    const abs = normalise(absPath);
    return this.files.has(abs) || this.dirs.has(abs);
  }

  async readDir(absPath: string): Promise<InstallDirEntry[]> {
    const abs = normalise(absPath);
    if (!this.dirs.has(abs)) throw new Error(`ENOENT: ${abs}`);
    const prefix = abs === '/' ? '/' : `${abs}/`;
    const result: InstallDirEntry[] = [];
    for (const dir of this.dirs) {
      if (dir !== abs && dir.startsWith(prefix) && !dir.slice(prefix.length).includes('/')) {
        result.push({ name: dir.slice(prefix.length), kind: 'directory' });
      }
    }
    for (const file of this.files.keys()) {
      if (file.startsWith(prefix) && !file.slice(prefix.length).includes('/')) {
        result.push({ name: file.slice(prefix.length), kind: 'file' });
      }
    }
    return result;
  }

  async readFile(absPath: string): Promise<Uint8Array> {
    const data = this.files.get(normalise(absPath));
    if (data === undefined) throw new Error(`ENOENT: ${absPath}`);
    return data;
  }

  async writeFile(absPath: string, data: Uint8Array): Promise<void> {
    const abs = normalise(absPath);
    if (!this.dirs.has(parentOf(abs))) throw new Error(`ENOENT: parent of ${abs}`);
    this.log.push(`write ${abs}`);
    this.files.set(abs, data);
  }

  async mkdirp(absPath: string): Promise<void> {
    this.addDirs(absPath);
  }

  async remove(absPath: string): Promise<void> {
    const abs = normalise(absPath);
    this.log.push(`remove ${abs}`);
    const prefix = `${abs}/`;
    this.files.delete(abs);
    for (const file of [...this.files.keys()]) if (file.startsWith(prefix)) this.files.delete(file);
    for (const dir of [...this.dirs])
      if (dir === abs || dir.startsWith(prefix)) this.dirs.delete(dir);
    this.dirs.add('/');
  }
}
