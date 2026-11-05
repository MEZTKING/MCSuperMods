import type { Element, Problem, ResourceLocation } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { findHandlerDefinitions, SCRIPTING_PROBLEM_CODES, scriptingValidators } from '../src/index';
import { element } from './support';

const bundle = builtInTargets[0] as TargetBundle;

function validate(elements: Element[]): Problem[] {
  const registry = createRegistryIndex({ vanilla: {} });
  return scriptingValidators.flatMap((validator) => {
    const problems = validator.validate({ elements, target: bundle.target, registry });
    if (problems instanceof Promise) throw new Error(`${validator.id} validates asynchronously.`);
    return problems;
  });
}

const summary = (problems: Problem[]) =>
  problems.map((p) => [p.code, p.severity, p.elementId, p.path]);

const script = (id: ResourceLocation, lines: string[]): Element =>
  element('msm:script', id, { lines });

const runScript = (handler: string) => ({ actions: [{ type: 'run_script', handler }] });

const definition = (kind: string, id: ResourceLocation, events: Record<string, unknown>): Element =>
  element(kind, id, { format: 1, events } as never);

describe('scripting validators', () => {
  it('lists every code it reports', () => {
    expect(SCRIPTING_PROBLEM_CODES).toHaveLength(3);
  });

  it('accepts a clean project', () => {
    const problems = validate([
      script('demo:fx', [
        'msm.actions.define("demo:glow", (e) => {});',
        "msm.actions.define('demo:spark', (e) => {});",
      ]),
      definition('msm:block', 'demo:ore', {
        'demo:a': {
          actions: [
            { type: 'play_sound', sound: 'minecraft:block.stone.break' },
            { type: 'run_script', handler: 'demo:glow' },
          ],
        },
      }),
      definition('msm:item', 'demo:wand', { 'demo:b': runScript('demo:spark') }),
      definition('msm:entity', 'demo:mob', { 'demo:c': runScript('demo:glow') }),
    ]);
    expect(problems).toEqual([]);
  });

  it('warns about run_script actions naming undefined handlers', () => {
    const problems = validate([
      script('demo:fx', ['// msm.actions.define is written below', 'msm.log.info("x");']),
      definition('msm:block', 'demo:ore', { 'demo:a': runScript('demo:glow') }),
      definition('msm:item', 'demo:wand', {
        'demo:b': {
          actions: [{ type: 'trigger_event', event: 'demo:b' }, ...runScript('demo:x').actions],
        },
      }),
      definition('msm:entity', 'demo:mob', { 'demo:c/d': runScript('demo:y') }),
      // Not an owner kind: ignored.
      definition('minecraft:recipe', 'demo:r', { 'demo:e': runScript('demo:z') }),
    ]);
    expect(summary(problems)).toEqual([
      ['scripting.unknown-handler', 'warning', 'demo:ore', '/events/demo:a/actions/0/handler'],
      ['scripting.unknown-handler', 'warning', 'demo:wand', '/events/demo:b/actions/1/handler'],
      ['scripting.unknown-handler', 'warning', 'demo:mob', '/events/demo:c~1d/actions/0/handler'],
    ]);
    expect(problems[0]?.message).toContain('msm.actions.define("demo:glow"');
  });

  it('matches handlers exactly, in any script of the project', () => {
    const problems = validate([
      script('demo:a', ['msm.actions.define("demo:Glow", () => {});']),
      script('demo:b', ['msm . actions . define ( "demo:spark" , () => {});']),
      definition('msm:block', 'demo:ore', {
        'demo:a': {
          actions: [...runScript('demo:glow').actions, ...runScript('demo:spark').actions],
        },
      }),
    ]);
    expect(summary(problems)).toEqual([
      ['scripting.unknown-handler', 'warning', 'demo:ore', '/events/demo:a/actions/0/handler'],
    ]);
  });

  it('warns about handlers defined by more than one script, on each script', () => {
    const problems = validate([
      script('demo:one', ['', '  msm.actions.define("demo:glow", () => {});']),
      script('demo:two', [
        'msm.actions.define("demo:glow", () => {});',
        'msm.actions.define("demo:glow", () => {});',
      ]),
      script('demo:three', ['msm.actions.define("demo:other", () => {});']),
    ]);
    expect(summary(problems)).toEqual([
      ['scripting.duplicate-handler', 'warning', 'demo:one', '/lines/1'],
      ['scripting.duplicate-handler', 'warning', 'demo:two', '/lines/0'],
    ]);
    expect(problems[0]?.range).toEqual({ start: 22, end: 31 });
    expect(problems[0]?.message).toContain('demo:two');
    expect(problems[1]?.message).toContain('demo:one');
  });

  it('reports empty scripts as information', () => {
    const problems = validate([
      script('demo:blank', ['', '   ', '\t']),
      script('demo:none', []),
      element('msm:script', 'demo:broken', {}),
      script('demo:full', ['// a comment counts']),
    ]);
    expect(summary(problems)).toEqual([
      ['scripting.empty-script', 'info', 'demo:blank', '/lines'],
      ['scripting.empty-script', 'info', 'demo:none', '/lines'],
      ['scripting.empty-script', 'info', 'demo:broken', '/lines'],
    ]);
  });
});

describe('findHandlerDefinitions', () => {
  it('finds definitions with either quote, across lines, with the id span', () => {
    expect(
      findHandlerDefinitions([
        'msm.actions.define(',
        "  'demo:a', () => {});",
        'msm.actions.define("demo:b", f); msm.actions.define("demo:c", g);',
        'msm.actions.define(id, h);',
        'msm.actions.define("unterminated',
      ]),
    ).toEqual([
      { handler: 'demo:a', line: 1, range: { start: 3, end: 9 } },
      { handler: 'demo:b', line: 2, range: { start: 20, end: 26 } },
      { handler: 'demo:c', line: 2, range: { start: 53, end: 59 } },
    ]);
  });
});
