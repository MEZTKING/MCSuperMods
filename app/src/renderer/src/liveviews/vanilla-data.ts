/**
 * The live views' reader of vanilla data files (ADR 0120 D11): by registry folder (`loot_table`,
 * `advancement`, `tags/item`, ...) and id, over `platform.minecraft.readDataFiles`, the bulk read
 * by folder of the user's own jar cache. A folder is asked once per reader and kept; several
 * folders asked together go in one call. Without the Minecraft folder set up every call answers
 * `not_set_up` (and the next call asks again, so a cache made meanwhile is seen).
 *
 * The files come from the user's client jar and stay in the local cache: a view reads them to
 * draw, and nothing here writes them anywhere (no export, no project file, no AI helper context;
 * `app/test/live-views-vanilla-cache.test.ts` checks).
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';
import type { VanillaDataFiles } from '../../../shared/platform';

/** One folder's vanilla files: id (`minecraft:<path below the folder>`) to JSON. */
export type VanillaFolderFiles = Readonly<Record<string, Json>>;

/** The answer of {@link VanillaDataReader.folders}. */
export type VanillaFoldersAnswer =
  | {
      readonly status: 'ready';
      /** The installed version the cache came from. */
      readonly version: string;
      /** Every asked folder (a folder the jar has no files in is empty). */
      readonly folders: Readonly<Record<string, VanillaFolderFiles>>;
    }
  | { readonly status: 'not_set_up' };

/** The answer of {@link VanillaDataReader.folder}. */
export type VanillaFolderAnswer =
  | { readonly status: 'ready'; readonly version: string; readonly files: VanillaFolderFiles }
  | { readonly status: 'not_set_up' };

/** The answer of {@link VanillaDataReader.file}. */
export type VanillaFileAnswer =
  | { readonly status: 'ready'; readonly id: string; readonly json: Json }
  /** The cache is set up and the jar has no such file. */
  | { readonly status: 'missing'; readonly id: string }
  | { readonly status: 'not_set_up' };

/** A synchronous view of loaded folders, the shape of `@msm/sim`'s `DataLookup`. */
export type VanillaLookup = (folder: string, id: string) => Json | undefined;

/** The answer of {@link VanillaDataReader.lookup}. */
export type VanillaLookupAnswer =
  | { readonly status: 'ready'; readonly version: string; readonly lookup: VanillaLookup }
  | { readonly status: 'not_set_up' };

/** Reads vanilla data files by folder and id; see the module comment. */
export interface VanillaDataReader {
  /** The Minecraft version read, or `null` for the reader that is never set up. */
  readonly mcVersion: string | null;
  /** Every file of the folders, in one call for those not read yet. */
  folders(folders: readonly string[]): Promise<VanillaFoldersAnswer>;
  /** Every file of one folder. */
  folder(folder: string): Promise<VanillaFolderAnswer>;
  /** One file by folder and id (`stone` means `minecraft:stone`; a leading `#` is dropped). */
  file(folder: string, id: string): Promise<VanillaFileAnswer>;
  /**
   * Loads the folders and answers a synchronous lookup over them, for an evaluator's
   * `EvalContext.lookup`. A folder not loaded answers `undefined`.
   */
  lookup(folders: readonly string[]): Promise<VanillaLookupAnswer>;
  /** Drops what was read (after the Minecraft folder changed). */
  forget(): void;
}

/** Reads some folders of a version's cache: `platform.minecraft.readDataFiles`. */
export type ReadVanillaDataFiles = (
  mcVersion: string,
  folders: readonly string[],
) => Promise<VanillaDataFiles | null>;

/** Options of {@link createVanillaDataReader}. */
export interface VanillaDataReaderOptions {
  /** The project's Minecraft version (the target's `mcVersion`). */
  readonly mcVersion: string;
  /** Default: the preload bridge's `minecraft.readDataFiles` (`window.msm`). */
  readonly read?: ReadVanillaDataFiles;
}

/** A folder key: lower case, digits, `_` and `/` between parts (as main and interop check). */
const FOLDER_KEY = /^[a-z0-9_]+(?:\/[a-z0-9_]+)*$/;

/** The id a file is keyed by: `minecraft:` added when there is no namespace, a `#` dropped. */
export function vanillaFileId(id: string): string {
  const bare = id.startsWith('#') ? id.slice(1) : id;
  return bare.includes(':') ? bare : `minecraft:${bare}`;
}

/**
 * Reads through the preload bridge. `window.msm` is read here rather than through the session's
 * `bridge()`, so no file under `liveviews/` imports from the session (B601's rule).
 */
const readThroughBridge: ReadVanillaDataFiles = (version, folders) => {
  const msm = (window as Partial<Window>).msm;
  if (msm === undefined) return Promise.reject(new Error('The MSM preload bridge is missing.'));
  return msm.minecraft.readDataFiles(version, folders);
};

const NOT_SET_UP = Object.freeze({ status: 'not_set_up' as const });

/** The reader without a Minecraft folder: every call answers `not_set_up`, nothing is asked. */
export const NOT_SET_UP_VANILLA_DATA: VanillaDataReader = Object.freeze({
  mcVersion: null,
  folders: async () => NOT_SET_UP,
  folder: async () => NOT_SET_UP,
  file: async () => NOT_SET_UP,
  lookup: async () => NOT_SET_UP,
  forget: () => {},
});

interface Loaded {
  readonly version: string;
  readonly files: VanillaFolderFiles;
}

/** A reader of one version's cache; see the module comment. */
export function createVanillaDataReader(options: VanillaDataReaderOptions): VanillaDataReader {
  const { mcVersion } = options;
  const read: ReadVanillaDataFiles = options.read ?? readThroughBridge;
  /** Folders read or being read; a `null` (not set up) or failed answer is not kept. */
  let pending = new Map<string, Promise<Loaded | null>>();

  const check = (folder: string): void => {
    if (!FOLDER_KEY.test(folder)) {
      throw new Error(`${JSON.stringify(folder)} is not a data folder name.`);
    }
  };

  const load = (folders: readonly string[]): Promise<(Loaded | null)[]> => {
    for (const folder of folders) check(folder);
    const wanted = [...new Set(folders)];
    const missing = wanted.filter((folder) => !pending.has(folder));
    if (missing.length > 0) {
      const generation = pending;
      const ask = read(mcVersion, missing);
      for (const folder of missing) {
        const one = ask.then((answer) =>
          answer === null
            ? null
            : {
                version: answer.version,
                files: (answer.folders[folder] ?? {}) as VanillaFolderFiles,
              },
        );
        generation.set(folder, one);
        // Not set up or failed: ask again next time.
        one.then(
          (loaded) => {
            if (loaded === null && generation.get(folder) === one) generation.delete(folder);
          },
          () => {
            if (generation.get(folder) === one) generation.delete(folder);
          },
        );
      }
    }
    return Promise.all(folders.map((folder) => pending.get(folder) as Promise<Loaded | null>));
  };

  const reader: VanillaDataReader = {
    mcVersion,
    async folders(folders) {
      const loaded = await load(folders);
      if (loaded.some((entry) => entry === null)) return NOT_SET_UP;
      const out: Record<string, VanillaFolderFiles> = {};
      folders.forEach((folder, index) => {
        out[folder] = (loaded[index] as Loaded).files;
      });
      return {
        status: 'ready',
        version: (loaded[0] as Loaded | undefined)?.version ?? '',
        folders: out,
      };
    },
    async folder(folder) {
      const [loaded] = await load([folder]);
      return loaded === null || loaded === undefined
        ? NOT_SET_UP
        : { status: 'ready', version: loaded.version, files: loaded.files };
    },
    async file(folder, id) {
      const [loaded] = await load([folder]);
      if (loaded === null || loaded === undefined) return NOT_SET_UP;
      const key = vanillaFileId(id);
      return Object.hasOwn(loaded.files, key)
        ? { status: 'ready', id: key, json: loaded.files[key] as Json }
        : { status: 'missing', id: key };
    },
    async lookup(folders) {
      const answer = await reader.folders(folders);
      if (answer.status !== 'ready') return NOT_SET_UP;
      const loaded = answer.folders;
      return {
        status: 'ready',
        version: answer.version,
        lookup: (folder, id) => {
          const files = Object.hasOwn(loaded, folder) ? loaded[folder] : undefined;
          const key = vanillaFileId(id);
          return files !== undefined && Object.hasOwn(files, key) ? files[key] : undefined;
        },
      };
    },
    forget() {
      pending = new Map();
    },
  };
  return reader;
}
