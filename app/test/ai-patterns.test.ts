import { readFileSync } from 'node:fs';
import * as ai from '@msm/ai';
import { ART_RECIPE_NAMES, TEXTURE_PATTERN_NAMES } from '@msm/ai';
import { ART_RECIPE_IDS, PLACEHOLDER_PATTERNS } from '@msm/plugin-library';
import { describe, expect, it } from 'vitest';

// `@msm/ai` may not depend on plugins, so it keeps hand-kept copies of the library's pattern
// names and drawn recipe ids for the `create_texture` schema; this test keeps them in step.
describe('AI helper texture patterns', () => {
  it('lists every pattern the library exports, in the same order', () => {
    expect([...TEXTURE_PATTERN_NAMES]).toEqual([...PLACEHOLDER_PATTERNS]);
  });

  it('lists every drawn recipe the library exports, in the same order (ADR 0092 D15)', () => {
    expect([...ART_RECIPE_NAMES]).toEqual([...ART_RECIPE_IDS]);
  });

  // ADR 0125 F17: pictures are drawn, not placeholders; the word is left nowhere the helper's
  // package exports or its scripted answers say it.
  it('says "placeholder" in no export of @msm/ai and no scripted answer', () => {
    expect(Object.keys(ai).filter((name) => /placeholder/i.test(name))).toEqual([]);
    for (const file of ['ai-scenario.test.ts', 'ai-rules.test.ts']) {
      const text = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(text.match(/placeholder/gi) ?? [], file).toEqual([]);
    }
  });
});
