/**
 * Test helpers: a small project of one block per type as lowered files, a fake target with the
 * folder names and block names the catalogue reads, and a log that keeps its lines.
 */
import type { Json } from '@msm/plugin-api';
import {
  type BlockCatalogue,
  type BlockPos,
  type BlockState,
  buildCatalogue,
  type CatalogueTarget,
  type PlaceInput,
  type SimLog,
  SimWorld,
} from '../../src/index.js';

/** A fake target: only what the catalogue reads (folder names and block names). */
export const FAKE_TARGET = {
  id: 'mc-test',
  folders: {
    resource: { block_definition: 'blockstates', lang: 'lang' },
    data: { tags: 'tags' },
  },
  blocks: {
    setTypes: ['wood', 'cherry', 'bamboo', 'crimson', 'warped', 'iron', 'copper', 'gold', 'stone'],
    woodTypes: ['oak', 'spruce', 'bamboo'],
  },
} as unknown as CatalogueTarget;

/** A log that keeps its lines. */
export interface TestLog extends SimLog {
  readonly lines: string[];
  readonly only: string[];
}

export function testLog(): TestLog {
  const lines: string[] = [];
  const only: string[] = [];
  return {
    lines,
    only,
    info: (text) => {
      lines.push(text);
    },
    onlyInMinecraft: (what) => {
      only.push(what);
    },
  };
}

export const NS = 'test';

/** One block definition per type, plus a few variants. */
export const DEFINITIONS: Readonly<Record<string, Json>> = {
  cube: { format: 1 },
  log: { format: 1, type: 'pillar' },
  furnace: { format: 1, type: 'horizontal', components: { 'msm:machine': {} } },
  observer: { format: 1, type: 'directional' },
  slab: { format: 1, type: 'slab' },
  stairs: { format: 1, type: 'stairs' },
  wall: { format: 1, type: 'wall' },
  fence: { format: 1, type: 'fence' },
  stone_fence: { format: 1, type: 'fence' },
  gate: { format: 1, type: 'fence_gate', wood_type: 'oak' },
  door: { format: 1, type: 'door', set_type: 'wood' },
  iron_door: { format: 1, type: 'door', set_type: 'iron' },
  trapdoor: { format: 1, type: 'trapdoor', set_type: 'wood' },
  gold_trapdoor: { format: 1, type: 'trapdoor', set_type: 'gold' },
  button: { format: 1, type: 'button', set_type: 'wood' },
  stone_button: { format: 1, type: 'button', set_type: 'stone' },
  quick_button: { format: 1, type: 'button', set_type: 'stone', press_ticks: 5 },
  plate: { format: 1, type: 'pressure_plate', set_type: 'wood' },
  weighted_plate: { format: 1, type: 'pressure_plate', set_type: 'gold', weighted_max: 10 },
  pane: { format: 1, type: 'pane' },
  crop: { format: 1, type: 'crop', max_age: 3 },
  sapling: { format: 1, type: 'sapling', tree: 'minecraft:oak' },
  leaves: { format: 1, type: 'leaves' },
  portal: { format: 1, type: 'portal', frame: 'minecraft:obsidian' },
  shaped: {
    format: 1,
    type: 'horizontal',
    components: { 'msm:shape': { boxes: [[0, 0, 0, 16, 16, 8]] } },
  },
  ghost: {
    format: 1,
    components: { 'msm:shape': { boxes: [[2, 0, 2, 14, 16, 14]], collision: false } },
  },
  powered: {
    format: 1,
    components: { 'msm:redstone': { on_powered: 'test:on', emit: 0 } },
  },
  odd: { format: 1, type: 'spinner' },
  bad_door: { format: 1, type: 'door', set_type: 'diamond' },
};

/** The lowered files of the test project, with optional extras. */
export function testFiles(extra: Record<string, Json> = {}): Map<string, string> {
  const files = new Map<string, string>();
  for (const [path, definition] of Object.entries(DEFINITIONS)) {
    files.set(`msm/${NS}/block/${path}.json`, JSON.stringify(definition));
  }
  files.set(
    `assets/${NS}/blockstates/furnace.json`,
    JSON.stringify({
      variants: {
        'facing=north,lit=false': { model: 'test:block/furnace' },
        'facing=north,lit=true': { model: 'test:block/furnace_on' },
      },
    }),
  );
  files.set(`msm/${NS}/block/broken.json`, '{ not json');
  files.set(`assets/${NS}/lang/en_us.json`, JSON.stringify({ 'block.test.door': 'Oak-ish Door' }));
  files.set(
    'data/minecraft/tags/block/wooden_fences.json',
    JSON.stringify({ values: [`${NS}:fence`, { id: `${NS}:gate`, required: false }] }),
  );
  for (const [path, json] of Object.entries(extra)) files.set(path, JSON.stringify(json));
  return files;
}

/** A fresh area and catalogue over the test project. */
export function setUp(): { world: SimWorld; catalogue: BlockCatalogue; log: TestLog } {
  const log = testLog();
  const catalogue = buildCatalogue(testFiles(), FAKE_TARGET, log);
  return { world: new SimWorld(16, 8, 16), catalogue, log };
}

/** `test:<path>`. */
export const id = (path: string): string => `${NS}:${path}`;

/** A place input on top of the block (or floor) at `pos`, looking along `yaw`. */
export function placeOn(
  block: string,
  pos: BlockPos,
  options: Partial<Omit<PlaceInput, 'block' | 'pos'>> = {},
): PlaceInput {
  return {
    block: id(block),
    pos,
    face: options.face ?? 'up',
    hit: options.hit ?? { x: 0.5, y: 1, z: 0.5 },
    yaw: options.yaw ?? 180,
    pitch: options.pitch ?? 30,
  };
}

/** Yaw that looks towards each horizontal direction. */
export const YAW = { south: 0, west: 90, north: 180, east: 270 } as const;

/** The properties of the block at a position, or `null` for air. */
export function propsAt(world: SimWorld, pos: BlockPos): BlockState['properties'] | null {
  return world.get(pos)?.properties ?? null;
}

/** The floor position under (x, z). */
export const floor = (x: number, z: number): BlockPos => ({ x, y: -1, z });
