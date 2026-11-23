/**
 * The fixed query set (ADR 0124 D16): 85 % first and 95 % in the top three overall, floors of 75 %
 * and 85 % per class and 100 % for ids, commands and nonsense. Skipped until the engine, the
 * sources and the words have landed (B660 to B673); `golden-queries.json` is B650's draft and is
 * never regenerated: a change needs a reason.
 */

import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';

describe.skip('search golden queries', () => {
  it("has the spike's queries", () => {
    const file = new URL('./golden-queries.json', import.meta.url);
    JSON.parse(readFileSync(file, 'utf8'));
  });
});
