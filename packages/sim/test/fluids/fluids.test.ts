/**
 * Fluids in Try it (B483, ADR 0099, ADR 0101 D5, limit Q29): the Fluid starter lowered on every
 * built-in target gives a liquid block and a bucket; the bucket pours a source that does not
 * flow, nothing collides with it, a block placed into it replaces it, and `on_entity_inside`
 * fires at most every 10 ticks for each one inside.
 */
import { join } from 'node:path';
import type { Json, Target } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { FLUID_INSIDE_COOLDOWN, flowWords, LocalWorldSource, readFluids } from '../../src/index.js';
import { builtInTargets, lowerProjectAt, REPO_ROOT } from '../lower-fixture.js';

const targets = await builtInTargets();
const UP = { x: 0.5, y: 1, z: 0.5 };
const floor = (x: number, z: number) => ({ x, y: -1, z });
const only = (source: LocalWorldSource): string[] =>
  source.lines.filter((line) => line.onlyInMinecraft).map((line) => line.text);

describe.each(targets.map((target) => [target.id, target] as const))(
  'the Fluid starter on %s',
  (_id, target) => {
    // Lowering a whole starter project takes longer than the default on a busy CI machine.
    it('reads the fluid, pours it from its bucket and says that it does not flow', {
      timeout: 30_000,
    }, async () => {
      const { files } = await lowerProjectAt(
        join(REPO_ROOT, 'examples', 'starters', 'fluid'),
        target,
      );
      const fluids = readFluids(files, target);
      const mint = fluids.get('msm_starter:mint_water');
      expect(mint).toMatchObject({
        displayName: 'Mint Water',
        bucket: 'msm_starter:mint_water_bucket',
        bucketName: 'Bucket of Mint Water',
        behavesLike: 'water',
        flow: { tickDelay: 5, slopeDistance: 4, dropOff: 1, infinite: true },
        light: 0,
        tint: 3983500,
        textures: {
          still: 'minecraft:block/water_still',
          flowing: 'minecraft:block/water_flow',
          overlay: 'minecraft:block/water_overlay',
        },
      });
      const source = new LocalWorldSource({ files, target, seed: 2 });
      expect(source.catalogue.isLiquid({ name: 'msm_starter:mint_water', properties: {} })).toBe(
        true,
      );
      source.act({
        type: 'use',
        pos: floor(24, 20),
        face: 'up',
        hit: UP,
        item: 'msm_starter:mint_water_bucket',
      });
      expect(source.world.get({ x: 24, y: 0, z: 20 })?.name).toBe('msm_starter:mint_water');
      expect(source.world.count).toBe(1);
      expect(source.lines.map((line) => line.text)).toContain(
        'You poured Mint Water from Bucket of Mint Water at 24, 0, 20.',
      );
      expect(only(source)).toContain(
        `Mint Water flows (${flowWords(mint as never)}); in the preview it stays where you pour it`,
      );
      // Nothing flows, whatever the clock does.
      for (let tick = 0; tick < 100; tick += 1) source.tick();
      expect(source.world.count).toBe(1);
      // Nothing collides with it or points at it.
      expect(
        source.catalogue.collision({ name: 'msm_starter:mint_water', properties: {} }),
      ).toEqual([]);
    });
  },
);

const target = targets[0] as Target;

/** A project of one lava-like fluid with an event, as lowered files. */
function fluidFiles(fluid: Json): Map<string, string> {
  const files = new Map<string, string>();
  files.set('msm/fl/fluid/goo.json', JSON.stringify(fluid));
  files.set('assets/fl/lang/en_us.json', JSON.stringify({ 'block.fl.goo': 'Goo' }));
  files.set('msm/fl/block/stone.json', JSON.stringify({ format: 1 }));
  return files;
}

describe('fluids in the area', () => {
  const GOO = {
    format: 1,
    behaves_like: 'lava',
    on_entity_inside: 'warm',
    events: {
      warm: { actions: [{ type: 'apply_effect', effect: 'minecraft:speed', seconds: 1 }] },
    },
  };

  it('fires on_entity_inside every 10 ticks for the player in it, and says lava-like things', () => {
    const source = new LocalWorldSource({
      files: fluidFiles(GOO),
      target,
      seed: 2,
      start: { x: 10.5, y: 0, z: 10.5 },
    });
    source.act({ type: 'use', pos: floor(10, 10), face: 'up', hit: UP, item: 'fl:goo_bucket' });
    // The player stands in it: no box stops the pour.
    expect(source.world.get({ x: 10, y: 0, z: 10 })?.name).toBe('fl:goo');
    for (let tick = 0; tick < 25; tick += 1) source.tick();
    const fired = source.trace.filter((entry) => entry.trigger === 'fluid:on_entity_inside');
    expect(fired).toHaveLength(Math.ceil(25 / FLUID_INSIDE_COOLDOWN));
    expect(fired[0]?.text).toContain('You are in Goo');
    expect(only(source)).toContain(
      'Being set on fire and hurt in Goo; in the preview you walk through it as through air',
    );
    expect(only(source)).toContain('Goo gives off light 15');
  });

  it('gives way to a block placed into it', () => {
    const source = new LocalWorldSource({ files: fluidFiles(GOO), target, seed: 2 });
    source.act({ type: 'use', pos: floor(5, 5), face: 'up', hit: UP, item: 'fl:goo_bucket' });
    source.act({ type: 'use', pos: floor(5, 5), face: 'up', hit: UP, item: 'fl:stone' });
    expect(source.world.get({ x: 5, y: 0, z: 5 })?.name).toBe('fl:stone');
  });
});
