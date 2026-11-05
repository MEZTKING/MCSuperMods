import type { Element, Problem, ResourceLocation, ValidationInput } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { ENTITIES_PROBLEM_CODES, entitiesValidators } from '../src/index';
import { element, indexesFor } from './support';

const bundle = builtInTargets[0] as TargetBundle;

async function validate(elements: Element[], withTextures = true): Promise<Problem[]> {
  const { registries } = await indexesFor(bundle);
  const registry: ValidationInput['registry'] = withTextures
    ? registries
    : createRegistryIndex({ vanilla: {} });
  return entitiesValidators.flatMap((validator) =>
    validator.validate({ elements, target: bundle.target, registry }),
  );
}

const summary = (problems: Problem[]) =>
  problems.map((p) => [p.code, p.severity, p.elementId, p.path]);

const MODEL = 'example:entity/ruby_golem';
const ANIMATIONS = 'example:entity/ruby_golem_animations';
const TEXTURE = 'example:entity/ruby_golem';
const EGG_TEXTURE = 'example:item/ruby_golem_spawn_egg';

const geoModel = element('msm:geo_model', MODEL, {
  format_version: '1.12.0',
  'minecraft:geometry': [],
});
const animationSet = element('msm:animation', ANIMATIONS, {
  format_version: '1.8.0',
  animations: { idle: {}, walk: {}, attack: {} },
});

/** A clean entity: model, animations and textures all present; extra fields merged in. */
function entity(
  id: ResourceLocation,
  extra: Record<string, unknown> = {},
  animated: Record<string, unknown> = {},
  components: Record<string, unknown> = {},
): Element {
  return element('msm:entity', id, {
    format: 1,
    category: 'creature',
    size: { width: 1, height: 1 },
    spawn_egg: { texture: EGG_TEXTURE },
    components: {
      'msm:animated_model': {
        model: MODEL,
        animations: ANIMATIONS,
        texture: TEXTURE,
        idle: 'idle',
        walk: 'walk',
        attack: 'attack',
        ...animated,
      },
      ...components,
    },
    ...extra,
  } as never);
}

const withRefs = (...elements: Element[]): Element[] => [geoModel, animationSet, ...elements];

describe('entities validators', () => {
  it('lists every code it reports', () => {
    expect(ENTITIES_PROBLEM_CODES).toHaveLength(9);
  });

  it('accepts a clean project', async () => {
    const problems = await validate(
      withRefs(
        entity(
          'example:ruby_golem',
          {
            spawn: { biomes: ['minecraft:plains'], weight: 1, min_group: 2, max_group: 2 },
            events: {
              'example:a': { actions: [{ type: 'trigger_event', event: 'example:b' }] },
              'example:b': { actions: [{ type: 'play_animation', animation: 'attack' }] },
            },
          },
          {},
          {
            'msm:attack': { damage: 2, on_attack: 'example:a' },
            'msm:on_hurt': { event: 'example:b' },
            'msm:ai_goals': {
              goals: [
                { type: 'melee_attack', targets: ['minecraft:player'] },
                { type: 'melee_attack', retaliate: true },
              ],
            },
          },
        ),
        entity('example:quiet', { spawn_egg: false }, { animations: undefined }),
      ),
    );
    expect(problems).toEqual([]);
  });

  it('reports unknown events in trigger components and trigger_event actions', async () => {
    const problems = await validate(
      withRefs(
        entity(
          'example:a',
          { events: { 'example:ok': { actions: [{ type: 'trigger_event', event: 'example:z' }] } } },
          {},
          {
            'msm:attack': { damage: 1, on_attack: 'example:w' },
            'msm:on_hurt': { event: 'example:x' },
            'msm:on_death': { event: 'example:ok' },
            'msm:on_interact': { event: 'example:y' },
          },
        ),
      ),
    );
    expect(summary(problems)).toEqual([
      ['entities.unknown-event', 'error', 'example:a', '/components/msm:attack/on_attack'],
      ['entities.unknown-event', 'error', 'example:a', '/components/msm:on_hurt/event'],
      ['entities.unknown-event', 'error', 'example:a', '/components/msm:on_interact/event'],
      ['entities.unknown-event', 'error', 'example:a', '/events/example:ok/actions/0/event'],
    ]);
  });

  it('reports event cycles, including a self-loop', async () => {
    const trigger = (event: string) => ({ actions: [{ type: 'trigger_event', event }] });
    const problems = await validate(
      withRefs(
        entity('example:a', {
          events: {
            'example:x': trigger('example:y'),
            'example:y': trigger('example:x'),
            'example:z': trigger('example:x'),
          },
        }),
        entity('example:b', { events: { 'example/self': trigger('example/self') } }),
      ),
    );
    expect(summary(problems)).toEqual([
      ['entities.event-cycle', 'error', 'example:a', '/events/example:x'],
      ['entities.event-cycle', 'error', 'example:b', '/events/example~1self'],
    ]);
    expect(problems[0]?.message).toContain('"example:x", "example:y"');
  });

  it('reports a model that is not an msm:geo_model element', async () => {
    const problems = await validate([
      animationSet,
      // An element of another kind with the model id does not count.
      element('msm:animation', MODEL, { format_version: '1.8.0', animations: {} }),
      entity('example:a'),
      entity('example:b', {}, { model: '' }),
    ]);
    expect(summary(problems)).toEqual([
      ['entities.unknown-model', 'error', 'example:a', '/components/msm:animated_model/model'],
      ['entities.unknown-model', 'error', 'example:b', '/components/msm:animated_model/model'],
    ]);
    expect(problems[0]?.message).toContain(MODEL);
    expect(problems[1]?.message).toContain('no model');
  });

  it('reports animations that are not an msm:animation element', async () => {
    const problems = await validate([
      geoModel,
      entity('example:a'),
      entity('example:b', {}, { animations: '' }),
      entity('example:c', {}, { animations: undefined }),
    ]);
    expect(summary(problems)).toEqual([
      [
        'entities.unknown-animations',
        'error',
        'example:a',
        '/components/msm:animated_model/animations',
      ],
      [
        'entities.unknown-animations',
        'error',
        'example:b',
        '/components/msm:animated_model/animations',
      ],
    ]);
  });

  it('warns about animation names missing from the animation set', async () => {
    const problems = await validate(
      withRefs(
        entity(
          'example:a',
          {
            events: {
              'example:e': {
                actions: [
                  { type: 'play_animation', animation: 'walk' },
                  { type: 'play_animation', animation: 'dance' },
                ],
              },
            },
          },
          { idle: 'rest', attack: 'smash' },
        ),
      ),
    );
    expect(summary(problems)).toEqual([
      [
        'entities.unknown-animation-name',
        'warning',
        'example:a',
        '/components/msm:animated_model/idle',
      ],
      [
        'entities.unknown-animation-name',
        'warning',
        'example:a',
        '/components/msm:animated_model/attack',
      ],
      [
        'entities.unknown-animation-name',
        'warning',
        'example:a',
        '/events/example:e/actions/1/animation',
      ],
    ]);
    expect(problems[0]?.message).toContain('attack, idle, walk');
    // Without the animation element only unknown-animations is reported.
    const alone = await validate([geoModel, entity('example:a', {}, { idle: 'rest' })]);
    expect(alone.map((p) => p.code)).toEqual(['entities.unknown-animations']);
  });

  it('warns about a texture with no project PNG, unless the index has no textures', async () => {
    const elements = withRefs(
      entity('example:a', {}, { texture: 'example:entity/ghost' }),
      entity('example:b', {}, { texture: '' }),
    );
    expect(summary(await validate(elements))).toEqual([
      ['entities.missing-texture', 'warning', 'example:a', '/components/msm:animated_model/texture'],
      ['entities.missing-texture', 'warning', 'example:b', '/components/msm:animated_model/texture'],
    ]);
    expect((await validate(elements, false)).map((p) => p.code)).toEqual([]);
  });

  it('warns about a spawn egg without a texture or with an unknown one', async () => {
    const problems = await validate(
      withRefs(
        entity('example:a', { spawn_egg: {} }),
        entity('example:b', { spawn_egg: undefined }),
        entity('example:c', { spawn_egg: { texture: 'example:item/nothing' } }),
        entity('example:d', { spawn_egg: false }),
      ),
    );
    expect(summary(problems)).toEqual([
      ['entities.egg-texture-missing', 'warning', 'example:a', '/spawn_egg'],
      ['entities.egg-texture-missing', 'warning', 'example:b', '/spawn_egg'],
      ['entities.egg-texture-missing', 'warning', 'example:c', '/spawn_egg/texture'],
    ]);
    const noIndex = await validate(
      withRefs(
        entity('example:a', { spawn_egg: {} }),
        entity('example:c', { spawn_egg: { texture: 'example:item/nothing' } }),
      ),
      false,
    );
    expect(summary(noIndex)).toEqual([
      ['entities.egg-texture-missing', 'warning', 'example:a', '/spawn_egg'],
    ]);
  });

  it('reports a group range whose minimum exceeds its maximum', async () => {
    const spawn = (min: number, max: number) => ({
      spawn: { biomes: ['minecraft:plains'], weight: 1, min_group: min, max_group: max },
    });
    const problems = await validate(
      withRefs(entity('example:a', spawn(3, 2)), entity('example:b', spawn(2, 2))),
    );
    expect(summary(problems)).toEqual([
      ['entities.group-range', 'error', 'example:a', '/spawn/max_group'],
    ]);
    expect(problems[0]?.message).toContain('(2)');
  });

  it('warns about a melee attack that never attacks', async () => {
    const problems = await validate(
      withRefs(
        entity(
          'example:a',
          {},
          {},
          {
            'msm:ai_goals': {
              goals: [
                { type: 'wander' },
                { type: 'melee_attack' },
                { type: 'melee_attack', targets: [], retaliate: false },
                { type: 'melee_attack', targets: ['minecraft:pig'] },
                { type: 'melee_attack', retaliate: true },
              ],
            },
          },
        ),
      ),
    );
    expect(summary(problems)).toEqual([
      ['entities.goal-needs-targets', 'warning', 'example:a', '/components/msm:ai_goals/goals/1'],
      ['entities.goal-needs-targets', 'warning', 'example:a', '/components/msm:ai_goals/goals/2'],
    ]);
  });

  it('ignores elements of other kinds and tolerates malformed data', async () => {
    const problems = await validate([
      element('msm:block', 'example:a', { events: { x: { actions: [{ type: 'trigger_event', event: 'y' }] } } }),
      element('msm:entity', 'example:b', 'nonsense' as never),
      element('msm:entity', 'example:c', { components: { 'msm:ai_goals': { goals: 3 } }, spawn_egg: false } as never),
    ]);
    expect(problems).toEqual([]);
  });

  it('reports every listed code somewhere in these tests', () => {
    // Guard: the codes the suite asserts above are exactly the listed codes.
    expect([...ENTITIES_PROBLEM_CODES].sort()).toEqual(
      [
        'entities.egg-texture-missing',
        'entities.event-cycle',
        'entities.goal-needs-targets',
        'entities.group-range',
        'entities.missing-texture',
        'entities.unknown-animation-name',
        'entities.unknown-animations',
        'entities.unknown-event',
        'entities.unknown-model',
      ],
    );
  });
});
