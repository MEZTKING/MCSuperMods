/**
 * The mob validators of ADRs 0070 to 0072 (`validators-mobs.ts`) and the mob additions to the
 * existing checks: one positive and one negative case per code, on a target with GeckoLib and one
 * (no GeckoLib) where the target matters.
 */
import type { Element, Problem, ResourceLocation, ValidationInput } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, { ENTITIES_MOB_PROBLEM_CODES, ENTITIES_PROBLEM_CODES } from '../src/index';
import { element, indexesFor } from './support';

const bundleWhere = (geckolib: boolean): TargetBundle => {
  const bundle = builtInTargets.find(
    (candidate) => (candidate.target.geckolib !== undefined) === geckolib,
  );
  if (bundle === undefined) throw new Error(`No built-in target with geckolib ${geckolib}`);
  return bundle;
};
/** A target with GeckoLib facts (the default target). */
const WITH_GECKOLIB = bundleWhere(true);
/** A target without GeckoLib facts, where `auto` mobs draw with the vanilla renderer. */
const WITHOUT_GECKOLIB = bundleWhere(false);
/** A projectile item only the target without GeckoLib lists (B283), if any. */
const NEWER_PROJECTILE = WITHOUT_GECKOLIB.target.entities?.projectileItems.find(
  (id) => !(WITH_GECKOLIB.target.entities?.projectileItems ?? []).includes(id),
);

async function validate(
  elements: Element[],
  bundle: TargetBundle = WITH_GECKOLIB,
  withTextures = true,
): Promise<Problem[]> {
  const { registries } = await indexesFor(bundle);
  const registry: ValidationInput['registry'] = withTextures
    ? registries
    : createRegistryIndex({ vanilla: {} });
  return (
    await Promise.all(
      (plugin.contributes.validators ?? []).map((validator) =>
        validator.validate({ elements, target: bundle.target, registry }),
      ),
    )
  ).flat();
}

const codes = (problems: Problem[]) => problems.map((p) => [p.code, p.severity, p.path]);
const only = (problems: Problem[], code: string) => problems.filter((p) => p.code === code);

const MODEL = 'example:entity/ruby_golem';
const ANIMATIONS = 'example:entity/ruby_golem_animations';
const TEXTURE = 'example:entity/ruby_golem';

const geoModel = element('msm:geo_model', MODEL, {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: { identifier: 'geometry.x', texture_width: 64, texture_height: 64 },
      bones: [{ name: 'body' }, { name: 'saddle', parent: 'body' }],
    },
  ],
});

const plainAnimations = {
  idle: { loop: true, bones: { body: { rotation: [0, 0, 0] } } },
  walk: {
    loop: true,
    bones: {
      body: {
        rotation: {
          '0.0': [0, 0, 0],
          '0.5': { post: [10, 0, 0], lerp_mode: 'catmullrom' },
        },
      },
    },
  },
  sit: {},
  fly: {},
  swim: {},
  shoot: {},
};

const animationSet = (animations: Record<string, unknown> = plainAnimations): Element =>
  element('msm:animation', ANIMATIONS, { format_version: '1.8.0', animations } as never);

/** A clean entity; `extra` merges into the data, `components` into its components. */
function entity(
  id: ResourceLocation,
  extra: Record<string, unknown> = {},
  components: Record<string, unknown> = {},
  animated: Record<string, unknown> = {},
): Element {
  return element('msm:entity', id, {
    format: 1,
    category: 'creature',
    size: { width: 1, height: 1 },
    spawn_egg: false,
    components: {
      'msm:animated_model': {
        model: MODEL,
        animations: ANIMATIONS,
        texture: TEXTURE,
        idle: 'idle',
        walk: 'walk',
        ...animated,
      },
      ...components,
    },
    ...extra,
  } as never);
}

const withRefs = (...elements: Element[]): Element[] => [geoModel, animationSet(), ...elements];

describe('entities mob validators', () => {
  it('lists every mob code inside ENTITIES_PROBLEM_CODES', () => {
    expect(ENTITIES_MOB_PROBLEM_CODES).toHaveLength(13);
    for (const code of ENTITIES_MOB_PROBLEM_CODES) expect(ENTITIES_PROBLEM_CODES).toContain(code);
    expect(new Set(ENTITIES_PROBLEM_CODES).size).toBe(ENTITIES_PROBLEM_CODES.length);
  });

  it('accepts a clean mount with every component on both targets', async () => {
    const mount = entity(
      'example:steed',
      {
        base: 'animal',
        spawn: {
          biomes: ['minecraft:plains'],
          weight: 1,
          min_group: 1,
          max_group: 1,
          rule: 'animal',
        },
      },
      {
        'msm:ranged_attack': { projectile: 'minecraft:arrow', on_shoot: 'example:shot' },
        'msm:ai_goals': { goals: [{ type: 'ranged_attack', targets: ['minecraft:zombie'] }] },
        'msm:tameable': { items: ['minecraft:bone'], on_tame: 'example:shot' },
        'msm:breedable': { items: ['minecraft:wheat'], on_breed: 'example:shot' },
        'msm:rideable': { controlled_by: 'owner', saddle_bone: 'saddle', on_mount: 'example:shot' },
        'msm:variants': {
          choose: 'biome',
          variants: [
            { id: 'a', texture: TEXTURE },
            { id: 'b', texture: TEXTURE, biomes: ['minecraft:plains'] },
          ],
        },
        'msm:boss_bar': {},
      },
      { renderer: 'vanilla', sit: 'sit', fly: 'fly', swim: 'swim', shoot: 'shoot' },
    );
    const withEvents = {
      ...mount,
      data: { ...(mount.data as object), events: { 'example:shot': { actions: [] } } },
    } as Element;
    expect(codes(await validate(withRefs(withEvents)))).toEqual([]);
    expect(codes(await validate(withRefs(withEvents), WITHOUT_GECKOLIB))).toEqual([]);
  });

  it('component-needs-base: tameable and breedable need an animal base', async () => {
    const components = {
      'msm:tameable': { items: ['minecraft:bone'] },
      'msm:breedable': { items: ['minecraft:wheat'] },
    };
    const problems = await validate(
      withRefs(
        entity('example:wrong', {}, components),
        entity('example:monster', { base: 'monster', category: 'monster' }, components),
        entity('example:right', { base: 'animal' }, components),
      ),
    );
    expect(
      only(problems, 'entities.component-needs-base').map((p) => [p.elementId, p.path, p.severity]),
    ).toEqual([
      ['example:wrong', '/components/msm:tameable', 'error'],
      ['example:wrong', '/components/msm:breedable', 'error'],
      ['example:monster', '/components/msm:tameable', 'error'],
      ['example:monster', '/components/msm:breedable', 'error'],
    ]);
  });

  it('ranged-goal-without-component and ranged-without-goal', async () => {
    const goal = {
      'msm:ai_goals': { goals: [{ type: 'wander' }, { type: 'ranged_attack', retaliate: true }] },
    };
    const ranged = { 'msm:ranged_attack': { projectile: 'minecraft:arrow' } };
    const problems = await validate(
      withRefs(
        entity('example:goal_only', {}, goal),
        entity('example:component_only', {}, ranged),
        entity('example:both', {}, { ...goal, ...ranged }),
      ),
    );
    expect(codes(problems)).toEqual([
      ['entities.ranged-goal-without-component', 'warning', '/components/msm:ai_goals/goals/1'],
      ['entities.ranged-without-goal', 'info', '/components/msm:ranged_attack'],
    ]);
    expect(problems.map((p) => p.elementId)).toEqual([
      'example:goal_only',
      'example:component_only',
    ]);
  });

  it('unknown-projectile: vanilla projectile items of the target or a throwable project item', async () => {
    const shooter = (id: ResourceLocation, projectile: string): Element =>
      entity(
        id,
        {},
        {
          'msm:ranged_attack': { projectile },
          'msm:ai_goals': { goals: [{ type: 'ranged_attack', retaliate: true }] },
        },
      );
    const rock = element('msm:item', 'example:rock', {
      format: 1,
      components: { 'msm:throwable': {} },
    });
    const pebble = element('msm:item', 'example:pebble', { format: 1, components: {} });
    const elements = withRefs(
      rock,
      pebble,
      shooter('example:a', 'minecraft:snowball'),
      shooter('example:b', 'example:rock'),
      shooter('example:c', 'minecraft:diamond'),
      shooter('example:d', 'example:pebble'),
      shooter('example:e', NEWER_PROJECTILE ?? 'minecraft:diamond'),
    );
    const withGeckolib = only(await validate(elements), 'entities.unknown-projectile');
    expect(withGeckolib.map((p) => [p.elementId, p.severity, p.path])).toEqual([
      ['example:c', 'error', '/components/msm:ranged_attack/projectile'],
      ['example:d', 'error', '/components/msm:ranged_attack/projectile'],
      ['example:e', 'error', '/components/msm:ranged_attack/projectile'],
    ]);
    expect(withGeckolib[1]?.message).toContain('"msm:throwable"');
    // The newer target adds a projectile item (B283).
    expect(NEWER_PROJECTILE).toBeDefined();
    const withoutGeckolib = only(
      await validate(elements, WITHOUT_GECKOLIB),
      'entities.unknown-projectile',
    );
    expect(withoutGeckolib.map((p) => p.elementId)).toEqual(['example:c', 'example:d']);
  });

  it('controlled-by-owner-needs-tameable', async () => {
    const problems = await validate(
      withRefs(
        entity('example:loose', {}, { 'msm:rideable': { controlled_by: 'owner' } }),
        entity('example:anyone', {}, { 'msm:rideable': { controlled_by: 'anyone' } }),
        entity(
          'example:pet',
          { base: 'animal' },
          {
            'msm:rideable': { controlled_by: 'owner' },
            'msm:tameable': { items: ['minecraft:bone'] },
          },
        ),
      ),
    );
    expect(codes(problems)).toEqual([
      [
        'entities.controlled-by-owner-needs-tameable',
        'warning',
        '/components/msm:rideable/controlled_by',
      ],
    ]);
    expect(problems[0]?.elementId).toBe('example:loose');
  });

  it('variant-texture-missing and duplicate-variant-id', async () => {
    const variants = {
      'msm:variants': {
        variants: [
          { id: 'red', texture: TEXTURE },
          { id: 'red', texture: 'example:entity/nowhere' },
          { id: 'blue', texture: '' },
        ],
      },
    };
    const problems = await validate(withRefs(entity('example:painted', {}, variants)));
    expect(codes(problems)).toEqual([
      ['entities.duplicate-variant-id', 'error', '/components/msm:variants/variants/1/id'],
      [
        'entities.variant-texture-missing',
        'warning',
        '/components/msm:variants/variants/1/texture',
      ],
      [
        'entities.variant-texture-missing',
        'warning',
        '/components/msm:variants/variants/2/texture',
      ],
    ]);
    // Without any textures in the index only the empty texture is reported.
    expect(
      codes(
        only(
          await validate(withRefs(entity('example:painted', {}, variants)), WITH_GECKOLIB, false),
          'entities.variant-texture-missing',
        ),
      ),
    ).toEqual([
      [
        'entities.variant-texture-missing',
        'warning',
        '/components/msm:variants/variants/2/texture',
      ],
    ]);
  });

  it('variants-without-biomes', async () => {
    const byBiome = (biomes: string[] | undefined) => ({
      'msm:variants': {
        choose: 'biome',
        variants: [{ id: 'a', texture: TEXTURE, ...(biomes === undefined ? {} : { biomes }) }],
      },
    });
    const problems = await validate(
      withRefs(
        entity('example:none', {}, byBiome(undefined)),
        entity('example:empty', {}, byBiome([])),
        entity('example:some', {}, byBiome(['minecraft:plains'])),
        entity(
          'example:random',
          {},
          { 'msm:variants': { variants: [{ id: 'a', texture: TEXTURE }] } },
        ),
      ),
    );
    expect(problems.map((p) => [p.code, p.severity, p.elementId, p.path])).toEqual([
      [
        'entities.variants-without-biomes',
        'info',
        'example:none',
        '/components/msm:variants/choose',
      ],
      [
        'entities.variants-without-biomes',
        'info',
        'example:empty',
        '/components/msm:variants/choose',
      ],
    ]);
  });

  it('saddle-bone-unknown', async () => {
    const problems = await validate(
      withRefs(
        entity('example:bad', {}, { 'msm:rideable': { saddle_bone: 'seat' } }),
        entity('example:good', {}, { 'msm:rideable': { saddle_bone: 'saddle' } }),
        entity(
          'example:no_model',
          {},
          { 'msm:rideable': { saddle_bone: 'seat' } },
          { model: 'example:entity/elsewhere' },
        ),
      ),
    );
    const saddle = only(problems, 'entities.saddle-bone-unknown');
    expect(saddle.map((p) => [p.elementId, p.severity, p.path])).toEqual([
      ['example:bad', 'warning', '/components/msm:rideable/saddle_bone'],
    ]);
    expect(saddle[0]?.message).toContain('body, saddle');
  });

  it('unknown-animation-name covers sit, fly, swim and shoot', async () => {
    const problems = await validate(
      withRefs(
        entity(
          'example:posed',
          {},
          {},
          { sit: 'sitting', fly: 'fly', swim: 'paddle', shoot: 'shoot' },
        ),
      ),
    );
    expect(codes(problems)).toEqual([
      ['entities.unknown-animation-name', 'warning', '/components/msm:animated_model/sit'],
      ['entities.unknown-animation-name', 'warning', '/components/msm:animated_model/swim'],
    ]);
  });

  it('unknown-event covers on_shoot, on_tame, on_breed and on_mount', async () => {
    const problems = await validate(
      withRefs(
        entity(
          'example:eventful',
          { base: 'animal' },
          {
            'msm:ranged_attack': { projectile: 'minecraft:arrow', on_shoot: 'example:a' },
            'msm:ai_goals': { goals: [{ type: 'ranged_attack', retaliate: true }] },
            'msm:tameable': { items: ['minecraft:bone'], on_tame: 'example:b' },
            'msm:breedable': { items: ['minecraft:wheat'], on_breed: 'example:c' },
            'msm:rideable': { on_mount: 'example:d' },
          },
        ),
      ),
    );
    expect(only(problems, 'entities.unknown-event').map((p) => p.path)).toEqual([
      '/components/msm:ranged_attack/on_shoot',
      '/components/msm:tameable/on_tame',
      '/components/msm:breedable/on_breed',
      '/components/msm:rideable/on_mount',
    ]);
  });

  it('vanilla-renderer-subset: Molang, easings and effect keyframes under the vanilla renderer', async () => {
    const fancy = animationSet({
      ...plainAnimations,
      idle: {
        loop: true,
        bones: { body: { rotation: ['math.sin(query.anim_time * 90) * 5', 0, 0] } },
      },
      walk: {
        loop: true,
        bones: { body: { position: { '0.0': { vector: [0, 0, 0], easing: 'easeInOutSine' } } } },
        sound_effects: { '0.2': { effect: 'step' } },
      },
      shoot: { particle_effects: { '0.0': { effect: 'flash' } }, timeline: { '0.0': 'v.x = 1;' } },
      fly: { bones: { body: { scale: { '0.0': { post: [1, 1, 1], lerp_mode: 'bezier' } } } } },
    });
    const elements = (renderer?: string): Element[] => [
      geoModel,
      fancy,
      entity('example:fancy', {}, {}, renderer === undefined ? {} : { renderer }),
    ];
    const vanilla = only(await validate(elements('vanilla')), 'entities.vanilla-renderer-subset');
    expect(vanilla.map((p) => [p.severity, p.path])).toEqual([
      ['warning', '/components/msm:animated_model/renderer'],
    ]);
    expect(vanilla[0]?.message).toContain('Molang expressions play as 0 ("idle")');
    expect(vanilla[0]?.message).toContain('play as linear ("fly", "walk")');
    expect(vanilla[0]?.message).toContain('sound keyframes are silent ("walk")');
    expect(vanilla[0]?.message).toContain('particle keyframes show nothing ("shoot")');
    expect(vanilla[0]?.message).toContain('instruction keyframes are skipped ("shoot")');
    // `auto` (absent) uses GeckoLib where the target has it and the vanilla renderer elsewhere.
    expect(only(await validate(elements()), 'entities.vanilla-renderer-subset')).toEqual([]);
    expect(
      only(await validate(elements(), WITHOUT_GECKOLIB), 'entities.vanilla-renderer-subset').map(
        (p) => p.path,
      ),
    ).toEqual(['/components/msm:animated_model/animations']);
    expect(only(await validate(elements('geckolib')), 'entities.vanilla-renderer-subset')).toEqual(
      [],
    );
    // A plain set stays silent under the vanilla renderer.
    expect(
      only(
        await validate(
          withRefs(entity('example:plain', {}, {}, { renderer: 'vanilla' })),
          WITHOUT_GECKOLIB,
        ),
        'entities.vanilla-renderer-subset',
      ),
    ).toEqual([]);
  });

  it('geckolib-renderer-target: GeckoLib-only mobs on a target without GeckoLib', async () => {
    const elements = withRefs(
      entity('example:geo', {}, {}, { renderer: 'geckolib' }),
      entity('example:auto', {}, {}, { renderer: 'auto' }),
    );
    expect(only(await validate(elements), 'entities.geckolib-renderer-target')).toEqual([]);
    const withoutGeckolib = only(
      await validate(elements, WITHOUT_GECKOLIB),
      'entities.geckolib-renderer-target',
    );
    expect(withoutGeckolib.map((p) => [p.elementId, p.severity, p.path])).toEqual([
      ['example:geo', 'error', '/components/msm:animated_model/renderer'],
    ]);
  });

  it('mode-category and monster-base-creature', async () => {
    const problems = await validate(
      withRefs(
        entity('example:land_swimmer', {}, { 'msm:movement': { mode: 'swim' } }),
        entity('example:walking_fish', { category: 'water_ambient' }),
        entity(
          'example:fish',
          { category: 'water_creature' },
          { 'msm:movement': { mode: 'swim' } },
        ),
        entity(
          'example:frog',
          { category: 'water_creature' },
          { 'msm:movement': { mode: 'amphibious' } },
        ),
        entity('example:brute', { base: 'monster' }),
        entity('example:zombie', { base: 'monster', category: 'monster' }),
      ),
    );
    expect(problems.map((p) => [p.code, p.severity, p.elementId, p.path])).toEqual([
      ['entities.mode-category', 'info', 'example:land_swimmer', '/components/msm:movement/mode'],
      ['entities.mode-category', 'info', 'example:walking_fish', '/category'],
      ['entities.monster-base-creature', 'info', 'example:brute', '/base'],
    ]);
  });
});
