/**
 * The Make a world flows (ADR 0119 D11; B586) draw on the live map without the player's
 * Minecraft jar: each flow's bundle, for its defaults, its every single answer and the world
 * examples, is lowered with the real built-in plugins for both targets, and `@msm/terrain`'s
 * engine builds the World Type's overworld from the project files alone (vanilla files `null`).
 * Nothing is left out (`unsupported()` is empty) except, for "Like the overworld", the vanilla
 * noise settings it names by id, which needs the jar. The pictures are checked too: islands have
 * land and sea, mountains rise high, caves have rock and air below a roof, an empty sky is air.
 * The worldgen plugin's world templates, one file each, name the vanilla surface noise by id and
 * so need the jar for everything but the empty sky; nothing else is left out.
 */

import { createElement, ElementKindRegistry, registerPlugin } from '@msm/core';
import type { ContentBundle, Json, ProjectStarter, Target } from '@msm/plugin-api';
import datapackPlugin from '@msm/plugin-datapack';
import { libraryStarters, WORLD_FLOW_IDS, worldExamples } from '@msm/plugin-library';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import worldgenPlugin, { worldgenTemplates } from '@msm/plugin-worldgen';
import { builtInTargets } from '@msm/targets';
import {
  buildColumns,
  createTerrainWorld,
  sampleHeights,
  type TerrainSource,
  type TerrainWorld,
  type WorldgenFileMap,
} from '@msm/terrain';
import { describe, expect, it } from 'vitest';

const registry = new ElementKindRegistry();
for (const plugin of [resourcePackPlugin, datapackPlugin, worldgenPlugin]) {
  registerPlugin(registry, plugin);
}

/** The folders the engine reads, longest first so `worldgen/noise_settings` wins over shorter. */
function foldersOf(target: Target): string[] {
  return [...(target.worldgen.terrainPreview?.dataFolders ?? []), 'dimension'].sort(
    (a, b) => b.length - a.length,
  );
}

/** The bundle's data files as the engine's project file map (as the app's `terrain/files.ts`). */
async function filesOf(bundle: ContentBundle, target: Target): Promise<WorldgenFileMap> {
  const folders = foldersOf(target);
  const out: Record<string, Record<string, unknown>> = {};
  for (const entry of bundle.elements) {
    const kind = registry.get(entry.kind);
    if (kind === undefined) continue;
    const element = createElement({ id: entry.id, kind: entry.kind, data: entry.data });
    for (const file of await kind.lower(element, target)) {
      const match = /^data\/([^/]+)\/(.+)\.json$/.exec(file.path);
      if (match === null) continue;
      const [, namespace, rest] = match as unknown as [string, string, string];
      const folder = folders.find((candidate) => rest.startsWith(`${candidate}/`));
      if (folder === undefined) continue;
      const contents =
        typeof file.contents === 'string' ? JSON.parse(file.contents) : file.contents;
      const files = out[folder] ?? {};
      files[`${namespace}:${rest.slice(folder.length + 1)}`] = contents;
      out[folder] = files;
    }
  }
  return out;
}

function starter(id: string): ProjectStarter {
  const found = libraryStarters.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no starter ${id}`);
  return found;
}

function build(
  entry: { build: ProjectStarter['build']; parameters?: ProjectStarter['parameters'] },
  target: Target,
  values: Readonly<Record<string, Json>> = {},
): ContentBundle {
  const defaults = Object.fromEntries(
    (entry.parameters ?? []).map((parameter) => [parameter.id, parameter.default]),
  );
  return entry.build({
    namespace: 'demo',
    projectName: 'Worlds',
    target,
    values: { ...defaults, ...values },
  }) as ContentBundle;
}

/** The World Type's overworld as the live map reads it. */
function sourceOf(bundle: ContentBundle): TerrainSource {
  const preset = bundle.elements.find((entry) => entry.kind === 'minecraft:worldgen/world_preset');
  if (preset === undefined) throw new Error('no world preset');
  return { preset: preset.id, dimension: 'minecraft:overworld' };
}

function worldOf(project: WorldgenFileMap, source: TerrainSource, target: Target): TerrainWorld {
  const fact = target.worldgen.terrainPreview;
  return createTerrainWorld({
    files: { vanilla: null, project },
    source,
    seed: 12345n,
    facts: { dataFolders: fact?.dataFolders ?? [], approximate: fact?.approximate ?? [] },
  });
}

/** Every answer of a flow one at a time (each choice, and each set entry alone), plus defaults. */
function answersOf(flow: ProjectStarter): Record<string, Json>[] {
  const out: Record<string, Json>[] = [{}];
  for (const parameter of flow.parameters ?? []) {
    if (parameter.type === 'choice') {
      for (const choice of parameter.choices) out.push({ [parameter.id]: choice.value });
    }
    if (parameter.type === 'set') {
      for (const choice of parameter.choices) out.push({ [parameter.id]: [choice.value] });
      out.push({ [parameter.id]: parameter.choices.map((choice) => choice.value) });
    }
  }
  return out;
}

const REGION = { x0: -256, z0: -256, width: 512, depth: 512, step: 16 } as const;

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle.target] as const))(
  'Make a world flows on the live map (%s)',
  (_id, target) => {
    it('are the five flows of ADR 0119 D11, in the worlds group', () => {
      expect([...WORLD_FLOW_IDS]).toEqual([
        'world-islands',
        'world-mountains',
        'world-one-biome',
        'world-caves',
        'world-empty-sky',
      ]);
      expect(WORLD_FLOW_IDS.map((id) => starter(id).title)).toEqual([
        'Islands',
        'Tall mountains',
        'One biome everywhere',
        'Caves only',
        'Empty sky with a start island',
      ]);
      for (const id of WORLD_FLOW_IDS) expect(starter(id).creator?.group).toBe('worlds');
    });

    it.each(WORLD_FLOW_IDS.map((id) => [id] as const))(
      '%s draws from the project files alone for every answer',
      async (id) => {
        const flow = starter(id);
        for (const values of answersOf(flow)) {
          const bundle = build(flow, target, values);
          const world = worldOf(await filesOf(bundle, target), sourceOf(bundle), target);
          const label = `${id} ${JSON.stringify(values)}`;
          const notes = world.unsupported();
          if (values.shape === 'overworld') {
            // Named by id: the game has it, the preview needs the jar (the set-up banner).
            expect(
              notes.map((note) => note.type),
              label,
            ).toEqual(['worldgen/noise_settings/minecraft:overworld']);
            continue;
          }
          expect(notes, label).toEqual([]);
          expect(world.generator, label).toBe('noise');
          expect(world.biomesKnown, label).toBe(true);
        }
      },
      60_000,
    );

    it('islands rise out of a sea, mountains tower, caves hollow out the rock, the sky is empty', async () => {
      const heights = async (id: string, values: Record<string, Json> = {}) => {
        const bundle = build(starter(id), target, values);
        const world = worldOf(await filesOf(bundle, target), sourceOf(bundle), target);
        return { world, heights: [...sampleHeights(world, REGION, 'ocean_floor')] };
      };
      const islands = await heights('world-islands');
      expect(Math.max(...islands.heights)).toBeGreaterThan(70);
      expect(Math.min(...islands.heights)).toBeLessThan(55);
      const mountains = await heights('world-mountains', { height: 'tallest' });
      expect(Math.max(...mountains.heights)).toBeGreaterThan(180);
      const flat = await heights('world-one-biome', { shape: 'flat' });
      expect(new Set(flat.heights)).toEqual(new Set([63]));

      const caves = await heights('world-caves');
      const window = { x0: 0, z0: 0, y0: 0, sizeX: 16, sizeY: 128, sizeZ: 16 };
      const cut = buildColumns(caves.world, window, 'surface');
      const names = cut.palette;
      const air = names.indexOf('minecraft:air');
      const counts = new Map<string, number>();
      for (const index of cut.blocks) {
        const name = names[index] ?? '?';
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      expect(counts.get('minecraft:stone') ?? 0).toBeGreaterThan(0);
      expect(air === -1 ? 0 : (counts.get('minecraft:air') ?? 0)).toBeGreaterThan(0);

      const sky = await heights('world-empty-sky');
      const skyCut = buildColumns(sky.world, { ...window, y0: 0, sizeY: 32 }, 'surface');
      expect(skyCut.palette.filter((_name, index) => skyCut.blocks.includes(index))).toEqual([
        'minecraft:air',
      ]);
    });

    it('draws every world example from its project files alone', async () => {
      for (const example of worldExamples) {
        const bundle = build(example, target);
        const world = worldOf(await filesOf(bundle, target), sourceOf(bundle), target);
        expect(world.unsupported(), example.id).toEqual([]);
      }
    });

    it("leaves out nothing of the worldgen plugin's world templates but the vanilla noise", async () => {
      const ids = [
        'noise_settings_islands',
        'noise_settings_mountains',
        'noise_settings_caves',
        'noise_settings_empty',
      ];
      for (const id of ids) {
        const template = worldgenTemplates.find((entry) => entry.id === id);
        if (template === undefined) throw new Error(`no template ${id}`);
        const data = (await template.data({
          id: `demo:${id}`,
          namespace: 'demo',
          path: id,
          projectNamespace: 'demo',
          namespaces: ['demo'],
          kindDefault: undefined,
          target,
        })) as Json;
        const bundle: ContentBundle = {
          elements: [
            { id: `demo:${id}`, kind: 'minecraft:worldgen/noise_settings', data },
            {
              id: 'demo:test_world',
              kind: 'minecraft:dimension',
              data: {
                type: 'minecraft:overworld',
                generator: {
                  type: 'minecraft:noise',
                  settings: `demo:${id}`,
                  biome_source: { type: 'minecraft:fixed', biome: 'minecraft:plains' },
                },
              },
            },
          ],
          assets: [],
        };
        const world = worldOf(
          await filesOf(bundle, target),
          { dimension: 'demo:test_world' },
          target,
        );
        // A template is one file, so it names the vanilla surface noise by id: the game has it,
        // and the live map needs the jar for it (the set-up banner); the empty sky needs none.
        expect(
          world.unsupported().map((note) => note.type),
          id,
        ).toEqual(id === 'noise_settings_empty' ? [] : ['worldgen/noise/minecraft:surface']);
      }
    });
  },
);
