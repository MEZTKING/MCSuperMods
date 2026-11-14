/**
 * The generated scripts type-check against the Script API typings and transpile to ES5 (B365),
 * through `ts-check.ts`.
 */
import type { Json } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { compileRuleBook } from '../src/compile';
import { SAMPLES } from './samples';
import { book, PROJECT } from './support';
import { check, transpile, withoutComments } from './ts-check';

const [defaultTarget] = builtInTargets;

/** Every sample's rules in one book, with distinct keys, so one script uses every entry. */
function everythingBook() {
  const rules: Json[] = [];
  const counters = new Map<string, Json>();
  SAMPLES.forEach((sample, index) => {
    for (const rule of sample.rules) {
      if (typeof rule === 'object' && rule !== null && !Array.isArray(rule)) {
        rules.push({ ...rule, key: `r${index}` });
      }
    }
    for (const counter of sample.counters ?? []) counters.set(JSON.stringify(counter), counter);
  });
  return book(rules, [...counters.values()]);
}

describe('generated scripts', () => {
  const scripts: { name: string; source: string }[] = [];
  if (defaultTarget !== undefined) {
    for (const sample of SAMPLES) {
      const result = compileRuleBook(
        book(sample.rules, sample.counters ?? []),
        PROJECT,
        defaultTarget.target,
      );
      if (result.script !== null)
        scripts.push({ name: sample.name, source: result.script.join('\n') });
    }
  }

  it('compiles most samples to scripts, against the real Script API 1.4 typings', () => {
    expect(scripts.length).toBeGreaterThan(30);
  });

  it('reports type errors (the check is real)', () => {
    expect(check('import { msm } from "msm:runtime";\nmsm.nothing();\n')).toHaveLength(1);
    expect(check('import { msm } from "msm:runtime";\nmsm.players().length;\n')).toEqual([]);
  });

  it('compiles one book using every step, condition and value into one script', () => {
    if (defaultTarget === undefined) return;
    const result = compileRuleBook(everythingBook(), PROJECT, defaultTarget.target);
    // The plain light_portal sample cannot share a trigger with rules that need a script.
    expect(result.problems.map((problem) => problem.code)).toEqual(['rules.needs-plain']);
    expect(result.script).not.toBeNull();
    const source = (result.script ?? []).join('\n');
    const problems = check(source);
    expect(problems).toEqual([]);
    const { js, errors } = transpile(source);
    expect(errors).toEqual([]);
    expect(withoutComments(js)).not.toMatch(/=>|\bclass\b|\blet\b|\bconst\b|`/);
  });

  for (const { name, source } of scripts) {
    it(`${name} type-checks and transpiles to ES5`, () => {
      expect(check(source)).toEqual([]);
      const { js, errors } = transpile(source);
      expect(errors).toEqual([]);
      expect(withoutComments(js)).not.toMatch(/=>|\bclass\b|\blet\b|\bconst\b|`/);
      expect(js).toContain('// rule:sample');
    });
  }
});
