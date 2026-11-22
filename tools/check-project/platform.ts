/**
 * A headless {@link PlatformAdapter} for the project checker: the app's own session runs over
 * it with an in-memory copy of the project, the vendored data of the built-in targets read
 * from disk, the app's mcfunction broker and scripting service (both run in the app's main
 * process), and saves that are kept in memory instead of written. Every service the checker
 * never uses rejects, so an unexpected call shows up as a plain error.
 *
 * @packageDocumentation
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { MemoryFileSystem } from '@msm/core';
import { targetById } from '@msm/targets';
import { createMcfunctionBroker } from '../../app/src/main/platform/mcfunction.ts';
import { createScriptingService } from '../../app/src/main/platform/scripting.ts';
import type { PlatformAdapter } from '../../app/src/shared/platform.ts';

/** The vendored data files a built-in target has. */
type VendoredKeyName = Parameters<PlatformAdapter['targets']['readVendored']>[1];

const unavailable = async (): Promise<never> => {
  throw new Error('Not available in the project checker.');
};

/** A file the session asked to save, kept in memory. */
export interface SavedFile {
  defaultName: string;
  data: Uint8Array;
}

/** Reads one vendored data file of a built-in target. */
export async function readVendored(targetId: string, key: VendoredKeyName): Promise<Uint8Array> {
  const bundle = targetById(targetId);
  if (bundle === undefined) throw new Error(`Unknown target ${targetId}.`);
  const buffer = await readFile(fileURLToPath(bundle.vendored[key]));
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/**
 * The checker's platform over `fs`. `saved` collects what the session's exports would have
 * written (the save dialog answers with a path under `/checker/`).
 *
 * @param fs - The in-memory copy of the project.
 * @param version - The MSM version written into export manifests.
 */
export function checkerPlatform(
  fs: MemoryFileSystem,
  version: string,
): { platform: PlatformAdapter; saved: SavedFile[] } {
  const saved: SavedFile[] = [];
  const platform: PlatformAdapter = {
    app: {
      info: async () => ({ version, electron: 'none', platform: 'check-project' }),
      launchNotice: async () => null,
    },
    dialogs: {
      pickDirectory: async () => null,
      confirmDiscard: async () => true,
      pickFiles: unavailable,
      saveFile: async ({ defaultName, data }) => {
        saved.push({ defaultName, data });
        return `/checker/${defaultName}`;
      },
    },
    shell: { showItemInFolder: unavailable },
    targets: { readVendored },
    settings: { get: unavailable, set: async () => {} },
    minecraft: {
      status: unavailable,
      listLocations: async () => ({ locations: [], selected: null }),
      extract: unavailable,
      readAsset: async () => null,
      listAssets: async () => [],
      readWorldgenFiles: async () => null,
      readDataFiles: async () => null,
      installResourcePack: unavailable,
      listWorlds: async () => [],
      installDataPack: unavailable,
    },
    thumbnails: { get: unavailable },
    mcfunction: createMcfunctionBroker({ readVendored }),
    exports: {
      pickFolder: async () => null,
      writeFiles: unavailable,
      runtimeJar: async () => null,
      geckolibJar: async () => null,
      writeTree: unavailable,
      gradleWrapper: async () => null,
    },
    scripting: createScriptingService(),
    testInMinecraft: {
      status: unavailable,
      createInstance: unavailable,
      run: unavailable,
      runModpack: unavailable,
      pickLauncherProgram: unavailable,
    },
    updates: {
      check: unavailable,
      install: unavailable,
      current: async () => ({ state: 'idle' }),
      onStatus: () => () => {},
    },
    project: {
      openRoot: async () => ({ ok: true }),
      createRoot: async () => ({ ok: true }),
      closeRoot: async () => {},
      currentRoot: async () => null,
      recent: async () => [],
      openRecent: async () => ({ ok: false, reason: 'Not available in the project checker.' }),
      removeRecent: async () => {},
      clearRecent: async () => {},
    },
    fs,
  };
  return { platform, saved };
}
