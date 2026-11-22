import { ART_RECIPE_NAMES, PLACEHOLDER_PATTERN_NAMES } from '@msm/ai';
import { ART_RECIPE_IDS, PLACEHOLDER_PATTERNS } from '@msm/plugin-library';
import { describe, expect, it } from 'vitest';

// `@msm/ai` may not depend on plugins, so it keeps hand-kept copies of the library's pattern
// names and drawn recipe ids for the `create_texture` schema; this test keeps them in step.
describe('AI helper placeholder patterns', () => {
  it('lists every pattern the library exports, in the same order', () => {
    expect([...PLACEHOLDER_PATTERN_NAMES]).toEqual([...PLACEHOLDER_PATTERNS]);
  });

  it('lists every drawn recipe the library exports, in the same order (ADR 0092 D15)', () => {
    expect([...ART_RECIPE_NAMES]).toEqual([...ART_RECIPE_IDS]);
  });
});
