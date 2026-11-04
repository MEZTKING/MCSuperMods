/**
 * `@msm/interop/node`: Node.js adapters for the platform-neutral interop code.
 */

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { normalize } from 'node:path';
import type { InstallDirEntry, InstallEnv, InstallFileSystem } from './minecraft-install/index';

/**
 * An {@link InstallFileSystem} over `node:fs/promises`. Paths built with `joinInstallPath`
 * are normalised to the host's separators with `path.normalize`.
 */
export function createNodeInstallFileSystem(): InstallFileSystem {
  return {
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
  };
}

/** Lower-case hex SHA-1 of the bytes, for `AssetCacheInfo.jarSha1`. */
export function sha1Hex(bytes: Uint8Array): string {
  return createHash('sha1').update(bytes).digest('hex');
}

/** The current process's platform, home directory and `%APPDATA%`. */
export function nodeEnv(): InstallEnv {
  return { platform: process.platform, home: homedir(), appData: process.env.APPDATA };
}
