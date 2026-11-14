import { PLACEHOLDER_PATTERN_NAMES } from '@msm/ai';
import { PLACEHOLDER_PATTERNS } from '@msm/plugin-library';
import { describe, expect, it } from 'vitest';

// `@msm/ai` may not depend on plugins, so it keeps a hand-kept copy of the library's pattern
// names for the `create_texture` schema; this test keeps the two in step.
describe('AI helper placeholder patterns', () => {
  it('lists every pattern the library exports, in the same order', () => {
    // The block family patterns of ADR 0069 D2 (B273) reach the AI helper's copy with B279.
    const pendingForAi = [
      'bark',
      'log_top',
      'stripped_log',
      'stripped_log_top',
      'planks',
      'door_top',
      'door_bottom',
      'trapdoor',
      'leaves',
      'sapling',
      'stone',
      'polished_stone',
      'bricks',
      'pillar_side',
      'pillar_top',
    ];
    const known = new Set<string>(PLACEHOLDER_PATTERN_NAMES);
    expect([
      ...PLACEHOLDER_PATTERN_NAMES,
      ...pendingForAi.filter((name) => !known.has(name)),
    ]).toEqual([...PLACEHOLDER_PATTERNS]);
  });
});
