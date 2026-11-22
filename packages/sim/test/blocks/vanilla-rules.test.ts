/**
 * Block transformers and vanilla block rules in Try it (B614) over `fixtures/sim-parity/project`
 * lowered on every built-in target, with a few block transformers, a project tool and a block
 * tag added to the lowered files: the rules come before the tool's own transformer, a project
 * transformer of a vanilla tool's id replaces vanilla's pairs, a project item names its own, and
 * what the preview cannot work out is said, never guessed.
 */
import type { Json, Target } from '@msm/plugin-api';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type BlockPos,
  LocalWorldSource,
  provideState,
  readVanillaBlockRules,
  ruleThings,
  type SimEffect,
  type SimFiles,
  transformerOfDefinition,
  transformerOfVanillaItem,
  transformerRows,
} from '../../src/index.js';
import { builtInTargets, lowerFixture } from '../lower-fixture.js';

const UP = { x: 0.5, y: 1, z: 0.5 };
const floor = (x: number, z: number): BlockPos => ({ x, y: -1, z });
const at = (x: number, y: number, z: number): BlockPos => ({ x, y, z });

const targets = await builtInTargets();

/** `then` is the game's own key for what a rule gives. */
const rule = (blocks: string, then: Json): Json => ({
  if_true: { type: 'minecraft:matching_blocks', blocks },
  then,
});

/** Transformers, a project brush naming one, and a block tag, added to the lowered files. */
const EXTRA: Record<string, string> = {
  'data/sim_parity/block_transformer/brush.json': JSON.stringify([
    {
      block_state_provider: {
        type: 'minecraft:rule_based',
        rules: [
          rule('minecraft:gravel', { id: 'minecraft:sand' }),
          rule('#sim_parity:sandy', { id: 'minecraft:red_sand' }),
          rule('#minecraft:logs', { id: 'minecraft:stone' }),
        ],
      },
      sound: 'minecraft:item.brush.brushing.generic',
      particle: 'scrape',
      disallowed_faces: ['down'],
      loot: 'sim_parity:brushed',
    },
    {
      block_state_provider: {
        type: 'minecraft:rule_based',
        rules: [rule('minecraft:sandstone', { type: 'minecraft:weighted_state_provider' })],
      },
    },
  ]),
  // A project file of a vanilla tool's id replaces vanilla's transformer whole.
  'data/minecraft/block_transformer/hoe.json': JSON.stringify([
    {
      block_state_provider: {
        type: 'minecraft:copy_properties',
        source: {
          type: 'minecraft:rule_based',
          rules: [rule('minecraft:oak_log', { id: 'minecraft:birch_log' })],
        },
      },
    },
  ]),
  'data/sim_parity/tags/block/sandy.json': JSON.stringify({ values: ['minecraft:sandstone'] }),
  'msm/sim_parity/item/brush.json': JSON.stringify({
    format: 1,
    components: { 'msm:components': { 'minecraft:block_transformer': 'sim_parity:brush' } },
  }),
  'msm/sim_parity/item/ruby_axe.json': JSON.stringify({
    format: 1,
    components: { 'msm:tool': { type: 'axe', tier: 'iron' } },
  }),
  'msm/sim_parity/item/odd.json': JSON.stringify({
    format: 1,
    components: { 'msm:components': { 'minecraft:block_transformer': 'sim_parity:none' } },
  }),
};

describe.each(targets.map((target) => [target.id, target] as const))(
  'block rules in Try it on %s',
  (_, target: Target) => {
    let files: SimFiles;

    beforeAll(async () => {
      const lowered = await lowerFixture('sim-parity/project', target);
      expect(lowered.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
      files = new Map([...lowered.files, ...Object.entries(EXTRA)]);
    }, 60_000);

    const area = (): LocalWorldSource => new LocalWorldSource({ files, target, seed: 5 });
    const place = (source: LocalWorldSource, block: string, pos: BlockPos) =>
      source.act({ type: 'place', pos, face: 'up', hit: UP, block });
    const use = (source: LocalWorldSource, pos: BlockPos, item?: string) =>
      source.act({
        type: 'use',
        pos,
        face: 'up',
        hit: UP,
        ...(item === undefined ? {} : { item }),
      });
    const name = (source: LocalWorldSource, pos: BlockPos) => source.world.get(pos)?.name ?? null;
    const said = (source: LocalWorldSource, words: string) =>
      source.lines.some((line) => line.text.includes(words));

    it('reads the rules file, later pairs winning, and the reverse of each wax pair', () => {
      const rules = readVanillaBlockRules(files);
      expect(rules.sources).toEqual(['sim_parity:tool_rules']);
      expect(rules.strip.get('minecraft:basalt')?.into).toBe('minecraft:polished_basalt');
      expect(rules.till.get('minecraft:packed_mud')?.drops).toBe('minecraft:clay_ball');
      expect(rules.unwax.get('minecraft:end_stone_bricks')?.block).toBe('minecraft:end_stone');
    });

    it('strips, flattens, tills and waxes props, with the tool sounds as captions', () => {
      const source = area();
      const sounds: SimEffect[] = [];
      source.subscribe((event) => {
        if (event.type === 'effect' && event.effect.kind === 'sound') sounds.push(event.effect);
      });
      place(source, 'minecraft:basalt', floor(1, 1));
      place(source, 'minecraft:clay', floor(3, 1));
      place(source, 'minecraft:packed_mud', floor(5, 1));
      place(source, 'minecraft:end_stone', floor(7, 1));
      use(source, at(1, 0, 1), 'minecraft:iron_axe');
      use(source, at(3, 0, 1), 'minecraft:iron_shovel');
      use(source, at(5, 0, 1), 'minecraft:iron_hoe');
      use(source, at(7, 0, 1), 'minecraft:honeycomb');
      expect(name(source, at(1, 0, 1))).toBe('minecraft:polished_basalt');
      expect(name(source, at(3, 0, 1))).toBe('minecraft:dirt_path');
      expect(name(source, at(5, 0, 1))).toBe('minecraft:mud_bricks');
      expect(name(source, at(7, 0, 1))).toBe('minecraft:end_stone_bricks');
      expect(source.inventory.count('minecraft:clay_ball')).toBe(1);
      use(source, at(7, 0, 1), 'minecraft:iron_axe');
      expect(name(source, at(7, 0, 1))).toBe('minecraft:end_stone');
      expect(sounds.map((sound) => sound.id)).toEqual([
        'minecraft:item.axe.strip',
        'minecraft:item.shovel.flatten',
        'minecraft:item.hoe.till',
        'minecraft:item.honeycomb.wax_on',
        'minecraft:item.axe.wax_off',
      ]);
      expect(said(source, 'the rule in sim_parity:tool_rules')).toBe(true);
      expect(said(source, 'the preview’s tools never wear')).toBe(true);
    });

    it('flattens only with air above, and does nothing with an empty hand or a sword', () => {
      const source = area();
      place(source, 'minecraft:clay', floor(3, 3));
      place(source, 'sim_parity:base', at(3, 0, 3));
      use(source, at(3, 0, 3), 'minecraft:iron_shovel');
      expect(name(source, at(3, 0, 3))).toBe('minecraft:clay');
      expect(said(source, 'only with air above it')).toBe(true);
      place(source, 'minecraft:basalt', floor(5, 3));
      use(source, at(5, 0, 3));
      use(source, at(5, 0, 3), 'minecraft:iron_sword');
      expect(name(source, at(5, 0, 3))).toBe('minecraft:basalt');
    });

    it('uses Minecraft’s own pairs where the project has no transformer of the tool', () => {
      const source = area();
      place(source, 'minecraft:oak_log', floor(1, 5));
      place(source, 'minecraft:copper_block', floor(3, 5));
      place(source, 'minecraft:exposed_copper', floor(5, 5));
      use(source, at(1, 0, 5), 'minecraft:iron_axe');
      use(source, at(3, 0, 5), 'minecraft:honeycomb');
      use(source, at(5, 0, 5), 'minecraft:golden_axe');
      expect(name(source, at(1, 0, 5))).toBe('minecraft:stripped_oak_log');
      expect(name(source, at(3, 0, 5))).toBe('minecraft:waxed_copper_block');
      expect(name(source, at(5, 0, 5))).toBe('minecraft:copper_block');
      expect(said(source, "Minecraft's own pair")).toBe(true);
    });

    it('lets a project tool of the axe type strip as an axe', () => {
      const source = area();
      place(source, 'minecraft:basalt', floor(2, 2));
      use(source, at(2, 0, 2), 'sim_parity:ruby_axe');
      expect(name(source, at(2, 0, 2))).toBe('minecraft:polished_basalt');
    });

    it('replaces vanilla’s hoe with the project’s hoe transformer, copying properties', () => {
      const source = area();
      // Dirt is vanilla's till pair, but the project's hoe.json replaces vanilla's whole.
      place(source, 'minecraft:dirt', floor(1, 7));
      place(source, 'minecraft:oak_log', floor(3, 7));
      use(source, at(1, 0, 7), 'minecraft:iron_hoe');
      use(source, at(3, 0, 7), 'minecraft:iron_hoe');
      expect(name(source, at(1, 0, 7))).toBe('minecraft:dirt');
      expect(name(source, at(3, 0, 7))).toBe('minecraft:birch_log');
    });

    it('runs a project item’s own transformer: blocks, project tags, extras said', () => {
      const source = area();
      const effects: SimEffect[] = [];
      source.subscribe((event) => {
        if (event.type === 'effect') effects.push(event.effect);
      });
      place(source, 'minecraft:gravel', floor(1, 1));
      use(source, at(1, 0, 1), 'sim_parity:brush');
      expect(name(source, at(1, 0, 1))).toBe('minecraft:sand');
      expect(effects.some((one) => one.id === 'minecraft:item.brush.brushing.generic')).toBe(true);
      expect(effects.some((one) => one.kind === 'particle' && one.id === 'minecraft:scrape')).toBe(
        true,
      );
      expect(said(source, 'the faces down')).toBe(true);
      expect(said(source, 'the loot of sim_parity:brushed')).toBe(true);
      // A project tag works; vanilla's own tags are not in the preview and are said.
      place(source, 'minecraft:sandstone', floor(3, 1));
      use(source, at(3, 0, 1), 'sim_parity:brush');
      expect(name(source, at(3, 0, 1))).toBe('minecraft:red_sand');
      place(source, 'minecraft:stone', floor(5, 1));
      use(source, at(5, 0, 1), 'sim_parity:brush');
      expect(name(source, at(5, 0, 1))).toBe('minecraft:stone');
      expect(said(source, 'the block tag #minecraft:logs')).toBe(true);
    });

    it('says an item naming a transformer the project lacks', () => {
      const source = area();
      place(source, 'minecraft:gravel', floor(1, 1));
      use(source, at(1, 0, 1), 'sim_parity:odd');
      expect(name(source, at(1, 0, 1))).toBe('minecraft:gravel');
      expect(said(source, 'which the project does not have')).toBe(true);
    });

    it('says ageing and burning rules once, not doing them', () => {
      const withAgeing = new Map(files);
      withAgeing.set(
        'msm/sim_parity/vanilla_block_rules/more.json',
        JSON.stringify({
          format: 1,
          age: [{ block: 'minecraft:stone', next: 'minecraft:cobblestone' }],
          burn: [{ block: 'minecraft:stone', burn_odds: 5, ignite_odds: 20 }],
        }),
      );
      const source = new LocalWorldSource({ files: withAgeing, target, seed: 5 });
      expect(said(source, 'ageing into Cobblestone')).toBe(true);
      expect(said(source, 'the preview has no fire')).toBe(true);
    });

    it('offers the rules’ blocks and their tools for the hotbar', () => {
      const things = ruleThings(files, target.folders.data.block_transformer);
      expect(things.blocks).toEqual(
        expect.arrayContaining([
          'minecraft:basalt',
          'minecraft:clay',
          'minecraft:end_stone',
          'minecraft:gravel',
          'minecraft:oak_log',
          'minecraft:packed_mud',
        ]),
      );
      expect(things.tools).toEqual(
        expect.arrayContaining([
          'minecraft:iron_axe',
          'minecraft:iron_shovel',
          'minecraft:iron_hoe',
          'minecraft:honeycomb',
          'sim_parity:brush',
        ]),
      );
    });
  },
);

describe('block transformer reading', () => {
  it('knows the tools of vanilla items and of item definitions', () => {
    expect(transformerOfVanillaItem('minecraft:netherite_axe')).toBe('minecraft:axe');
    expect(transformerOfVanillaItem('minecraft:wooden_pickaxe')).toBeUndefined();
    expect(transformerOfVanillaItem('minecraft:stone_hoe')).toBe('minecraft:hoe');
    expect(
      transformerOfDefinition({
        components: { 'msm:components': { 'minecraft:block_transformer': 'axe' } },
      }),
    ).toBe('minecraft:axe');
    expect(transformerOfDefinition({ components: { 'msm:tool': { type: 'sword' } } })).toBe(
      undefined,
    );
  });

  it('gives states for plain, simple and rule-based providers, and says the rest', () => {
    const none = () => undefined;
    expect(provideState({ id: 'minecraft:dirt' }, 'minecraft:stone', none)).toEqual({
      kind: 'state',
      state: { id: 'minecraft:dirt', properties: {} },
    });
    expect(
      provideState(
        {
          type: 'minecraft:simple',
          state: { Name: 'minecraft:dirt', Properties: { snowy: 'true' } },
        },
        'minecraft:stone',
        none,
      ),
    ).toEqual({ kind: 'state', state: { id: 'minecraft:dirt', properties: { snowy: 'true' } } });
    const ruled = {
      type: 'minecraft:rule_based',
      rules: [rule('minecraft:stone', { id: 'minecraft:cobblestone' })],
    };
    expect(provideState(ruled, 'minecraft:dirt', none)).toEqual({ kind: 'none' });
    expect(
      provideState({ ...ruled, fallback: { id: 'minecraft:air' } }, 'minecraft:dirt', none),
    ).toEqual({ kind: 'state', state: { id: 'minecraft:air', properties: {} } });
    expect(provideState('minecraft:named', 'minecraft:dirt', none).kind).toBe('unknown');
    expect(
      provideState(
        {
          type: 'minecraft:rule_based',
          rules: [
            {
              if_true: {
                type: 'minecraft:matching_blocks',
                blocks: 'minecraft:dirt',
                offset: [0, 1, 0],
              },
              // biome-ignore lint/suspicious/noThenProperty: the game's own key
              then: { id: 'minecraft:stone' },
            },
          ],
        },
        'minecraft:dirt',
        none,
      ),
    ).toEqual({ kind: 'unknown', what: 'a test of a block beside the one used (an offset)' });
    expect(
      provideState(
        {
          type: 'minecraft:rule_based',
          rules: [
            {
              if_true: {
                type: 'minecraft:not',
                predicate: { type: 'minecraft:matching_blocks', blocks: ['minecraft:dirt'] },
              },
              // biome-ignore lint/suspicious/noThenProperty: the game's own key
              then: { id: 'minecraft:stone' },
            },
          ],
        },
        'minecraft:sand',
        none,
      ),
    ).toEqual({ kind: 'state', state: { id: 'minecraft:stone', properties: {} } });
  });

  it('lists a transformer as rows of before and after', () => {
    const rows = transformerRows(
      JSON.parse(EXTRA['data/sim_parity/block_transformer/brush.json'] as string),
    );
    expect(rows.map((row) => [row.step, row.before, row.after?.id ?? row.unknown])).toEqual([
      [0, ['minecraft:gravel'], 'minecraft:sand'],
      [0, ['#sim_parity:sandy'], 'minecraft:red_sand'],
      [0, ['#minecraft:logs'], 'minecraft:stone'],
      [1, ['minecraft:sandstone'], 'the block state provider minecraft:weighted_state_provider'],
    ]);
  });
});
