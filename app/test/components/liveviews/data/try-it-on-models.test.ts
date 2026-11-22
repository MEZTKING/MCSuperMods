import type { PartResult, Unsupported } from '@msm/sim';
import { defaultTargetId, targetFacts } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  effectLines,
  levelValueWords,
} from '../../../../src/renderer/src/liveviews/data/enchantment/effects';
import {
  costFieldsOf,
  levelAtModified,
  levelChances,
  levelTable,
  modifiedLevels,
  rangesText,
  slotCosts,
} from '../../../../src/renderer/src/liveviews/data/enchantment/table-model';
import {
  enchantmentWords,
  levelWords,
  plainText,
  stackLines,
} from '../../../../src/renderer/src/liveviews/data/enchantment/words';
import {
  ANSWER_WORDS,
  namesVanillaFile,
  partFidelity,
  partRows,
} from '../../../../src/renderer/src/liveviews/data/predicate/predicate-model';

/** MSM's own made-up enchantment: 1 + 11 per level, 21 + 11 per level, three levels. */
const FROST = {
  description: 'Frost',
  max_level: 3,
  weight: 5,
  anvil_cost: 2,
  min_cost: { base: 1, per_level_above_first: 11 },
  max_cost: { base: 21, per_level_above_first: 11 },
};

const lang = {
  'enchantment.level.1': 'I',
  'enchantment.level.2': 'II',
  'enchantment.level.10': 'X',
  'enchantment.minecraft.made_up': 'Made Up',
  'item.minecraft.diamond_sword': 'Diamond Sword',
  'demo.greeting': 'Hello %s',
};

describe('enchantment words (B600 2S11)', () => {
  it('names levels I to X from the language file and shows the raw key from 11 up', () => {
    expect(levelWords(2, lang)).toBe('II');
    expect(levelWords(10, lang)).toBe('X');
    expect(levelWords(11, lang)).toBe('enchantment.level.11');
    expect(levelWords(3, null)).toBe('III');
    expect(levelWords(12, null)).toBe('enchantment.level.12');
  });

  it('leaves out the level of a one-level enchantment and names it by description or key', () => {
    expect(enchantmentWords('demo:frost', 1, { name: 'Frost', maxLevel: 1 }, lang)).toBe('Frost');
    expect(enchantmentWords('demo:frost', 1, { name: 'Frost', maxLevel: 3 }, lang)).toBe('Frost I');
    expect(enchantmentWords('minecraft:made_up', 2, undefined, lang)).toBe('Made Up II');
  });

  it('makes text components plain', () => {
    expect(plainText({ translate: 'demo.greeting', with: ['Ann'] }, lang)).toBe('Hello Ann');
    expect(plainText([{ text: 'A' }, { text: 'B', extra: ['C'] }], null)).toBe('ABC');
    expect(plainText({ translate: 'demo.none', fallback: 'Fallback' }, null)).toBe('Fallback');
  });

  it('draws a stack: custom name, curse red, lore, durability from the share left', () => {
    const facts = targetFacts(defaultTargetId) ?? null;
    const lines = stackLines(
      {
        id: 'minecraft:diamond_sword',
        count: 1,
        enchantments: { 'demo:frost': 2, 'demo:doom': 1 },
        components: {
          'minecraft:custom_name': 'Ruby blade',
          'minecraft:lore': ['Made in a test'],
          'minecraft:rarity': 'epic',
        },
        damage: 0.5,
      },
      {
        lang,
        enchantments: (id) =>
          id === 'demo:frost' ? { name: 'Frost', maxLevel: 3 } : { name: 'Doom', maxLevel: 1 },
        curses: new Set(['demo:doom']),
        facts,
      },
    );
    expect(lines.map((line) => line.text)).toEqual([
      'Ruby blade',
      'Frost II',
      'Doom',
      'Made in a test',
      'Durability: 781 / 1561',
      'Also has: minecraft:rarity',
    ]);
    expect(lines[2]?.tone).toBe('curse');
    expect(lines[3]?.tone).toBe('lore');
  });
});

describe('the level table and the enchanting table (B600 2S11)', () => {
  it('reads the cost windows from the cost fields', () => {
    const fields = costFieldsOf(FROST);
    const rows = levelTable(fields, 10);
    expect(rows.map((row) => [row.level, row.minCost, row.maxCost])).toEqual([
      [1, 1, 21],
      [2, 12, 32],
      [3, 23, 43],
    ]);
    expect(levelAtModified(fields, 25)).toBe(3);
    expect(levelAtModified(fields, 44)).toBe(0);
  });

  it('follows a cost edit', () => {
    const edited = costFieldsOf({ ...FROST, min_cost: { base: 1, per_level_above_first: 5 } });
    expect(levelTable(edited, 10)[1]?.minCost).toBe(6);
  });

  it('gives modified levels whose chances add up to one', () => {
    for (const [cost, enchantability] of [
      [1, 1],
      [15, 10],
      [30, 22],
    ] as const) {
      const total = [...modifiedLevels(cost, enchantability).values()].reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 9);
      const levels = [...levelChances(costFieldsOf(FROST), cost, enchantability).values()];
      expect(levels.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
  });

  it('works out the three slots’ costs from the bookshelves', () => {
    expect(slotCosts(15)).toEqual([
      { min: 2, max: 10 },
      { min: 6, max: 21 },
      { min: 30, max: 30 },
    ]);
    expect(slotCosts(0)).toEqual([
      { min: 1, max: 2 },
      { min: 1, max: 6 },
      { min: 1, max: 8 },
    ]);
  });

  it('writes ranges', () => {
    expect(rangesText([1, 2, 3, 7, 9, 10])).toBe('1 to 3, 7, 9 to 10');
    expect(rangesText([])).toBe('');
  });

  it('words the effects, every id named', () => {
    const lines = effectLines({
      'minecraft:damage': [
        {
          effect: {
            type: 'minecraft:add',
            value: { type: 'minecraft:linear', base: 1, per_level_above_first: 0.5 },
          },
        },
      ],
      'demo:made_up': {},
    });
    expect(lines[0]?.words).toBe('Changes the damage dealt');
    expect(lines[0]?.details).toEqual(['adds 1 + 0.5 per level above the first']);
    expect(lines[1]?.words).toContain('demo:made_up');
    expect(levelValueWords(3)).toBe('3');
  });
});

describe('a predicate’s parts (B604)', () => {
  const tree: PartResult = {
    path: '',
    type: 'all_of',
    answer: 'unknown',
    parts: [
      { path: '/terms/0', type: 'random_chance', answer: 'yes', parts: [], chance: 0.25 },
      { path: '/terms/1', type: 'enchantment_active_check', answer: 'unknown', parts: [] },
      { path: '/terms/2', type: 'match_block', answer: 'no', parts: [], chance: 0 },
    ],
  };
  const notes: Unsupported[] = [
    {
      kind: 'condition',
      type: 'enchantment_active_check',
      path: '/terms/1',
      reason: 'needs_world',
    },
    { kind: 'number', type: 'score', path: '/terms/0/chance', reason: 'needs_world' },
  ];

  it('lays out every part with its answer, the unknown ones named at their path', () => {
    const rows = partRows(tree, notes);
    expect(rows.map((row) => [row.path, row.answer, row.depth])).toEqual([
      ['', 'unknown', 0],
      ['/terms/0', 'yes', 1],
      ['/terms/1', 'unknown', 1],
      ['/terms/2', 'no', 1],
    ]);
    expect(rows[2]?.unknown.map((n) => n.type)).toEqual(['enchantment_active_check']);
    expect(rows[1]?.unknown.map((n) => n.type)).toEqual(['score']);
    expect(rows[1]?.chance).toBe(0.25);
  });

  it('never words unknown as no, and claims checked only for measured types', () => {
    expect(ANSWER_WORDS.unknown).toBe('Only the game knows');
    expect(ANSWER_WORDS.unknown).not.toBe(ANSWER_WORDS.no);
    expect(partFidelity({ type: 'random_chance', answer: 'yes' })).toBe('checked');
    expect(partFidelity({ type: 'match_block', answer: 'no' })).toBe('about_right');
    expect(partFidelity({ type: 'random_chance', answer: 'unknown' })).toBe('only_in_game');
  });

  it('knows when the data names a vanilla file', () => {
    expect(namesVanillaFile({ items: '#minecraft:pickaxes' })).toBe(true);
    expect(namesVanillaFile({ items: 'minecraft:stone' })).toBe(false);
    expect(
      namesVanillaFile({}, [{ kind: 'reference', type: 'x', path: '', reason: 'missing_file' }]),
    ).toBe(true);
  });
});
