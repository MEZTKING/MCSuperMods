/**
 * `@msm/interop/node`: Node.js adapters for the platform-neutral interop code.
 */

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { normalize } from 'node:path';
import type { InstallDirEntry, InstallEnv, InstallFileSystem } from './minecraft-install/index';

/** Options of {@link createNodeInstallFileSystem}. */
export interface NodeInstallFileSystemOptions {
  /**
   * Give the file system `rename`, so launcher writers build a new instance in a staging folder
   * and move it into place in one step (ADR 0133 D2, B760 N1). Off by default until the app's
   * callers opt in: with it, `createManagedInstance` also stages the test instance, and Play's
   * safety test must then allow the instances folder's `.msm-staging` (B765).
   */
  rename?: boolean;
}

/**
 * An {@link InstallFileSystem} over `node:fs/promises`. Paths built with `joinInstallPath`
 * are normalised to the host's separators with `path.normalize`.
 */
export function createNodeInstallFileSystem(
  options: NodeInstallFileSystemOptions = {},
): InstallFileSystem {
  const fs: InstallFileSystem = {
    async exists(absPath) {
      try {
        await stat(normalize(absPath));
        return true;
      } catch {
        return false;
      }
    },
    async readDir(absPath) {
      const dir = normalize(absPath);
      const entries = await readdir(dir, { withFileTypes: true });
      const result: InstallDirEntry[] = [];
      for (const entry of entries) {
        let isDirectory = entry.isDirectory();
        if (entry.isSymbolicLink()) {
          try {
            isDirectory = (await stat(normalize(`${dir}/${entry.name}`))).isDirectory();
          } catch {
            continue; // Dangling link.
          }
        }
        result.push({ name: entry.name, kind: isDirectory ? 'directory' : 'file' });
      }
      return result;
    },
    async readFile(absPath) {
      const buffer = await readFile(normalize(absPath));
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    },
    async writeFile(absPath, data) {
      await writeFile(normalize(absPath), data);
    },
    async mkdirp(absPath) {
      await mkdir(normalize(absPath), { recursive: true });
    },
    async remove(absPath) {
      await rm(normalize(absPath), { recursive: true, force: true });
    },
    async realpath(absPath) {
      return realpath(normalize(absPath));
    },
  };
  if (options.rename === true) {
    fs.rename = async (fromAbsPath, toAbsPath) => {
      const to = normalize(toAbsPath);
      // POSIX `rename` replaces an empty folder at `to`; the surface promises a refusal.
      let taken = true;
      try {
        await stat(to);
      } catch {
        taken = false;
      }
      if (taken) throw new Error(`EEXIST: ${to} already exists.`);
      await rename(normalize(fromAbsPath), to);
    };
  }
  return fs;
}

/** Lower-case hex SHA-1 of the bytes, for `AssetCacheInfo.jarSha1`. */
export function sha1Hex(bytes: Uint8Array): string {
  return createHash('sha1').update(bytes).digest('hex');
}

/**
 * The current process's platform, home directory, `%APPDATA%`, `$XDG_DATA_HOME` and
 * `$PRISMLAUNCHER_DATA_DIR`.
 */
export function nodeEnv(): InstallEnv {
  return {
    platform: process.platform,
    home: homedir(),
    appData: process.env.APPDATA,
    xdgDataHome: process.env.XDG_DATA_HOME,
    prismDataDirEnv: process.env.PRISMLAUNCHER_DATA_DIR,
  };
}
