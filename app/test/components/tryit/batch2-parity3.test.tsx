// @vitest-environment happy-dom
/**
 * Vanilla parity 3, batch 2 in the Try it view (B540): the hotbar's fish buckets, bottles, gift
 * items and vanilla tools, the merchant mock-up's changed prices and standing, project boats
 * drawn as wood-coloured boxes, and MSM's general stand-ins for vanilla models and pictures.
 */
import type { SimFiles } from '@msm/sim';
import { cleanup, render, screen } from '@testing-library/react';
import type { TextureAtlasProvider } from 'deepslate/render';
import { afterEach, describe, expect, it } from 'vitest';
import { batch2Things } from '../../../src/renderer/src/tryit/batch2/things';
import {
  prepareTryItResources,
  vanillaBlockOfAsset,
} from '../../../src/renderer/src/tryit/render/resources';
import { TryItArea } from '../../../src/renderer/src/tryit/session-source';
import { MerchantScreen } from '../../../src/renderer/src/tryit/traders/MerchantScreen';
import { BOAT_BOX_RGBA } from '../../../src/renderer/src/tryit/vehicles/vehicle-pass';
import { NS, TARGET } from './tryit-fixture';

afterEach(cleanup);

const folders = TARGET.folders.resource;
const data = TARGET.folders.data;

function files(): SimFiles {
  const entries: Record<string, unknown> = {
    [`msm/${NS}/entity/merchant.json`]: {
      format: 1,
      size: { width: 0.6, height: 1.9 },
      components: {
        'msm:trader': {
          trade_sets: [{ trade_set: `${NS}:wares` }],
          levels: false,
          reputation: { gift_item: 'minecraft:poppy' },
        },
      },
    },
    [`data/${NS}/${data.villager_trade}/apple.json`]: {
      wants: { id: 'minecraft:emerald', count: 10 },
      gives: { id: 'minecraft:apple', count: 3 },
      reputation_discount: 0.05,
    },
    [`data/${NS}/${data.trade_set}/wares.json`]: { trades: [`${NS}:apple`], amount: 1 },
    [`msm/${NS}/entity/koi.json`]: {
      format: 1,
      size: { width: 0.5, height: 0.4 },
      components: { 'msm:movement': { mode: 'swim' }, 'msm:bucketable': {} },
    },
    [`msm/${NS}/fluid/tea.json`]: {
      format: 1,
      behaves_like: 'water',
      cauldron: { levels: true },
      bottle: {},
    },
    [`msm/${NS}/item/maple_boat.json`]: { format: 1, components: { 'msm:boat': {} } },
    [`assets/${NS}/${folders.lang}/en_us.json`]: {
      [`entity.${NS}.merchant`]: 'Merchant',
      [`entity.${NS}.koi`]: 'Koi',
      [`block.${NS}.tea`]: 'Tea',
    },
  };
  return new Map(Object.entries(entries).map(([path, json]) => [path, JSON.stringify(json)]));
}

const area = (): TryItArea => new TryItArea({ files: files(), target: TARGET, seed: 2 });

describe('Try it, vanilla parity 3 batch 2', () => {
  it('offers the fish bucket, the bottle, the gift and the vanilla tools they need', () => {
    const tryIt = area();
    const things = batch2Things(
      {
        fluids: tryIt.source.fluids.catalogue.all(),
        mobs: tryIt.source.mobs,
        traders: tryIt.source.traders.specs,
        vehicles: tryIt.source.vehicles.types,
        nameOf: (id) => tryIt.source.itemName(id),
      },
      tryIt.files,
      folders,
    );
    expect(things.map((thing) => [thing.id, thing.kind])).toEqual([
      [`${NS}:koi_bucket`, 'item'],
      [`${NS}:tea_bottle`, 'item'],
      ['minecraft:poppy', 'item'],
      ['minecraft:cauldron', 'prop'],
      ['minecraft:glass_bottle', 'item'],
      ['minecraft:bucket', 'item'],
      ['minecraft:water_bucket', 'item'],
    ]);
    expect(things.find((thing) => thing.id === `${NS}:koi_bucket`)?.name).toBe('Bucket of Koi');
    expect(tryIt.source.vehicles.types.ids()).toContain(`${NS}:maple_boat`);
    expect(BOAT_BOX_RGBA).toHaveLength(4);
  });

  it('shows a hit trader its raised price beside the base and the standing', () => {
    const tryIt = area();
    tryIt.act({
      type: 'use',
      pos: { x: 24, y: -1, z: 20 },
      face: 'up',
      hit: { x: 0.5, y: 1, z: 0.5 },
      item: `${NS}:merchant_spawn_egg`,
    });
    const mob = tryIt.source.entities.entities()[0];
    if (mob === undefined) throw new Error('no mob');
    tryIt.act({ type: 'hit', entity: mob.id });
    tryIt.act({ type: 'interact', entity: mob.id });
    const open = tryIt.source.traders.open;
    if (open === null) throw new Error('no merchant screen');
    render(
      <MerchantScreen
        open={open}
        nameOf={(id) => tryIt.source.itemName(id)}
        onTrade={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('tryit-merchant-base').textContent).toBe('10');
    expect(screen.getAllByTestId('tryit-merchant-price')[0]?.textContent).toBe('12');
    expect(screen.getByTestId('tryit-merchant-standing').textContent).toContain('-25');
  });
});

describe('the general stand-ins without the client jar', () => {
  it('names the block of a vanilla block model or picture', () => {
    expect(vanillaBlockOfAsset('minecraft:block/cauldron_side')).toBe('minecraft:cauldron_side');
    expect(vanillaBlockOfAsset('block/lodestone_top')).toBe('minecraft:lodestone_top');
    expect(vanillaBlockOfAsset('minecraft:item/apple')).toBeNull();
    expect(vanillaBlockOfAsset('demo:block/ruby')).toBeNull();
  });

  it('draws a whole vanilla model and pictures a block names directly', async () => {
    const lowered = new Map<string, string>([
      [
        `assets/${NS}/${folders.block_definition}/statue.json`,
        JSON.stringify({ variants: { '': { model: 'minecraft:block/anvil_of_the_ages' } } }),
      ],
      [
        `assets/${NS}/${folders.block_definition}/vat.json`,
        JSON.stringify({ variants: { '': { model: `${NS}:block/vat` } } }),
      ],
      [
        `assets/${NS}/${folders.model}/block/vat.json`,
        JSON.stringify({
          parent: 'minecraft:block/cube_all',
          textures: { all: 'minecraft:block/cauldron_side' },
        }),
      ],
    ]);
    const prepared = await prepareTryItResources([`${NS}:statue`, `${NS}:vat`], {
      files: lowered,
      folders,
      vanilla: null,
      createAtlas: async (textures) =>
        ({
          getTextureAtlas: () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
          getTextureUV: () => [0, 0, 1, 1],
          getPixelSize: () => 1,
          textures,
        }) as unknown as TextureAtlasProvider,
    });
    expect(prepared.missingModels).toEqual([]);
    expect(prepared.missingTextures).toEqual([]);
    expect(prepared.usedFallback).toBe(true);
  });
});
