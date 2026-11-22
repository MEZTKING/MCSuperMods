/**
 * Traders 2 in Try it (B540, ADR 0107 as amended after B524, the runtime's B528): reputation in
 * the merchant mock-up's prices (hits, trades, gifts, their caps, daily fading, `price_step`),
 * demand at each restock, and restocking at a work site.
 */
import type { Json, Target } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  DAY_TICKS,
  demandPrice,
  HALF_DAY_TICKS,
  LocalWorldSource,
  readTraders,
  type SimFiles,
  specialPrice,
} from '../../src/index.js';
import { builtInTargets } from '../lower-fixture.js';

const [target] = (await builtInTargets()) as [Target];
const UP = { x: 0.5, y: 1, z: 0.5 };
const floor = (x: number, z: number) => ({ x, y: -1, z });

/** A project of one trader `tr:seller` whose one offer is 10 emeralds for a ruby. */
function files(trader: Json, trade: Json = {}): SimFiles {
  const out = new Map<string, string>();
  const put = (path: string, json: Json) => out.set(path, JSON.stringify(json));
  put('msm/tr/entity/seller.json', {
    format: 1,
    size: { width: 0.6, height: 1.8 },
    components: {
      'msm:trader': {
        trade_sets: [{ trade_set: 'tr:level_1' }],
        levels: false,
        ...(trader as object),
      },
    },
  });
  put('assets/tr/lang/en_us.json', { 'entity.tr.seller': 'Seller' });
  put('data/tr/villager_trade/ruby.json', {
    wants: { id: 'minecraft:emerald', count: 10 },
    gives: { id: 'tr:ruby' },
    max_uses: 2,
    reputation_discount: 0.05,
    ...(trade as object),
  });
  put('data/tr/trade_set/level_1.json', { trades: ['tr:ruby'], amount: 1 });
  put('data/tr/tags/block/desks.json', { values: ['minecraft:lectern'] });
  return out;
}

function withSeller(f: SimFiles) {
  const source = new LocalWorldSource({ files: f, target, seed: 3 });
  source.act({ type: 'use', pos: floor(24, 20), face: 'up', hit: UP, item: 'tr:seller_spawn_egg' });
  const mob = source.entities.entities()[0];
  if (mob === undefined) throw new Error('no seller');
  return { source, mob: mob.id };
}

const sneak = (source: LocalWorldSource, sneaking: boolean) => {
  source.act({
    type: 'move',
    forward: 0,
    strafe: 0,
    jump: false,
    sneak: sneaking,
    toggleFly: false,
    yaw: 0,
    pitch: 0,
  });
  source.tick();
};

describe('the price rules', () => {
  it('follow the runtime: floor of standing times the multiplier, or the step', () => {
    // B524: a standing of -25 at 0.05 adds 2 (vanilla's 10 emeralds became 12).
    expect(specialPrice(-25, 0.05)).toBe(2);
    expect(specialPrice(-50, 0.2)).toBe(10);
    expect(specialPrice(20, 0.05)).toBe(-1);
    expect(specialPrice(26, 0, 5)).toBe(-5);
    expect(demandPrice(10, 2, 0.05)).toBe(1);
    expect(demandPrice(10, -4, 0.05)).toBe(0);
  });

  it('reads the reputation with the defaults, demand and the work site', () => {
    const traders = readTraders(files({ reputation: { gift_item: 'minecraft:emerald' } }), target);
    expect(traders.get('tr:seller')).toMatchObject({
      reputation: { hurt: 25, trade: 2, gift: 25, decayPerDay: 20, giftItem: 'minecraft:emerald' },
      demand: true,
    });
    const off = readTraders(files({ demand: false, work_site: '#tr:desks' }), target);
    expect(off.get('tr:seller')).toMatchObject({ demand: false, workSite: '#tr:desks' });
    expect(off.get('tr:seller')?.reputation).toBeUndefined();
  });
});

describe('a trader that remembers how you treat it', () => {
  it('raises its price after a hit, keeps the mob, and lowers it after a gift', () => {
    const { source, mob } = withSeller(files({ reputation: { gift_item: 'minecraft:emerald' } }));
    source.act({ type: 'interact', entity: mob });
    const merchant = source.traders.open?.merchant;
    if (merchant === undefined) throw new Error('no screen');
    const offer = merchant.offers[0];
    if (offer === undefined) throw new Error('no offer');
    expect(merchant.price(offer)).toBe(10);
    source.traders.close();

    source.act({ type: 'hit', entity: mob });
    expect(source.entities.entity(mob)).toBeDefined();
    expect(merchant.standing).toBe(-25);
    expect(merchant.price(offer)).toBe(12);
    expect(source.lines.map((line) => line.text)).toContain(
      'You hit Seller: your standing with it falls to -25, so its prices rise. In the preview it stays; sneak and hit to remove it.',
    );
    // Hits stop at 200.
    for (let i = 0; i < 10; i += 1) source.act({ type: 'hit', entity: mob });
    expect(merchant.standing).toBe(-200);
    expect(merchant.price(offer)).toBe(20);

    // A gift of the gift item: +25 (to the cap of 25), then the click opens the screen.
    source.act({ type: 'interact', entity: mob, item: 'minecraft:emerald' });
    expect(source.traders.open).toBeNull();
    expect(merchant.standing).toBe(-175);
    expect(merchant.price(offer)).toBe(19);
    source.act({ type: 'interact', entity: mob, item: 'minecraft:emerald' });
    expect(source.traders.open?.mobId).toBe(mob);
    expect(merchant.standingParts).toEqual({ hurt: 200, trading: 0, gift: 25 });

    // A trade gains 2; a day later hits recover 20 and trades fade by 2.
    source.traders.trade(0, false, (id) => id);
    expect(merchant.standingParts.trading).toBe(2);
    source.traders.passTime(DAY_TICKS);
    expect(merchant.standingParts).toEqual({ hurt: 180, trading: 0, gift: 25 });
    expect(source.lines.map((line) => line.text)).toContain(
      'A day went by: your standing with Seller faded to -155.',
    );

    // A sneaking hit removes it, as any mob.
    sneak(source, true);
    source.act({ type: 'hit', entity: mob });
    expect(source.entities.entity(mob)).toBeUndefined();
  });

  it('takes a price step when one is given', () => {
    const { source, mob } = withSeller(
      files({ reputation: { gift_item: 'minecraft:emerald', gift: 25, price_step: 5 } }),
    );
    source.act({ type: 'interact', entity: mob, item: 'minecraft:emerald' });
    source.act({ type: 'interact', entity: mob });
    const merchant = source.traders.open?.merchant;
    const offer = merchant?.offers[0];
    if (merchant === undefined || offer === undefined) throw new Error('no screen');
    expect(merchant.standing).toBe(25);
    expect(merchant.price(offer)).toBe(5);
  });
});

describe('demand and work sites', () => {
  it('raises a heavily used offer at the restock, and keeps it flat with demand off', () => {
    for (const [demand, expected] of [
      [true, 11],
      [false, 10],
    ] as const) {
      const { source, mob } = withSeller(files({ demand }));
      source.act({ type: 'interact', entity: mob });
      const merchant = source.traders.open?.merchant;
      const offer = merchant?.offers[0];
      if (merchant === undefined || offer === undefined) throw new Error('no screen');
      source.traders.trade(0, true, (id) => id);
      expect(offer.uses).toBe(2);
      source.traders.passTime(HALF_DAY_TICKS);
      expect(offer.uses).toBe(0);
      expect(offer.demand).toBe(demand ? 2 : 0);
      expect(merchant.price(offer)).toBe(expected);
    }
  });

  it('waits to restock until a block of its work site is within 16 blocks', () => {
    const { source, mob } = withSeller(files({ work_site: '#tr:desks' }));
    source.act({ type: 'interact', entity: mob });
    const merchant = source.traders.open?.merchant;
    const offer = merchant?.offers[0];
    if (merchant === undefined || offer === undefined) throw new Error('no screen');
    source.traders.trade(0, true, (id) => id);
    source.traders.passTime(HALF_DAY_TICKS);
    expect(offer.uses).toBe(2);
    expect(merchant.waitingToRestock).toBe(true);
    expect(source.lines.map((line) => line.text)).toContain(
      'Seller has a restock due and waits for its work site (#tr:desks) within 16 blocks.',
    );
    const at = source.entities.entity(mob)?.position;
    if (at === undefined) throw new Error('no mob');
    source.act({
      type: 'place',
      pos: floor(Math.floor(at.x) + 2, Math.floor(at.z)),
      face: 'up',
      hit: UP,
      block: 'minecraft:lectern',
    });
    source.tick();
    expect(offer.uses).toBe(0);
    expect(merchant.waitingToRestock).toBe(false);
    expect(source.lines.map((line) => line.text)).toContain(
      'Seller restocked its offers at its work site.',
    );
  });
});
