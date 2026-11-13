import { PLACEHOLDER_PATTERN_NAMES } from '@msm/ai';
import { PLACEHOLDER_PATTERNS } from '@msm/plugin-library';
import { describe, expect, it } from 'vitest';

// `@msm/ai` may not depend on plugins, so it keeps a hand-kept copy of the library's pattern
// names for the `create_texture` schema; this test keeps the two in step.
describe('AI helper placeholder patterns', () => {
  it('lists every pattern the library exports, in the same order', () => {
    expect([...PLACEHOLDER_PATTERN_NAMES]).toEqual([...PLACEHOLDER_PATTERNS]);
  });
});
