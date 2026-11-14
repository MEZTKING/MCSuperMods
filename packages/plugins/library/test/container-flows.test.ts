/**
 * The Storage crate and Machine Creator flows and the container examples (ADR 0076 D2, D4):
 * block types, components, recipes and pictures for every choice. Validation and export with
 * the real plugins on both targets live in `packages/exporters/test/library.test.ts`, the
 * Creator's reopen rule in `app/test/creator-scenario.test.ts`.
 */
import type { ContentBundle, Json, JsonObject } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { encodePng, libraryExamples, libraryStarters } from '../src/index';
import { MACHINE_RECIPES, machineBundle } from '../src/starters/machine';
import { storageCrateBundle } from '../src/starters/storage-crate';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

const crate = (values: Record<string, Json> = {}): ContentBundle =>
  storageCrateBundle({ namespace: 'demo', projectName: 'Demo', target, values });
const machine = (values: Record<string, Json> = {}): ContentBundle =>
  machineBundle({ namespace: 'demo', projectName: 'Demo', target, values });

const data = (bundle: ContentBundle, id: string): JsonObject => {
  const found = bundle.elements.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found.data as JsonObject;
};
const components = (bundle: ContentBundle, id: string): JsonObject =>
  data(bundle, id).components as JsonObject;
const ids = (bundle: ContentBundle): string[] => bundle.elements.map((entry) => entry.id);
const assetPaths = (bundle: ContentBundle): string[] => bundle.assets.map((asset) => asset.path);

/** A PNG `data:` URL of a grey square, as the wizard passes an image parameter's value. */
function pngDataUrl(size: number): string {
  const bytes = encodePng(new Uint8Array(size * size * 4).fill(160), size, size);
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

describe('Storage crate flow (ADR 0076 D2)', () => {
  it('is a Creator flow in the blocks group', () => {
    const entry = libraryStarters.find((starter) => starter.id === 'storage-crate');
    expect(entry?.title).toBe('Storage crate');
    expect(entry?.creator?.group).toBe('blocks');
    expect(entry?.layers).toEqual(['resourcepack', 'datapack', 'msm']);
  });

  it('makes a directional 3-row chest crate of wood by default', () => {
    const bundle = crate();
    expect(ids(bundle)).toEqual([
      'demo:pack',
      'demo:mod',
      'demo:supply_crate',
      'demo:supply_crate_from_chest',
    ]);
    expect(data(bundle, 'demo:supply_crate')).toMatchObject({
      type: 'directional',
      display_name: 'Supply Crate',
      sound_type: 'wood',
      loot: 'self',
      textures: {
        all: 'demo:block/supply_crate',
        front: 'demo:block/supply_crate_front',
        front_open: 'demo:block/supply_crate_front_open',
      },
    });
    expect(components(bundle, 'demo:supply_crate')['msm:container']).toEqual({
      layout: 'chest',
      rows: 3,
    });
    expect(components(bundle, 'demo:supply_crate')['msm:breakable']).toMatchObject({
      tool: 'axe',
      requires_tool: false,
    });
    expect(data(bundle, 'demo:supply_crate_from_chest')).toMatchObject({
      pattern: ['XXX', 'XCX', 'XXX'],
      key: { X: '#minecraft:planks', C: 'minecraft:chest' },
      result: { id: 'demo:supply_crate' },
    });
    expect(assetPaths(bundle)).toEqual([
      'textures/block/supply_crate.png',
      'textures/block/supply_crate_front.png',
      'textures/block/supply_crate_front_open.png',
    ]);
  });

  it('keeps contents only with three rows, as the shulker box screen', () => {
    const keeps = (values: Record<string, Json>) =>
      components(crate({ keep_contents: true, ...values }), 'demo:supply_crate')['msm:container'];
    expect(keeps({})).toEqual({ layout: 'chest', rows: 3, keep_contents: true });
    expect(keeps({ size: 'small' })).toEqual({ layout: 'chest', rows: 1 });
    expect(keeps({ size: 'large' })).toEqual({ layout: 'chest', rows: 6 });
  });

  it('follows the stone look and the recipe and picture choices', () => {
    const picture = pngDataUrl(16);
    const bundle = crate({
      crate_name: 'Rock Bin',
      look: 'stone',
      ingredient: 'minecraft:iron_ingot',
      picture_front_open: picture,
    });
    expect(data(bundle, 'demo:rock_bin').sound_type).toBe('stone');
    expect(components(bundle, 'demo:rock_bin')['msm:breakable']).toEqual({
      hardness: 3.5,
      resistance: 3.5,
      tool: 'pickaxe',
    });
    expect((data(bundle, 'demo:rock_bin_from_chest').key as JsonObject).X).toBe(
      'minecraft:iron_ingot',
    );
    const open = bundle.assets.find((asset) => asset.path.endsWith('rock_bin_front_open.png'));
    expect(Buffer.from(open?.bytes ?? []).toString('base64')).toBe(
      picture.slice('data:image/png;base64,'.length),
    );
    expect(ids(crate({ ingredient: 'none' }))).not.toContain('demo:supply_crate_from_chest');
    expect(
      (data(crate({ look: 'stone' }), 'demo:supply_crate_from_chest').key as JsonObject).X,
    ).toBe('minecraft:cobblestone');
  });
});

describe('Machine flow (ADR 0076 D2)', () => {
  it('is a Creator flow in the blocks group', () => {
    const entry = libraryStarters.find((starter) => starter.id === 'machine');
    expect(entry?.title).toBe('Machine');
    expect(entry?.creator?.group).toBe('blocks');
  });

  it('makes a horizontal fuel machine with three recipes of its own by default', () => {
    const bundle = machine();
    expect(ids(bundle)).toEqual([
      'demo:pack',
      'demo:mod',
      'demo:grinder',
      'demo:grinder_from_furnace',
    ]);
    const grinder = data(bundle, 'demo:grinder');
    expect(grinder).toMatchObject({
      type: 'horizontal',
      textures: {
        front: 'demo:block/grinder_front',
        front_lit: 'demo:block/grinder_front_lit',
        side: 'demo:block/grinder',
        top: 'demo:block/grinder_top',
      },
    });
    // The defaults: its own recipe type, fuel, speed 1, so nothing is written out.
    expect(components(bundle, 'demo:grinder')['msm:machine']).toEqual({});
    expect(grinder.recipes).toEqual([
      { ingredient: 'minecraft:cobblestone', result: 'minecraft:gravel' },
      { ingredient: 'minecraft:gravel', result: 'minecraft:flint', experience: 0.1 },
      { ingredient: 'minecraft:bone', result: { id: 'minecraft:bone_meal', count: 4 } },
    ]);
    expect(data(bundle, 'demo:grinder_from_furnace').key).toEqual({
      X: 'minecraft:iron_ingot',
      F: 'minecraft:furnace',
    });
    expect(assetPaths(bundle)).toEqual([
      'textures/block/grinder_front.png',
      'textures/block/grinder_front_lit.png',
      'textures/block/grinder.png',
      'textures/block/grinder_top.png',
    ]);
  });

  it('writes power, speed and vanilla recipe types, its own id first', () => {
    const bundle = machine({
      power: 'redstone',
      speed: 2,
      vanilla_types: ['minecraft:smelting', 'minecraft:blasting'],
    });
    expect(components(bundle, 'demo:grinder')['msm:machine']).toEqual({
      recipe_types: ['demo:grinder', 'minecraft:smelting', 'minecraft:blasting'],
      power: 'redstone',
      speed: 2,
    });
    const vanillaOnly = machine({
      vanilla_types: ['minecraft:smoking'],
      recipe_1: 'none',
      recipe_2: 'none',
      recipe_3: 'none',
    });
    expect(components(vanillaOnly, 'demo:grinder')['msm:machine']).toEqual({
      recipe_types: ['minecraft:smoking'],
    });
    expect(data(vanillaOnly, 'demo:grinder').recipes).toBeUndefined();
  });

  it('writes each chosen recipe once', () => {
    const bundle = machine({ recipe_1: 'iron_ingot', recipe_2: 'iron_ingot', recipe_3: 'sugar' });
    expect(data(bundle, 'demo:grinder').recipes).toEqual([
      {
        ingredient: 'minecraft:raw_iron',
        result: { id: 'minecraft:iron_ingot', count: 2 },
        experience: 0.7,
      },
      { ingredient: 'minecraft:sugar_cane', result: { id: 'minecraft:sugar', count: 2 } },
    ]);
  });

  it('offers recipes with distinct ingredients and results, so none compete or clash', () => {
    const real = MACHINE_RECIPES.filter((entry) => entry.value !== 'none');
    expect(new Set(real.map((entry) => entry.ingredient)).size).toBe(real.length);
    expect(new Set(real.map((entry) => entry.result)).size).toBe(real.length);
  });
});

describe('container examples (ADR 0076 D4)', () => {
  const example = (id: string) => {
    const found = libraryExamples.find((entry) => entry.id === id);
    if (found === undefined) throw new Error(`no ${id}`);
    return found.build({
      namespace: 'demo',
      projectName: 'Demo',
      target,
      values: {},
    }) as ContentBundle;
  };

  it('places a loot crate with a loot table through a structure template', () => {
    const bundle = example('example_msm_loot_crate');
    expect(ids(bundle)).toEqual([
      'demo:loot_crate',
      'demo:chests/loot_crate',
      'demo:loot_crate_room',
    ]);
    const room = data(bundle, 'demo:loot_crate_room');
    expect(room.palette).toContain('demo:loot_crate');
    expect(room.block_entities).toEqual([
      { pos: [2, 1, 2], nbt: '{LootTable:"demo:chests/loot_crate"}' },
    ]);
  });

  it('feeds and empties the ore crusher through a hopper chain', () => {
    const bundle = example('example_msm_ore_crusher');
    expect(ids(bundle)).toEqual([
      'demo:ore_crusher',
      'demo:ore_crusher_from_furnace',
      'demo:ore_crusher_line',
    ]);
    expect((data(bundle, 'demo:ore_crusher').recipes as Json[]).length).toBe(3);
    expect(data(bundle, 'demo:ore_crusher_line').palette).toEqual(
      expect.arrayContaining(['demo:ore_crusher', 'minecraft:hopper[facing=down]']),
    );
  });

  it('keeps the shulker crate contents', () => {
    const bundle = example('example_msm_shulker_crate');
    expect(components(bundle, 'demo:shulker_crate')['msm:container']).toEqual({
      layout: 'chest',
      rows: 3,
      keep_contents: true,
    });
  });
});
