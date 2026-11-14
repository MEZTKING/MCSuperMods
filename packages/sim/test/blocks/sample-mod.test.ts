/**
 * The catalogue over `fixtures/sample-mod` lowered on every built-in target: every block is
 * read (no props, no "Only in Minecraft" lines), its properties agree with the lowered block
 * state definition, and every block can be placed in the area.
 */
import type { Target } from '@msm/plugin-api';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type BlockCatalogue,
  blockstateProperties,
  buildCatalogue,
  placeBlock,
  readJsonFile,
  SimWorld,
} from '../../src/index.js';
import { builtInTargets, type LoweredFixture, lowerFixture } from '../lower-fixture.js';
import { testLog } from './helpers.js';

const NS = 'msm_sample_mod';

const targets = await builtInTargets();

describe.each(targets.map((target) => [target.id, target] as const))(
  'sample-mod on %s',
  (_, target: Target) => {
    let lowered: LoweredFixture;
    let catalogue: BlockCatalogue;
    const log = testLog();

    beforeAll(async () => {
      lowered = await lowerFixture('sample-mod', target);
      catalogue = buildCatalogue(lowered.files, target, log);
    }, 60_000);

    it('lowers without errors', () => {
      expect(lowered.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    });

    it('reads every block definition, none as a prop, saying nothing', () => {
      const definitions = [...lowered.files.keys()].filter((path) =>
        path.startsWith(`msm/${NS}/block/`),
      );
      expect(definitions.length).toBeGreaterThanOrEqual(30);
      expect(catalogue.ids()).toHaveLength(definitions.length);
      for (const blockId of catalogue.ids())
        expect(catalogue.get(blockId)?.prop, blockId).toBe(false);
      expect(log.only).toEqual([]);
    });

    it('knows the types of the Wood, Stone and Crop sets', () => {
      const typeOf = (path: string) => catalogue.get(`${NS}:${path}`)?.type;
      expect(typeOf('maple_log')).toBe('pillar');
      expect(typeOf('maple_slab')).toBe('slab');
      expect(typeOf('maple_stairs')).toBe('stairs');
      expect(typeOf('maple_fence')).toBe('fence');
      expect(typeOf('maple_fence_gate')).toBe('fence_gate');
      expect(typeOf('maple_door')).toBe('door');
      expect(typeOf('maple_trapdoor')).toBe('trapdoor');
      expect(typeOf('maple_button')).toBe('button');
      expect(typeOf('maple_pressure_plate')).toBe('pressure_plate');
      expect(typeOf('maple_sapling')).toBe('sapling');
      expect(typeOf('maple_leaves')).toBe('leaves');
      expect(typeOf('ruby_bricks_wall')).toBe('wall');
      expect(typeOf('ruby_berries_crop')).toBe('crop');
      expect(catalogue.get(`${NS}:maple_fence`)?.woodenFence).toBe(true);
      expect(catalogue.get(`${NS}:maple_door`)?.opensByHand).toBe(true);
      expect(catalogue.get(`${NS}:maple_button`)?.pressTicks).toBe(30);
      expect(catalogue.get(`${NS}:maple_door`)?.displayName).toBe('Maple Door');
      expect(catalogue.get(`${NS}:chime_block`)?.properties.powered).toEqual(['false', 'true']);
    });

    it('agrees with every lowered block state definition', () => {
      const folder = target.folders.resource.block_definition;
      for (const blockId of catalogue.ids()) {
        const block = catalogue.get(blockId);
        const path = blockId.slice(NS.length + 1);
        const blockstate = readJsonFile(lowered.files, `assets/${NS}/${folder}/${path}.json`);
        expect(block?.hasBlockstate, blockId).toBe(blockstate !== undefined);
        for (const [name, values] of blockstateProperties(blockstate)) {
          for (const value of values)
            expect(block?.properties[name], `${blockId} ${name}`).toContain(value);
        }
        // The default state, cut to the properties the file names, is one of its variants.
        if (
          blockstate !== undefined &&
          typeof blockstate === 'object' &&
          blockstate !== null &&
          'variants' in blockstate
        ) {
          const key = [...blockstateProperties(blockstate).keys()]
            .sort()
            .map((name) => `${name}=${block?.defaultState.properties[name]}`)
            .join(',');
          const keys = Object.keys((blockstate as { variants: Record<string, unknown> }).variants);
          expect(keys, blockId).toContain(key);
        }
      }
    });

    it('places every block in the area', () => {
      const world = new SimWorld();
      catalogue.ids().forEach((blockId, i) => {
        const result = placeBlock(world, catalogue, {
          block: blockId,
          pos: { x: (i % 12) * 3 + 1, y: -1, z: Math.floor(i / 12) * 3 + 1 },
          face: 'up',
          hit: { x: 0.5, y: 1, z: 0.5 },
          yaw: 180,
          pitch: 30,
        });
        expect(result.placed, blockId).toBe(true);
      });
    });
  },
);
