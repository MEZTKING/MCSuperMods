/**
 * The entity catalogue over `fixtures/sample-creatures` and `fixtures/sample-mob` lowered on every
 * built-in target: every mob is read with its size, movement mode and model, can be spawned, and
 * wanders 200 ticks inside the area.
 */
import type { Target } from '@msm/plugin-api';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AREA_SIZE_X,
  AREA_SIZE_Z,
  buildCatalogue,
  buildEntityCatalogue,
  type EntityCatalogue,
  EntityWorld,
  SimWorld,
} from '../../src/index.js';
import { testLog } from '../blocks/helpers.js';
import { builtInTargets, type LoweredFixture, lowerFixture } from '../lower-fixture.js';

const targets = await builtInTargets();
const C = 'msm_sample_creatures';

describe.each(targets.map((target) => [target.id, target] as const))(
  'sample-creatures on %s',
  (_, target: Target) => {
    let lowered: LoweredFixture;
    let catalogue: EntityCatalogue;
    const log = testLog();

    beforeAll(async () => {
      lowered = await lowerFixture('sample-creatures', target);
      catalogue = buildEntityCatalogue(lowered.files, target, log);
    }, 60_000);

    it('lowers without errors and reads every mob, saying nothing', () => {
      expect(lowered.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
      expect(catalogue.ids()).toEqual(
        ['archer', 'boss', 'fish', 'glider', 'mount', 'pet'].map((path) => `${C}:${path}`),
      );
      expect(log.only).toEqual([]);
    });

    it('keeps sizes, modes, scales and names', () => {
      expect(catalogue.get(`${C}:archer`)).toMatchObject({
        displayName: 'Sample Archer',
        spawnEgg: `${C}:archer_spawn_egg`,
        spawnEggName: 'Sample Archer Spawn Egg',
        width: 0.6,
        height: 1.95,
        mode: 'walk',
        model: { model: `${C}:entity/archer`, idle: 'idle', walk: 'walk', scale: 1 },
      });
      expect(catalogue.get(`${C}:glider`)).toMatchObject({ mode: 'fly', hovers: true });
      expect(catalogue.get(`${C}:fish`)).toMatchObject({ mode: 'swim' });
      expect(catalogue.get(`${C}:boss`)?.model?.scale).toBe(1.5);
      expect(catalogue.get(`${C}:mount`)?.stepHeight).toBe(1);
      expect(catalogue.get(`${C}:archer`)?.onlyInMinecraft).toContain('ranged attacks');
    });

    it('spawns every mob from its egg and keeps them in the area', () => {
      const blocks = buildCatalogue(lowered.files, target, log);
      const world = new SimWorld();
      const entities = new EntityWorld(world, blocks, catalogue, log, { seed: 5 });
      catalogue.ids().forEach((id, i) => {
        const egg = catalogue.get(id)?.spawnEgg as string;
        const result = entities.spawnFromEgg(egg, {
          pos: { x: 6 + i * 6, y: -1, z: 20 },
          face: 'up',
        });
        expect(result.spawned, id).toBe(true);
      });
      for (let t = 0; t < 200; t++) {
        for (const box of entities.step().map((s) => s.position)) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x).toBeLessThanOrEqual(AREA_SIZE_X);
          expect(box.z).toBeGreaterThanOrEqual(0);
          expect(box.z).toBeLessThanOrEqual(AREA_SIZE_Z);
        }
      }
      expect(log.only).toContain('Sample Fish swims; in the preview it stands still');
    });
  },
);

describe.each(targets.map((target) => [target.id, target] as const))(
  'sample-mob on %s',
  (_, target: Target) => {
    it('reads the glow golem', async () => {
      const lowered = await lowerFixture('sample-mob', target);
      const log = testLog();
      const catalogue = buildEntityCatalogue(lowered.files, target, log);
      expect(catalogue.ids()).toEqual(['msm_sample_mob:glow_golem']);
      expect(catalogue.get('msm_sample_mob:glow_golem')?.model).toBeDefined();
      expect(log.only).toEqual([]);
    }, 60_000);
  },
);
