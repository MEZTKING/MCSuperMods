/**
 * The `controls.*` validators (ADR 0088 D8, ADR 0089 D9; B413): one test per code, the skips
 * without control facts, and the cases that must stay quiet.
 */
import type { Element, Json, Problem, TargetFacts } from '@msm/plugin-api';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, { CONTROLS_PROBLEM_CODES, controlsValidators } from '../src/index';
import { element, indexesFor, registryOf } from './support';

const firstBundle = builtInTargets[0] as TargetBundle;

/** Runs every validator of the plugin, as the app does. */
async function validate(
  elements: Element[],
  options: { target?: TargetFacts; bundle?: TargetBundle } = {},
): Promise<Problem[]> {
  const bundle = options.bundle ?? firstBundle;
  const registry = registryOf(await indexesFor(bundle));
  const target = options.target ?? bundle.target;
  const results = await Promise.all(
    (plugin.contributes.validators ?? []).map((validator) =>
      validator.validate({ elements, target, registry }),
    ),
  );
  return results.flat();
}

const withCode = (problems: Problem[], code: string): [string, string | undefined, string][] =>
  problems
    .filter((problem) => problem.code === `controls.${code}`)
    .map((problem) => [problem.elementId as string, problem.path, problem.severity]);

const keyBind = (id: string, data: Record<string, Json> = {}): Element =>
  element('msm:key_bind', id, { format: 1, default_key: 'key.keyboard.k', ...data });
const hud = (id: string, data: Record<string, Json> = {}): Element =>
  element('msm:hud', id, { format: 1, type: 'bar', value: { source: 'set' }, ...data });
const vehicle = (id: string): Element => element('msm:vehicle', id, { format: 1 });
const mob = (id: string): Element => element('msm:entity', id, { format: 1 });

describe('controls validators', () => {
  it('lists sixteen codes and three validators', () => {
    expect(CONTROLS_PROBLEM_CODES).toHaveLength(16);
    expect(new Set(CONTROLS_PROBLEM_CODES).size).toBe(16);
    expect(controlsValidators.map((validator) => validator.id)).toEqual([
      'msm.controls.key-binds',
      'msm.controls.hud',
      'msm.controls.hud-references',
    ]);
  });

  it('is quiet for a clean project and an empty one', async () => {
    expect(await validate([])).toEqual([]);
    expect(
      await validate([
        keyBind('demo:a', { default_key: 'key.keyboard.k' }),
        keyBind('demo:b', { default_key: 'key.keyboard.unknown' }),
        keyBind('demo:c', { default_key: 'key.keyboard.unknown' }),
        hud('demo:bar'),
      ]),
    ).toEqual([]);
  });

  describe('key binds', () => {
    it('controls.unknown-key: a name the target does not know', async () => {
      const problems = await validate([keyBind('demo:a', { default_key: 'key.keyboard.nope' })]);
      expect(withCode(problems, 'unknown-key')).toEqual([['demo:a', '/default_key', 'error']]);
    });

    it('controls.vanilla-key-clash: names the vanilla control, on both targets', async () => {
      for (const bundle of builtInTargets) {
        const problems = await validate([keyBind('demo:a', { default_key: 'key.keyboard.p' })], {
          bundle,
        });
        expect(withCode(problems, 'vanilla-key-clash'), bundle.target.id).toEqual([
          ['demo:a', '/default_key', 'warning'],
        ]);
        // P is a vanilla control whose name differs between targets: read it from the facts.
        const control = Object.entries(bundle.target.controls?.vanillaKeys ?? {}).find(
          ([name, key]) => key === 'key.keyboard.p' && !name.startsWith('key.debug.'),
        )?.[0];
        expect(control).toBeDefined();
        expect(problems[0]?.message).toContain(control as string);
      }
    });

    it('controls.vanilla-key-clash: debug combinations do not clash', async () => {
      // H is only F3+H (advanced tooltips).
      const problems = await validate([keyBind('demo:a', { default_key: 'key.keyboard.h' })]);
      expect(withCode(problems, 'vanilla-key-clash')).toEqual([]);
    });

    it('controls.runtime-key-clash: only when the project has a vehicle', async () => {
      const key = keyBind('demo:a', { default_key: 'key.keyboard.r' });
      expect(withCode(await validate([key]), 'runtime-key-clash')).toEqual([]);
      const problems = await validate([key, vehicle('demo:tank')]);
      expect(withCode(problems, 'runtime-key-clash')).toEqual([
        ['demo:a', '/default_key', 'warning'],
      ]);
      expect(problems.find((p) => p.code === 'controls.runtime-key-clash')?.message).toContain(
        'fire',
      );
    });

    it('controls.duplicate-key: two key binds on one key, not on unbound', async () => {
      const problems = await validate([
        keyBind('demo:a'),
        keyBind('demo:b'),
        keyBind('demo:c', { default_key: 'key.keyboard.j' }),
      ]);
      expect(withCode(problems, 'duplicate-key')).toEqual([
        ['demo:a', '/default_key', 'warning'],
        ['demo:b', '/default_key', 'warning'],
      ]);
    });

    it('controls.bad-category: not a lower-case id path', async () => {
      const problems = await validate([
        keyBind('demo:a', { category: 'My Keys' }),
        keyBind('demo:b', { category: 'a//b' }),
        keyBind('demo:c', { category: 'moves/fast-1.x' }),
      ]);
      expect(withCode(problems, 'bad-category')).toEqual([
        ['demo:a', '/category', 'error'],
        ['demo:b', '/category', 'error'],
      ]);
    });

    it('controls.name-conflict: one language key, two texts', async () => {
      const problems = await validate([
        keyBind('demo:a', { category_name: 'Moves', default_key: 'key.keyboard.j' }),
        keyBind('demo:b', { category_name: 'Spells' }),
        keyBind('demo:c', {
          category: 'other',
          category_name: 'Other',
          default_key: 'key.keyboard.u',
        }),
        keyBind('demo:d', { name: 'shared', display_name: 'One', default_key: 'key.keyboard.y' }),
        keyBind('demo:e', { name: 'shared', display_name: 'Two', default_key: 'key.keyboard.n' }),
        keyBind('demo:f', { category_name: 'Moves', default_key: 'key.keyboard.m' }),
      ]);
      expect(withCode(problems, 'name-conflict')).toEqual([
        ['demo:a', '/category_name', 'error'],
        ['demo:b', '/category_name', 'error'],
        ['demo:f', '/category_name', 'error'],
        ['demo:d', '/display_name', 'error'],
        ['demo:e', '/display_name', 'error'],
      ]);
    });

    it('controls.unknown-event: a trigger naming no event', async () => {
      const problems = await validate([
        keyBind('demo:a', {
          'msm:on_press': 'demo:go',
          'msm:while_held': 'demo:missing',
          events: { 'demo:go': { actions: [] } },
        }),
      ]);
      expect(withCode(problems, 'unknown-event')).toEqual([['demo:a', '/msm:while_held', 'error']]);
    });

    it('controls.key-runs-function: info on the first run_function', async () => {
      const problems = await validate([
        keyBind('demo:a', {
          events: {
            'demo:go': {
              actions: [
                { type: 'play_sound', sound: 'minecraft:block.note_block.bell' },
                { type: 'run_function', function: 'demo:reward' },
              ],
            },
          },
        }),
      ]);
      expect(withCode(problems, 'key-runs-function')).toEqual([
        ['demo:a', '/events/demo:go/actions/1', 'info'],
      ]);
    });

    it('controls.vehicle-without-when: vehicle with another when', async () => {
      const problems = await validate([
        keyBind('demo:a', { vehicle: 'demo:tank' }),
        keyBind('demo:b', { vehicle: 'demo:tank', when: 'on_foot', default_key: 'key.keyboard.j' }),
        keyBind('demo:c', { vehicle: 'demo:tank', when: 'driving', default_key: 'key.keyboard.u' }),
        vehicle('demo:tank'),
      ]);
      expect(withCode(problems, 'vehicle-without-when')).toEqual([
        ['demo:a', '/vehicle', 'error'],
        ['demo:b', '/vehicle', 'error'],
      ]);
    });

    it('controls.unknown-vehicle: a known entity that is not a project vehicle', async () => {
      const problems = await validate([
        keyBind('demo:a', { vehicle: 'minecraft:pig', when: 'in_vehicle' }),
        keyBind('demo:b', {
          vehicle: 'demo:guard',
          when: 'driving',
          default_key: 'key.keyboard.j',
        }),
        keyBind('demo:c', { vehicle: 'demo:tank', when: 'driving', default_key: 'key.keyboard.u' }),
        // Unknown to every registry: the schema's unknown-id, not repeated here.
        keyBind('demo:d', {
          vehicle: 'demo:nothing',
          when: 'driving',
          default_key: 'key.keyboard.y',
        }),
        mob('demo:guard'),
        vehicle('demo:tank'),
      ]);
      expect(withCode(problems, 'unknown-vehicle')).toEqual([
        ['demo:a', '/vehicle', 'error'],
        ['demo:b', '/vehicle', 'error'],
      ]);
    });

    it('skips the target fact checks without control facts', async () => {
      const { controls: _controls, ...target } = firstBundle.target;
      const problems = await validate(
        [
          keyBind('demo:a', { default_key: 'key.keyboard.nope' }),
          keyBind('demo:b', { default_key: 'key.keyboard.p' }),
          keyBind('demo:c', { default_key: 'key.keyboard.r' }),
          vehicle('demo:tank'),
        ],
        { target },
      );
      expect(problems).toEqual([]);
    });
  });

  describe('HUD elements', () => {
    it('controls.vehicle-without-show: vehicle with another show', async () => {
      const problems = await validate([
        hud('demo:a', { vehicle: 'demo:tank' }),
        hud('demo:b', { vehicle: 'demo:tank', show: 'driving' }),
        vehicle('demo:tank'),
      ]);
      expect(withCode(problems, 'vehicle-without-show')).toEqual([['demo:a', '/vehicle', 'error']]);
    });

    it('controls.unknown-vehicle: on HUD elements too', async () => {
      const problems = await validate([
        hud('demo:a', { vehicle: 'demo:guard', show: 'in_vehicle' }),
      ]);
      expect(withCode(problems, 'unknown-vehicle')).toEqual([['demo:a', '/vehicle', 'error']]);
    });

    it('controls.icons-need-icon: icons without an icon', async () => {
      const problems = await validate([
        hud('demo:a', { type: 'icons' }),
        hud('demo:b', { type: 'icons', icon: 'demo:hud/heart' }),
      ]);
      expect(withCode(problems, 'icons-need-icon')).toEqual([['demo:a', '/type', 'error']]);
    });

    it('controls.bad-color: not #rrggbb', async () => {
      const problems = await validate([
        hud('demo:a', { fill_color: 'red', back_color: '#202020' }),
        hud('demo:b', { type: 'text', color: '#fff' }),
        hud('demo:c', { type: 'text', color: '#A0B0C0' }),
      ]);
      expect(withCode(problems, 'bad-color')).toEqual([
        ['demo:a', '/fill_color', 'error'],
        ['demo:b', '/color', 'error'],
      ]);
    });

    it('controls.field-not-for-type: fields another type reads', async () => {
      const problems = await validate([
        hud('demo:bar', { text: '{value}', size: [10, 2] }),
        hud('demo:text', { type: 'text', max: 10, fill_color: '#ffffff', shadow: true }),
        hud('demo:icons', {
          type: 'icons',
          icon: 'demo:hud/heart',
          max: 10,
          sprite: 'demo:hud/mana',
        }),
      ]);
      expect(withCode(problems, 'field-not-for-type')).toEqual([
        ['demo:bar', '/text', 'warning'],
        ['demo:text', '/max', 'warning'],
        ['demo:text', '/fill_color', 'warning'],
        ['demo:icons', '/sprite', 'warning'],
      ]);
    });

    it('controls.unknown-objective: no project text creates it', async () => {
      const score = (objective: string): Json => ({ source: 'score', objective });
      const problems = await validate([
        hud('demo:a', { type: 'text', value: score('points') }),
        hud('demo:b', { value: score('kills'), max: score('goal') }),
        element('minecraft:function', 'demo:load', {
          lines: ['scoreboard objectives add kills playerKillCount'],
        }),
      ]);
      expect(withCode(problems, 'unknown-objective')).toEqual([
        ['demo:a', '/value/objective', 'info'],
        ['demo:b', '/max/objective', 'info'],
      ]);
    });

    it('controls.unknown-hud: show, hide and set steps naming no HUD element', async () => {
      const problems = await validate([
        hud('demo:mana'),
        keyBind('demo:a', {
          events: {
            'demo:go': {
              actions: [
                { type: 'show_hud', hud: 'demo:mana' },
                { type: 'hide_hud', hud: 'demo:gone' },
                { type: 'set_hud', hud: 'demo:missing', value: 3 },
              ],
            },
          },
        }),
        element('msm:block', 'demo:block', {
          format: 1,
          events: { 'demo:use': { actions: [{ type: 'show_hud', hud: 'demo:other' }] } },
        }),
      ]);
      expect(withCode(problems, 'unknown-hud')).toEqual([
        ['demo:a', '/events/demo:go/actions/1/hud', 'error'],
        ['demo:a', '/events/demo:go/actions/2/hud', 'error'],
        ['demo:block', '/events/demo:use/actions/0/hud', 'error'],
      ]);
    });
  });

  it('reports only listed codes', async () => {
    const problems = await validate([
      keyBind('demo:a', {
        default_key: 'key.keyboard.nope',
        category: 'X',
        vehicle: 'minecraft:pig',
      }),
      hud('demo:b', { type: 'icons', color: 'x', text: 'y', vehicle: 'demo:tank' }),
    ]);
    const listed = new Set<string>(CONTROLS_PROBLEM_CODES);
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) expect(listed.has(problem.code), problem.code).toBe(true);
  });
});
