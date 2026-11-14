import { describe, expect, it } from 'vitest';
import {
  baseHeight,
  blockIdOf,
  columnLayers,
  countGroundBlocks,
  FLAT_WORLD_LAYERS,
  flatGround,
  GROUND_AIR,
  type GroundBlocks,
  groundState,
  groundStateAt,
  LocalWorldSource,
  normaliseQuickOptions,
  QUICK_PRESETS,
  QUICK_SAND,
  QUICK_WATER,
  type QuickWorldOptions,
  quickWorld,
  stretchLayerIndex,
  TREE_LEAVES,
  TREE_LOG,
  TREE_SOILS,
} from '../../src/index.js';
import { FAKE_TARGET, testFiles } from '../blocks/helpers.js';

const preset = (id: string): QuickWorldOptions => {
  const found = QUICK_PRESETS.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`No preset ${id}`);
  return found.options;
};

/** The top non-air state of a column, with its y. */
function top(ground: GroundBlocks, x: number, z: number): { y: number; state: string } {
  for (let y = ground.size.y - 1; y >= 0; y -= 1) {
    const state = groundStateAt(ground, x, y, z);
    if (state !== GROUND_AIR) return { y, state };
  }
  return { y: -1, state: GROUND_AIR };
}

describe('block state strings', () => {
  it('reads names, namespaces and properties, dropping bad pairs alone', () => {
    expect(groundState('minecraft:stone')).toEqual({ name: 'minecraft:stone', properties: {} });
    expect(groundState('dirt')).toEqual({ name: 'minecraft:dirt', properties: {} });
    expect(groundState('minecraft:oak_log[axis=y,bad,=x]')).toEqual({
      name: 'minecraft:oak_log',
      properties: { axis: 'y' },
    });
    expect(blockIdOf('minecraft:grass_block[snowy=false]')).toBe('minecraft:grass_block');
  });
});

describe('flatGround', () => {
  it('fills the bottom of the area with bedrock, dirt, dirt and grass block', () => {
    const ground = flatGround();
    expect(ground.size).toEqual({ x: 48, y: 32, z: 48 });
    for (const [x, z] of [
      [0, 0],
      [47, 47],
      [20, 31],
    ] as const) {
      expect([0, 1, 2, 3].map((y) => groundStateAt(ground, x, y, z))).toEqual(FLAT_WORLD_LAYERS);
      expect(groundStateAt(ground, x, 4, z)).toBe(GROUND_AIR);
    }
    expect(countGroundBlocks(ground)).toEqual(
      new Map([
        ['minecraft:bedrock', 48 * 48],
        ['minecraft:dirt', 2 * 48 * 48],
        ['minecraft:grass_block', 48 * 48],
      ]),
    );
  });
});

describe('quickWorld', () => {
  it('is deterministic per seed and differs between seeds', () => {
    for (const id of ['island', 'hills']) {
      const a = quickWorld(preset(id));
      const b = quickWorld({ ...preset(id) });
      expect(a.blocks).toEqual(b.blocks);
      expect(a.palette).toEqual(b.palette);
      expect(a.trees).toEqual(b.trees);
      const c = quickWorld({ ...preset(id), seed: preset(id).seed + 1 });
      expect(c.blocks).not.toEqual(a.blocks);
    }
  });

  it('stacks layers top to bottom; the thickest one stretches', () => {
    const layers = [
      { block: 'minecraft:grass_block', thickness: 1 },
      { block: 'minecraft:dirt', thickness: 3 },
      { block: 'minecraft:stone', thickness: 4 },
      { block: 'minecraft:bedrock', thickness: 1 },
    ];
    expect(stretchLayerIndex(layers)).toBe(2);
    expect(baseHeight(layers)).toBe(9);
    const short = (id: string) => id.slice('minecraft:'.length);
    // Flat: the layers stack exactly, as a superflat preset does.
    expect(columnLayers(layers, 9).map(short)).toEqual([
      'bedrock',
      'stone',
      'stone',
      'stone',
      'stone',
      'dirt',
      'dirt',
      'dirt',
      'grass_block',
    ]);
    // Higher land: the stone grows; lower land: it shrinks, then the dirt; the top layer and
    // the bottom layer stay longest.
    expect(columnLayers(layers, 11).filter((id) => id === 'minecraft:stone')).toHaveLength(6);
    expect(columnLayers(layers, 4).map(short)).toEqual(['bedrock', 'dirt', 'dirt', 'grass_block']);
    expect(columnLayers(layers, 2).map(short)).toEqual(['bedrock', 'grass_block']);
    expect(columnLayers(layers, 1).map(short)).toEqual(['grass_block']);
    // A tie stretches the lower layer.
    expect(
      stretchLayerIndex([
        { block: 'a', thickness: 2 },
        { block: 'b', thickness: 2 },
      ]),
    ).toBe(1);

    const flat = quickWorld(preset('classic-flat'));
    for (const [x, z] of [
      [0, 0],
      [30, 12],
    ] as const) {
      const column = Array.from({ length: 10 }, (_, y) => blockIdOf(groundStateAt(flat, x, y, z)));
      expect(column.map(short)).toEqual([...columnLayers(layers, 9).map(short), 'air']);
    }
  });

  it('gives each preset its shape', () => {
    const flat = quickWorld(preset('classic-flat'));
    expect(new Set(flat.heights)).toEqual(new Set([9]));
    expect(flat.trees).toHaveLength(0);

    const sandbox = quickWorld(preset('sandbox'));
    expect(top(sandbox, 10, 10)).toEqual({ y: 3, state: 'minecraft:smooth_stone' });
    expect(new Set(sandbox.heights).size).toBe(1);

    const hills = quickWorld(preset('hills'));
    const heights = [...hills.heights];
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThanOrEqual(4);
    expect(Math.max(...heights)).toBeLessThanOrEqual(24);

    const valley = quickWorld({ ...preset('classic-flat'), shape: 'valley' });
    const row = Array.from({ length: 48 }, (_, x) => valley.heights[24 * 48 + x] as number);
    // Low in the middle, high at both sides.
    const middle = Math.min(...row.slice(14, 34));
    expect(row[0] as number).toBeGreaterThan(middle + 4);
    expect(row[47] as number).toBeGreaterThan(middle + 4);
  });

  it('puts the island above the water and its edges under it', () => {
    const island = quickWorld(preset('island'));
    const level = island.options.waterLevel;
    // The centre is land above the water.
    expect(top(island, 24, 24).y).toBeGreaterThanOrEqual(level);
    expect(blockIdOf(top(island, 24, 24).state)).toBe('minecraft:grass_block');
    // The corners are water, up to the level and no higher.
    for (const [x, z] of [
      [0, 0],
      [47, 0],
      [0, 47],
      [47, 47],
    ] as const) {
      expect(top(island, x, z)).toEqual({ y: level - 1, state: QUICK_WATER });
    }
    for (let i = 0; i < island.blocks.length; i += 1) {
      const y = Math.floor(i / (48 * 48));
      const state = island.palette[island.blocks[i] as number];
      if (state === QUICK_WATER) expect(y).toBeLessThan(level);
      // No air is left under the water level.
      if (y < level) expect(state).not.toBe(GROUND_AIR);
    }
    // Shores: the land at the water's edge is sand.
    let shores = 0;
    for (let z = 0; z < 48; z += 1) {
      for (let x = 0; x < 48; x += 1) {
        const height = island.heights[z * 48 + x] as number;
        if (height === level || height === level + 1) {
          shores += 1;
          expect(groundStateAt(island, x, height - 1, z)).toBe(QUICK_SAND);
        }
      }
    }
    expect(shores).toBeGreaterThan(0);
    // Another level moves the water with it.
    const higher = quickWorld({ ...preset('island'), waterLevel: level + 2 });
    expect(top(higher, 0, 0)).toEqual({ y: level + 1, state: QUICK_WATER });
  });

  it('grows as many trees as asked, on soil, apart, above the water', () => {
    const base = { ...preset('classic-flat') };
    const counts = (trees: 'none' | 'few' | 'many', seed: number) =>
      quickWorld({ ...base, trees, seed }).trees.length;
    for (const seed of [1, 2, 3, 99]) {
      expect(counts('none', seed)).toBe(0);
      expect(counts('few', seed)).toBe(4);
      expect(counts('many', seed)).toBeGreaterThanOrEqual(10);
      expect(counts('many', seed)).toBeLessThanOrEqual(14);
    }
    const world = quickWorld({ ...base, trees: 'many', seed: 5 });
    for (const tree of world.trees) {
      expect(TREE_SOILS.has(blockIdOf(groundStateAt(world, tree.x, tree.y - 1, tree.z)))).toBe(
        true,
      );
      for (let y = tree.y; y < tree.y + tree.trunk; y += 1) {
        expect(groundStateAt(world, tree.x, y, tree.z)).toBe(TREE_LOG);
      }
      expect(groundStateAt(world, tree.x, tree.y + tree.trunk, tree.z)).toBe(TREE_LEAVES);
      for (const other of world.trees) {
        if (other !== tree)
          expect((other.x - tree.x) ** 2 + (other.z - tree.z) ** 2).toBeGreaterThanOrEqual(16);
      }
    }
    // On the island, no tree stands on sand or under water.
    const island = quickWorld({ ...preset('island'), trees: 'many' });
    for (const tree of island.trees) {
      expect(tree.y - 1).toBeGreaterThanOrEqual(island.options.waterLevel);
    }
    // Sand alone grows no trees.
    const desert = quickWorld({
      ...base,
      trees: 'many',
      layers: [{ block: 'minecraft:sand', thickness: 4 }],
    });
    expect(desert.trees).toHaveLength(0);
  });

  it('keeps options within the limits', () => {
    const options = normaliseQuickOptions({
      shape: 'mountains' as never,
      layers: Array.from({ length: 12 }, () => ({ block: '', thickness: 99 })),
      waterLevel: 400,
      trees: 'lots' as never,
      seed: -5,
    });
    expect(options.shape).toBe('flat');
    expect(options.layers).toHaveLength(8);
    expect(options.layers[0]).toEqual({ block: 'minecraft:stone', thickness: 16 });
    expect(options.waterLevel).toBe(24);
    expect(options.trees).toBe('none');
    expect(options.seed).toBe(0);
    expect(quickWorld(options).heights.every((height) => height <= 24)).toBe(true);
  });
});

describe('LocalWorldSource.loadGround', () => {
  const make = () => new LocalWorldSource({ files: testFiles(), target: FAKE_TARGET, seed: 7 });

  it('fills the world with props, stands the player on top and says so once', () => {
    const source = make();
    const started = performance.now();
    const result = source.loadGround('quick', quickWorld(preset('island')));
    const elapsed = performance.now() - started;
    console.log(`loadGround (island): ${elapsed.toFixed(1)} ms for ${result.blocks} blocks`);
    expect(source.ground).toBe('quick');
    expect(result.blocks).toBe(source.world.count);
    expect(result.blocks).toBeGreaterThan(20_000);
    expect(source.world.get({ x: 0, y: 0, z: 0 })?.name).toBe('minecraft:bedrock');
    // The player stands on the land at the centre.
    expect(source.player.position.x).toBe(24.5);
    expect(source.player.position.y).toBe(top(quickWorld(preset('island')), 24, 24).y + 1);
    const lines = source.lines.map((line) => line.text);
    expect(lines.filter((text) => text.includes('is a vanilla block'))).toEqual([]);
    expect(lines.some((text) => text.startsWith("The ground's Minecraft blocks"))).toBe(true);
    expect(lines.some((text) => text.startsWith('Water and lava are drawn'))).toBe(true);
  });

  it('walks through water and places into it', () => {
    const source = make();
    source.loadGround('quick', quickWorld(preset('island')));
    const water = { name: 'minecraft:water', properties: {} };
    expect(source.catalogue.collision(water)).toEqual([]);
    expect(source.catalogue.outline(water)).toEqual([]);
    // A corner column: water from the sea floor up to the level.
    const level = preset('island').waterLevel;
    expect(source.world.get({ x: 0, y: level - 1, z: 0 })?.name).toBe('minecraft:water');
    source.act({
      type: 'place',
      pos: { x: 0, y: level - 2, z: 0 },
      face: 'up',
      hit: { x: 0.5, y: 1, z: 0.5 },
      block: 'test:cube',
    });
    // The column under the water is water too; placing on top of the water cell below works.
    expect(source.world.get({ x: 0, y: level - 1, z: 0 })?.name).toBe('test:cube');
  });

  it('leaves out other mods’ blocks and keeps known states, defaults for the rest', () => {
    const source = make();
    const ground = flatGround();
    const palette = [...ground.palette, 'othermod:gizmo', 'test:cube[nonsense=1]'];
    const blocks = ground.blocks.slice();
    blocks[(5 * 48 + 0) * 48 + 0] = palette.length - 2;
    blocks[(5 * 48 + 0) * 48 + 1] = palette.length - 1;
    const result = source.loadGround('world', { size: ground.size, palette, blocks });
    expect(result.leftOut).toEqual(new Map([['othermod:gizmo', 1]]));
    expect(source.world.get({ x: 0, y: 5, z: 0 })).toBeNull();
    expect(source.world.get({ x: 1, y: 5, z: 0 })).toEqual({ name: 'test:cube', properties: {} });
    expect(source.lines.some((line) => line.text.includes('othermod:gizmo'))).toBe(true);
  });

  it('brings the ground back on "Clear the area", and the grid clears to nothing', () => {
    const source = make();
    source.loadGround('flat', flatGround());
    const count = source.world.count;
    expect(count).toBe(4 * 48 * 48);
    expect(source.player.position.y).toBe(4);
    source.act({
      type: 'place',
      pos: { x: 20, y: 3, z: 20 },
      face: 'up',
      hit: { x: 0.5, y: 1, z: 0.5 },
      block: 'test:cube',
    });
    source.act({ type: 'break', pos: { x: 21, y: 3, z: 21 } });
    expect(source.world.count).toBe(count);
    source.act({ type: 'clear' });
    expect(source.world.count).toBe(count);
    expect(source.world.get({ x: 20, y: 4, z: 20 })).toBeNull();
    expect(source.world.get({ x: 21, y: 3, z: 21 })?.name).toBe('minecraft:grass_block');
    expect(source.lines.at(-1)?.text).toBe('You cleared the area; the ground is back as it was.');

    source.loadGround('grid');
    expect(source.ground).toBe('grid');
    expect(source.world.count).toBe(0);
    expect(source.player.position.y).toBe(0);
  });

  it('keeps the ground through a live edit, checking each state once', () => {
    const source = make();
    source.loadGround('quick', quickWorld(preset('hills')));
    const count = source.world.count;
    const started = performance.now();
    source.setFiles(new Map(testFiles()));
    console.log(`setFiles over ${count} blocks: ${(performance.now() - started).toFixed(1)} ms`);
    expect(source.world.count).toBe(count);
  });
});
