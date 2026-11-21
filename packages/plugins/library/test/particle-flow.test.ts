/**
 * The Particle Creator flow and the particle examples (ADR 0081 D3, D5): ids, the particle's
 * definition for every answer, its frames, the block with ambient particles, the wand and the
 * examples. Validation and export with the real plugins on both targets (and the vanilla server
 * check) live in `packages/exporters/test/library.test.ts`, the Creator's reopen rule in
 * `app/test/creator-scenario.test.ts`.
 */
import type { ContentBundle, Json, JsonObject } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { artPng, PATTERN_RECIPES } from '../src/art/artpng';
import { type PlaceholderPattern, placeholderPng, type Rgb } from '../src/assets/png';
import { artSeed, COLOURS } from '../src/content/bundle';
import { DEFAULT_PARTICLE_COLOUR } from '../src/content/particle';
import { kindExamples, libraryExamples, libraryStarters } from '../src/index';
import { particleBundle } from '../src/starters/particle';

/** Frame `frame` of `pattern` as the Particle flow draws it for the particle `id` of `demo`. */
function drawnFrame(id: string, pattern: PlaceholderPattern, colour: Rgb, frame: number) {
  return artPng(pattern, {
    colour,
    frame,
    seed: artSeed('demo', `particle/${id}`, PATTERN_RECIPES[pattern]),
  });
}

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

const particle = (values: Record<string, Json> = {}): ContentBundle =>
  particleBundle({ namespace: 'demo', projectName: 'Demo', target, values });

const data = (bundle: ContentBundle, id: string): JsonObject => {
  const found = bundle.elements.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found.data as JsonObject;
};
const ids = (bundle: ContentBundle): string[] => bundle.elements.map((entry) => entry.id);
const assetPaths = (bundle: ContentBundle): string[] => bundle.assets.map((asset) => asset.path);
const bytesOf = (bundle: ContentBundle, path: string): Uint8Array | undefined =>
  bundle.assets.find((asset) => asset.path === path)?.bytes;

/** A PNG `data:` URL of a grey picture, as the wizard passes an image parameter's value. */
const pictureUrl = (bytes: Uint8Array): string =>
  `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;

describe('Particle flow (ADR 0081 D3)', () => {
  it('is a Creator flow in the magic group that needs the Fabric mod jar', () => {
    const entry = libraryStarters.find((starter) => starter.id === 'particle');
    expect(entry?.title).toBe('Particle');
    expect(entry?.creator).toEqual({ group: 'magic', blurb: 'Your own particle.' });
    expect(entry?.layers).toEqual(['resourcepack', 'datapack', 'msm']);
    expect(entry?.supports?.(target)).toBe(true);
    const { fabric: _fabric, ...withoutFabric } = target;
    expect(entry?.supports?.(withoutFabric)).toBe(false);
    expect(entry?.requiresKinds).toEqual([
      'minecraft:model',
      'minecraft:pack_mcmeta',
      'msm:block',
      'msm:item',
      'msm:mod',
      'msm:particle',
    ]);
    expect(
      (entry?.parameters ?? []).map((parameter) => [
        parameter.id,
        parameter.label,
        parameter.default,
      ]),
    ).toEqual([
      ['particle_name', 'Particle name', 'Golden Spark'],
      ['look', 'Look', 'spark'],
      ['picture', 'My own picture', null],
      ['colour', 'Colour', '#ffd060'],
      ['size', 'Size', 'medium'],
      ['glows', 'Glows', true],
      ['how_long', 'How long', 'medium'],
      ['movement', 'Movement', 'floats'],
      ['fades', 'Fades out', true],
      ['show', 'Show it', 'block'],
    ]);
  });

  it('makes a gold spark shown around a new block by default', () => {
    const bundle = particle();
    expect(ids(bundle)).toEqual([
      'demo:pack',
      'demo:mod',
      'demo:golden_spark',
      'demo:golden_spark_block',
      'demo:block/golden_spark_block',
    ]);
    expect(data(bundle, 'demo:golden_spark')).toEqual({
      format: 1,
      textures: [
        'demo:golden_spark_0',
        'demo:golden_spark_1',
        'demo:golden_spark_2',
        'demo:golden_spark_3',
      ],
      animation: 'loop',
      lifetime: 20,
      size: 0.2,
      gravity: -0.1,
      fade: 'out',
      emissive: true,
    });
    expect(data(bundle, 'demo:golden_spark_block')).toMatchObject({
      model: 'demo:block/golden_spark_block',
      display_name: 'Golden Spark Block',
      loot: 'self',
      components: {
        'msm:ambient_particles': {
          particle: 'demo:golden_spark',
          chance: 0.4,
          offset: [0.5, 1.1, 0.5],
          spread: [0.5, 0.2, 0.5],
        },
      },
    });
    expect(assetPaths(bundle)).toEqual([
      'textures/particle/golden_spark_0.png',
      'textures/particle/golden_spark_1.png',
      'textures/particle/golden_spark_2.png',
      'textures/particle/golden_spark_3.png',
      'textures/block/golden_spark_block.png',
    ]);
    for (const frame of [0, 1, 2, 3]) {
      expect(bytesOf(bundle, `textures/particle/golden_spark_${frame}.png`)).toEqual(
        drawnFrame('golden_spark', 'particle_spark', DEFAULT_PARTICLE_COLOUR, frame),
      );
    }
  });

  it('follows the look, colour, size, lifetime, movement, glow and fade answers', () => {
    const cases: [Record<string, Json>, JsonObject][] = [
      [
        { look: 'orb', size: 'small', how_long: 'short', movement: 'drifts' },
        { animation: 'loop', frame_ticks: 4, size: 0.1, lifetime: 10, friction: 0.9 },
      ],
      [
        { look: 'puff', size: 'large', how_long: 'long', movement: 'falls' },
        { size: 0.4, size_end: 0.8, lifetime: 40, gravity: 0.1 },
      ],
      [{ look: 'leaf' }, { animation: 'random', spin: 6, gravity: -0.1 }],
    ];
    for (const [values, fields] of cases) {
      expect(data(particle(values), 'demo:golden_spark'), JSON.stringify(values)).toMatchObject(
        fields,
      );
    }
    const plain = data(particle({ glows: false, fades: false }), 'demo:golden_spark');
    expect(plain.emissive).toBeUndefined();
    expect(plain.fade).toBeUndefined();
    const puff = data(particle({ look: 'puff' }), 'demo:golden_spark');
    expect(puff.animation).toBeUndefined();
    const blue = particle({ look: 'leaf', colour: '#2454c4' });
    expect(bytesOf(blue, 'textures/particle/golden_spark_2.png')).toEqual(
      drawnFrame('golden_spark', 'particle_leaf', COLOURS.sapphire, 2),
    );
  });

  it('uses a picked picture as the one frame, and a drawn spark without one', () => {
    const picture = placeholderPng('gem');
    const own = particle({ look: 'own', picture: pictureUrl(picture), particle_name: 'Star' });
    expect(data(own, 'demo:star')).toMatchObject({ textures: ['demo:star'] });
    expect(data(own, 'demo:star').animation).toBeUndefined();
    expect(assetPaths(own)).toEqual([
      'textures/particle/star.png',
      'textures/block/star_block.png',
    ]);
    expect(bytesOf(own, 'textures/particle/star.png')).toEqual(picture);
    const none = particle({ look: 'own', particle_name: 'Star' });
    expect(bytesOf(none, 'textures/particle/star.png')).toEqual(
      drawnFrame('star', 'particle_spark', DEFAULT_PARTICLE_COLOUR, 0),
    );
  });

  it('writes a wand for the item answer and nothing more for the particle alone', () => {
    const wand = particle({ show: 'item' });
    expect(ids(wand)).toEqual([
      'demo:pack',
      'demo:mod',
      'demo:golden_spark',
      'demo:golden_spark_wand',
    ]);
    expect(data(wand, 'demo:golden_spark_wand')).toEqual({
      format: 1,
      model: 'minecraft:item/blaze_rod',
      display_name: 'Golden Spark Wand',
      max_stack_size: 1,
      creative_tab: 'minecraft:tools_and_utilities',
      components: { 'msm:on_use': { event: 'demo:golden_spark_wand_used', cooldown_ticks: 10 } },
      events: {
        'demo:golden_spark_wand_used': {
          actions: [
            {
              type: 'spawn_particle',
              particle: 'demo:golden_spark',
              count: 16,
              spread: 0.6,
              speed: 0.05,
            },
          ],
        },
      },
    });
    const alone = particle({ show: 'none' });
    expect(ids(alone)).toEqual(['demo:pack', 'demo:mod', 'demo:golden_spark']);
    expect(assetPaths(alone)).toHaveLength(4);
  });

  it('writes no function and never names the particle in data a vanilla pack would load', () => {
    for (const values of [{}, { show: 'item' }, { show: 'none' }, { look: 'own' }]) {
      const bundle = particle(values);
      for (const entry of bundle.elements) {
        expect(
          [
            'minecraft:pack_mcmeta',
            'msm:mod',
            'msm:particle',
            'msm:block',
            'minecraft:model',
            'msm:item',
          ],
          entry.id,
        ).toContain(entry.kind);
      }
    }
  });
});

describe('particle examples (ADR 0081 D5)', () => {
  const example = (id: string) => {
    const entry = libraryExamples.find((candidate) => candidate.id === id);
    if (entry === undefined) throw new Error(`no ${id}`);
    const bundle = entry.build({ namespace: 'demo', projectName: 'Demo', target, values: {} });
    if (bundle instanceof Promise) throw new Error('async');
    return { entry, bundle };
  };

  it('has a per-kind example for both particle kinds', () => {
    expect(
      kindExamples
        .filter((entry) => entry.kind.endsWith(':particle'))
        .map((entry) => [entry.id, entry.kind]),
    ).toEqual([
      ['example_particle', 'minecraft:particle'],
      ['example_msm_particle', 'msm:particle'],
    ]);
    const flame = example('example_particle').bundle;
    expect(ids(flame)).toEqual(['minecraft:flame']);
    expect(data(flame, 'minecraft:flame')).toEqual({ textures: ['demo:blue_flame'] });
    expect(assetPaths(flame)).toEqual(['textures/particle/blue_flame.png']);
    const ember = example('example_msm_particle').bundle;
    expect(ids(ember)).toEqual(['demo:drifting_ember']);
    expect(data(ember, 'demo:drifting_ember')).toMatchObject({
      size: 0.1,
      lifetime: 40,
      emissive: true,
      fade: 'out',
    });
  });

  it('builds the firefly jar: the particle, the jar with ambient particles and the wand', () => {
    const { entry, bundle } = example('example_msm_firefly_jar');
    expect(entry.category).toBe('Blocks');
    expect(ids(bundle)).toEqual(['demo:firefly_glow', 'demo:firefly_jar', 'demo:spark_wand']);
    expect(data(bundle, 'demo:firefly_glow')).toMatchObject({
      animation: 'loop',
      frame_ticks: 4,
      lifetime: { min: 40, max: 80 },
      fade: 'in_out',
      emissive: true,
      gravity: -0.02,
    });
    expect(data(bundle, 'demo:firefly_jar')).toMatchObject({
      components: { 'msm:ambient_particles': { particle: 'demo:firefly_glow' } },
    });
    const actions = (
      (data(bundle, 'demo:spark_wand').events as JsonObject)['demo:spark_wand_used'] as {
        actions: JsonObject[];
      }
    ).actions;
    expect(actions[0]).toMatchObject({ particle: 'demo:firefly_glow', motion: [0, 0.15, 0] });
    expect(actions[1]).toMatchObject({ particle: { type: 'minecraft:dust', scale: 1.5 } });
  });
});
