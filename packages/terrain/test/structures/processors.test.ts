/**
 * B638: the structure processors against the spike B634's before-and-after worlds (both targets,
 * every result file) and their own rules. Exact rows must give the spike's outcome for every input
 * block; random rows the spike's shares within four standard errors; about-right rows only outcomes
 * the worlds showed.
 */
import { describe, expect, it } from 'vitest';
import type { PieceTemplate, ProcessInput } from '../../src/structures/api';
import { processTemplate } from '../../src/structures/processors';
import {
  FIXTURES,
  fillWorld,
  RESULT_FILES,
  readResults,
  runShares,
  sampleTemplate,
  TAGS,
} from './processor-fixtures';

const EXACT = [
  'none',
  'nop',
  'jigsawrep',
  'ignore',
  'legacy',
  'rule_two',
  'two_lists',
  'rule_block',
  'inline',
  'rule_state',
  'rule_tag',
  'rule_allof',
  'rule_anyof',
  'rule_height',
  'rule_loc',
  'blackstone',
] as const;

/**
 * Outcomes the world itself made after placing, not the processor: in `rule_loc` water flowed
 * back into some cells, so an input row holding water is the water's doing.
 */
const WORLD_OUTCOMES: Readonly<Record<string, string>> = { rule_loc: 'water' };

const base = (over: Partial<ProcessInput> = {}): ProcessInput => ({
  template: sampleTemplate(),
  list: { processors: [] },
  rotation: 'none',
  origin: [0, -59, 0],
  seed: 7n,
  world: fillWorld('minecraft:glass'),
  ...over,
});

function spikeRow(row: {
  changed: Record<string, Record<string, number>>;
  unchanged_inputs: readonly string[];
}) {
  const out: Record<string, Record<string, number>> = {};
  for (const input of row.unchanged_inputs) out[input] = { '(same)': 1 };
  for (const [input, shares] of Object.entries(row.changed)) {
    const { n: _n, ...rest } = shares;
    out[input] = rest;
  }
  return out;
}

describe.each(RESULT_FILES)('the spike’s worlds in %s', (file) => {
  const results = readResults(file);

  it.each(EXACT)('gives the outcome of %s for every input block', (name) => {
    const row = results[name];
    expect(row, `${name} in ${file}`).toBeDefined();
    if (!row) return;
    // The first world of one target placed the height sample off its height: no stone changed.
    if (name === 'rule_height' && !row.changed.stone) return;
    const ours = runShares(name, 6);
    const worldOutcome = WORLD_OUTCOMES[name];
    for (const [input, shares] of Object.entries(spikeRow(row))) {
      const mine = ours[input];
      expect(mine, `${name}: ${input} in the sample`).toBeDefined();
      if (!mine) continue;
      if (worldOutcome && worldOutcome in shares) continue;
      for (const [outcome, share] of Object.entries(shares)) {
        expect(mine[outcome] ?? 0, `${name}: ${input} to ${outcome}`).toBeCloseTo(share, 1);
      }
    }
  });

  it.each(['rule_rand', 'rule_rstate', 'rot50', 'rot50_tag'])(
    'gives the shares of %s within four standard errors',
    (name) => {
      const row = results[name];
      if (!row) throw new Error(`${name} missing`);
      const ours = runShares(name, 200);
      for (const [input, shares] of Object.entries(row.changed)) {
        if (input === 'jigsaw') continue;
        const n = shares.n ?? 1;
        const mine = ours[input];
        if (!mine) throw new Error(`${input} missing`);
        for (const [outcome, share] of Object.entries(shares)) {
          if (outcome === 'n') continue;
          // The pooled share's standard error of the difference of two shares.
          const p = (share * n + (mine[outcome] ?? 0) * mine.n) / (n + mine.n);
          const se = Math.sqrt(Math.max(p * (1 - p), 0.25 / (n + mine.n)) * (1 / n + 1 / mine.n));
          expect(
            Math.abs((mine[outcome] ?? 0) - share),
            `${name}: ${input} to ${outcome}`,
          ).toBeLessThanOrEqual(4 * se + 1e-9);
        }
      }
      for (const input of row.unchanged_inputs) {
        expect(ours[input]?.['(same)'], `${name}: ${input} unchanged`).toBe(1);
      }
    },
  );

  it.each(['age0', 'age50', 'age100'])('ages %s only into blocks the worlds showed', (name) => {
    const seen: Record<string, Set<string>> = {};
    for (const f of RESULT_FILES) {
      // Obsidian turned crying at every mossiness in some world, so its outcomes are pooled.
      for (const fixture of [name, 'age0', 'age50', 'age100']) {
        const row = readResults(f)[fixture];
        if (!row) continue;
        for (const [input, shares] of Object.entries(spikeRow(row))) {
          if (fixture !== name && input !== 'obsidian') continue;
          const set = seen[input] ?? new Set(['(same)']);
          seen[input] = set;
          for (const k of Object.keys(shares)) set.add(k);
        }
      }
    }
    const ours = runShares(name, 60);
    for (const [input, shares] of Object.entries(ours)) {
      for (const outcome of Object.keys(shares)) {
        if (outcome === 'n') continue;
        expect(seen[input]?.has(outcome), `${name}: ${input} to ${outcome}`).toBe(true);
      }
    }
    // Stone stays about half the time, as in every world.
    expect(ours.stone?.['(same)']).toBeGreaterThan(0.4);
    expect(ours.stone?.['(same)']).toBeLessThan(0.6);
  });

  it('leaves non-full blocks out over lava and places full ones', () => {
    const row = results.lava;
    if (!row) throw new Error('lava missing');
    const ours = runShares('lava', 6);
    // Air flows back over lava and sand falls into it: the world's doing, not the processor's.
    const worldEffects = new Set(['air', 'jigsaw', 'sand', 'stone_brick_stairs']);
    for (const [input, shares] of Object.entries(spikeRow(row))) {
      if (worldEffects.has(input)) continue;
      for (const [outcome, share] of Object.entries(shares)) {
        expect(ours[input]?.[outcome] ?? 0, `lava: ${input} to ${outcome}`).toBeCloseTo(share, 5);
      }
    }
  });

  it('caps the delegate at its limit', () => {
    const row = results.capped;
    const n = row?.changed.stone?.n ?? 0;
    const glowstone = row?.changed.stone?.glowstone ?? 0;
    // The spike: exactly 5 of 66 stones per placement.
    expect(Math.round((glowstone * n) / 6)).toBe(5);
  });
});

describe('capped', () => {
  it('changes exactly the limit when the delegate changes more', () => {
    for (let s = 0n; s < 40n; s += 1n) {
      const r = processTemplate(base({ seed: s, list: FIXTURES.capped?.list }));
      const row = r.rules.find((x) => x.type === 'minecraft:capped');
      expect(row?.changed).toBe(5);
      expect(row?.fidelity).toBe('exact');
    }
  });

  it('draws a uniform limit between its ends', () => {
    let total = 0;
    for (let s = 0n; s < 300n; s += 1n) {
      const r = processTemplate(base({ seed: s, list: FIXTURES.capped_u?.list }));
      const changed = r.rules.find((x) => x.type === 'minecraft:capped')?.changed ?? -1;
      expect(changed).toBeGreaterThanOrEqual(2);
      expect(changed).toBeLessThanOrEqual(6);
      total += changed;
    }
    expect(total / 300).toBeGreaterThan(3.6);
    expect(total / 300).toBeLessThan(4.4);
  });
});

describe('the rows and their counts', () => {
  it('lists the jigsaw placement first and counts what each processor changed', () => {
    const r = processTemplate(base({ list: FIXTURES.two_lists?.list }));
    expect(r.refused).toBeNull();
    expect(r.rules.map((x) => [x.type, x.changed, x.fidelity])).toEqual([
      ['minecraft:jigsaw_replacement', 1, 'exact'],
      ['minecraft:rule', 66, 'exact'],
      ['minecraft:rule', 66, 'exact'],
    ]);
    expect(r.after).toHaveLength(256);
    const gold = r.palette.indexOf('minecraft:gold_ore');
    expect(r.after.filter((b) => b.state === gold)).toHaveLength(66);
  });

  it('can leave the jigsaw blocks alone for a plain template', () => {
    const r = processTemplate(base(), { jigsawPlacement: false });
    expect(r.rules).toEqual([]);
    expect(r.after.some((b) => r.palette[b.state]?.startsWith('minecraft:jigsaw'))).toBe(true);
  });

  it('leaves out the legacy element’s air and says so', () => {
    const r = processTemplate(base(), {
      element: { type: 'minecraft:legacy_single_pool_element' },
    });
    expect(r.rules[1]).toMatchObject({
      type: 'minecraft:legacy_single_pool_element',
      changed: 125,
    });
    expect(r.after).toHaveLength(256 - 125);
  });

  it('gives the same result for the same seed and another for another', () => {
    const list = FIXTURES.rot50?.list;
    const a = processTemplate(base({ list, seed: 3n }));
    const b = processTemplate(base({ list, seed: 3n }));
    const c = processTemplate(base({ list, seed: 4n }));
    expect(b.after).toEqual(a.after);
    expect(c.after).not.toEqual(a.after);
  });

  it('reads block states as a name or { id, properties } and refuses { Name }', () => {
    const ok = processTemplate(
      base({
        list: [
          {
            processor_type: 'minecraft:rule',
            rules: [
              {
                input_predicate: {
                  predicate_type: 'minecraft:block_match',
                  block: 'minecraft:stone',
                },
                location_predicate: { predicate_type: 'minecraft:always_true' },
                output_state: { id: 'minecraft:oak_log', properties: { axis: 'x' } },
              },
            ],
          },
        ],
      }),
    );
    expect(ok.palette).toContain('minecraft:oak_log[axis=x]');
    const refused = processTemplate(
      base({
        list: [
          {
            processor_type: 'minecraft:rule',
            rules: [
              {
                input_predicate: {
                  predicate_type: 'minecraft:block_match',
                  block: 'minecraft:stone',
                },
                location_predicate: { predicate_type: 'minecraft:always_true' },
                output_state: { Name: 'minecraft:oak_log', Properties: { axis: 'x' } },
              },
            ],
          },
        ],
      }),
    );
    expect(refused.refused).toMatch(/refuses/);
    expect(refused.rules).toEqual([]);
    expect(refused.after).toEqual(refused.template.blocks);
  });
});

describe('the world under the template', () => {
  it('keeps the world’s protected blocks', () => {
    const world = {
      blockAt: (x: number, _y: number, z: number) =>
        (x + z) % 3 === 0 ? 'minecraft:bedrock' : 'minecraft:glass',
      surfaceAt: () => -60,
    };
    const r = processTemplate(
      base({
        world,
        list: [
          {
            processor_type: 'minecraft:protected_blocks',
            value: '#minecraft:features_cannot_replace',
          },
        ],
      }),
      { blockTag: (id) => TAGS[id] },
    );
    const kept = (r.template.blocks ?? []).filter((b) => (b.pos[0] + b.pos[2]) % 3 === 0).length;
    expect(r.rules[1]).toMatchObject({
      type: 'minecraft:protected_blocks',
      changed: kept,
      fidelity: 'exact',
    });
    expect(r.after.every((b) => (b.pos[0] + b.pos[2]) % 3 !== 0)).toBe(true);
  });

  it('drops a template onto the ground with gravity, offset included', () => {
    for (const offset of [0, -1]) {
      const r = processTemplate(
        base({
          origin: [0, -50, 0],
          list: [{ processor_type: 'minecraft:gravity', heightmap: 'WORLD_SURFACE_WG', offset }],
        }),
        { jigsawPlacement: false },
      );
      // Template y 0 lands at the first free y (-60) plus the offset; the column keeps its shape.
      const floor = r.after.filter((b) => b.pos[1] === -10 + offset);
      expect(floor).toHaveLength(64);
      expect(r.rules[0]?.fidelity).toBe('exact');
    }
  });

  it('calls gravity about right on uneven ground', () => {
    const r = processTemplate(
      base({
        world: { blockAt: () => null, surfaceAt: (x: number) => -60 + (x % 2) },
        list: [{ processor_type: 'minecraft:gravity', heightmap: 'WORLD_SURFACE_WG', offset: 0 }],
      }),
    );
    expect(r.rules.at(-1)?.fidelity).toBe('about_right');
  });

  it('turns the template before reading the world', () => {
    const lavaWest = {
      blockAt: (x: number) => (x < 0 ? 'minecraft:lava' : 'minecraft:glass'),
      surfaceAt: () => -60,
    };
    const list = [{ processor_type: 'minecraft:lava_submerged_block' }];
    const straight = processTemplate(base({ world: lavaWest, list }));
    const turned = processTemplate(base({ world: lavaWest, list, rotation: 'clockwise_180' }));
    expect(straight.rules.at(-1)?.changed).toBe(0);
    expect(turned.rules.at(-1)?.changed).toBeGreaterThan(0);
    expect(turned.rules.at(-1)?.fidelity).toBe('about_right');
  });

  it('makes a linear position test about right, more likely farther away', () => {
    const list = [
      {
        processor_type: 'minecraft:rule',
        rules: [
          {
            input_predicate: { predicate_type: 'minecraft:block_match', block: 'minecraft:stone' },
            location_predicate: { predicate_type: 'minecraft:always_true' },
            position_predicate: {
              predicate_type: 'minecraft:axis_aligned_linear_pos',
              axis: 'x',
              min_dist: 0,
              max_dist: 7,
              min_chance: 0,
              max_chance: 1,
            },
            output_state: 'minecraft:coal_block',
          },
        ],
      },
    ];
    let near = 0;
    let far = 0;
    for (let s = 0n; s < 50n; s += 1n) {
      const r = processTemplate(base({ list, seed: s }));
      const coal = r.palette.indexOf('minecraft:coal_block');
      for (const b of r.after) {
        if (b.state !== coal) continue;
        if (b.pos[0] === 0) near += 1;
        if (b.pos[0] === 7) far += 1;
      }
      expect(r.rules.at(-1)?.fidelity).toBe('about_right');
    }
    expect(near).toBe(0);
    expect(far).toBe(50 * 8);
  });
});

describe('block entities', () => {
  const chestRule = (modifier: unknown) => [
    {
      processor_type: 'minecraft:rule',
      rules: [
        {
          input_predicate: { predicate_type: 'minecraft:block_match', block: 'minecraft:chest' },
          location_predicate: { predicate_type: 'minecraft:always_true' },
          output_state: 'minecraft:chest',
          block_entity_modifier: modifier,
        },
      ],
    },
  ];
  const chestOf = (r: ReturnType<typeof processTemplate>) =>
    r.after.find((b) => r.palette[b.state]?.startsWith('minecraft:chest'))?.nbt as Record<
      string,
      unknown
    >;

  it('appends a loot table and a seed', () => {
    const r = processTemplate(
      base({
        list: chestRule({
          type: 'minecraft:append_loot',
          loot_table: 'minecraft:chests/simple_dungeon',
        }),
      }),
    );
    const nbt = chestOf(r);
    expect(nbt.LootTable).toBe('minecraft:chests/simple_dungeon');
    expect(typeof nbt.LootTableSeed).toBe('number');
    expect(nbt.Items).toEqual([]);
    expect(r.rules.at(-1)).toMatchObject({ changed: 1, fidelity: 'exact' });
  });

  it('merges static data', () => {
    const r = processTemplate(
      base({ list: chestRule({ type: 'minecraft:append_static', data: { CustomName: 'b634' } }) }),
    );
    expect(chestOf(r).CustomName).toBe('b634');
  });

  it.each(['minecraft:clear', 'minecraft:passthrough'])('names %s and keeps the data', (type) => {
    const r = processTemplate(base({ list: chestRule({ type }) }));
    expect(chestOf(r)).toEqual({ Items: [] });
    expect(r.rules.at(-1)?.note).toMatch(/only in the game/);
  });
});

describe('what is only in the game', () => {
  it('names an unknown processor type and leaves the template unchanged for it', () => {
    const r = processTemplate(base({ list: [{ processor_type: 'msm_test:mystery' }] }), {
      jigsawPlacement: false,
    });
    expect(r.rules).toEqual([
      expect.objectContaining({ type: 'msm_test:mystery', fidelity: 'only_in_game', changed: 0 }),
    ]);
    expect(r.after).toHaveLength(256);
  });

  it('names a corner constraint on the targets that read it', () => {
    const element = { type: 'minecraft:single_pool_element', cornerConstraint: [{}] };
    const read = processTemplate(base({ facts: { readsCornerConstraint: true } }), { element });
    expect(read.rules.at(-1)).toMatchObject({
      type: 'corner_constraint',
      fidelity: 'only_in_game',
    });
    const unread = processTemplate(base({ facts: { readsCornerConstraint: false } }), { element });
    expect(unread.rules.at(-1)).toMatchObject({
      type: 'corner_constraint',
      fidelity: 'exact',
      changed: 0,
    });
  });

  it('says when a tag is not known', () => {
    const r = processTemplate(
      base({
        list: [
          {
            processor_type: 'minecraft:rule',
            rules: [
              {
                input_predicate: { predicate_type: 'minecraft:tag_match', tag: 'msm_test:nowhere' },
                location_predicate: { predicate_type: 'minecraft:always_true' },
                output_state: 'minecraft:tnt',
              },
            ],
          },
        ],
      }),
    );
    expect(r.rules.at(-1)?.note).toMatch(/msm_test:nowhere/);
    expect(r.rules.at(-1)?.fidelity).toBe('about_right');
  });

  it('shows a template with no blocks (a labelled box) as nothing changed', () => {
    const box: PieceTemplate = { ...sampleTemplate(), blocks: null };
    const r = processTemplate(base({ template: box, list: FIXTURES.blackstone?.list }));
    expect(r.after).toEqual([]);
    expect(r.rules.every((x) => x.changed === 0)).toBe(true);
  });
});
