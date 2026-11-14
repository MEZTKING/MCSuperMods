/**
 * The particle validators (ADR 0080 D7, D10; B351): every `blocks-items.particle-*` code, the
 * fields that name a particle in blocks, items, effects, leaves and portals, the skips without
 * particle facts or registry ids, and `msm:ambient_particles` on a portal. The structural options
 * check is held against the target's vanilla `::java::util::particle::Particle` schema here,
 * since validators receive no schema index.
 */
import type { Element, Json, Problem, TargetFacts, ValidationInput } from '@msm/plugin-api';
import { createRegistryIndex, validateJson } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  BLOCK_TYPE_PROBLEM_CODES,
  BLOCKS_ITEMS_PROBLEM_CODES,
  CONTAINER_PROBLEM_CODES,
  PARTICLE_PROBLEM_CODES,
  PORTAL_PROBLEM_CODES,
  particleValidators,
} from '../src/index';
import { element, indexesFor } from './support';

const firstBundle = builtInTargets[0] as TargetBundle;

/** Runs every validator of the plugin, as the app does. */
async function validate(
  elements: Element[],
  options: { target?: TargetFacts; vanilla?: boolean } = {},
): Promise<Problem[]> {
  const { registries } = await indexesFor(firstBundle);
  const registry: ValidationInput['registry'] =
    options.vanilla === false ? createRegistryIndex({ vanilla: {} }) : registries;
  const target = options.target ?? firstBundle.target;
  const results = await Promise.all(
    (plugin.contributes.validators ?? []).map((validator) =>
      validator.validate({ elements, target, registry }),
    ),
  );
  return results.flat();
}

const withCode = (problems: Problem[], code: string): [string, string | undefined, string][] =>
  problems
    .filter((problem) => problem.code === `blocks-items.${code}`)
    .map((problem) => [problem.elementId as string, problem.path, problem.severity]);

const particleCodes = (problems: Problem[]): string[] =>
  problems
    .map((problem) => problem.code)
    .filter((code) => code.startsWith('blocks-items.particle-'));

type Id = `${string}:${string}`;
const particle = (id: Id, data: Record<string, unknown> = {}): Element =>
  element('msm:particle', id, { format: 1, textures: ['minecraft:glow'], ...data } as never);
const block = (id: Id, data: Record<string, unknown> = {}): Element =>
  element('msm:block', id, { format: 1, model: 'minecraft:block/stone', ...data } as never);
const item = (id: Id, data: Record<string, unknown> = {}): Element =>
  element('msm:item', id, { format: 1, model: 'minecraft:item/stick', ...data } as never);
const effect = (id: Id, data: Record<string, unknown> = {}): Element =>
  element('msm:effect', id, { format: 1, category: 'beneficial', color: 0, ...data } as never);
const spawning = (...particles: Json[]) => ({
  events: {
    'demo:go': { actions: particles.map((value) => ({ type: 'spawn_particle', particle: value })) },
  },
});

describe('particle validators', () => {
  it('lists six codes, none shared with the other validators', () => {
    expect(PARTICLE_PROBLEM_CODES).toHaveLength(6);
    const all = [
      ...PARTICLE_PROBLEM_CODES,
      ...PORTAL_PROBLEM_CODES,
      ...CONTAINER_PROBLEM_CODES,
      ...BLOCK_TYPE_PROBLEM_CODES,
      ...BLOCKS_ITEMS_PROBLEM_CODES,
    ];
    expect(new Set(all).size).toBe(all.length);
    expect(particleValidators.map((validator) => validator.id)).toEqual([
      'msm.blocks-items.particles',
      'msm.blocks-items.particle-references',
    ]);
  });

  it('reports nothing for valid particles and every valid way to name one', async () => {
    const problems = await validate([
      particle('demo:spark', { lifetime: { min: 5, max: 5 }, animation: 'loop', frame_ticks: 2 }),
      block('demo:lamp', {
        components: {
          'msm:ambient_particles': { particle: 'demo:spark', states: { lit: 'true' } },
        },
        ...spawning(
          'minecraft:flame',
          'end_rod',
          'demo:spark',
          { type: 'demo:spark' },
          { type: 'minecraft:flame' },
          { type: 'minecraft:dust', color: [1, 0.5, 0], scale: 1.5 },
          { type: 'block', block_state: 'minecraft:stone' },
          { type: 'minecraft:item', item: { id: 'minecraft:diamond' } },
        ),
      }),
      block('demo:glow_leaves', { type: 'leaves', falling_particle: 'demo:spark' }),
      item('demo:wand', spawning({ type: 'minecraft:dust', color: [0, 0, 1], scale: 1 })),
      effect('demo:frost', { particle: 'minecraft:snowflake', ...spawning('demo:spark') }),
      block('demo:gate', {
        type: 'portal',
        frame: 'minecraft:obsidian',
        destination: 'minecraft:the_nether',
        particles: { type: 'minecraft:dust', color: 0xff0000 },
      }),
      block('demo:gate2', {
        type: 'portal',
        frame: 'minecraft:crying_obsidian',
        destination: 'minecraft:the_nether',
        particles: { type: 'demo:spark' },
      }),
      element('minecraft:particle', 'minecraft:flame', { textures: ['demo:flame'] }),
    ]);
    expect(particleCodes(problems)).toEqual([]);
  });

  it('reports a lifetime range whose minimum is above its maximum', async () => {
    const problems = await validate([
      particle('demo:a', { lifetime: { min: 30, max: 10 } }),
      particle('demo:b', { lifetime: 30 }),
    ]);
    expect(withCode(problems, 'particle-lifetime-range')).toEqual([
      ['demo:a', '/lifetime/min', 'error'],
    ]);
  });

  it('warns about frame ticks without the loop animation', async () => {
    const problems = await validate([
      particle('demo:a', { frame_ticks: 4 }),
      particle('demo:b', { animation: 'age', frame_ticks: 4 }),
      particle('demo:c', { animation: 'loop', frame_ticks: 4 }),
    ]);
    expect(withCode(problems, 'particle-frame-ticks-unused')).toEqual([
      ['demo:a', '/frame_ticks', 'warning'],
      ['demo:b', '/frame_ticks', 'warning'],
    ]);
  });

  it('reports a resource pack description with the id of a project particle', async () => {
    const problems = await validate([
      particle('demo:spark'),
      element('minecraft:particle', 'demo:spark', { textures: ['demo:spark_0'] }),
      element('minecraft:particle', 'minecraft:flame', { textures: ['demo:spark_0'] }),
    ]);
    expect(withCode(problems, 'particle-description-clash')).toEqual([['demo:spark', '', 'error']]);
  });

  it('reports a plain id of a type that takes options in every particle field', async () => {
    const problems = await validate([
      block('demo:a', {
        components: { 'msm:ambient_particles': { particle: 'minecraft:item' } },
        ...spawning('minecraft:dust', 'flame'),
      }),
      block('demo:leaves', { type: 'leaves', falling_particle: 'minecraft:block' }),
      item('demo:wand', spawning('dust_color_transition')),
      effect('demo:frost', { particle: 'minecraft:entity_effect', ...spawning('minecraft:trail') }),
      block('demo:gate', {
        type: 'portal',
        frame: 'minecraft:obsidian',
        destination: 'minecraft:the_nether',
        particles: { type: 'minecraft:dust' },
      }),
      block('demo:gate2', {
        type: 'portal',
        frame: 'minecraft:crying_obsidian',
        destination: 'minecraft:the_nether',
        particles: { type: 'minecraft:block_marker' },
      }),
    ]);
    expect(withCode(problems, 'particle-needs-options')).toEqual([
      ['demo:a', '/events/demo:go/actions/0/particle', 'error'],
      ['demo:a', '/components/msm:ambient_particles/particle', 'error'],
      ['demo:leaves', '/falling_particle', 'error'],
      ['demo:wand', '/events/demo:go/actions/0/particle', 'error'],
      ['demo:frost', '/events/demo:go/actions/0/particle', 'error'],
      ['demo:frost', '/particle', 'error'],
      ['demo:gate', '/particles/type', 'error'],
      ['demo:gate2', '/particles/type', 'error'],
    ]);
    const spawn = problems.find((problem) => problem.path === '/events/demo:go/actions/0/particle');
    expect(spawn?.message).toContain('{ "type": "minecraft:dust", ... }');
    const field = problems.find((problem) => problem.path === '/particle');
    expect(field?.message).toContain('Pick a particle type without options');
  });

  it('reports an options object naming no known particle type', async () => {
    const problems = await validate([
      block('demo:a', spawning({ type: 'demo:missing' }, { type: 'minecraft:dust', scale: 1 })),
      block('demo:b', {
        components: { 'msm:ambient_particles': { particle: { type: 'nope' } } },
      }),
    ]);
    expect(withCode(problems, 'particle-options-unknown-type')).toEqual([
      ['demo:a', '/events/demo:go/actions/0/particle/type', 'error'],
      ['demo:b', '/components/msm:ambient_particles/particle/type', 'error'],
    ]);
  });

  it('reports fields on an options object of a type without options', async () => {
    const problems = await validate([
      particle('demo:spark'),
      block('demo:a', {
        ...spawning({ type: 'minecraft:flame', scale: 2, color: [1, 1, 1] }),
        components: {
          'msm:ambient_particles': { particle: { type: 'demo:spark', size: 1 } },
        },
      }),
    ]);
    expect(withCode(problems, 'particle-options-invalid')).toEqual([
      ['demo:a', '/events/demo:go/actions/0/particle/color', 'error'],
      ['demo:a', '/components/msm:ambient_particles/particle/size', 'error'],
    ]);
    expect(problems.find((p) => p.code.endsWith('options-invalid'))?.message).toBe(
      '"minecraft:flame" takes no options, so "color", "scale" cannot apply. Remove them, or write the particle as the plain id "minecraft:flame".',
    );
  });

  it('counts project particles from the elements as well as the registry', async () => {
    const problems = await validate([
      particle('demo:only_here'),
      block('demo:a', spawning({ type: 'demo:only_here' })),
    ]);
    expect(particleCodes(problems)).toEqual([]);
  });

  it('skips the option checks without particle facts, and type checks without registry ids', async () => {
    const elements = [
      block(
        'demo:a',
        spawning('minecraft:dust', { type: 'demo:missing' }, { type: 'flame', x: 1 }),
      ),
      effect('demo:e', { particle: 'minecraft:dust' }),
    ];
    const { particles: _particles, ...noFacts } = firstBundle.target;
    expect(particleCodes(await validate(elements, { target: noFacts }))).toEqual([]);
    expect(particleCodes(await validate(elements, { vanilla: false }))).toEqual([
      'blocks-items.particle-needs-options',
      'blocks-items.particle-options-invalid',
      'blocks-items.particle-needs-options',
    ]);
  });

  it('leaves entity events to the schema and the runtime', async () => {
    const problems = await validate([
      element('msm:entity', 'demo:mob', { format: 1, ...spawning('minecraft:dust') } as never),
    ]);
    expect(particleCodes(problems)).toEqual([]);
  });

  it('reports msm:ambient_particles on a portal as a component not for its type', async () => {
    const problems = await validate([
      block('demo:gate', {
        type: 'portal',
        frame: 'minecraft:obsidian',
        destination: 'minecraft:the_nether',
        components: { 'msm:ambient_particles': { particle: 'minecraft:end_rod' } },
      }),
    ]);
    expect(withCode(problems, 'component-not-for-type')).toEqual([
      ['demo:gate', '/components/msm:ambient_particles', 'error'],
    ]);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'the structural options check against the vanilla particle schema on %s',
  (_targetId, bundle) => {
    const errors = async (value: Json): Promise<string[]> => {
      const { schemaIndex } = await indexesFor(bundle);
      const node = schemaIndex.resolveSchemaRef('::java::util::particle::Particle');
      return validateJson(value, node)
        .filter((problem) => problem.severity === 'error')
        .map((problem) => `${problem.code} ${problem.path}`);
    };

    it('accepts the options objects the validators accept', async () => {
      for (const value of [
        { type: 'minecraft:flame' },
        { type: 'minecraft:dust', color: [1, 0.5, 0], scale: 1.5 },
        { type: 'minecraft:block', block_state: 'minecraft:stone' },
        { type: 'minecraft:item', item: { id: 'minecraft:diamond' } },
      ] satisfies Json[]) {
        expect(await errors(value), JSON.stringify(value)).toEqual([]);
      }
    });

    it('refuses fields on a type without options, as particle-options-invalid does', async () => {
      expect(await errors({ type: 'minecraft:flame', scale: 2 })).toEqual([
        'schema.unknown-field /scale',
      ]);
    });
  },
);
