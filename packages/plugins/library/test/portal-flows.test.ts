/**
 * The Portal Creator flow, the Dimension flow's portal answer and the portal example (ADR 0078
 * D2, D4): ids, the portal's fields for every answer, the frame block, the key, the textures
 * and the travel function. Validation and export with the real plugins on both targets (and
 * the vanilla server check) live in `packages/exporters/test/library.test.ts`, the Creator's
 * reopen rule in `app/test/creator-scenario.test.ts`.
 */
import type { ContentBundle, Json, JsonObject } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { texture } from '../src/content/bundle';
import { COLOURS, libraryExamples, libraryStarters } from '../src/index';
import { dimensionBundle } from '../src/starters/dimension';
import { portalBundle } from '../src/starters/portal';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

const portal = (values: Record<string, Json> = {}): ContentBundle =>
  portalBundle({ namespace: 'demo', projectName: 'Demo', target, values });
const dimension = (values: Record<string, Json> = {}): ContentBundle =>
  dimensionBundle({ namespace: 'demo', projectName: 'Demo', target, values });

const data = (bundle: ContentBundle, id: string): JsonObject => {
  const found = bundle.elements.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found.data as JsonObject;
};
const ids = (bundle: ContentBundle): string[] => bundle.elements.map((entry) => entry.id);
const assetPaths = (bundle: ContentBundle): string[] => bundle.assets.map((asset) => asset.path);
const bytesOf = (bundle: ContentBundle, path: string): Uint8Array | undefined =>
  bundle.assets.find((asset) => asset.path === path)?.bytes;

describe('Portal flow (ADR 0078 D2)', () => {
  it('is a Creator flow in the worlds group that needs the Fabric mod jar', () => {
    const entry = libraryStarters.find((starter) => starter.id === 'portal');
    expect(entry?.title).toBe('Portal');
    expect(entry?.creator).toEqual({ group: 'worlds', blurb: 'Portal to a dimension.' });
    expect(entry?.layers).toEqual(['resourcepack', 'datapack', 'msm']);
    expect(entry?.supports?.(target)).toBe(true);
    const { fabric: _fabric, ...withoutFabric } = target;
    expect(entry?.supports?.(withoutFabric)).toBe(false);
    expect(entry?.requiresKinds).toEqual([
      'minecraft:dimension',
      'minecraft:function',
      'minecraft:model',
      'minecraft:pack_mcmeta',
      'minecraft:recipe',
      'msm:block',
      'msm:item',
      'msm:mod',
    ]);
    expect((entry?.parameters ?? []).map((parameter) => parameter.id)).toEqual([
      'portal_name',
      'destination',
      'dimension_name',
      'terrain',
      'biome',
      'sky',
      'dimension_id',
      'frame',
      'igniter',
      'scale',
      'overlay',
      'colour',
      'particles',
      'sounds',
    ]);
  });

  it('makes a portal to a new dimension in a new frame block, lit with flint and steel, by default', () => {
    const bundle = portal();
    expect(ids(bundle)).toEqual([
      'demo:pack',
      'demo:mod',
      'demo:sky_realm',
      'demo:sky_realm/travel',
      'demo:sky_portal',
      'demo:sky_portal_frame',
      'demo:block/sky_portal_frame',
      'demo:sky_portal_frame_from_obsidian',
    ]);
    expect(data(bundle, 'demo:sky_portal')).toEqual({
      format: 1,
      display_name: 'Sky Portal',
      type: 'portal',
      frame: 'demo:sky_portal_frame',
      destination: 'demo:sky_realm',
      travel: { scale: 1 },
      textures: { portal: 'demo:block/sky_portal' },
    });
    expect(data(bundle, 'demo:sky_portal_frame')).toMatchObject({
      model: 'demo:block/sky_portal_frame',
      display_name: 'Sky Portal Frame',
      loot: 'self',
      components: { 'msm:breakable': { tool: 'pickaxe', min_tier: 'iron' } },
    });
    expect(data(bundle, 'demo:sky_portal_frame_from_obsidian')).toMatchObject({
      key: { O: 'minecraft:obsidian', A: 'minecraft:amethyst_shard' },
      result: { id: 'demo:sky_portal_frame', count: 8 },
    });
    expect(data(bundle, 'demo:sky_realm')).toMatchObject({
      type: 'minecraft:overworld',
      generator: { type: 'minecraft:noise', settings: 'minecraft:overworld' },
    });
    // The travel function stays, so a vanilla data pack still has a way in.
    expect(data(bundle, 'demo:sky_realm/travel').lines).toEqual([
      '# Travels to Sky Realm and back. Run with /function demo:sky_realm/travel, or step through the portal.',
      'execute if dimension demo:sky_realm in minecraft:overworld run return run spreadplayers ~ ~ 0 64 false @s',
      'execute in demo:sky_realm run spreadplayers ~ ~ 0 64 false @s',
    ]);
    expect(assetPaths(bundle)).toEqual([
      'textures/block/sky_portal.png',
      'textures/block/sky_portal_frame.png',
    ]);
    expect(bytesOf(bundle, 'textures/block/sky_portal.png')).toEqual(
      texture('demo', 'block/sky_portal', 'portal', COLOURS.violet).bytes,
    );
    expect(bytesOf(bundle, 'textures/block/sky_portal_frame.png')).toEqual(
      texture('demo', 'block/sky_portal_frame', 'portal_frame', COLOURS.violet).bytes,
    );
  });

  it('leads to the Nether, the End or a dimension by id without making a dimension', () => {
    for (const [values, destination] of [
      [{ destination: 'minecraft:the_nether' }, 'minecraft:the_nether'],
      [{ destination: 'minecraft:the_end' }, 'minecraft:the_end'],
      [{ destination: 'other', dimension_id: 'demo:ruby_realm' }, 'demo:ruby_realm'],
    ] as const) {
      const bundle = portal(values);
      expect(data(bundle, 'demo:sky_portal').destination).toBe(destination);
      expect(bundle.elements.some((entry) => entry.kind === 'minecraft:dimension')).toBe(false);
      expect(bundle.elements.some((entry) => entry.kind === 'minecraft:function')).toBe(false);
    }
  });

  it('follows the frame, igniter, scale, colour, particle, sound and overlay answers', () => {
    const bundle = portal({
      portal_name: 'Ember Gate',
      frame: 'minecraft:gold_block',
      igniter: 'key',
      scale: '8',
      colour: '#de9420',
      particles: 'dust',
      sounds: 'quiet',
      overlay: false,
    });
    expect(ids(bundle)).not.toContain('demo:ember_gate_frame');
    expect(data(bundle, 'demo:ember_gate')).toEqual({
      format: 1,
      display_name: 'Ember Gate',
      type: 'portal',
      frame: 'minecraft:gold_block',
      igniter: 'demo:ember_gate_key',
      destination: 'demo:sky_realm',
      travel: { scale: 8, overlay: false },
      sounds: { ambient: false, travel: false },
      particles: { color: 0xde9420 },
      textures: { portal: 'demo:block/ember_gate' },
    });
    expect(data(bundle, 'demo:ember_gate_key')).toMatchObject({
      display_name: 'Ember Gate Key',
      model: 'demo:item/ember_gate_key',
      components: { 'msm:durability': { max: 64 } },
    });
    expect(data(bundle, 'demo:ember_gate_key_from_gold')).toMatchObject({
      type: 'minecraft:crafting_shapeless',
      result: { id: 'demo:ember_gate_key' },
    });
    expect(assetPaths(bundle)).toEqual([
      'textures/block/ember_gate.png',
      'textures/item/ember_gate_key.png',
    ]);
    expect(bytesOf(bundle, 'textures/block/ember_gate.png')).toEqual(
      texture('demo', 'block/ember_gate', 'portal', COLOURS.amber).bytes,
    );
    for (const igniter of ['minecraft:fire_charge', 'minecraft:ender_eye']) {
      expect(data(portal({ igniter }), 'demo:sky_portal').igniter).toBe(igniter);
    }
    expect(data(portal(), 'demo:sky_portal').igniter).toBeUndefined();
  });

  it('never puts the frame block in a flat layer of the dimension', () => {
    const bundle = portal({ terrain: 'flat', biome: 'minecraft:plains' });
    const layers = ((data(bundle, 'demo:sky_realm').generator as JsonObject).settings as JsonObject)
      .layers as JsonObject[];
    expect(layers.map((layer) => layer.block)).toEqual([
      'minecraft:bedrock',
      'minecraft:dirt',
      'minecraft:grass_block',
    ]);
  });
});

describe("Dimension flow's portal answer (ADR 0078 D2)", () => {
  it('offers a portal as the third way to get there', () => {
    const entry = libraryStarters.find((starter) => starter.id === 'dimension');
    const travel = entry?.parameters?.find((parameter) => parameter.id === 'travel');
    expect(travel?.type === 'choice' ? travel.choices.map((choice) => choice.value) : []).toEqual([
      'item',
      'command',
      'portal',
    ]);
    expect(entry?.requiresKinds).toContain('msm:block');
  });

  it("adds the Portal flow's portal and frame block in the dimension's colour, and keeps the travel function", () => {
    const bundle = dimension({ travel: 'portal', colour: '#2454c4' });
    expect(ids(bundle)).toEqual([
      'demo:pack',
      'demo:mod',
      'demo:ruby_realm',
      'demo:ruby_realm/travel',
      'demo:ruby_realm_portal',
      'demo:ruby_realm_portal_frame',
      'demo:block/ruby_realm_portal_frame',
      'demo:ruby_realm_portal_frame_from_obsidian',
    ]);
    expect(data(bundle, 'demo:ruby_realm_portal')).toEqual({
      format: 1,
      display_name: 'Ruby Realm Portal',
      type: 'portal',
      frame: 'demo:ruby_realm_portal_frame',
      destination: 'demo:ruby_realm',
      travel: { scale: 1 },
      textures: { portal: 'demo:block/ruby_realm_portal' },
    });
    expect(data(bundle, 'demo:ruby_realm/travel').lines).toContain(
      'execute in demo:ruby_realm run spreadplayers ~ ~ 0 64 false @s',
    );
    expect(bytesOf(bundle, 'textures/block/ruby_realm_portal.png')).toEqual(
      texture('demo', 'block/ruby_realm_portal', 'portal', COLOURS.sapphire).bytes,
    );
    expect(bytesOf(bundle, 'textures/block/ruby_realm_portal_frame.png')).toEqual(
      texture('demo', 'block/ruby_realm_portal_frame', 'portal_frame', COLOURS.sapphire).bytes,
    );
  });

  it('keeps the key and command answers as before', () => {
    expect(ids(dimension())).toContain('demo:ruby_realm_key');
    expect(ids(dimension())).not.toContain('demo:ruby_realm_portal');
    expect(ids(dimension({ travel: 'command' }))).toEqual([
      'demo:pack',
      'demo:ruby_realm',
      'demo:ruby_realm/travel',
    ]);
  });
});

describe('Two-way sky portal example (ADR 0078 D4)', () => {
  const example = libraryExamples.find((entry) => entry.id === 'example_msm_sky_portal');
  const bundle = (): ContentBundle =>
    (example as NonNullable<typeof example>).build({
      namespace: 'demo',
      projectName: 'Demo',
      target,
      values: {},
    }) as ContentBundle;

  it('is a block example that needs the Fabric mod jar', () => {
    expect(example?.title).toBe('Two-way sky portal');
    expect(example?.kind).toBe('msm:block');
    expect(example?.supports?.(target)).toBe(true);
  });

  it('builds a flat sky dimension, the portal with an on_travel line and a beacon that lights it', () => {
    const built = bundle();
    expect(ids(built)).toEqual([
      'demo:sky_isle',
      'demo:sky_isle/travel',
      'demo:sky_gate',
      'demo:sky_gate_frame',
      'demo:block/sky_gate_frame',
      'demo:sky_gate_frame_from_obsidian',
      'demo:sky_gate/arrived',
      'demo:sky_gate_beacon',
    ]);
    expect((data(built, 'demo:sky_isle').generator as JsonObject).type).toBe('minecraft:flat');
    expect(data(built, 'demo:sky_isle').type).toBe('minecraft:overworld');
    expect(data(built, 'demo:sky_gate')).toMatchObject({
      type: 'portal',
      frame: 'demo:sky_gate_frame',
      destination: 'demo:sky_isle',
      particles: { color: 0x2454c4 },
      on_travel: 'demo:sky_gate_travelled',
      events: {
        'demo:sky_gate_travelled': {
          actions: [{ type: 'run_function', function: 'demo:sky_gate/arrived' }],
        },
      },
    });
    expect(data(built, 'demo:sky_gate/arrived').lines).toContain(
      'say I came through the Sky Gate.',
    );
    expect(data(built, 'demo:sky_gate_beacon')).toMatchObject({
      components: { 'msm:on_interact': { event: 'demo:sky_gate_beacon_used' } },
      events: {
        'demo:sky_gate_beacon_used': {
          actions: [{ type: 'light_portal', portal: 'demo:sky_gate' }],
        },
      },
    });
    for (const entry of built.elements) expect(entry.tags, entry.id).toContain('example');
  });
});
