import { MSM_RUNTIME_TYPINGS } from '@msm/plugin-scripting';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { createScriptingService, LruMemo } from '../src/main/platform/scripting';
import {
  CHECK_OPTIONS,
  createScriptingEngine,
  SCRIPT_LIB_FILES,
  TRANSPILE_OPTIONS,
} from '../src/main/platform/scripting-engine';

const NAME = 'msm/demo/script/glow.ts';
const engine = createScriptingEngine();

/** Whether the ES5 output holds a token Rhino 1.9.2 does not parse. */
function es2015Tokens(js: string): string[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, js);
  const found = new Set<string>();
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.ClassKeyword) found.add('class');
    if (token === ts.SyntaxKind.EqualsGreaterThanToken) found.add('=>');
    if (token === ts.SyntaxKind.AsyncKeyword) found.add('async');
    if (token === ts.SyntaxKind.OfKeyword) found.add('of');
    if (token === ts.SyntaxKind.LetKeyword || token === ts.SyntaxKind.ConstKeyword)
      found.add('let');
  }
  return [...found].sort();
}

describe('scripting engine: transpile (ADR 0031 D2)', () => {
  it('uses the decided options', () => {
    expect(TRANSPILE_OPTIONS).toMatchObject({
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.CommonJS,
      downlevelIteration: true,
      ignoreDeprecations: '6.0',
    });
    expect(CHECK_OPTIONS).toMatchObject({
      target: ts.ScriptTarget.ES2018,
      strict: true,
      noLib: true,
    });
  });

  it('lowers classes, for-of, async and arrows to ES5 CommonJS', () => {
    const source = [
      'import { msm as runtime } from "msm:runtime";',
      'class Counter { #n = 0; bump(): number { return ++this.#n; } }',
      'const counter = new Counter();',
      'async function later(): Promise<number> { return 1; }',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a template literal in the script source
      'for (const [key, value] of new Map([["a", 1]])) { runtime.log.info(`${key}=${value}`); }',
      'msm.events.on("player.join", (e) => { counter.bump(); void later(); });',
    ].join('\n');
    const result = engine.transpile(source, NAME);
    if (!('js' in result)) throw new Error(JSON.stringify(result.problems));
    expect(result.js.startsWith('"use strict";')).toBe(true);
    expect(result.js).toContain('require("msm:runtime")');
    expect(es2015Tokens(result.js)).toEqual([]);
    // Deterministic.
    expect(engine.transpile(source, NAME)).toEqual(result);
  });

  it('returns syntax errors with source offsets and lines', () => {
    const source = 'msm.log.info("ok");\nlet x = ;\n';
    const result = engine.transpile(source, NAME);
    if (!('problems' in result)) throw new Error('expected problems');
    expect(result.problems).toHaveLength(1);
    const [problem] = result.problems;
    expect(problem).toMatchObject({
      severity: 'error',
      code: 'typescript.syntax',
      tsCode: 1109,
      line: 1,
      start: 8,
    });
    expect(problem?.offset.start).toBe(source.indexOf(';', 20));
  });
});

describe('scripting engine: check (ADR 0032 D5)', () => {
  it('passes a script that uses the typings and the curated libs', () => {
    const source = [
      'msm.events.on("block.interact", (e) => {',
      '  if ([1, 2].includes(1) && "a".padStart(2).length === 2) e.cancel();',
      '  for (const [key, value] of Object.entries({ a: 1 })) msm.log.info(key + value);',
      '  const found = /(?<word>\\w+)/.exec("x")?.groups?.word;',
      '  new Map<string, number>().set("a", 1); void Promise.resolve(found);',
      '});',
    ].join('\n');
    expect(engine.check(source, NAME, MSM_RUNTIME_TYPINGS)).toEqual([]);
  });

  it('reports unknown API members as warnings on their line', () => {
    const source = 'msm.log.info("ok");\nmsm.nope();\n';
    const problems = engine.check(source, NAME, MSM_RUNTIME_TYPINGS);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      severity: 'warning',
      code: 'typescript.semantic',
      tsCode: 2339,
      line: 1,
      start: 4,
      end: 8,
    });
    expect(problems[0]?.message).toContain("'nope'");
  });

  it('reports syntax errors as errors', () => {
    const problems = engine.check('let x = ;', NAME, MSM_RUNTIME_TYPINGS);
    expect(problems.some((p) => p.severity === 'error' && p.code === 'typescript.syntax')).toBe(
      true,
    );
  });

  it('sees no DOM, Node or newer libs', () => {
    const source = 'document.title = "x";\nprocess.exit(0);\n[1].flat();\n';
    const lines = engine.check(source, NAME, MSM_RUNTIME_TYPINGS).map((p) => p.line);
    expect(lines).toEqual([0, 1, 2]);
  });

  it('bundles the curated lib set', () => {
    expect(Object.keys(SCRIPT_LIB_FILES)).toContain('lib.es2018.regexp.d.ts');
    expect(Object.keys(SCRIPT_LIB_FILES)).not.toContain('lib.dom.d.ts');
    for (const text of Object.values(SCRIPT_LIB_FILES)) expect(text.length).toBeGreaterThan(100);
  });
});

describe('scripting service', () => {
  it('loads the engine lazily, once, and memoises per source', async () => {
    const transpile = vi.fn(engine.transpile);
    const check = vi.fn(engine.check);
    const load = vi.fn(async () => ({ createScriptingEngine: () => ({ transpile, check }) }));
    const service = createScriptingService({ load });
    expect(load).not.toHaveBeenCalled();
    const first = await service.transpile('let a = 1;', NAME);
    const second = await service.transpile('let a = 1;', NAME);
    expect(second).toEqual(first);
    expect(transpile).toHaveBeenCalledTimes(1);
    await service.transpile('let a = 2;', NAME);
    expect(transpile).toHaveBeenCalledTimes(2);
    await service.check('msm.nope();', NAME, MSM_RUNTIME_TYPINGS);
    await service.check('msm.nope();', NAME, MSM_RUNTIME_TYPINGS);
    expect(check).toHaveBeenCalledTimes(1);
    await service.check('msm.nope();', NAME, `${MSM_RUNTIME_TYPINGS}\n`);
    expect(check).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('retries a failed engine load and says why it failed', async () => {
    let attempts = 0;
    const service = createScriptingService({
      load: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('no compiler');
        return { createScriptingEngine: () => engine };
      },
    });
    await expect(service.transpile('let a = 1;', NAME)).rejects.toThrow(
      /TypeScript service could not start: no compiler/,
    );
    expect('js' in (await service.transpile('let a = 1;', NAME))).toBe(true);
  });

  it('loads the real engine by default', async () => {
    const result = await createScriptingService().check('msm.nope();', NAME, MSM_RUNTIME_TYPINGS);
    expect(result.map((p) => p.tsCode)).toEqual([2339]);
  });

  it('keeps a bounded LRU memo', () => {
    const memo = new LruMemo<number>(2);
    memo.set('a', 1);
    memo.set('b', 2);
    expect(memo.get('a')).toBe(1);
    memo.set('c', 3);
    expect(memo.get('b')).toBeUndefined();
    expect(memo.get('a')).toBe(1);
    expect(memo.size).toBe(2);
  });
});
