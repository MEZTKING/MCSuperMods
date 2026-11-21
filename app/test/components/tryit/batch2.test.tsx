// @vitest-environment happy-dom
/**
 * Vanilla parity 2, batch 2 in the Try it view (B483): the merchant mock-up over a real area,
 * fluid buckets and the fluid pass's faces and colours, and the sky of a project dimension type.
 */
import type { Element, Project } from '@msm/core';
import type { SimFiles } from '@msm/sim';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FALLBACK_ALPHA,
  FALLBACK_LAVA,
  fluidColour,
  fluidFaces,
  fluidLooks,
  rgbOf,
  SOURCE_HEIGHT,
  writeFluidFace,
} from '../../../src/renderer/src/tryit/fluids/fluid-pass';
import { bucketThings } from '../../../src/renderer/src/tryit/fluids/things';
import { FLOATS_PER_VERTEX } from '../../../src/renderer/src/tryit/render/particles';
import { FULL_UV } from '../../../src/renderer/src/tryit/render/portal';
import { hexToRgb, projectSkies } from '../../../src/renderer/src/tryit/render/sky';
import { TryItArea } from '../../../src/renderer/src/tryit/session-source';
import {
  MERCHANT_NOTE,
  MerchantScreen,
} from '../../../src/renderer/src/tryit/traders/MerchantScreen';
import { NS, TARGET } from './tryit-fixture';

afterEach(cleanup);

const folders = TARGET.folders.resource;
const data = TARGET.folders.data;

function files(): SimFiles {
  const entries: Record<string, unknown> = {
    [`msm/${NS}/entity/merchant.json`]: {
      format: 1,
      category: 'creature',
      size: { width: 0.6, height: 1.9 },
      components: {
        'msm:trader': {
          trade_sets: [{ trade_set: `${NS}:wares`, xp_to_next: 4 }, { trade_set: `${NS}:rare` }],
        },
      },
    },
    [`data/${NS}/${data.villager_trade}/apple.json`]: {
      wants: { id: 'minecraft:emerald', count: 2 },
      gives: { id: 'minecraft:apple', count: 3 },
      max_uses: 2,
      xp: 2,
    },
    [`data/${NS}/${data.villager_trade}/gem.json`]: {
      wants: { id: 'minecraft:emerald', count: 8 },
      additional_wants: { id: 'minecraft:book' },
      gives: { id: 'minecraft:diamond' },
    },
    [`data/${NS}/${data.trade_set}/wares.json`]: { trades: [`${NS}:apple`], amount: 1 },
    [`data/${NS}/${data.trade_set}/rare.json`]: { trades: [`${NS}:gem`], amount: 1 },
    [`msm/${NS}/fluid/goo.json`]: { format: 1, behaves_like: 'lava', tint: 0xff8800 },
    [`assets/${NS}/${folders.model}/block/goo.json`]: {
      textures: { still: `${NS}:block/goo_still`, flowing: `${NS}:block/goo_flow` },
    },
    [`assets/${NS}/${folders.lang}/en_us.json`]: {
      [`entity.${NS}.merchant`]: 'Merchant',
      [`block.${NS}.goo`]: 'Goo',
      [`item.${NS}.goo_bucket`]: 'Bucket of Goo',
    },
  };
  return new Map(Object.entries(entries).map(([path, json]) => [path, JSON.stringify(json)]));
}

const area = (): TryItArea => new TryItArea({ files: files(), target: TARGET, seed: 2 });

describe('the merchant mock-up', () => {
  it('shows the offers, trades, levels up and crosses out a used-up offer', () => {
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
    tryIt.act({ type: 'interact', entity: mob.id });
    const open = tryIt.source.traders.open;
    if (open === null) throw new Error('no merchant screen');
    const trades: [number, boolean][] = [];
    const view = () => (
      <MerchantScreen
        open={open}
        nameOf={(id) => tryIt.source.itemName(id)}
        onTrade={(index, all) => {
          trades.push([index, all]);
          tryIt.source.traders.trade(index, all, (id) => tryIt.source.itemName(id));
        }}
        onClose={() => {}}
      />
    );
    const { rerender } = render(view());
    const screenNode = screen.getByTestId('tryit-merchant');
    expect(screenNode.getAttribute('data-level')).toBe('1');
    expect(screen.getByTestId('tryit-merchant-level').textContent).toBe('Novice');
    expect(screen.getByTestId('tryit-merchant-xp').getAttribute('data-progress')).toBe('0.00');
    expect(screen.getByText(MERCHANT_NOTE)).toBeTruthy();
    fireEvent.click(screen.getByTestId('tryit-merchant-offer-1'));
    rerender(view());
    expect(screen.getByTestId('tryit-merchant-xp').getAttribute('data-progress')).toBe('0.50');
    fireEvent.click(screen.getByTestId('tryit-merchant-offer-1'), { shiftKey: true });
    rerender(view());
    expect(trades).toEqual([
      [0, false],
      [0, true],
    ]);
    expect(screen.getByTestId('tryit-merchant-level').textContent).toBe('Apprentice');
    expect(screen.getByTestId('tryit-merchant-offer-1').getAttribute('data-out-of-stock')).toBe(
      'true',
    );
    expect(screen.getByTestId('tryit-merchant-sold-out')).toBeTruthy();
    // Level 2's offer, with its second price.
    const second = screen.getByTestId('tryit-merchant-offer-2');
    expect(second.textContent).toContain('8');
    expect(second.textContent).toContain('and');
    expect(second.getAttribute('data-out-of-stock')).toBe('false');
  });
});

describe('fluids in the view', () => {
  it('offers the bucket, not the liquid block, with its name', () => {
    const tryIt = area();
    const fluids = tryIt.source.fluids.catalogue.all();
    expect(bucketThings(fluids, tryIt.files, folders)).toEqual([
      { id: `${NS}:goo_bucket`, name: 'Bucket of Goo', kind: 'bucket' },
    ]);
    expect(tryIt.source.fluids.isFluid(`${NS}:goo`)).toBe(true);
    const looks = fluidLooks(fluids);
    expect(looks.get(`${NS}:goo`)).toEqual({
      id: `${NS}:goo`,
      still: `${NS}:block/goo_still`,
      flowing: `${NS}:block/goo_flow`,
      tint: rgbOf(0xff8800),
      behavesLike: 'lava',
    });
  });

  it('draws the faces that do not touch the same fluid, a source lower under air', () => {
    const goo = `${NS}:goo`;
    const at = (pos: { x: number; y: number; z: number }) =>
      pos.x === 3 && pos.y === 1 && pos.z === 0 ? { name: goo, properties: {} } : null;
    expect(fluidFaces({ x: 2, y: 0, z: 0 }, goo, at)).toEqual({
      faces: ['up', 'north', 'south', 'west', 'east'],
      height: SOURCE_HEIGHT,
    });
    expect(fluidFaces({ x: 3, y: 0, z: 0 }, goo, at)).toEqual({
      faces: ['north', 'south', 'west', 'east'],
      height: 1,
    });
    const out = new Float32Array(6 * FLOATS_PER_VERTEX);
    expect(
      writeFluidFace(out, 0, { x: 2, y: 0, z: 0 }, 'up', SOURCE_HEIGHT, FULL_UV, [1, 1, 1, 1]),
    ).toBe(6 * FLOATS_PER_VERTEX);
    expect(out[1]).toBeCloseTo(SOURCE_HEIGHT);
  });

  it('tints a picture and falls back to a pane of its own colour', () => {
    const look = fluidLooks([
      {
        id: 'x:lava_like',
        displayName: 'Lava Like',
        bucket: 'x:lava_like_bucket',
        bucketName: 'Bucket',
        behavesLike: 'lava',
        flow: { tickDelay: 30, slopeDistance: 2, dropOff: 2, infinite: false },
        light: 15,
        textures: {},
        origin: { elementId: 'x:lava_like' },
      },
    ]).get('x:lava_like');
    expect(fluidColour(look, false)).toEqual([...FALLBACK_LAVA, 1]);
    expect(fluidColour({ id: 'y', tint: [0.5, 0.5, 0.5], behavesLike: 'water' }, true)).toEqual([
      0.5, 0.5, 0.5, 1,
    ]);
    expect(fluidColour({ id: 'y', tint: null, behavesLike: 'water' }, false)[3]).toBe(
      FALLBACK_ALPHA,
    );
  });
});

describe('the sky of a dimension type', () => {
  const element = (id: string, kind: string, value: unknown): Element =>
    ({ id, kind, data: value, formatVersion: 1, meta: {} }) as unknown as Element;
  const project = (elements: Element[]): Project =>
    ({ namespaces: [{ namespace: NS, elements }] }) as unknown as Project;

  it('offers the dimensions that use a dimension type of the project', () => {
    const skies = projectSkies(
      project([
        element(`${NS}:glow_moon`, 'minecraft:dimension', { type: `${NS}:glow_moon_type` }),
        element(`${NS}:plain`, 'minecraft:dimension', { type: 'minecraft:overworld' }),
        element(`${NS}:glow_moon_type`, 'minecraft:dimension_type', {
          attributes: { 'minecraft:visual/sky_color': '#102030' },
        }),
      ]),
    );
    expect(skies).toEqual([
      {
        dimension: `${NS}:glow_moon`,
        name: 'Glow Moon',
        dimensionType: `${NS}:glow_moon_type`,
        hex: '#102030',
        rgb: hexToRgb('#102030'),
      },
    ]);
    expect(projectSkies(null)).toEqual([]);
    expect(hexToRgb('blue')).toBeNull();
  });
});
