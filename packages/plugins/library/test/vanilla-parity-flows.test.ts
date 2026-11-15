/**
 * The vanilla parity Creator flows of batch 1 (ADR 0101 D2, B459): Copper set, Lights, Bed,
 * Cake, Backpack, Custom command and Creative tab, the Wood set's signs, the Stone set's ageing
 * and the Crop flow's soil and bush with berries, and their MSM-drawn pictures. Validation and
 * export with the real plugins on both targets (zero problems, warnings included) live in
 * `packages/exporters/test/library.test.ts`.
 */
import type { ContentBundle, ContentBundleElement, Json, JsonObject } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import * as pictures from '../src/assets/vanilla-parity/index';
import { libraryStarters } from '../src/index';
import { backpackBundle } from '../src/starters/backpack';
import { bedBundle } from '../src/starters/bed';
import { cakeBundle } from '../src/starters/cake';
import { copperSetBundle, stageId, waxedId } from '../src/starters/copper-set';
import { creativeTabBundle } from '../src/starters/creative-tab';
import { cropBundle } from '../src/starters/crop';
import { customCommandBundle } from '../src/starters/custom-command';
import { lightsBundle } from '../src/starters/lights';
import { stoneSetBundle } from '../src/starters/stone-set';
import { woodSetBundle } from '../src/starters/wood-set';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

type Build = (context: Parameters<typeof woodSetBundle>[0]) => ContentBundle;
const run = (build: Build, values: Record<string, Json> = {}): ContentBundle =>
  build({ namespace: 'demo', projectName: 'Demo', target, values });

const find = (bundle: ContentBundle, id: string, kind?: string): ContentBundleElement => {
  const found = bundle.elements.find(
    (entry) => entry.id === id && (kind === undefined || entry.kind === kind),
  );
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
};
const data = (bundle: ContentBundle, id: string, kind?: string): JsonObject =>
  find(bundle, id, kind).data as JsonObject;
const components = (bundle: ContentBundle, id: string): JsonObject =>
  data(bundle, id).components as JsonObject;
const ofKind = (bundle: ContentBundle, kind: string): ContentBundleElement[] =>
  bundle.elements.filter((entry) => entry.kind === kind);
const assetPaths = (bundle: ContentBundle): string[] => bundle.assets.map((asset) => asset.path);

/** Width and height of a PNG from its IHDR chunk. */
const pngSize = (bytes: Uint8Array): [number, number] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
};

describe('vanilla parity flows are Creator flows (ADR 0101 D2)', () => {
  it.each([
    ['copper-set', 'blocks'],
    ['lights', 'blocks'],
    ['bed', 'blocks'],
    ['cake', 'food'],
    ['backpack', 'gear'],
    ['custom-command', 'scripts'],
    ['creative-tab', 'scripts'],
  ])('%s is listed in the %s group with mod layers', (id, group) => {
    const entry = libraryStarters.find((starter) => starter.id === id);
    expect(entry?.creator?.group).toBe(group);
    expect(entry?.layers).toContain('msm');
    expect(entry?.parameters?.length ?? 0).toBeGreaterThan(0);
  });

  it('every new flow and answer gives unique element ids', () => {
    const cases: [Build, Record<string, Json>][] = [
      [copperSetBundle, {}],
      [lightsBundle, {}],
      [bedBundle, {}],
      [cakeBundle, {}],
      [backpackBundle, { dye_recipe: true }],
      [customCommandBundle, {}],
      [creativeTabBundle, {}],
      [woodSetBundle, {}],
      [stoneSetBundle, { ages: true, members: ['block', 'stairs', 'slab', 'wall', 'pillar'] }],
      [cropBundle, { plant: 'berry_bush', wild: true }],
    ];
    for (const [build, values] of cases) {
      const bundle = run(build, values);
      const ids = bundle.elements.map((entry) => entry.id);
      expect(new Set(ids).size, build.name).toBe(ids.length);
      const paths = assetPaths(bundle);
      expect(new Set(paths).size, build.name).toBe(paths.length);
    }
  });
});

describe('Copper set flow', () => {
  it('makes every piece in four stages, each naming the next, with waxed copies', () => {
    const bundle = run(copperSetBundle);
    const blocks = ofKind(bundle, 'msm:block');
    expect(blocks).toHaveLength(7 * 8);
    expect(components(bundle, 'demo:tin_block')['msm:weathering']).toEqual({
      next: 'demo:exposed_tin',
      stage: 'unaffected',
    });
    expect(components(bundle, 'demo:exposed_tin')['msm:weathering']).toEqual({
      next: 'demo:weathered_tin',
      stage: 'exposed',
    });
    expect(components(bundle, 'demo:oxidized_cut_tin_slab')['msm:weathering']).toEqual({
      stage: 'oxidized',
    });
    expect(components(bundle, 'demo:weathered_tin_door')['msm:waxable']).toEqual({
      into: 'demo:waxed_weathered_tin_door',
    });
    const waxed = components(bundle, 'demo:waxed_oxidized_tin_bars');
    expect(waxed['msm:weathering']).toBeUndefined();
    expect(waxed['msm:waxable']).toBeUndefined();
    expect(data(bundle, 'demo:exposed_tin').display_name).toBe('Exposed Tin');
    expect(data(bundle, 'demo:oxidized_tin_door').display_name).toBe('Oxidised Tin Door');
    expect(data(bundle, 'demo:waxed_tin_block').display_name).toBe('Waxed Block of Tin');
    // Stage copies name their own stage's base block and pictures; waxed ones the waxed base.
    expect(data(bundle, 'demo:weathered_cut_tin_stairs').base_block).toBe('demo:weathered_cut_tin');
    expect(data(bundle, 'demo:waxed_exposed_cut_tin_stairs').base_block).toBe(
      'demo:waxed_exposed_cut_tin',
    );
    expect(data(bundle, 'demo:waxed_exposed_cut_tin_stairs').textures).toEqual({
      all: 'demo:block/exposed_cut_tin',
    });
    expect(data(bundle, 'demo:tin_door').set_type).toBe('copper');
    expect(data(bundle, 'demo:tin_bars').type).toBe('pane');
  });

  it('writes the ingot, vanilla-shaped recipes and a honeycomb recipe per waxed copy', () => {
    const bundle = run(copperSetBundle);
    const recipes = ofKind(bundle, 'minecraft:recipe').map((entry) => entry.id);
    expect(recipes.filter((id) => id.endsWith('_from_honeycomb'))).toHaveLength(28);
    expect(recipes).toContain('demo:tin_block_from_tin_ingot');
    expect(recipes).toContain('demo:tin_ingot_from_tin_block');
    expect(recipes).toContain('demo:cut_tin_slab_from_tin_block_stonecutting');
    expect(data(bundle, 'demo:tin_bars_from_tin_ingot').result).toEqual({
      count: 16,
      id: 'demo:tin_bars',
    });
    expect(data(bundle, 'demo:tin_ingot', 'msm:item').display_name).toBe('Tin Ingot');
    expect(assetPaths(bundle)).toHaveLength(6 * 4 + 1);
  });

  it('without waxed copies or the ingot keeps only the stages', () => {
    const bundle = run(copperSetBundle, { waxed: false, ingot: false, members: ['block'] });
    expect(ofKind(bundle, 'msm:block').map((entry) => entry.id)).toEqual([
      'demo:tin_block',
      'demo:exposed_tin',
      'demo:weathered_tin',
      'demo:oxidized_tin',
    ]);
    expect(components(bundle, 'demo:tin_block')['msm:waxable']).toBeUndefined();
    expect(ofKind(bundle, 'minecraft:recipe')).toEqual([]);
    expect(ofKind(bundle, 'msm:item')).toEqual([]);
  });

  it('derives stage and waxed ids as vanilla copper', () => {
    expect(stageId('demo:tin_block', '')).toBe('demo:tin_block');
    expect(stageId('demo:tin_block', 'exposed_')).toBe('demo:exposed_tin');
    expect(stageId('demo:block/tin_door_top', 'oxidized_')).toBe(
      'demo:block/oxidized_tin_door_top',
    );
    expect(waxedId('demo:exposed_tin')).toBe('demo:waxed_exposed_tin');
  });
});

describe('Lights flow', () => {
  it('makes a torch, lantern, chain and candle of the vanilla-like types', () => {
    const bundle = run(lightsBundle);
    const types = Object.fromEntries(
      ofKind(bundle, 'msm:block').map((entry) => [entry.id, (entry.data as JsonObject).type]),
    );
    expect(types).toEqual({
      'demo:glow_torch': 'torch',
      'demo:glow_lantern': 'lantern',
      'demo:glow_chain': 'chain',
      'demo:glow_candle': 'candle',
    });
    expect(data(bundle, 'demo:glow_torch').particle).toBe('minecraft:flame');
    expect(data(bundle, 'demo:glow_candle').textures).toEqual({
      candle: 'demo:block/glow_candle',
      item: 'demo:item/glow_candle',
      lit: 'demo:block/glow_candle_lit',
    });
    // Candles keep the type's own light: no msm:light_emitter (light-fixed-by-state).
    expect(components(bundle, 'demo:glow_candle')['msm:light_emitter']).toBeUndefined();
  });

  it('crafts with the light ingredient, never vanilla coal shapes', () => {
    const bundle = run(lightsBundle);
    expect(data(bundle, 'demo:glow_torch_from_glowstone_dust').key).toEqual({
      '#': 'minecraft:stick',
      X: 'minecraft:glowstone_dust',
    });
    expect(data(bundle, 'demo:glow_lantern_from_glowstone_dust').key).toEqual({
      '#': 'demo:glow_torch',
      N: 'minecraft:iron_nugget',
    });
    expect(ofKind(run(lightsBundle, { ingredient: 'none' }), 'minecraft:recipe')).toEqual([]);
  });

  it('uses one picked picture for every block', () => {
    const bundle = run(lightsBundle, { members: ['torch', 'chain'] });
    expect(assetPaths(bundle)).toEqual([
      'textures/block/glow_torch.png',
      'textures/block/glow_chain.png',
      'textures/item/glow_chain.png',
    ]);
  });
});

describe('Bed flow', () => {
  it('makes a bed in a dye colour, or a sleeping bag on the straw bed rule', () => {
    const bed = run(bedBundle);
    expect(data(bed, 'demo:cosy_bed')).toMatchObject({
      type: 'bed',
      colour: 'red',
      textures: { bed: 'demo:block/cosy_bed' },
      item: { max_stack_size: 1 },
    });
    expect(data(bed, 'demo:cosy_bed').rule).toBeUndefined();
    expect(data(bed, 'demo:cosy_bed_from_red_wool').pattern).toEqual(['WFW', 'PPP']);
    const bag = run(bedBundle, { kind: 'sleeping_bag', colour: 'green' });
    expect(data(bag, 'demo:cosy_sleeping_bag')).toMatchObject({
      rule: 'straw_bed',
      colour: 'green',
    });
  });
});

describe('Cake flow', () => {
  it('makes a cake with its slice food and vanilla cake shape, or a pie', () => {
    const cake = run(cakeBundle);
    expect(data(cake, 'demo:berry_cake')).toMatchObject({
      type: 'cake',
      food: { nutrition: 2, saturation: 0.1 },
      item: { max_stack_size: 1 },
    });
    expect(data(cake, 'demo:berry_cake_from_sweet_berries').pattern).toEqual(['MMM', 'SFS', 'WWW']);
    const pie = run(cakeBundle, { style: 'pie', flavour: 'minecraft:apple' });
    expect(data(pie, 'demo:berry_cake_from_apple').type).toBe('minecraft:crafting_shapeless');
    expect(assetPaths(cake)).toHaveLength(5);
  });
});

describe('Backpack flow', () => {
  it('makes a bag of chest rows that stacks to one, and a dyed bag on request', () => {
    const bundle = run(backpackBundle);
    expect(data(bundle, 'demo:backpack', 'msm:item')).toMatchObject({
      max_stack_size: 1,
      components: { 'msm:item_inventory': { layout: 'chest', rows: 3, open: 'use' } },
    });
    expect(ofKind(bundle, 'msm:item')).toHaveLength(1);
    const dyed = run(backpackBundle, { dye_recipe: true, dye: 'blue' });
    expect(data(dyed, 'demo:blue_backpack_from_blue_dye')).toMatchObject({
      type: 'minecraft:crafting_transmute',
      input: 'demo:backpack',
      material: 'minecraft:blue_dye',
      result: { id: 'demo:blue_backpack' },
    });
  });
});

describe('Custom command flow', () => {
  it('runs an event, open to every player by default, operators on request', () => {
    const bundle = run(customCommandBundle);
    const command = data(bundle, 'demo:heal', 'msm:command');
    expect(command).toMatchObject({
      name: 'heal',
      event: 'run',
      feedback_text: 'You feel better.',
      events: { run: { actions: [{ type: 'heal', amount: 20 }, { type: 'play_sound' }] } },
    });
    expect(command.permission).toBeUndefined();
    expect(command.function).toBeUndefined();
    const op = run(customCommandBundle, { who: 'operators', action: 'item', count: 4 });
    expect(data(op, 'demo:heal', 'msm:command')).toMatchObject({
      permission: 2,
      events: {
        run: {
          actions: [
            { type: 'give_item', item: 'minecraft:bread', count: 4 },
            { type: 'play_sound' },
          ],
        },
      },
    });
  });
});

describe('Creative tab flow', () => {
  it('makes a tab showing a first block that lists itself in it', () => {
    const bundle = run(creativeTabBundle);
    expect(data(bundle, 'demo:my_blocks', 'msm:creative_tab')).toEqual({
      format: 1,
      icon: 'demo:my_blocks_block',
      display_name: 'My Blocks',
    });
    expect((data(bundle, 'demo:my_blocks_block').item as JsonObject).creative_tab).toBe(
      'demo:my_blocks',
    );
    const bare = run(creativeTabBundle, { first_block: false, order: 'by_name' });
    expect(data(bare, 'demo:my_blocks', 'msm:creative_tab')).toMatchObject({
      icon: 'minecraft:diamond',
      order: 'by_name',
    });
    expect(ofKind(bare, 'msm:block')).toEqual([]);
  });
});

describe('Wood set signs (on by default)', () => {
  it('makes a sign and a hanging sign with their writing screen pictures and recipes', () => {
    const bundle = run(woodSetBundle);
    expect(data(bundle, 'demo:maple_sign')).toMatchObject({
      type: 'sign',
      wood_type: 'oak',
      item: { max_stack_size: 16 },
      textures: {
        all: 'demo:block/maple_planks',
        sign: 'demo:gui/signs/maple_sign',
        item: 'demo:item/maple_sign',
      },
    });
    expect(data(bundle, 'demo:maple_hanging_sign')).toMatchObject({
      type: 'hanging_sign',
      textures: {
        all: 'demo:block/stripped_maple_log',
        hanging_gui: 'demo:gui/hanging_signs/maple_hanging_sign',
      },
    });
    expect(assetPaths(bundle)).toEqual(
      expect.arrayContaining([
        'textures/gui/signs/maple_sign.png',
        'textures/gui/hanging_signs/maple_hanging_sign.png',
        'textures/item/maple_sign.png',
        'textures/item/maple_hanging_sign.png',
      ]),
    );
    expect(data(bundle, 'demo:maple_hanging_sign_from_stripped_logs').key).toEqual({
      '#': 'demo:stripped_maple_log',
      X: 'minecraft:iron_chain',
    });
    expect(data(bundle, 'demo:maple_sign_from_planks').result).toEqual({
      count: 3,
      id: 'demo:maple_sign',
    });
  });

  it('leaves the signs out when switched off', () => {
    const bundle = run(woodSetBundle, { signs: false, hanging_signs: false });
    const ids = bundle.elements.map((entry) => entry.id);
    expect(ids.some((id) => id.includes('sign'))).toBe(false);
    expect(assetPaths(bundle).some((path) => path.includes('sign'))).toBe(false);
  });
});

describe('Stone set ageing (off by default)', () => {
  it('ages the members copper comes in and leaves walls as they are', () => {
    expect(run(stoneSetBundle).elements.some((entry) => entry.id.includes('exposed_'))).toBe(false);
    const bundle = run(stoneSetBundle, { ages: true });
    expect(components(bundle, 'demo:slate')['msm:weathering']).toEqual({
      next: 'demo:exposed_slate',
      stage: 'unaffected',
    });
    expect(data(bundle, 'demo:weathered_slate_stairs').base_block).toBe('demo:weathered_slate');
    expect(data(bundle, 'demo:waxed_oxidized_slate_slab').display_name).toBe(
      'Waxed Oxidised Slate Slab',
    );
    expect(components(bundle, 'demo:slate_wall')['msm:weathering']).toBeUndefined();
    expect(bundle.elements.some((entry) => entry.id === 'demo:exposed_slate_wall')).toBe(false);
    expect(data(bundle, 'demo:block/exposed_slate', 'minecraft:model').textures).toEqual({
      all: 'demo:block/exposed_slate',
    });
    expect(assetPaths(bundle)).toEqual([
      'textures/block/slate.png',
      'textures/block/exposed_slate.png',
      'textures/block/weathered_slate.png',
      'textures/block/oxidized_slate.png',
    ]);
  });
});

describe('Crop flow: grows on, and the bush with berries', () => {
  it('sets the soil tag of a crop', () => {
    expect(data(run(cropBundle), 'demo:tomato_crop').soil).toBeUndefined();
    expect(data(run(cropBundle, { soil: 'soul_sand' }), 'demo:tomato_crop').soil).toBe(
      '#minecraft:soul_fire_base_blocks',
    );
    const wild = run(cropBundle, { soil: 'sand', wild: true });
    expect(data(wild, 'demo:tomato_soil', 'minecraft:tag/block').values).toEqual([
      '#minecraft:sand',
      'minecraft:grass_block',
    ]);
  });

  it('makes a bush whose berries are its block item', () => {
    const bundle = run(cropBundle, { plant: 'berry_bush' });
    expect(data(bundle, 'demo:tomato_bush')).toMatchObject({
      type: 'berry_bush',
      berry: 'demo:tomato',
      item: { id: 'demo:tomato' },
      models: { item: 'demo:item/tomato' },
      loot: 'self',
    });
    expect((data(bundle, 'demo:tomato_bush').textures as JsonObject).stages).toHaveLength(4);
    expect(data(bundle, 'demo:tomato_bush').harvest).toBeUndefined();
    expect(ofKind(bundle, 'msm:item')).toEqual([]);
    const wild = run(cropBundle, { plant: 'berry_bush', wild: true, harvest_max: 4 });
    expect(data(wild, 'demo:tomato_bush').harvest).toEqual({ full: [2, 5], ripe: [1, 4] });
    expect(data(wild, 'demo:wild_tomato_bush').to_place).toEqual({
      id: 'demo:tomato_bush',
      properties: { age: '3' },
    });
  });
});

describe('vanilla parity pictures (ADR 0092 rules, MSM-drawn)', () => {
  it('are PNGs of the sizes the game reads', () => {
    const sixteen = [
      pictures.agedPlatePng([170, 170, 180], [80, 160, 130], 2, true),
      pictures.agedDoorPng([170, 170, 180], [80, 160, 130], 1, 'top'),
      pictures.agedTrapdoorPng([170, 170, 180], [80, 160, 130], 3),
      pictures.agedBarsPng([170, 170, 180], [80, 160, 130], 0),
      pictures.agedStonePng([96, 104, 120], [96, 126, 70], 2, 'bricks'),
      pictures.torchPng([150, 108, 62], [252, 186, 72]),
      pictures.lanternPng([92, 98, 112], [252, 186, 72]),
      pictures.chainPng([92, 98, 112]),
      pictures.candlePng([232, 214, 178], [252, 186, 72], true),
      pictures.bedPng([156, 40, 36]),
      pictures.cakePng('side', [244, 236, 226], [178, 36, 58], false),
      pictures.berryBushPng(3, [40, 160, 96], [196, 28, 52]),
      pictures.hangingSignGuiPng([164, 116, 68]),
      pictures.plainBlockPng([70, 150, 214]),
      pictures.lanternItemPng([92, 98, 112], [252, 186, 72]),
      pictures.chainItemPng([92, 98, 112]),
      pictures.candleItemPng([232, 214, 178], [252, 186, 72]),
      pictures.berriesItemPng([196, 28, 52], [40, 160, 96]),
      pictures.cakeItemPng([244, 236, 226], [178, 36, 58], true),
      pictures.signItemPng([164, 116, 68]),
      pictures.hangingSignItemPng([164, 116, 68]),
      pictures.backpackItemPng([146, 92, 52]),
      pictures.ingotItemPng([170, 170, 180]),
    ];
    for (const png of sixteen) expect(pngSize(png)).toEqual([16, 16]);
    expect(pngSize(pictures.signGuiPng([164, 116, 68]))).toEqual([24, 26]);
  });

  it('are byte-stable and change with the stage', () => {
    const a = pictures.agedPlatePng([170, 170, 180], [80, 160, 130], 1, false);
    expect(pictures.agedPlatePng([170, 170, 180], [80, 160, 130], 1, false)).toEqual(a);
    expect(pictures.agedPlatePng([170, 170, 180], [80, 160, 130], 2, false)).not.toEqual(a);
  });

  it('item silhouettes are 16 rows of 16', () => {
    for (const rows of [
      pictures.LANTERN_ITEM,
      pictures.CHAIN_ITEM,
      pictures.CANDLE_ITEM,
      pictures.BERRIES_ITEM,
      pictures.CAKE_ITEM,
      pictures.PIE_ITEM,
      pictures.SIGN_ITEM,
      pictures.HANGING_SIGN_ITEM,
      pictures.BACKPACK_ITEM,
    ]) {
      expect(rows).toHaveLength(16);
      for (const row of rows) expect(row).toHaveLength(16);
    }
  });
});
