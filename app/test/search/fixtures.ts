/**
 * Shared fixtures of the search tests (B660): the app's own lists as the doors will hand them in,
 * the targets' vendored registries, a small made-up names file (no Mojang text: every name here
 * is invented), a session double and a host run on this thread.
 */

import { readFileSync } from 'node:fs';
import type { Problem, Project } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import { builtInTargets, targetFacts } from '@msm/targets';
import { builtInPlugins } from '../../src/renderer/src/plugins/built-in';
import type { SearchInbound, SearchOutbound } from '../../src/renderer/src/search/client';
import { createSearchHost, type SearchHost } from '../../src/renderer/src/search/host';
import type { AppLists, SearchSessionLike } from '../../src/renderer/src/search/sources';
import {
  parseVanillaRegistries,
  type VanillaRegistries,
} from '../../src/renderer/src/search/sources/vanilla';
import type { VanillaNames } from '../../src/shared/platform';

export { builtInPlugins };

/** The built-in targets' ids, newest first. */
export const TARGET_IDS: readonly string[] = builtInTargets.map((bundle) => bundle.target.id);

/** A target's facts (throws for an unknown id). */
export function factsOf(id: string): TargetFacts {
  const facts = targetFacts(id);
  if (facts === undefined) throw new Error(`No target ${id}`);
  return facts;
}

/** A target's vendored registries, read from the repository. */
export function registriesOf(id: string): VanillaRegistries {
  const bundle = builtInTargets.find((entry) => entry.target.id === id);
  if (bundle === undefined) throw new Error(`No target ${id}`);
  return parseVanillaRegistries(JSON.parse(readFileSync(bundle.vendored.mcmetaRegistries, 'utf8')));
}

/**
 * The app's lists (the palette's built-in commands, the sidebar's kind labels, the settings
 * catalogue). Loaded by path at run time: the modules sit beside components the Node test project
 * does not compile.
 */
export async function appLists(): Promise<AppLists> {
  const commandsPath = '../../src/renderer/src/commands/built-in-commands';
  const sidebarPath = '../../src/renderer/src/components/ElementSidebar';
  const settingsPath = '../../src/renderer/src/components/settings-catalogue';
  const commands = (await import(/* @vite-ignore */ commandsPath)) as {
    BUILT_IN_COMMAND_IDS: readonly string[];
    BUILT_IN_COMMANDS: Record<string, { title: string; sentence?: string; words?: string[] }>;
  };
  const sidebar = (await import(/* @vite-ignore */ sidebarPath)) as {
    GROUP_LABELS: Record<string, string>;
    TECHNICAL_GROUPS: ReadonlySet<string>;
  };
  const settings = (await import(/* @vite-ignore */ settingsPath)) as {
    SETTINGS_CATALOGUE: AppLists['settings'];
  };
  return {
    commands: commands.BUILT_IN_COMMAND_IDS.map((id) => {
      const line = commands.BUILT_IN_COMMANDS[id];
      return {
        id,
        title: line?.title ?? id,
        ...(line?.sentence !== undefined ? { sentence: line.sentence } : {}),
        ...(line?.words !== undefined ? { words: line.words } : {}),
      };
    }),
    settings: settings.SETTINGS_CATALOGUE,
    kinds: {
      label: (kind) => sidebar.GROUP_LABELS[kind],
      technical: (kind) => sidebar.TECHNICAL_GROUPS.has(kind),
    },
  };
}

/** A made-up names file: invented names, so a test can tell a jar name from words of an id. */
export function madeUpNames(): VanillaNames {
  return {
    version: 'test',
    blocks: { 'minecraft:stone': 'Plain Test Rock', 'minecraft:oak_log': 'Test Timber' },
    items: { 'minecraft:iron_ingot': 'Test Metal Bar' },
    entityTypes: { 'minecraft:pig': 'Test Pig' },
    biomes: { 'minecraft:plains': 'Test Grassland' },
    effects: { 'minecraft:speed': 'Test Quickness' },
    enchantments: {},
    potions: {},
    subtitles: { 'entity.pig.ambient': 'Test pig grunts' },
  };
}

/** A session double whose project the test replaces. */
export class FakeSession implements SearchSessionLike {
  #listeners = new Set<() => void>();
  snapshot: { project: Project | null; problems: readonly Problem[] };

  constructor(project: Project | null = null, problems: readonly Problem[] = []) {
    this.snapshot = { project, problems };
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  set(project: Project | null, problems: readonly Problem[] = this.snapshot.problems): void {
    this.snapshot = { project, problems };
    for (const listener of this.#listeners) listener();
  }
}

/** A host run on this thread, synchronously, with every outbound message kept. */
export function syncHost(): {
  host: SearchHost;
  out: SearchOutbound[];
  send(m: SearchInbound): void;
} {
  const out: SearchOutbound[] = [];
  const host = createSearchHost((message) => out.push(message), { schedule: (run) => run() });
  return { host, out, send: (message) => host.receive(message) };
}

/** A small project: a namespace with the given elements (data and kind as given). */
export function projectWith(
  elements: {
    id: `${string}:${string}`;
    kind: string;
    data?: unknown;
    setId?: string;
    flowId?: string;
  }[],
): Project {
  const namespaces = new Map<string, Project['namespaces'][number]>();
  for (const element of elements) {
    const name = element.id.slice(0, element.id.indexOf(':'));
    const namespace = namespaces.get(name) ?? { name, elements: [], assets: [] };
    namespace.elements.push({
      formatVersion: 1,
      id: element.id,
      kind: element.kind,
      data: (element.data ?? {}) as never,
      meta: {
        createdAt: '2026-11-23T00:00:00.000Z',
        ...(element.setId !== undefined
          ? {
              creator: {
                flowId: element.flowId ?? 'weapon',
                setId: element.setId,
                values: {},
                generatedId: element.id,
              },
            }
          : {}),
      },
    });
    namespaces.set(name, namespace);
  }
  return {
    formatVersion: 1,
    name: 'Test mod',
    namespaces: [...namespaces.values()],
    targets: [TARGET_IDS[TARGET_IDS.length - 1] as string],
    plugins: [],
    settings: {},
  };
}
