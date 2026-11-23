/**
 * The spike B634's processor sample rebuilt in memory for B638's tests: an 8 by 4 by 8 template
 * with a stone floor, 2 more stone, one jigsaw, one chest, the 40 candidate blocks in the counts the
 * spike's results give (`docs/reference/spikes/b634/results/processors-*.json`, one placement's
 * share of each input) and 124 air. The lists below are written from the README's description of
 * each fixture ("Processor list for B638"); the spike's own list files were throwaway. The tag files
 * are MSM's own, holding the members the spike observed.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PieceTemplate, ProcessorWorld, TemplateBlock } from '../../src/structures/api';
import { type ProcessOptions, processTemplate } from '../../src/structures/processors';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
export const RESULTS = join(REPO_ROOT, 'docs/reference/spikes/b634/results');
/** The spike's processor results, one file per version and world seed. */
export const RESULT_FILES = readdirSync(RESULTS)
  .filter((f) => /^processors-.*\.json$/.test(f))
  .sort();

export interface SpikeRow {
  readonly changed: Record<string, Record<string, number>>;
  readonly unchanged_inputs: readonly string[];
  readonly chest?: string;
}

export function readResults(file: string): Record<string, SpikeRow> {
  return JSON.parse(readFileSync(join(RESULTS, file), 'utf8')) as Record<string, SpikeRow>;
}

const STAIR_NORTH =
  'minecraft:stone_brick_stairs[facing=north,half=bottom,shape=straight,waterlogged=false]';
const STAIR_SOUTH =
  'minecraft:stone_brick_stairs[facing=south,half=bottom,shape=straight,waterlogged=false]';

/** One placement's count of each candidate (the spike's n over its 6 placements). */
const CANDIDATES: readonly (readonly [string, number])[] = [
  ['andesite', 2],
  ['blackstone', 1],
  ['bricks', 1],
  ['chiseled_stone_bricks', 2],
  ['cobbled_deepslate', 1],
  ['cobblestone', 2],
  ['cobblestone_slab', 2],
  ['cobblestone_stairs', 2],
  ['cobblestone_wall', 2],
  ['cracked_deepslate_bricks', 1],
  ['cracked_stone_bricks', 2],
  ['deepslate_bricks', 1],
  ['diamond_block', 1],
  ['dirt', 1],
  ['emerald_block', 1],
  ['gold_block', 2],
  ['granite', 2],
  ['gravel', 1],
  ['iron_bars', 1],
  ['mossy_cobblestone', 2],
  ['mossy_stone_bricks', 2],
  ['oak_log', 2],
  ['oak_planks', 2],
  ['obsidian', 1],
  ['polished_andesite', 2],
  ['polished_blackstone_bricks', 1],
  ['sand', 1],
  ['sandstone', 1],
  ['smooth_stone', 2],
  ['smooth_stone_slab', 2],
  ['stone_brick_slab', 2],
  ['stone_brick_wall', 2],
  ['stone_bricks', 2],
  ['stone_button', 2],
  ['stone_pressure_plate', 2],
  ['stone_slab', 2],
  ['stone_stairs', 2],
  ['tuff', 1],
];

/** The sample template: 256 cells, palette by name. */
export function sampleTemplate(): PieceTemplate {
  const palette: string[] = [];
  const index = (state: string): number => {
    let i = palette.indexOf(state);
    if (i === -1) {
      i = palette.length;
      palette.push(state);
    }
    return i;
  };
  const upper: { state: string; nbt?: unknown }[] = [
    { state: 'minecraft:stone' },
    { state: 'minecraft:stone' },
    {
      state: 'minecraft:jigsaw[orientation=up_north]',
      nbt: { final_state: 'minecraft:air', name: 'minecraft:empty', pool: 'minecraft:empty' },
    },
    { state: 'minecraft:chest[facing=north,type=single,waterlogged=false]', nbt: { Items: [] } },
    { state: STAIR_NORTH },
    { state: STAIR_NORTH },
    { state: STAIR_SOUTH },
  ];
  for (const [name, n] of CANDIDATES) {
    for (let k = 0; k < n; k += 1) upper.push({ state: `minecraft:${name}` });
  }
  const blocks: TemplateBlock[] = [];
  for (let x = 0; x < 8; x += 1) {
    for (let z = 0; z < 8; z += 1) blocks.push({ pos: [x, 0, z], state: index('minecraft:stone') });
  }
  // The upper three layers: a checkerboard of the other blocks, air between and after them.
  const cells: [number, number, number][] = [];
  for (let y = 1; y < 4; y += 1) {
    for (let x = 0; x < 8; x += 1) for (let z = 0; z < 8; z += 1) cells.push([x, y, z]);
  }
  const even = cells.filter(([x, y, z]) => (x + y + z) % 2 === 0);
  const odd = cells.filter(([x, y, z]) => (x + y + z) % 2 === 1);
  const order = [...even, ...odd];
  order.forEach((pos, i) => {
    const entry = upper[i];
    if (entry) {
      blocks.push({
        pos,
        state: index(entry.state),
        ...(entry.nbt === undefined ? {} : { nbt: entry.nbt }),
      });
    } else blocks.push({ pos, state: index('minecraft:air') });
  });
  return {
    id: 'msm_test:b634_sample',
    size: [8, 4, 8],
    jigsaws: [
      {
        pos: blocks.find((b) => palette[b.state]?.startsWith('minecraft:jigsaw'))?.pos ?? [0, 1, 0],
        orientation: 'up_north',
        name: 'minecraft:empty',
        target: 'minecraft:empty',
        pool: 'minecraft:empty',
        joint: 'rollable',
        finalState: 'minecraft:air',
        selectionPriority: 0,
        placementPriority: 0,
      },
    ],
    blocks,
    palette,
  };
}

/** A world of one block everywhere, the ground's first free y at `surface`. */
export function fillWorld(block: string, surface: number | null = -60): ProcessorWorld {
  return { blockAt: () => block, surfaceAt: () => surface };
}

/** MSM's own tag files for the tests. */
export const TAGS: Readonly<Record<string, unknown>> = {
  'minecraft:stone_bricks': {
    values: [
      'minecraft:stone_bricks',
      'minecraft:mossy_stone_bricks',
      'minecraft:cracked_stone_bricks',
      'minecraft:chiseled_stone_bricks',
    ],
  },
  'minecraft:features_cannot_replace': {
    values: [
      'minecraft:bedrock',
      'minecraft:spawner',
      'minecraft:chest',
      'minecraft:end_portal_frame',
    ],
  },
};

const rule = (input: unknown, output: unknown, extra: Record<string, unknown> = {}) => ({
  input_predicate: input,
  location_predicate: { predicate_type: 'minecraft:always_true' },
  output_state: output,
  ...extra,
});
const block = (name: string) => ({ predicate_type: 'minecraft:block_match', block: name });

/** The spike's fixtures as lists (MSM's reading of the README), with the world each stood on. */
export interface Fixture {
  readonly list: unknown;
  readonly world?: ProcessorWorld;
  readonly options?: ProcessOptions;
  readonly originY?: number;
}

export const FIXTURES: Readonly<Record<string, Fixture>> = {
  none: { list: { processors: [] } },
  nop: { list: { processors: [{ processor_type: 'minecraft:nop' }] } },
  jigsawrep: { list: { processors: [{ processor_type: 'minecraft:jigsaw_replacement' }] } },
  ignore: {
    list: {
      processors: [
        { processor_type: 'minecraft:block_ignore', blocks: ['minecraft:stone', 'minecraft:air'] },
      ],
    },
  },
  legacy: {
    list: { processors: [] },
    options: { element: { type: 'minecraft:legacy_single_pool_element' } },
  },
  rule_two: {
    list: {
      processors: [
        {
          processor_type: 'minecraft:rule',
          rules: [
            rule(block('minecraft:stone'), 'minecraft:iron_block'),
            rule(block('minecraft:stone'), 'minecraft:gold_block'),
          ],
        },
      ],
    },
  },
  two_lists: {
    list: {
      processors: [
        {
          processor_type: 'minecraft:rule',
          rules: [rule(block('minecraft:stone'), 'minecraft:iron_block')],
        },
        {
          processor_type: 'minecraft:rule',
          rules: [rule(block('minecraft:iron_block'), 'minecraft:gold_ore')],
        },
      ],
    },
  },
  rule_block: {
    list: {
      processors: [
        {
          processor_type: 'minecraft:rule',
          rules: [rule(block('minecraft:cobblestone'), 'minecraft:emerald_ore')],
        },
      ],
    },
  },
  inline: {
    list: [
      {
        processor_type: 'rule',
        rules: [rule(block('cobblestone'), { id: 'minecraft:emerald_ore' })],
      },
    ],
  },
  rule_state: {
    list: {
      processors: [
        {
          processor_type: 'minecraft:rule',
          rules: [
            rule(
              {
                predicate_type: 'minecraft:blockstate_match',
                block_state: {
                  id: 'minecraft:stone_brick_stairs',
                  properties: {
                    facing: 'north',
                    half: 'bottom',
                    shape: 'straight',
                    waterlogged: 'false',
                  },
                },
              },
              'minecraft:lapis_block',
            ),
          ],
        },
      ],
    },
  },
  rule_tag: {
    list: {
      processors: [
        {
          processor_type: 'minecraft:rule',
          rules: [
            rule(
              { predicate_type: 'minecraft:tag_match', tag: 'minecraft:stone_bricks' },
              'minecraft:redstone_block',
            ),
          ],
        },
      ],
    },
  },
  rule_allof: {
    list: {
      processors: [
        {
          processor_type: 'minecraft:rule',
          rules: [
            rule(
              {
                predicate_type: 'minecraft:all_of',
                rules: [
                  { predicate_type: 'minecraft:tag_match', tag: 'minecraft:stone_bricks' },
                  { predicate_type: 'minecraft:not', rule: block('minecraft:stone_bricks') },
                ],
              },
              'minecraft:copper_block',
            ),
          ],
        },
      ],
    },
  },
  rule_anyof: {
    list: {
      processors: [
        {
          processor_type: 'minecraft:rule',
          rules: [
            rule(
              {
                predicate_type: 'minecraft:any_of',
                rules: [block('minecraft:granite'), block('minecraft:tuff')],
              },
              'minecraft:copper_block',
            ),
          ],
        },
      ],
    },
  },
  rule_height: {
    originY: -59,
    list: {
      processors: [
        {
          processor_type: 'minecraft:rule',
          rules: [
            rule(
              {
                predicate_type: 'minecraft:all_of',
                rules: [
                  block('minecraft:stone'),
                  {
                    predicate_type: 'minecraft:height_match',
                    min_inclusive: -59,
                    max_inclusive: -59,
                  },
                ],
              },
              'minecraft:iron_block',
            ),
          ],
        },
      ],
    },
  },
  rule_loc: {
    world: fillWorld('minecraft:water'),
    list: {
      processors: [
        {
          processor_type: 'minecraft:rule',
          rules: [
            {
              input_predicate: { predicate_type: 'minecraft:always_true' },
              location_predicate: block('minecraft:water'),
              output_state: 'minecraft:tnt',
            },
          ],
        },
      ],
    },
  },
  blackstone: { list: { processors: [{ processor_type: 'minecraft:blackstone_replace' }] } },
  rule_rand: {
    list: {
      processors: [
        {
          processor_type: 'minecraft:rule',
          rules: [
            rule(
              {
                predicate_type: 'minecraft:random_block_match',
                block: 'minecraft:stone',
                probability: 0.3,
              },
              'minecraft:diamond_ore',
            ),
          ],
        },
      ],
    },
  },
  rule_rstate: {
    list: {
      processors: [
        {
          processor_type: 'minecraft:rule',
          rules: [
            rule(
              {
                predicate_type: 'minecraft:random_blockstate_match',
                block_state: {
                  id: 'minecraft:stone_brick_stairs',
                  properties: {
                    facing: 'north',
                    half: 'bottom',
                    shape: 'straight',
                    waterlogged: 'false',
                  },
                },
                probability: 0.5,
              },
              'minecraft:lapis_block',
            ),
          ],
        },
      ],
    },
  },
  rot50: { list: { processors: [{ processor_type: 'minecraft:block_rot', integrity: 0.5 }] } },
  rot50_tag: {
    list: {
      processors: [
        {
          processor_type: 'minecraft:block_rot',
          integrity: 0.5,
          rottable_blocks: '#minecraft:stone_bricks',
        },
      ],
    },
  },
  capped: {
    list: {
      processors: [
        {
          processor_type: 'minecraft:capped',
          limit: 5,
          delegate: {
            processor_type: 'minecraft:rule',
            rules: [rule(block('minecraft:stone'), 'minecraft:glowstone')],
          },
        },
      ],
    },
  },
  capped_u: {
    list: {
      processors: [
        {
          processor_type: 'minecraft:capped',
          limit: { type: 'minecraft:uniform', min_inclusive: 2, max_inclusive: 6 },
          delegate: {
            processor_type: 'minecraft:rule',
            rules: [rule(block('minecraft:stone'), 'minecraft:glowstone')],
          },
        },
      ],
    },
  },
  age0: { list: { processors: [{ processor_type: 'minecraft:block_age', mossiness: 0 }] } },
  age50: { list: { processors: [{ processor_type: 'minecraft:block_age', mossiness: 0.5 }] } },
  age100: { list: { processors: [{ processor_type: 'minecraft:block_age', mossiness: 1 }] } },
  lava: {
    world: fillWorld('minecraft:lava'),
    list: { processors: [{ processor_type: 'minecraft:lava_submerged_block' }] },
  },
};

/** Per input block (short name): how often each outcome came out, `(same)` for unchanged. */
export type Shares = Record<string, Record<string, number> & { n: number }>;

const short = (id: string) => id.replace(/^minecraft:/, '').replace(/\[.*$/, '');

/** Runs a fixture over several seeds and counts each input's outcomes as the spike did. */
export function runShares(name: string, placements: number, firstSeed = 1n): Shares {
  const fixture = FIXTURES[name];
  if (!fixture) throw new Error(`no fixture ${name}`);
  const template = sampleTemplate();
  const world = fixture.world ?? fillWorld('minecraft:glass');
  const counts: Record<string, Record<string, number>> = {};
  for (let p = 0; p < placements; p += 1) {
    const origin = [p * 16, fixture.originY ?? -59, 0] as const;
    const result = processTemplate(
      {
        template,
        list: fixture.list,
        rotation: 'none',
        origin,
        seed: firstSeed + BigInt(p),
        world,
      },
      { blockTag: (id) => TAGS[id], ...fixture.options },
    );
    // Cells are matched by their template position (no fixture here moves blocks).
    const byPos = new Map<string, string>();
    for (const b of result.after)
      byPos.set(`${b.pos[0]},${b.pos[1]},${b.pos[2]}`, result.palette[b.state] ?? '');
    for (const t of template.blocks ?? []) {
      const input = short(template.palette[t.state] ?? '');
      const outState = byPos.get(`${t.pos[0]},${t.pos[1]},${t.pos[2]}`);
      const out =
        outState === undefined ? short(world.blockAt(0, 0, 0) ?? 'minecraft:air') : short(outState);
      const key = out === input ? '(same)' : out;
      const row = counts[input] ?? {};
      counts[input] = row;
      row[key] = (row[key] ?? 0) + 1;
    }
  }
  const shares: Shares = {};
  for (const [input, row] of Object.entries(counts)) {
    const n = Object.values(row).reduce((a, b) => a + b, 0);
    const out: Record<string, number> & { n: number } = { n };
    for (const [k, v] of Object.entries(row)) out[k] = v / n;
    shares[input] = out;
  }
  return shares;
}
