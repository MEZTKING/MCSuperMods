/**
 * Test helpers for the mobs: a small project of mobs as lowered files (one per movement mode),
 * the block test project for shapes, and a full-size area.
 */
import type { Json } from '@msm/plugin-api';
import {
  buildCatalogue,
  buildEntityCatalogue,
  EntityWorld,
  type EntityWorldOptions,
  SimWorld,
} from '../../src/index.js';
import { FAKE_TARGET, type TestLog, testFiles, testLog } from '../blocks/helpers.js';

export const NS = 'zoo';

const model = (name: string): Json => ({
  model: `${NS}:entity/${name}`,
  texture: `${NS}:entity/${name}`,
  animations: `${NS}:entity/${name}_animations`,
  idle: 'idle',
  walk: 'walk',
});

/** One mob definition per movement mode, plus a few odd ones. */
export const MOBS: Readonly<Record<string, Json>> = {
  cow: {
    format: 1,
    category: 'creature',
    size: { width: 0.9, height: 1.4 },
    components: {
      'msm:animated_model': { ...(model('cow') as object), scale: 1.2 },
      'msm:movement': { speed: 0.2 },
      'msm:ai_goals': { goals: [{ type: 'panic' }, { type: 'wander' }, { type: 'look_around' }] },
      'msm:breedable': { items: ['minecraft:wheat'] },
    },
    spawn: { biomes: ['minecraft:plains'], weight: 1, min_group: 1, max_group: 2 },
  },
  bee: {
    format: 1,
    category: 'creature',
    size: { width: 0.7, height: 0.6 },
    components: {
      'msm:animated_model': { ...(model('bee') as object), fly: 'fly' },
      'msm:movement': { mode: 'fly', flying_speed: 0.6 },
    },
    spawn_egg: {},
  },
  parrot: {
    format: 1,
    category: 'creature',
    size: { width: 0.5, height: 0.9 },
    components: {
      'msm:animated_model': model('parrot'),
      'msm:movement': { mode: 'fly', hovers: false },
    },
  },
  fish: {
    format: 1,
    category: 'water_ambient',
    size: { width: 0.5, height: 0.4 },
    components: {
      'msm:animated_model': model('fish'),
      'msm:movement': { mode: 'swim' },
    },
    spawn_egg: false,
  },
  frog: {
    format: 1,
    category: 'creature',
    size: { width: 0.5, height: 0.5 },
    components: {
      'msm:animated_model': model('frog'),
      'msm:movement': { mode: 'amphibious', step_height: 1 },
    },
  },
  ghost: {
    format: 1,
    category: 'monster',
    size: { width: 0.6, height: 1.8 },
    components: {
      'msm:animated_model': model('ghost'),
      'msm:movement': { mode: 'burrow' },
    },
  },
};

/** The lowered files of the mob project, with an `en_us` file and an unreadable definition. */
export function mobFiles(extra: Record<string, Json> = {}): Map<string, string> {
  const files = new Map<string, string>();
  for (const [path, definition] of Object.entries(MOBS)) {
    files.set(`msm/${NS}/entity/${path}.json`, JSON.stringify(definition));
  }
  files.set(`msm/${NS}/entity/broken.json`, '{ not json');
  files.set(
    `assets/${NS}/lang/en_us.json`,
    JSON.stringify({
      'entity.zoo.cow': 'Moo Cow',
      'item.zoo.cow_spawn_egg': 'Cow Egg',
      'entity.zoo.bee': 'Buzzy Bee',
    }),
  );
  for (const [path, json] of Object.entries(extra)) files.set(path, JSON.stringify(json));
  return files;
}

/** `zoo:<path>`. */
export const mob = (path: string): string => `${NS}:${path}`;

/** A full-size area with the block test project's shapes and the mob catalogue. */
export function setUpMobs(options: EntityWorldOptions = {}): {
  world: SimWorld;
  entities: EntityWorld;
  log: TestLog;
  blocks: ReturnType<typeof buildCatalogue>;
} {
  const log = testLog();
  const blocks = buildCatalogue(testFiles(), FAKE_TARGET, log);
  const catalogue = buildEntityCatalogue(mobFiles(), FAKE_TARGET, log);
  log.lines.length = 0;
  log.only.length = 0;
  const world = new SimWorld();
  return { world, entities: new EntityWorld(world, blocks, catalogue, log, options), log, blocks };
}

/** On the floor under (x, z). */
export const onFloor = (x: number, z: number) => ({ pos: { x, y: -1, z }, face: 'up' as const });
