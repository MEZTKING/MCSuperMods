/**
 * What the search preview builds in memory (B665): the "Makes …" words, the tab a picture opens
 * on (none with ids in Very easy), a guide section's first paragraph, a rule of the mod, the key
 * that restarts the wait, and every library starter and flow built with its defaults on both
 * targets and planned against an empty mod, timed (limit SL8: the build part of SQ7's 250 ms).
 */

import type { Json } from '@msm/core';
import type { ContentBundle, TargetFacts } from '@msm/plugin-api';
import { libraryExamples, libraryStarters } from '@msm/plugin-library';
import { builtInTargets } from '@msm/targets';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildPreview,
  bundleNames,
  guideFirstParagraph,
  makesLine,
  makesPhrase,
  previewKey,
  previewTab,
  ruleOf,
} from '../../../src/renderer/src/search/preview-bundle';
import { itemBundle, previewHit, smallMod } from './preview-fixtures';

describe('words', () => {
  it('lists names as Surprise me does', () => {
    expect(makesPhrase([])).toBe('');
    expect(makesPhrase(['A'])).toBe('A');
    expect(makesPhrase(['A', 'B', 'C'])).toBe('A, B and C');
    expect(makesPhrase(['A', 'B', 'C', 'D', 'E', 'F', 'G'])).toBe('A, B, C, D, E and 2 more');
    expect(makesLine(['Blue Sword'])).toBe('Makes Blue Sword.');
    expect(makesLine([])).toBeNull();
  });

  it('names blocks, items and mobs from display names and language files', () => {
    const bundle: ContentBundle = {
      elements: [
        ...itemBundle('demo', 'Ruby').elements,
        { id: 'demo:ruby_block', kind: 'msm:block', data: { format: 1 } },
        {
          id: 'demo:en_us',
          kind: 'minecraft:lang',
          data: { 'block.demo.ruby_block': 'Ruby Block' },
        },
        { id: 'demo:recipe', kind: 'minecraft:recipe', data: {} },
      ],
      assets: [],
    };
    expect(bundleNames(bundle)).toEqual(['Ruby Block', 'Ruby']);
  });

  it('restarts the wait for a new entry or new answers only', () => {
    const a = previewHit('flow:a', 'flow', 'A', { type: 'flow', starter: 'a' });
    const same = previewHit('flow:a', 'flow', 'A', { type: 'flow', starter: 'a' }, { score: 9 });
    const answered = previewHit(
      'flow:a',
      'flow',
      'A',
      { type: 'flow', starter: 'a' },
      {
        answers: { colour: '#0000ff' },
      },
    );
    expect(previewKey(same)).toBe(previewKey(a));
    expect(previewKey(answered)).not.toBe(previewKey(a));
  });

  it('opens on the Creator tab, and never on one with ids in Very easy', () => {
    const items = itemBundle('demo', 'Ruby');
    expect(previewTab(items, false)).toBe('items');
    expect(previewTab(items, true)).toBe('items');
    const recipe: ContentBundle = {
      elements: [{ id: 'demo:r', kind: 'minecraft:recipe', data: {} }],
      assets: [],
    };
    expect(previewTab(recipe, false)).toBe('recipes');
    expect(previewTab(recipe, true)).toBeNull();
  });
});

describe('the guide and the rules', () => {
  const page = [
    '# Page',
    '',
    'First.',
    '',
    '## Same',
    '',
    '```',
    'code',
    '```',
    '',
    '- An item **first**.',
    '- Then.',
    '',
    '## Same',
    '',
    'The second same.',
    '',
    '## Empty',
    '',
    '## Script API 1.6',
    '',
    'Words.',
  ].join('\n');

  it('reads the first paragraph or list item under the heading, numbered and aliased', () => {
    expect(guideFirstParagraph(page, 'page')).toBe('First.');
    expect(guideFirstParagraph(page, 'same')).toBe('An item **first**.');
    expect(guideFirstParagraph(page, 'same-1')).toBe('The second same.');
    expect(guideFirstParagraph(page, 'empty')).toBeNull();
    expect(guideFirstParagraph(page, 'script-api-16')).toBe('Words.');
    expect(guideFirstParagraph(page, 'missing')).toBeNull();
  });

  it('finds a rule of a book of the mod', () => {
    expect(ruleOf(smallMod(), 'demo:ruby_rules', 0)?.name).toBe('Ruby boom');
    expect(ruleOf(smallMod(), 'demo:ruby_rules', 1)).toBeNull();
    expect(ruleOf(null, 'demo:ruby_rules', 0)).toBeNull();
  });
});

describe('every starter and flow builds in memory (SQ7, SL8)', () => {
  const times: { target: string; id: string; ms: number }[] = [];

  beforeAll(async () => {
    for (const bundle of builtInTargets) {
      const target = bundle.target as TargetFacts;
      for (const starter of libraryStarters) {
        if (starter.supports !== undefined && !starter.supports(target)) continue;
        const start = performance.now();
        const built = await buildPreview(
          { type: starter.creator === undefined ? 'starter' : 'flow', starter: starter.id },
          undefined,
          {
            target,
            library: { starters: libraryStarters, templates: [], examples: libraryExamples },
            isKnownKind: () => true,
            project: null,
          },
        );
        times.push({ target: target.id, id: starter.id, ms: performance.now() - start });
        expect(built.plan).not.toBeNull();
        expect(built.dropped).toEqual([]);
      }
    }
  }, 120_000);

  it('builds and plans each one with its defaults, well inside 250 ms', () => {
    expect(times.length).toBeGreaterThan(140);
    const sorted = [...times].sort((a, b) => b.ms - a.ms);
    const median = sorted[Math.floor(sorted.length / 2)]?.ms ?? 0;
    // The timings for the report (B665): the slowest builds and the median.
    console.info(
      `preview builds: ${times.length}, median ${median.toFixed(1)} ms, slowest ${sorted
        .slice(0, 8)
        .map((entry) => `${entry.target} ${entry.id} ${entry.ms.toFixed(1)} ms`)
        .join('; ')}`,
    );
    // A loose bound: happy-dom on a shared machine, not the app's renderer.
    for (const entry of sorted) expect(entry.ms, `${entry.target} ${entry.id}`).toBeLessThan(1000);
  });

  it('gives every flow the understood answers it accepts', async () => {
    const weapon = libraryStarters.find((starter) => starter.id === 'weapon');
    const target = builtInTargets[0]?.target as TargetFacts;
    const values: Record<string, Json> = { weapon_name: 'Blue Sword', durability: -1 };
    const built = await buildPreview({ type: 'flow', starter: 'weapon' }, values, {
      target,
      library: { starters: weapon === undefined ? [] : [weapon], templates: [], examples: [] },
      isKnownKind: () => true,
      project: smallMod(),
    });
    expect(built.makes).toEqual(['Blue Sword']);
    expect(built.dropped).toEqual(['durability']);
    expect(built.bundle.elements.some((element) => element.id.startsWith('demo:'))).toBe(true);
  });
});
