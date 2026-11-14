/**
 * Golden tests of the compiler (B365): one sample per catalogue entry (`samples.ts`) is compiled
 * against the test project; the patches and problems are compared with
 * `fixtures/goldens/<name>.json` and the script with `fixtures/goldens/<name>.ts`. Every sample
 * book is valid against the `msm:rules` schema, compiles without problems, and its patched
 * subjects validate against their element schemas on every built-in target. Set
 * `UPDATE_GOLDENS=1` to rewrite the expected files instead of comparing.
 */
import { existsSync } from 'node:fs';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { compileRuleBook } from '../src/compile';
import { SAMPLES } from './samples';
import {
  applyPatches,
  blockingProblems,
  book,
  golden,
  indexesFor,
  PROJECT,
  sortedJson,
  UPDATE,
} from './support';

const FIXTURES = new URL('./fixtures/goldens/', import.meta.url);
const [defaultTarget] = builtInTargets;

describe('rule compiler goldens', () => {
  it('has a target', () => {
    expect(defaultTarget).toBeDefined();
  });

  for (const sample of SAMPLES) {
    it(`compiles ${sample.name}`, async () => {
      if (defaultTarget === undefined) return;
      const element = book(sample.rules, sample.counters ?? []);
      const result = compileRuleBook(element, PROJECT, defaultTarget.target);
      expect(result.problems).toEqual([]);

      const json = sortedJson({ patches: result.patches, problems: result.problems });
      const expectedJson = await golden(new URL(`${sample.name}.json`, FIXTURES), json);
      if (expectedJson !== null) expect(json).toBe(expectedJson);

      const scriptUrl = new URL(`${sample.name}.ts`, FIXTURES);
      if (result.script === null) {
        if (!UPDATE) expect(existsSync(scriptUrl)).toBe(false);
      } else {
        const text = `${result.script.join('\n')}\n`;
        const expectedScript = await golden(scriptUrl, text);
        if (expectedScript !== null) expect(text).toBe(expectedScript);
      }

      for (const bundle of builtInTargets) {
        const indexes = await indexesFor(bundle);
        expect(blockingProblems(indexes, 'msm:rules', element.data), bundle.target.id).toEqual([]);
        for (const patched of applyPatches(PROJECT, result.patches)) {
          expect(
            blockingProblems(indexes, patched.kind, patched.data),
            `${bundle.target.id} ${patched.id}`,
          ).toEqual([]);
        }
      }
    });
  }
});
