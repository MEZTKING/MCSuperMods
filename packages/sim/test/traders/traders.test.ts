/**
 * Traders in Try it (B483, ADR 0098 D1, ADR 0101 D5): the merchant mock-up over the Wandering
 * merchant starter lowered on every built-in target, and over hand-made files for levels,
 * restocks, shift-click, `restock: never`, monsters at night, `on_trade`, storage and
 * professions.
 */
import { join } from 'node:path';
import type { Json, Target } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  DAY_TICKS,
  HALF_DAY_TICKS,
  LocalWorldSource,
  numberSpec,
  outOfStock,
  readTradeSet,
  type SimFiles,
  TRADE_LEVEL_NAMES,
  TRADER_START_TIME,
  tradeSetWords,
} from '../../src/index.js';
import { builtInTargets, lowerProjectAt, REPO_ROOT } from '../lower-fixture.js';

const targets = await builtInTargets();
const UP = { x: 0.5, y: 1, z: 0.5 };
const floor = (x: number, z: number) => ({ x, y: -1, z });

/** A source over `files`, with a mob of `type` hatched from its egg in front of the player. */
function withMob(files: SimFiles, target: Target, type: string) {
  const source = new LocalWorldSource({ files, target, seed: 3 });
  source.act({ type: 'use', pos: floor(24, 20), face: 'up', hit: UP, item: `${type}_spawn_egg` });
  const mob = source.entities.entities()[0];
  if (mob === undefined) throw new Error(`${type} did not hatch`);
  return { source, mob: mob.id };
}

const only = (source: LocalWorldSource): string[] =>
  source.lines.filter((line) => line.onlyInMinecraft).map((line) => line.text);

describe.each(targets.map((target) => [target.id, target] as const))(
  'the Wandering merchant starter on %s',
  (_id, target) => {
    // Lowering a whole starter project takes longer than the default on a busy CI machine.
    it('opens the merchant screen with its wares, trades, levels up and says the vanilla sets', {
      timeout: 30_000,
    }, async () => {
      const { files } = await lowerProjectAt(
        join(REPO_ROOT, 'examples', 'starters', 'wandering-merchant'),
        target,
      );
      const { source, mob } = withMob(files, target, 'msm_starter:travelling_merchant');
      source.act({ type: 'interact', entity: mob });
      const open = source.traders.open;
      expect(open?.displayName).toBe('Travelling Merchant');
      const merchant = open?.merchant;
      if (merchant === undefined) throw new Error('no merchant screen');
      expect(merchant.level).toBe(1);
      expect(merchant.offers.map((offer) => [offer.cost, offer.result, offer.maxUses])).toEqual([
        [{ item: 'minecraft:emerald', count: 1 }, { item: 'minecraft:glow_berries', count: 6 }, 8],
        [{ item: 'minecraft:emerald', count: 5 }, { item: 'minecraft:name_tag', count: 1 }, 8],
      ]);
      expect(merchant.progress).toBe(0);

      // A shift-click trades the glow berries until they run out: 8 × 2 XP reach Apprentice.
      expect(source.traders.trade(0, true, (id) => id)).toBe(8);
      expect(outOfStock(merchant.offers[0] as never)).toBe(true);
      expect(merchant.xp).toBe(16);
      expect(merchant.level).toBe(2);
      expect(source.lines.map((line) => line.text)).toContain(
        'Travelling Merchant reached Apprentice (level 2) and has new offers.',
      );
      // Level 2 draws from Minecraft's wandering trader set, which the preview cannot read.
      expect(merchant.offers).toHaveLength(2);
      expect(only(source).some((text) => text.includes('Wandering trader, common'))).toBe(true);
      // Out of stock: refused with words.
      expect(source.traders.trade(0, false, (id) => id)).toBe(0);
      expect(source.lines.at(-1)?.text).toContain('used up until the trader restocks');

      // The half-day mark restocks it.
      for (let tick = 0; tick < HALF_DAY_TICKS; tick += 1) source.traders.tick();
      expect(merchant.offers[0]?.uses).toBe(0);
      expect(merchant.restocks).toBe(1);
    });
  },
);

/** Hand-made files: a project of one trader (namespace `tr`), its trades and sets. */
function traderFiles(trader: Json, extra: Record<string, Json> = {}): Map<string, string> {
  const files = new Map<string, string>();
  const put = (path: string, json: Json) => files.set(path, JSON.stringify(json));
  put('msm/tr/entity/seller.json', {
    format: 1,
    category: 'creature',
    size: { width: 0.6, height: 1.8 },
    components: { 'msm:trader': trader },
    events: { sold: { actions: [{ type: 'play_sound', sound: 'tr:sold' }] } },
  });
  put('assets/tr/lang/en_us.json', {
    'entity.tr.seller': 'Seller',
    'item.tr.ruby': 'Ruby',
  });
  put('data/tr/villager_trade/apple.json', {
    wants: { id: 'minecraft:emerald', count: 2 },
    additional_wants: { id: 'minecraft:stick', count: 1 },
    gives: { id: 'minecraft:apple', count: 3 },
    max_uses: 2,
    xp: 5,
  });
  put('data/tr/villager_trade/bread.json', {
    wants: { id: 'minecraft:emerald' },
    gives: { id: 'minecraft:bread', count: { min: 2, max: 2 } },
    xp: 6,
  });
  put('data/tr/villager_trade/ruby.json', {
    wants: { id: 'minecraft:emerald', count: 9 },
    gives: { id: 'tr:ruby' },
    max_uses: 1,
  });
  put('data/tr/tags/villager_trade/level_2.json', { values: ['tr:ruby'] });
  put('data/tr/trade_set/level_1.json', { trades: ['tr:apple', 'tr:bread'], amount: 2 });
  put('data/tr/trade_set/level_2.json', { trades: '#tr:level_2', amount: 1 });
  for (const [path, json] of Object.entries(extra)) put(path, json);
  return files;
}

const target = targets[0] as Target;

describe('the merchant mock-up', () => {
  const LEVELS = {
    trade_sets: [{ trade_set: 'tr:level_1', xp_to_next: 10 }, { trade_set: 'tr:level_2' }],
    on_trade: 'sold',
    trade_sound: 'tr:sold',
  };

  it('reads a second price, levels by xp_to_next and draws the next level from a tag', () => {
    const { source, mob } = withMob(traderFiles(LEVELS), target, 'tr:seller');
    source.act({ type: 'interact', entity: mob });
    const merchant = source.traders.open?.merchant;
    if (merchant === undefined) throw new Error('no merchant screen');
    expect(merchant.offers[0]?.secondCost).toEqual({ item: 'minecraft:stick', count: 1 });
    expect(merchant.offers[1]).toMatchObject({ maxUses: 4, xp: 6 });
    expect(source.traders.trade(0, false, (id) => id)).toBe(1);
    expect(merchant.progress).toBe(0.5);
    expect(
      source.trace.filter((entry) => entry.trigger === 'entity:msm:trader.on_trade'),
    ).toHaveLength(1);
    expect(source.traders.trade(0, false, (id) => id)).toBe(1);
    expect(merchant.level).toBe(2);
    expect(merchant.offers.map((offer) => offer.result.item)).toEqual([
      'minecraft:apple',
      'minecraft:bread',
      'tr:ruby',
    ]);
    // The last level fills the bar.
    expect(merchant.progress).toBe(1);
    expect(source.lines.map((line) => line.text)).toContain(
      'You traded 2 minecraft:emerald and 1 minecraft:stick for 3 minecraft:apple with Seller. That offer is now out of stock.',
    );
  });

  it('keeps level 1 only without levels, and never restocks with restock: never', () => {
    const { source, mob } = withMob(
      traderFiles({ ...LEVELS, levels: false, restock: 'never' }),
      target,
      'tr:seller',
    );
    source.act({ type: 'interact', entity: mob });
    const merchant = source.traders.open?.merchant;
    if (merchant === undefined) throw new Error('no merchant screen');
    expect(source.traders.trade(1, true, (id) => id)).toBe(4);
    expect(merchant.xp).toBe(0);
    expect(merchant.level).toBe(1);
    source.timeLapse();
    expect(merchant.offers[1]?.uses).toBe(4);
    expect(source.traders.trade(1, false, (id) => id)).toBe(0);
    expect(source.lines.at(-1)?.text).toContain('it never restocks');
  });

  it('restocks twice in a time-lapsed day', () => {
    const { source, mob } = withMob(traderFiles(LEVELS), target, 'tr:seller');
    source.act({ type: 'interact', entity: mob });
    const merchant = source.traders.open?.merchant;
    source.traders.trade(1, false, (id) => id);
    source.timeLapse();
    expect(merchant?.offers[1]?.uses).toBe(0);
    expect(merchant?.restocks).toBe(1);
    expect(source.traders.timeOfDay).toBe((TRADER_START_TIME + DAY_TICKS) % DAY_TICKS);
  });

  it('refuses a monster at night and passes a click on when no offer can be shown', () => {
    const monster = traderFiles(LEVELS);
    const definition = JSON.parse(monster.get('msm/tr/entity/seller.json') as string);
    monster.set('msm/tr/entity/seller.json', JSON.stringify({ ...definition, base: 'monster' }));
    const { source, mob } = withMob(monster, target, 'tr:seller');
    source.traders.passTime(13000);
    expect(source.traders.night).toBe(true);
    source.act({ type: 'interact', entity: mob });
    expect(source.traders.open).toBeNull();
    expect(source.lines.at(-1)?.text).toContain('does not trade at night');

    const vanilla = withMob(
      traderFiles({ trade_sets: [{ trade_set: 'minecraft:armorer/level_1' }] }),
      target,
      'tr:seller',
    );
    vanilla.source.act({ type: 'interact', entity: vanilla.mob });
    expect(vanilla.source.traders.open).toBeNull();
    expect(only(vanilla.source).some((text) => text.includes('"Armorer, level 1"'))).toBe(true);
    expect(vanilla.source.lines.map((line) => line.text)).toContain(
      'You used Seller; nothing happens in the preview.',
    );
  });

  it("says storage on a sneaking use and on the first spawn (shoulder pets are mobs2.ts's)", () => {
    const files = traderFiles(LEVELS);
    const definition = JSON.parse(files.get('msm/tr/entity/seller.json') as string);
    definition.base = 'animal';
    definition.components['msm:storage'] = { rows: 3 };
    definition.components['msm:shoulder_riding'] = {};
    definition.components['msm:tameable'] = { items: ['minecraft:apple'] };
    files.set('msm/tr/entity/seller.json', JSON.stringify(definition));
    const { source, mob } = withMob(files, target, 'tr:seller');
    const spawnLine = only(source).find((text) => text.startsWith("Seller's"));
    expect(spawnLine).toContain('storage');
    expect(spawnLine).not.toContain("riding on its owner's shoulder");
    expect(spawnLine).not.toContain('msm:trader');
    source.act({
      type: 'move',
      forward: 0,
      strafe: 0,
      jump: false,
      sneak: true,
      toggleFly: false,
      yaw: 0,
      pitch: 0,
    });
    source.tick();
    source.act({ type: 'interact', entity: mob });
    expect(source.traders.open).toBeNull();
    expect(only(source).some((text) => text.startsWith("Seller's storage opens"))).toBe(true);
  });

  it('says a profession when its job site is placed', async () => {
    const { files } = await lowerProjectAt(
      join(REPO_ROOT, 'examples', 'starters', 'village-job'),
      target,
    );
    const source = new LocalWorldSource({ files, target, seed: 3 });
    const workbench = source.catalogue.ids().find((id) => id.endsWith('_workbench'));
    if (workbench === undefined) throw new Error('no job site block');
    source.act({ type: 'use', pos: floor(24, 20), face: 'up', hit: UP, item: workbench });
    expect(only(source).some((text) => text.startsWith('A villager without a job takes'))).toBe(
      true,
    );
  });
});

describe('trade data', () => {
  it('reads number providers and trade sets', () => {
    expect(numberSpec(3)).toEqual({ min: 3, max: 3 });
    expect(numberSpec({ type: 'minecraft:uniform', min: 1, max: 4 })).toEqual({ min: 1, max: 4 });
    expect(numberSpec({ type: 'minecraft:constant', value: 2 })).toEqual({ min: 2, max: 2 });
    expect(numberSpec('x')).toBeNull();
    const set = readTradeSet(
      traderFiles(
        { trade_sets: [] },
        {
          'data/tr/trade_set/mixed.json': {
            trades: ['tr:apple', 'minecraft:mason/1/clay'],
            amount: 1,
          },
        },
      ),
      target,
      'tr:mixed',
    );
    expect(set?.trades).toEqual(['tr:apple']);
    expect(set?.unreadable).toEqual(['minecraft:mason/1/clay']);
    expect(tradeSetWords('minecraft:wandering_trader/common')).toBe('Wandering trader, common');
    expect(TRADE_LEVEL_NAMES).toHaveLength(5);
  });
});
