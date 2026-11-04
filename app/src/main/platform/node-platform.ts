/**
 * The main-process {@link PlatformAdapter}: holds the current project root and serves a file
 * system scoped to it. Electron-specific services (dialogs, app info) are injected so this
 * module stays testable under plain Node.
 *
 * @packageDocumentation
 */

import { mkdir, readdir, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { ProjectFileSystem } from '@msm/core';
import type { PlatformAdapter, RootResult } from '../../shared/platform';
import { createScopedFileSystem } from './scoped-fs';

/** The project file name; mirrors `PROJECT_FILE` in `@msm/core`. */
export const PROJECT_FILE = 'msm.project.json';

/** Electron services the platform needs. */
export interface NodePlatformDeps {
  info: PlatformAdapter['app']['info'];
  dialogs: PlatformAdapter['dialogs'];
}

async function statOrNull(path: string): Promise<Awaited<ReturnType<typeof stat>> | null> {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

/**
 * Creates the main-process platform.
 *
 * @param deps - Dialogs and app information supplied by Electron.
 */
export function createNodePlatform(deps: NodePlatformDeps): PlatformAdapter {
  let currentRoot: string | null = null;
  let scoped: ProjectFileSystem | null = null;

  const open = (path: string): RootResult => {
    currentRoot = path;
    scoped = createScopedFileSystem(path);
    return { ok: true };
  };

  const active = (): ProjectFileSystem => {
    if (scoped === null) throw new Error('No project is open.');
    return scoped;
  };

  const fs: ProjectFileSystem = {
    readFile: async (path) => active().readFile(path),
    writeFile: async (path, data) => active().writeFile(path, data),
    readDir: async (path) => active().readDir(path),
    exists: async (path) => active().exists(path),
    mkdirp: async (path) => active().mkdirp(path),
    remove: async (path) => active().remove(path),
  };

  return {
    app: { info: deps.info },
    dialogs: deps.dialogs,
    project: {
      async openRoot(path) {
        if (!isAbsolute(path)) return { ok: false, reason: 'The project path must be absolute.' };
        const info = await statOrNull(path);
        if (info === null || !info.isDirectory()) {
          return { ok: false, reason: `${path} is not a directory.` };
        }
        const file = await statOrNull(join(path, PROJECT_FILE));
        if (file === null || !file.isFile()) {
          return { ok: false, reason: `${path} does not contain ${PROJECT_FILE}.` };
        }
        return open(path);
      },
      async createRoot(path) {
        if (!isAbsolute(path)) return { ok: false, reason: 'The project path must be absolute.' };
        const info = await statOrNull(path);
        if (info !== null) {
          if (!info.isDirectory()) return { ok: false, reason: `${path} is not a directory.` };
          if ((await readdir(path)).length > 0) {
            return { ok: false, reason: `${path} is not empty.` };
          }
        } else {
          await mkdir(path, { recursive: true });
        }
        return open(path);
      },
      async closeRoot() {
        currentRoot = null;
        scoped = null;
      },
      async currentRoot() {
        return currentRoot;
      },
    },
    fs,
  };
}
