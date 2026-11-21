/**
 * The Creator flows of vanilla parity batch 2 (ADR 0101 D2, B481): Wandering merchant, Village
 * job and Fluid, the Mount flow's "Carries a chest" and the Pet flow's "Rides on your shoulder",
 * and their MSM-drawn pictures. Validation and export with the real plugins on both targets
 * (zero problems, warnings included) live in `packages/exporters/test/library.test.ts`.
 */
import type { ContentBundle, ContentBundleElement, Json, JsonObject } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  bucketItemPng,
  liquidPng,
  professionApronPng,
  VILLAGER_TEXTURE_SIZE,
} from '../src/assets/vanilla-parity/batch2';
import { libraryStarters } from '../src/index';
import { fluidBundle } from '../src/starters/fluid';
import { mountBundle } from '../src/starters/mount';
import { petBundle } from '../src/starters/pet';
import { villageJobBundle } from '../src/starters/village-job';
import { wanderingMerchantBundle } from '../src/starters/wandering-merchant';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

type Build = (context: Parameters<typeof fluidBundle>[0]) => ContentBundle;
const run = (build: Build, values: Record<string, Json> = {}): ContentBundle =>
  build({ namespace: 'demo', projectName: 'Demo', target, values });

const find = (bundle: ContentBundle, id: string): ContentBundleElement => {
  const found = bundle.elements.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
};
const data = (bundle: ContentBundle, id: string): JsonObject => find(bundle, id).data as JsonObject;
const components = (bundle: ContentBundle, id: string): JsonObject =>
  data(bundle, id).components as JsonObject;
const ofKind = (bundle: ContentBundle, kind: string): ContentBundleElement[] =>
  bundle.elements.filter((entry) => entry.kind === kind);

/** Width and height of a PNG from its IHDR chunk. */
const pngSize = (bytes: Uint8Array): [number, number] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
};

describe('batch 2 flows are Creator flows (ADR 0101 D2)', () => {
  it.each([
    ['wandering-merchant', 'mobs'],
    ['village-job', 'worlds'],
    ['fluid', 'blocks'],
  ])('%s is listed in the %s group with mod layers', (id, group) => {
    const entry = libraryStarters.find((starter) => starter.id === id);
    expect(entry?.creator?.group).toBe(group);
    expect(entry?.layers).toContain('msm');
    expect(entry?.parameters?.length ?? 0).toBeGreaterThan(0);
  });

  it('every new flow and answer gives unique element ids and asset paths', () => {
    const cases: [Build, Record<string, Json>][] = [
      [wanderingMerchantBundle, {}],
      [wanderingMerchantBundle, { ware_2: 'minecraft:glow_berries', ware_3: 'minecraft:apple' }],
      [villageJobBundle, {}],
      [fluidBundle, { lakes: true, look: 'drawn' }],
      [mountBundle, { carries_chest: true }],
      [petBundle, { shoulder: true }],
    ];
    for (const [build, values] of cases) {
      const bundle = run(build, values);
      const ids = bundle.elements.map((entry) => entry.id);
      expect(new Set(ids).size, build.name).toBe(ids.length);
      const paths = bundle.assets.map((asset) => asset.path);
      expect(new Set(paths).size, build.name).toBe(paths.length);
    }
  });
});

describe('Wandering merchant flow', () => {
  it('trades its own wares first, then the wandering trader sets', () => {
    const bundle = run(wanderingMerchantBundle);
    expect(components(bundle, 'demo:travelling_merchant')['msm:trader']).toEqual({
      trade_sets: [
        { trade_set: 'demo:travelling_merchant/wares' },
        { trade_set: 'minecraft:wandering_trader/common' },
        { trade_set: 'minecraft:wandering_trader/uncommon' },
      ],
      levels: true,
      restock: 'twice_a_day',
    });
    expect(data(bundle, 'demo:travelling_merchant/wares')).toEqual({
      trades: ['demo:travelling_merchant/ware_1', 'demo:travelling_merchant/ware_2'],
      amount: 2,
    });
    expect(data(bundle, 'demo:travelling_merchant/ware_2')).toMatchObject({
      wants: { id: 'minecraft:emerald', count: 5 },
      gives: { id: 'minecraft:name_tag', count: 1 },
    });
    expect(data(bundle, 'demo:travelling_merchant').base).toBeUndefined();
  });

  it('sells only its own wares and never restocks when asked', () => {
    const bundle = run(wanderingMerchantBundle, {
      ware_1: 'apple',
      ware_2: '',
      vanilla_wares: false,
      restock: 'never',
      spawn_biomes: 'nowhere',
    });
    const trader = components(bundle, 'demo:travelling_merchant')['msm:trader'] as JsonObject;
    expect(trader.trade_sets).toEqual([{ trade_set: 'demo:travelling_merchant/wares' }]);
    expect(trader.restock).toBe('never');
    expect(ofKind(bundle, 'minecraft:villager_trade').map((entry) => entry.id)).toEqual([
      'demo:travelling_merchant/ware_1',
    ]);
    expect(data(bundle, 'demo:travelling_merchant/ware_1').gives).toEqual({
      id: 'minecraft:apple',
      count: 6,
    });
    expect(data(bundle, 'demo:travelling_merchant').spawn).toBeUndefined();
  });
});

describe('Village job flow', () => {
  it('makes the job, its workbench and five trade tags with its own trades at level 1', () => {
    const bundle = run(villageJobBundle);
    expect(data(bundle, 'demo:tinker')).toEqual({
      format: 1,
      display_name: 'Tinker',
      job_site: 'demo:tinker_workbench',
      work_sound: 'minecraft:entity.villager.work_toolsmith',
      textures: {
        villager: 'demo:entity/villager/profession/tinker',
        zombie_villager: 'demo:entity/zombie_villager/profession/tinker',
      },
    });
    expect(find(bundle, 'demo:tinker_workbench').kind).toBe('msm:block');
    const tags = ofKind(bundle, 'minecraft:tag/villager_trade');
    expect(tags.map((entry) => entry.id)).toEqual(
      [1, 2, 3, 4, 5].map((level) => `demo:tinker/level_${level}`),
    );
    expect(data(bundle, 'demo:tinker/level_1').values).toEqual([
      'demo:tinker/1/copper_ingot_emerald',
      'demo:tinker/1/emerald_lantern',
      '#minecraft:toolsmith/level_1',
    ]);
    expect(data(bundle, 'demo:tinker/level_5').values).toEqual(['#minecraft:toolsmith/level_5']);
  });

  it('keeps only its own trades without a vanilla job, and no recipe when asked', () => {
    const bundle = run(villageJobBundle, { trades_like: 'none', recipe: false });
    expect(data(bundle, 'demo:tinker').work_sound).toBeUndefined();
    expect(data(bundle, 'demo:tinker/level_2').values).toEqual([]);
    expect(ofKind(bundle, 'minecraft:recipe')).toEqual([]);
  });

  it('draws the apron on the 64 by 64 villager layout for both villagers', () => {
    const bundle = run(villageJobBundle);
    const pictures = bundle.assets.filter((asset) => asset.path.includes('/profession/'));
    expect(pictures.map((asset) => asset.path)).toEqual([
      'textures/entity/villager/profession/tinker.png',
      'textures/entity/zombie_villager/profession/tinker.png',
    ]);
    expect(pngSize(professionApronPng([140, 90, 46]))).toEqual([
      VILLAGER_TEXTURE_SIZE,
      VILLAGER_TEXTURE_SIZE,
    ]);
  });
});

describe('Fluid flow', () => {
  it('behaves like water with moving pictures under a tint and its own bucket picture', () => {
    const bundle = run(fluidBundle);
    const fluid = data(bundle, 'demo:mint_water');
    expect(fluid).toMatchObject({
      behaves_like: 'water',
      flow: { tick_delay: 5, slope_distance: 4, drop_off: 1, infinite: true },
      tint: 0x3cc88c,
      textures: { still: 'minecraft:block/water_still', bucket: 'demo:item/mint_water_bucket' },
    });
    expect(fluid.light).toBeUndefined();
    expect(fluid.on_entity_inside).toBeUndefined();
    expect(bundle.assets.map((asset) => asset.path)).toEqual([
      'textures/item/mint_water_bucket.png',
    ]);
    expect(ofKind(bundle, 'minecraft:worldgen/feature')).toEqual([]);
  });

  it('takes lava numbers, drawn pictures, an effect and lakes when asked', () => {
    const bundle = run(fluidBundle, {
      fluid_name: 'Hot Tar',
      behaves_like: 'lava',
      look: 'drawn',
      speed: 'slow',
      effect: 'minecraft:poison',
      lakes: true,
      lake_biomes: 'deserts',
    });
    const fluid = data(bundle, 'demo:hot_tar');
    expect(fluid.flow).toEqual({ tick_delay: 60, slope_distance: 2, drop_off: 2, infinite: false });
    expect(fluid.tint).toBeUndefined();
    expect(fluid.on_entity_inside).toBe('demo:hot_tar_inside');
    expect(Object.keys(fluid.events as JsonObject)).toEqual(['demo:hot_tar_inside']);
    expect(data(bundle, 'demo:hot_tar_lake')).toMatchObject({
      type: 'minecraft:lake',
      fluid: { type: 'minecraft:simple', state: 'demo:hot_tar' },
    });
    expect(data(bundle, 'demo:hot_tar_lakes').biomes).toEqual(['minecraft:desert']);
    expect(bundle.assets.map((asset) => asset.path).sort()).toEqual([
      'textures/block/hot_tar_flow.png',
      'textures/block/hot_tar_still.png',
      'textures/item/hot_tar_bucket.png',
    ]);
  });

  it('draws 16 by 16 pictures', () => {
    for (const bytes of [
      bucketItemPng([60, 200, 140]),
      liquidPng([60, 200, 140], false),
      liquidPng([60, 200, 140], true),
    ]) {
      expect(pngSize(bytes)).toEqual([16, 16]);
    }
  });
});

describe('Mount and Pet answers', () => {
  it('Mount: carries a chest only when asked', () => {
    expect(components(run(mountBundle), 'demo:dune_runner')['msm:storage']).toBeUndefined();
    const bundle = run(mountBundle, { carries_chest: true, chest_rows: 5, needs_chest: false });
    expect(components(bundle, 'demo:dune_runner')['msm:storage']).toEqual({
      rows: 5,
      needs_chest: false,
    });
  });

  it('Pet: rides on your shoulder at half size, no wider than 0.7 blocks', () => {
    expect(components(run(petBundle), 'demo:ember_fox')['msm:shoulder_riding']).toBeUndefined();
    for (const preset of ['quadruped', 'bird', 'flyer', 'biped']) {
      const bundle = run(petBundle, { shoulder: true, preset });
      expect(components(bundle, 'demo:ember_fox')['msm:shoulder_riding']).toEqual({});
      const size = data(bundle, 'demo:ember_fox').size as { width: number };
      expect(size.width, preset).toBeLessThanOrEqual(0.7);
    }
  });
});
