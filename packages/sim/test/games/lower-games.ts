/**
 * Lowers games elements in memory with the real games plugin (B558), loaded by file path at test
 * time as `lower-fixture.ts` loads the built-in plugins: `@msm/sim` never imports a plugin.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ElementKindRegistry, lowerProject, registerPlugin, stableStringify } from '@msm/core';
import type { Element, Json, Plugin, Project, ResourceLocation, Target } from '@msm/plugin-api';
import type {
  GamesElement,
  GamesProject,
  SimFiles,
  StructureTemplateBlocks,
} from '../../src/index.js';
import { REPO_ROOT } from '../lower-fixture.js';

/** A games element (or any element) of `kind`. */
export function element(kind: string, id: string, data: Json): GamesElement {
  return { kind, id, data };
}

let games: Promise<Plugin> | undefined;

function gamesPlugin(): Promise<Plugin> {
  games ??= import(pathToFileURL(join(REPO_ROOT, 'packages/plugins/games/src/index.ts')).href).then(
    (module: { default: Plugin }) => module.default,
  );
  return games;
}

/** The lowered files of `elements` (one namespace each) for `target`. */
export async function lowerGames(
  elements: readonly GamesElement[],
  target: Target,
): Promise<SimFiles> {
  const plugin = await gamesPlugin();
  const registry = new ElementKindRegistry();
  registerPlugin(registry, plugin);
  const byNamespace = new Map<string, Element[]>();
  for (const one of elements) {
    const namespace = one.id.slice(0, one.id.indexOf(':'));
    const list = byNamespace.get(namespace) ?? [];
    list.push({
      formatVersion: 1,
      id: one.id as ResourceLocation,
      kind: one.kind,
      data: one.data,
      meta: { createdAt: '2026-01-01T00:00:00.000Z' },
    });
    byNamespace.set(namespace, list);
  }
  const project: Project = {
    formatVersion: 1,
    name: 'Games',
    namespaces: [...byNamespace].map(([name, list]) => ({ name, elements: list, assets: [] })),
    targets: [target.id],
    plugins: ['msm.games'],
    settings: {},
  };
  const lowered = lowerProject(project, registry, target, { plugins: [plugin] });
  const errors = lowered.problems.filter((problem) => problem.severity === 'error');
  if (errors.length > 0) throw new Error(errors.map((problem) => problem.message).join('\n'));
  const files = new Map<string, string | Uint8Array>();
  for (const file of lowered.files) {
    files.set(
      file.path,
      file.contents instanceof Uint8Array ? file.contents : stableStringify(file.contents),
    );
  }
  return files;
}

/** A games project of `elements` and `templates`. */
export function gamesProject(
  elements: readonly GamesElement[],
  templates: Readonly<Record<string, StructureTemplateBlocks>> = {},
): GamesProject {
  return { elements, templates: new Map(Object.entries(templates)) };
}

/** A small island: 5 by 3 by 5, dirt under grass, a chest on top at 4, 3, 4 (cut in a corner). */
export const ISLAND: StructureTemplateBlocks = (() => {
  const blocks: [number, number, number, number][] = [];
  for (let x = 0; x < 5; x += 1) {
    for (let z = 0; z < 5; z += 1) {
      blocks.push([x, 0, z, 0], [x, 1, z, 0], [x, 2, z, 1]);
    }
  }
  blocks.push([4, 3, 4, 2]);
  return {
    size: [5, 4, 5],
    palette: [
      'minecraft:dirt',
      'minecraft:grass_block[snowy=false]',
      'minecraft:chest[facing=north]',
    ],
    blocks,
  };
})();
