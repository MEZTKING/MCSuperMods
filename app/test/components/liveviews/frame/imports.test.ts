import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP_SRC = fileURLToPath(new URL('../../../../src', import.meta.url));
const WORKER = ['renderer', 'src', 'liveviews', 'worker.ts'].join('/');
const EVALUATORS = [
  'rollLoot',
  'lootOdds',
  'resolveTag',
  'createTagResolver',
  'testPredicate',
  'applyItemModifier',
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry.name)) out.push(path);
  }
  return out;
}

/**
 * Whether source text takes one of `@msm/sim`'s evaluators as a value: a named import or
 * re-export that is not type-only, a namespace import, a dynamic import or a deep import of the
 * evaluators' folders.
 */
export function takesEvaluators(text: string): boolean {
  if (/['"]@msm\/sim\/(?:src\/)?(?:loot|tags|predicates)(?:\/[^'"]*)?['"]/.test(text)) return true;
  if (/\bimport\s*\(\s*['"]@msm\/sim['"]\s*\)/.test(text)) return true;
  if (/\bimport\s+\*\s+as\s+\w+\s+from\s+['"]@msm\/sim['"]/.test(text)) return true;
  const named = /\b(import|export)\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]@msm\/sim['"]/g;
  for (const match of text.matchAll(named)) {
    if (match[2] !== undefined) continue;
    for (const part of (match[3] ?? '').split(',')) {
      const words = part.trim().split(/\s+/);
      if (words[0] === 'type') continue;
      if (EVALUATORS.includes(words[0] ?? '')) return true;
    }
  }
  return false;
}

describe('the evaluators stay in the live views worker (ADR 0120 D12)', () => {
  it('no app source but liveviews/worker.ts takes them', () => {
    const offenders = sourceFiles(APP_SRC)
      .map((path) => relative(APP_SRC, path).split(sep).join('/'))
      .filter((path) => path !== WORKER)
      .filter((path) => takesEvaluators(readFileSync(join(APP_SRC, path), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the worker does take them (the check looks at the right file)', () => {
    expect(takesEvaluators(readFileSync(join(APP_SRC, WORKER), 'utf8'))).toBe(true);
  });

  it('the pattern catches every form of taking them, and lets types through', () => {
    for (const line of [
      "import { rollLoot } from '@msm/sim';",
      "import { type Situation, lootOdds as odds } from '@msm/sim';",
      "export { resolveTag } from '@msm/sim';",
      "import * as sim from '@msm/sim';",
      "const sim = await import('@msm/sim');",
      "import { x } from '@msm/sim/src/loot/api';",
    ]) {
      expect(takesEvaluators(line), line).toBe(true);
    }
    for (const line of [
      "import type { LootRoll, Situation } from '@msm/sim';",
      "import { type OddsStep, SimRandom } from '@msm/sim';",
      "import { readJsonFile } from '@msm/sim';",
    ]) {
      expect(takesEvaluators(line), line).toBe(false);
    }
  });
});
