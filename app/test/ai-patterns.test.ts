import { PLACEHOLDER_PATTERN_NAMES } from '@msm/ai';
import { PLACEHOLDER_PATTERNS } from '@msm/plugin-library';
import { describe, expect, it } from 'vitest';

/**
 * Patterns the library added for status effects and throwables (ADRs 0055, 0056, B208) that the
 * AI helper's `create_texture` schema does not offer yet: adding them changes that tool's
 * schema, which the effects and throwables plan keeps byte-identical (B209). Remove a name here
 * when `@msm/ai` lists it.
 */
const NOT_YET_IN_AI_HELPER: readonly string[] = [
  'ball',
  'knife',
  'boomerang',
  'flask',
  'effect_icon',
];

// `@msm/ai` may not depend on plugins, so it keeps a hand-kept copy of the library's pattern
// names for the `create_texture` schema; this test keeps the two in step.
describe('AI helper placeholder patterns', () => {
  it('lists every pattern the library exports, in the same order', () => {
    expect([...PLACEHOLDER_PATTERN_NAMES]).toEqual(
      PLACEHOLDER_PATTERNS.filter((pattern) => !NOT_YET_IN_AI_HELPER.includes(pattern)),
    );
  });

  it('names only patterns the library has as not yet offered', () => {
    for (const pattern of NOT_YET_IN_AI_HELPER) {
      expect(PLACEHOLDER_PATTERNS as readonly string[]).toContain(pattern);
      expect(PLACEHOLDER_PATTERN_NAMES as readonly string[]).not.toContain(pattern);
    }
  });
});
