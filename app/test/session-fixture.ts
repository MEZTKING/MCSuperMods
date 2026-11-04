/**
 * A fake {@link PlatformAdapter} for session tests: an in-memory project file system, the
 * real vendored target data read from disk, and recorders for dialogs and installs.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { MemoryFileSystem } from '@msm/core';
import { builtInTargets, targetById } from '@msm/targets';
import { builtInPlugins } from '../src/renderer/src/plugins/built-in';
import type { McfunctionChecker } from '../src/renderer/src/session/mcfunction-problems';
import {
  ProjectSession,
  type ProjectSessionOptions,
} from '../src/renderer/src/session/project-session';
import type { AppSettingsPatch, GameLocationList, PlatformAdapter } from '../src/shared/platform';
import { stubPlatformServices } from './helpers/stub-platform';

/** What the fake platform recorded. */
export interface PlatformCalls {
  confirms: string[];
  saved: { defaultName: string; data: Uint8Array }[];
  installed: { fileName: string; data: Uint8Array }[];
  vendoredReads: string[];
  /** Every `settings.set` patch, in order. */
  settingsSets: AppSettingsPatch[];
  /** The Minecraft version of every `minecraft.listLocations` call. */
  locationReads: string[];
}

/** Options for {@link fakePlatform}. */
export interface FakePlatformOptions {
  discard?: boolean;
  /** The directory the pick dialog returns. */
  directory?: string;
  /** What the save dialog returns; defaults to `/exports/<defaultName>`. */
  savePath?: string | null;
  /** What `minecraft.listLocations` resolves to; defaults to no locations. */
  locations?: GameLocationList;
}

/** Builds the fake platform over `fs`. */
export function fakePlatform(fs: MemoryFileSystem, options: FakePlatformOptions = {}) {
  const calls: PlatformCalls = {
    confirms: [],
    saved: [],
    installed: [],
    vendoredReads: [],
    settingsSets: [],
    locationReads: [],
  };
  const stubs = stubPlatformServices();
  const directory = options.directory ?? '/projects/demo';
  const platform: PlatformAdapter = {
    ...stubs,
    app: { info: async () => ({ version: '0.1.0-test', electron: '0', platform: 'test' }) },
    dialogs: {
      ...stubs.dialogs,
      pickDirectory: async () => directory,
      confirmDiscard: async (message) => {
        calls.confirms.push(message);
        return options.discard ?? true;
      },
      saveFile: async ({ defaultName, data }) => {
        calls.saved.push({ defaultName, data });
        return options.savePath === undefined ? `/exports/${defaultName}` : options.savePath;
      },
    },
    targets: {
      readVendored: async (targetId, key) => {
        calls.vendoredReads.push(`${targetId}:${key}`);
        const bundle = targetById(targetId);
        if (bundle === undefined) throw new Error(`Unknown target ${targetId}`);
        const buffer = await readFile(fileURLToPath(bundle.vendored[key]));
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      },
    },
    settings: {
      ...stubs.settings,
      set: async (patch) => {
        calls.settingsSets.push(patch);
      },
    },
    minecraft: {
      ...stubs.minecraft,
      listLocations: async (mcVersion) => {
        calls.locationReads.push(mcVersion);
        return options.locations ?? { locations: [], selected: null };
      },
      installResourcePack: async (fileName, data) => {
        calls.installed.push({ fileName, data });
        return { path: `/minecraft/resourcepacks/${fileName}` };
      },
    },
    project: {
      openRoot: async () => ({ ok: true }),
      createRoot: async () => ({ ok: true }),
      closeRoot: async () => {},
      currentRoot: async () => directory,
    },
    fs,
  };
  return { platform, calls };
}

/** A fixed clock for element timestamps. */
export const now = (): string => '2026-01-01T00:00:00.000Z';

/**
 * A session with the built-in plugins and targets over a fake platform. `sessionOptions` adds
 * to (or replaces) the session options, for example an mcfunction checker.
 */
export function newSession(
  fs: MemoryFileSystem,
  options: FakePlatformOptions = {},
  sessionOptions: ProjectSessionOptions = {},
) {
  const { platform, calls } = fakePlatform(fs, options);
  const session = new ProjectSession(platform, {
    plugins: builtInPlugins,
    targets: builtInTargets,
    now,
    ...sessionOptions,
  });
  return { session, calls, platform };
}

/** The id of the default (newest) built-in target. */
export const defaultTarget = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

let nodeChecker: Promise<McfunctionChecker> | null = null;

/**
 * The real offline mcfunction service (Node) for {@link defaultTarget}, as the session's
 * injected checker. Built once per test file; Spyglass is imported lazily so other tests do
 * not load it.
 */
export function nodeMcfunctionChecker(): Promise<McfunctionChecker> {
  nodeChecker ??= (async () => {
    const { createMcfunctionService } = await import('@msm/schemas/mcfunction');
    const bundle = targetById(defaultTarget.id);
    if (bundle === undefined) throw new Error(`Unknown target ${defaultTarget.id}`);
    const read = async (url: URL): Promise<unknown> =>
      JSON.parse(await readFile(fileURLToPath(url), 'utf8')) as unknown;
    const [commands, blocks, registries, mcdocSymbols] = await Promise.all([
      read(bundle.vendored.mcmetaCommands),
      read(bundle.vendored.mcmetaBlocks),
      read(bundle.vendored.mcmetaRegistries),
      read(bundle.vendored.vanillaMcdocSymbols),
    ]);
    const service = await createMcfunctionService(
      { commands, blocks, registries: registries as Record<string, string[]> },
      { mcVersion: defaultTarget.mcVersion, mcdocSymbols },
    );
    return { check: (source, options) => service.check(source, options) };
  })();
  return nodeChecker;
}
