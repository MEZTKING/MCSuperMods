/**
 * A fake {@link PlatformAdapter} for session tests: an in-memory project file system, the
 * real vendored target data read from disk, and recorders for dialogs and installs.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { MemoryFileSystem } from '@msm/core';
import {
  type BundleContext,
  type ContentBundle,
  definePlugin,
  type ElementKind,
  type ExampleProject,
  type Plugin,
  type ProjectStarter,
} from '@msm/plugin-api';
import { placeholderPng } from '@msm/plugin-library';
import { builtInTargets, defaultTargetId, targetById } from '@msm/targets';
import { builtInPlugins } from '../src/renderer/src/plugins/built-in';
import type { McfunctionChecker } from '../src/renderer/src/session/mcfunction-problems';
import {
  ProjectSession,
  type ProjectSessionOptions,
} from '../src/renderer/src/session/project-session';
import type {
  AppSettingsPatch,
  GameLocationList,
  PlatformAdapter,
  RecentProjectView,
} from '../src/shared/platform';
import { stubPlatformServices } from './helpers/stub-platform';

/** What the fake platform recorded. */
export interface PlatformCalls {
  confirms: string[];
  /** Every `dialogs.pickDirectory` request, in order. */
  pickDirectory: Parameters<PlatformAdapter['dialogs']['pickDirectory']>[0][];
  saved: { defaultName: string; data: Uint8Array }[];
  installed: { fileName: string; data: Uint8Array }[];
  vendoredReads: string[];
  /** Every `settings.set` patch, in order. */
  settingsSets: AppSettingsPatch[];
  /** The Minecraft version of every `minecraft.listLocations` call. */
  locationReads: string[];
  /** The root of every `project.openRecent` call. */
  openRecent: string[];
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
  /**
   * The recent projects `project.recent` returns; `project.openRecent` accepts only these
   * roots, as main does. Defaults to none.
   */
  recent?: RecentProjectView[];
}

/** Builds the fake platform over `fs`. */
export function fakePlatform(fs: MemoryFileSystem, options: FakePlatformOptions = {}) {
  const calls: PlatformCalls = {
    confirms: [],
    pickDirectory: [],
    saved: [],
    installed: [],
    vendoredReads: [],
    settingsSets: [],
    locationReads: [],
    openRecent: [],
  };
  const recent = options.recent ?? [];
  const stubs = stubPlatformServices();
  const directory = options.directory ?? '/projects/demo';
  const platform: PlatformAdapter = {
    ...stubs,
    app: {
      info: async () => ({ version: '0.1.0-test', electron: '0', platform: 'test' }),
      launchNotice: async () => null,
    },
    dialogs: {
      ...stubs.dialogs,
      pickDirectory: async (opts) => {
        calls.pickDirectory.push(opts);
        return directory;
      },
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
      recent: async () => recent.map((entry) => ({ ...entry })),
      openRecent: async (root) => {
        calls.openRecent.push(root);
        return recent.some((entry) => entry.root === root)
          ? { ok: true }
          : { ok: false, reason: `${root} is not in the recent projects list.` };
      },
      removeRecent: async (root) => {
        const index = recent.findIndex((entry) => entry.root === root);
        if (index !== -1) recent.splice(index, 1);
      },
      clearRecent: async () => {
        recent.splice(0);
      },
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

/** The default built-in target for new projects (the newest `release` target, ADR 0037). */
export const defaultTarget = (targetById(defaultTargetId) as (typeof builtInTargets)[number])
  .target;

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

// Library fakes (ADR 0020) -----------------------------------------------------------------

/** A starter bundle spanning both layers, two namespaces and one generated texture. */
function starterBundle({ namespace }: BundleContext): ContentBundle {
  return {
    elements: [
      {
        id: `${namespace}:item/ruby`,
        kind: 'minecraft:model',
        data: {
          parent: 'minecraft:item/generated',
          textures: { layer0: `${namespace}:item/ruby` },
        },
        notes: 'A flat item model drawn from the generated ruby texture.',
        tags: ['example', 'models'],
      },
      { id: `${namespace}:greet`, kind: 'minecraft:function', data: { lines: ['say Hello'] } },
      {
        id: 'minecraft:load',
        kind: 'minecraft:tag/function',
        data: { values: [`${namespace}:greet`] },
      },
    ],
    assets: [{ namespace, path: 'textures/item/ruby.png', bytes: placeholderPng('gem') }],
  };
}

/** A fake starter: an item model with its texture, a function and the load tag. */
export const fakeStarter: ProjectStarter = {
  id: 'test_starter',
  title: 'Test starter',
  description: 'A model, a texture, a function and the load tag.',
  category: 'content',
  layers: ['resourcepack', 'datapack'],
  requiresKinds: ['minecraft:model', 'minecraft:function', 'minecraft:tag/function'],
  build: starterBundle,
};

/** A fake example: a block model on a generated ore texture. */
export const fakeExample: ExampleProject = {
  id: 'test_example',
  title: 'Ore block model',
  description: 'A cube_all block model on a generated texture.',
  kind: 'minecraft:model',
  category: 'Models',
  tags: ['ore'],
  requiresKinds: ['minecraft:model'],
  build: ({ namespace }) => ({
    elements: [
      {
        id: `${namespace}:block/ruby_ore`,
        kind: 'minecraft:model',
        data: {
          parent: 'minecraft:block/cube_all',
          textures: { all: `${namespace}:block/ruby_ore` },
        },
        notes: 'Every face shows the same texture.',
      },
    ],
    assets: [{ namespace, path: 'textures/block/ruby_ore.png', bytes: placeholderPng('ore') }],
  }),
};

const noteKind: ElementKind = {
  id: 'test:note',
  schema: '::java::data::recipe::Recipe',
  folder: 'test_note',
  lower: () => [],
};

/**
 * A fake library plugin: one kind of its own with a template, a template for a kind it does
 * not own (which the host drops), {@link fakeStarter}, {@link fakeExample}, and a starter and
 * an example needing an unregistered kind (which the host hides).
 */
export const fakeLibraryPlugin: Plugin = definePlugin({
  id: 'test.library',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [noteKind],
    elementTemplates: [
      {
        id: 'note',
        kind: 'test:note',
        title: 'Note',
        description: 'A note.',
        category: 'Notes',
        data: ({ projectNamespace }) => ({ text: `Hello from ${projectNamespace}` }),
      },
      {
        id: 'foreign_recipe',
        kind: 'minecraft:recipe',
        title: 'Foreign recipe',
        description: 'Dropped: the kind belongs to another plugin.',
        category: 'Recipes',
        data: () => ({}),
      },
    ],
    projectStarters: [
      fakeStarter,
      { ...fakeStarter, id: 'needs_missing', requiresKinds: ['test:missing'] },
    ],
    examples: [
      fakeExample,
      { ...fakeExample, id: 'needs_missing', requiresKinds: ['test:missing'] },
    ],
  },
});

/** A session with the built-in plugins plus {@link fakeLibraryPlugin}. */
export function newLibrarySession(fs: MemoryFileSystem, options: FakePlatformOptions = {}) {
  return newSession(fs, options, { plugins: [...builtInPlugins, fakeLibraryPlugin] });
}
