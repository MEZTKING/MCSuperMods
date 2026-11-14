/**
 * The portal validators (ADR 0077 D8; B335): every `blocks-items.portal-*` code, the
 * `light_portal` action check and the portal's component allow list, plus the other validators
 * of the plugin that must stay quiet for a portal (appearance, entity inside, item collision).
 */
import type { BlockFacts, Element, Problem, TargetFacts, ValidationInput } from '@msm/plugin-api';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  BLOCK_TYPE_PROBLEM_CODES,
  BLOCKS_ITEMS_PROBLEM_CODES,
  CONTAINER_PROBLEM_CODES,
  isPortalElement,
  PORTAL_COMPONENTS,
  PORTAL_PROBLEM_CODES,
  portalValidators,
} from '../src/index';
import { element, indexesFor } from './support';

const firstBundle = builtInTargets[0] as TargetBundle;

/** Runs every validator of the plugin, so a portal is checked as the app checks it. */
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

type Id = `${string}:${string}`;
const portal = (id: Id, data: Record<string, unknown> = {}): Element =>
  element('msm:block', id, {
    format: 1,
    type: 'portal',
    frame: 'minecraft:crying_obsidian',
    destination: 'minecraft:the_nether',
    ...data,
  } as never);
const block = (id: Id, data: Record<string, unknown> = {}): Element =>
  element('msm:block', id, { format: 1, model: 'minecraft:block/stone', ...data } as never);
const lightingEvents = (portalId: string) => ({
  events: { 'demo:light': { actions: [{ type: 'light_portal', portal: portalId }] } },
});

describe('portal validators', () => {
  it('lists ten codes, none shared with the other validators', () => {
    expect(PORTAL_PROBLEM_CODES).toHaveLength(10);
    const all = [
      ...PORTAL_PROBLEM_CODES,
      ...CONTAINER_PROBLEM_CODES,
      ...BLOCK_TYPE_PROBLEM_CODES,
      ...BLOCKS_ITEMS_PROBLEM_CODES,
    ];
    expect(new Set(all).size).toBe(all.length);
    expect(portalValidators.map((validator) => validator.id)).toEqual([
      'msm.blocks-items.portals',
      'msm.blocks-items.light-portal',
    ]);
  });

  it('reports nothing for a minimal portal and a full one with a project frame and sound', async () => {
    const problems = await validate([
      portal('demo:gate'),
      block('demo:sky_stone'),
      element('minecraft:dimension', 'demo:sky', {
        type: 'minecraft:overworld',
        generator: { type: 'minecraft:flat', settings: { layers: [], biome: 'minecraft:plains' } },
      } as never),
      element('minecraft:sounds', 'demo:sounds', { 'portal.hum': { sounds: ['demo:hum'] } }),
      element('msm:item', 'demo:key', { format: 1, model: 'minecraft:item/stick' } as never),
      portal('demo:sky_portal', {
        frame: 'demo:sky_stone',
        igniter: 'demo:key',
        destination: 'demo:sky',
        travel: { arrival: 'surface', players_only: true },
        sounds: { ambient: 'demo:portal.hum', travel: false },
        particles: { type: 'minecraft:dust', color: 0x88ccff, count: 2 },
        on_travel: 'demo:arrived',
        events: { 'demo:arrived': { actions: [{ type: 'play_sound', sound: 'demo:portal.hum' }] } },
        components: {
          'msm:breakable': { hardness: 1, resistance: 1 },
          'msm:light_emitter': { level: 15 },
          'msm:on_entity_inside': { event: 'demo:arrived' },
        },
      }),
      block('demo:beacon', {
        components: { 'msm:on_interact': { event: 'demo:light' } },
        ...lightingEvents('demo:sky_portal'),
      }),
    ]);
    expect(problems).toEqual([]);
  });

  it('portal-destination-unknown: neither a project nor a vanilla dimension', async () => {
    const problems = await validate([
      portal('demo:a', { destination: 'demo:nowhere' }),
      portal('demo:b', { return_to: 'demo:elsewhere', destination: 'minecraft:the_end' }),
      portal('demo:c', { destination: 'the_end' }),
    ]);
    expect(withCode(problems, 'portal-destination-unknown')).toEqual([
      ['demo:a', '/destination', 'error'],
      ['demo:b', '/return_to', 'error'],
    ]);
    // An empty registry knows no dimensions: nothing to check against.
    const bare = await validate([portal('demo:a', { destination: 'demo:nowhere' })], {
      vanilla: false,
    });
    expect(withCode(bare, 'portal-destination-unknown')).toEqual([]);
  });

  it('portal-same-dimension: destination equal to return_to (default the overworld)', async () => {
    const problems = await validate([
      portal('demo:a', { destination: 'minecraft:overworld' }),
      portal('demo:b', { destination: 'minecraft:the_end', return_to: 'the_end' }),
      portal('demo:c', { destination: 'minecraft:the_end', return_to: 'minecraft:the_nether' }),
    ]);
    expect(withCode(problems, 'portal-same-dimension')).toEqual([
      ['demo:a', '/destination', 'error'],
      ['demo:b', '/return_to', 'error'],
    ]);
  });

  it('portal-frame-unknown and portal-frame-block-needed', async () => {
    const problems = await validate([
      block('demo:frame'),
      element('minecraft:tag/block', 'demo:frames', { values: ['minecraft:gold_block'] }),
      portal('demo:a', { frame: 'demo:missing' }),
      portal('demo:b', { frame: '#demo:no_tag', frame_block: 'minecraft:gold_block' }),
      portal('demo:c', { frame: '#demo:frames' }),
      portal('demo:d', { frame: '#minecraft:beacon_base_blocks', frame_block: 'demo:lost' }),
      portal('demo:e', { frame: 'demo:frame' }),
      portal('demo:f', { frame: '#demo:frames', frame_block: 'demo:frame' }),
    ]);
    expect(withCode(problems, 'portal-frame-unknown')).toEqual([
      ['demo:a', '/frame', 'error'],
      ['demo:b', '/frame', 'error'],
      ['demo:d', '/frame_block', 'error'],
    ]);
    expect(withCode(problems, 'portal-frame-block-needed')).toEqual([
      ['demo:c', '/frame_block', 'error'],
    ]);
  });

  it('portal-igniter-unknown: items, block items, item tags and false', async () => {
    const problems = await validate([
      block('demo:torch_block'),
      block('demo:no_item', { item: false }),
      element('minecraft:tag/item', 'demo:keys', { values: ['minecraft:stick'] }),
      portal('demo:a', { igniter: 'demo:missing' }),
      portal('demo:b', { igniter: '#demo:no_keys' }),
      portal('demo:c', { igniter: 'demo:torch_block' }),
      portal('demo:d', { igniter: '#demo:keys' }),
      portal('demo:e', { igniter: false }),
      portal('demo:f', { igniter: 'demo:no_item' }),
      portal('demo:g', { igniter: 'minecraft:fire_charge' }),
    ]);
    expect(withCode(problems, 'portal-igniter-unknown')).toEqual([
      ['demo:a', '/igniter', 'error'],
      ['demo:b', '/igniter', 'error'],
      ['demo:f', '/igniter', 'error'],
    ]);
  });

  it('portal-igniter-unknown: a portal has no item to light another with unless it has item', async () => {
    const problems = await validate([
      portal('demo:a'),
      portal('demo:b', { frame: 'minecraft:gold_block', igniter: 'demo:a' }),
      portal('demo:c', { item: {} }),
      portal('demo:d', { frame: 'minecraft:quartz_block', igniter: 'demo:c' }),
    ]);
    expect(withCode(problems, 'portal-igniter-unknown')).toEqual([['demo:b', '/igniter', 'error']]);
  });

  it('portal-frame-clash: the same frame and igniter; the first id wins', async () => {
    const problems = await validate([
      portal('demo:c', { frame: 'crying_obsidian' }),
      portal('demo:a'),
      portal('demo:b', { igniter: 'minecraft:flint_and_steel' }),
      portal('demo:d', { igniter: false }),
      portal('demo:e', { igniter: false }),
      portal('demo:f', { igniter: 'minecraft:fire_charge' }),
      portal('demo:g', {
        frame: '#minecraft:beacon_base_blocks',
        frame_block: 'minecraft:gold_block',
      }),
    ]);
    expect(withCode(problems, 'portal-frame-clash')).toEqual([
      ['demo:b', '/frame', 'warning'],
      ['demo:c', '/frame', 'warning'],
    ]);
    expect(problems.find((p) => p.code === 'blocks-items.portal-frame-clash')?.message).toContain(
      '"demo:a"',
    );
  });

  it('portal-particle-options: a colour only with dust', async () => {
    const problems = await validate([
      portal('demo:a', { particles: { type: 'minecraft:portal', color: 255 } }),
      portal('demo:b', { particles: { type: 'dust', color: 255 } }),
      portal('demo:c', { particles: { color: 255 } }),
      portal('demo:d', { particles: { type: 'minecraft:reverse_portal' } }),
    ]);
    expect(withCode(problems, 'portal-particle-options')).toEqual([
      ['demo:a', '/particles/type', 'error'],
    ]);
  });

  it('portal-sound-unknown: vanilla and project sounds, false, and targets without facts', async () => {
    const elements = [
      element('minecraft:sounds', 'demo:sounds', { hum: { sounds: ['demo:hum'] } }),
      portal('demo:a', { sounds: { ambient: 'demo:missing', travel: 'demo:hum' } }),
      portal('demo:b', {
        sounds: { ambient: 'block.portal.ambient', travel: 'minecraft:nope' },
      }),
      portal('demo:c', { sounds: { ambient: false, travel: false } }),
    ];
    const problems = await validate(elements);
    expect(withCode(problems, 'portal-sound-unknown')).toEqual([
      ['demo:a', '/sounds/ambient', 'warning'],
      ['demo:b', '/sounds/travel', 'warning'],
    ]);
    expect(problems.find((p) => p.code === 'blocks-items.portal-sound-unknown')?.message).toContain(
      'minecraft:block.portal.ambient',
    );
    const facts = firstBundle.target.blocks as BlockFacts;
    const { portal: _portal, ...blocks } = facts;
    const withoutFacts = await validate(elements, {
      target: { ...firstBundle.target, blocks },
    });
    expect(withCode(withoutFacts, 'portal-sound-unknown')).toEqual([]);
  });

  it('portal-event-unknown: on_travel must be declared', async () => {
    const problems = await validate([
      portal('demo:a', { on_travel: 'demo:gone' }),
      portal('demo:b', {
        on_travel: 'demo:here',
        events: { 'demo:here': { actions: [] } },
      }),
    ]);
    expect(withCode(problems, 'portal-event-unknown')).toEqual([['demo:a', '/on_travel', 'error']]);
  });

  it('light-portal-not-portal: blocks, items and effects; entities are left to the schema', async () => {
    const problems = await validate([
      portal('demo:gate'),
      block('demo:stone_gate'),
      block('demo:a', lightingEvents('demo:stone_gate')),
      element('msm:item', 'demo:b', {
        format: 1,
        model: 'minecraft:item/stick',
        ...lightingEvents('demo:missing'),
      } as never),
      element('msm:effect', 'demo:c', { format: 1, ...lightingEvents('demo:gate') } as never),
      element('msm:effect', 'demo:d', { format: 1, ...lightingEvents('demo:stone_gate') } as never),
      element('msm:entity', 'demo:e', { format: 1, ...lightingEvents('demo:stone_gate') } as never),
      block('demo:f', lightingEvents('demo:gate')),
    ]);
    expect(withCode(problems, 'light-portal-not-portal')).toEqual([
      ['demo:a', '/events/demo:light/actions/0/portal', 'error'],
      ['demo:b', '/events/demo:light/actions/0/portal', 'error'],
      ['demo:d', '/events/demo:light/actions/0/portal', 'error'],
    ]);
  });

  it('component-not-for-type: only the portal components, shaped-only ones reported once', async () => {
    const problems = await validate([
      portal('demo:a', {
        components: {
          'msm:breakable': { hardness: 1, resistance: 1 },
          'msm:on_interact': { event: 'demo:x' },
          'msm:flammable': { burn_odds: 5, ignite_odds: 5 },
          'msm:shape': { preset: 'slab_bottom' },
        },
        events: { 'demo:x': { actions: [] } },
      }),
    ]);
    expect(withCode(problems, 'component-not-for-type')).toEqual([
      ['demo:a', '/components/msm:shape', 'error'],
      ['demo:a', '/components/msm:on_interact', 'error'],
      ['demo:a', '/components/msm:flammable', 'error'],
    ]);
    expect(PORTAL_COMPONENTS).toEqual([
      'msm:breakable',
      'msm:light_emitter',
      'msm:on_break',
      'msm:on_place',
      'msm:on_random_tick',
      'msm:on_entity_inside',
    ]);
  });

  it('keeps the other validators quiet: appearance, entity inside, item collision', async () => {
    const problems = await validate([
      portal('demo:gate', { components: { 'msm:on_entity_inside': { event: 'demo:x' } } }),
      element('msm:item', 'demo:gate', { format: 1, model: 'minecraft:item/stick' } as never),
    ]);
    expect(problems.map((problem) => problem.code)).toEqual(['blocks-items.unknown-event']);
    const withItem = await validate([
      portal('demo:gate', { item: {} }),
      element('msm:item', 'demo:gate', { format: 1, model: 'minecraft:item/stick' } as never),
    ]);
    expect(withCode(withItem, 'item-collision')).toEqual([['demo:gate', undefined, 'error']]);
  });

  it('knows portals by kind and type', () => {
    expect(isPortalElement(portal('demo:a'))).toBe(true);
    expect(isPortalElement(block('demo:b'))).toBe(false);
    expect(isPortalElement(element('msm:item', 'demo:c', { type: 'portal' }))).toBe(false);
  });
});
