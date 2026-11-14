/** Connections and halves that follow the neighbours: rows, corners, T joins and removal. */
import { describe, expect, it } from 'vitest';
import { type BlockPos, breakBlock, placeBlock, stairsShape } from '../../src/index.js';
import { floor, id, placeOn, propsAt, setUp, YAW } from './helpers.js';

const P = (x: number, y: number, z: number): BlockPos => ({ x, y, z });

/** Places `block` on the floor at each (x, z). */
function build(
  ctx: ReturnType<typeof setUp>,
  block: string,
  spots: readonly (readonly [number, number])[],
  yaw: number = YAW.north,
): void {
  for (const [x, z] of spots) {
    const result = placeBlock(ctx.world, ctx.catalogue, placeOn(block, floor(x, z), { yaw }));
    if (!result.placed) throw new Error(`could not place ${block} at ${x},${z}: ${result.reason}`);
  }
}

const sides = (props: Record<string, string> | null) =>
  props === null ? null : ['north', 'east', 'south', 'west'].map((side) => props[side]).join(' ');

for (const [type, joined, none] of [
  ['fence', 'true', 'false'],
  ['pane', 'true', 'false'],
  ['wall', 'low', 'none'],
] as const) {
  describe(`${type} connections`, () => {
    it('a row joins end to end', () => {
      const ctx = setUp();
      build(ctx, type, [
        [4, 5],
        [5, 5],
        [6, 5],
      ]);
      expect(sides(propsAt(ctx.world, P(4, 0, 5)))).toBe(`${none} ${joined} ${none} ${none}`);
      expect(sides(propsAt(ctx.world, P(5, 0, 5)))).toBe(`${none} ${joined} ${none} ${joined}`);
      expect(sides(propsAt(ctx.world, P(6, 0, 5)))).toBe(`${none} ${none} ${none} ${joined}`);
    });

    it('a corner joins two sides', () => {
      const ctx = setUp();
      build(ctx, type, [
        [5, 4],
        [5, 5],
        [6, 5],
      ]);
      expect(sides(propsAt(ctx.world, P(5, 0, 5)))).toBe(`${joined} ${joined} ${none} ${none}`);
    });

    it('a T joins three sides', () => {
      const ctx = setUp();
      build(ctx, type, [
        [4, 5],
        [6, 5],
        [5, 6],
        [5, 5],
      ]);
      expect(sides(propsAt(ctx.world, P(5, 0, 5)))).toBe(`${none} ${joined} ${joined} ${joined}`);
    });

    it('removal lets go of the side', () => {
      const ctx = setUp();
      build(ctx, type, [
        [4, 5],
        [5, 5],
        [6, 5],
      ]);
      const changes = breakBlock(ctx.world, ctx.catalogue, P(6, 0, 5));
      expect(changes[0]).toEqual({ pos: P(6, 0, 5), state: null });
      expect(sides(propsAt(ctx.world, P(5, 0, 5)))).toBe(`${none} ${none} ${none} ${joined}`);
    });
  });
}

describe('wall posts', () => {
  it('a straight run has no post; its ends and corners do', () => {
    const ctx = setUp();
    build(ctx, 'wall', [
      [4, 5],
      [5, 5],
      [6, 5],
      [6, 6],
    ]);
    expect(propsAt(ctx.world, P(4, 0, 5))?.up).toBe('true');
    expect(propsAt(ctx.world, P(5, 0, 5))?.up).toBe('false');
    expect(propsAt(ctx.world, P(6, 0, 5))?.up).toBe('true');
    breakBlock(ctx.world, ctx.catalogue, P(4, 0, 5));
    expect(propsAt(ctx.world, P(5, 0, 5))?.up).toBe('true');
  });

  it('a block on top makes the sides tall; a wall on top with a post raises the post', () => {
    const ctx = setUp();
    build(ctx, 'wall', [
      [4, 5],
      [5, 5],
      [6, 5],
    ]);
    placeBlock(ctx.world, ctx.catalogue, placeOn('cube', P(5, 0, 5)));
    expect(propsAt(ctx.world, P(5, 0, 5))).toMatchObject({
      east: 'tall',
      west: 'tall',
      up: 'false',
    });
    breakBlock(ctx.world, ctx.catalogue, P(5, 1, 5));
    placeBlock(ctx.world, ctx.catalogue, placeOn('wall', P(5, 0, 5)));
    expect(propsAt(ctx.world, P(5, 1, 5))?.up).toBe('true');
    expect(propsAt(ctx.world, P(5, 0, 5))).toMatchObject({ east: 'low', west: 'low', up: 'true' });
  });
});

describe('fence gates in walls', () => {
  it('drops into a wall placed beside it and rises when it goes', () => {
    const ctx = setUp();
    build(ctx, 'gate', [[5, 5]]);
    expect(propsAt(ctx.world, P(5, 0, 5))?.in_wall).toBe('false');
    build(ctx, 'wall', [[6, 5]]);
    expect(propsAt(ctx.world, P(5, 0, 5))?.in_wall).toBe('true');
    expect(propsAt(ctx.world, P(6, 0, 5))?.west).toBe('low');
    breakBlock(ctx.world, ctx.catalogue, P(6, 0, 5));
    expect(propsAt(ctx.world, P(5, 0, 5))?.in_wall).toBe('false');
  });
});

describe('stairs corners', () => {
  it('stairs behind turned left make an outer left corner', () => {
    const ctx = setUp();
    build(ctx, 'stairs', [[5, 4]], YAW.west);
    build(ctx, 'stairs', [[5, 5]], YAW.north);
    expect(propsAt(ctx.world, P(5, 0, 5))?.shape).toBe('outer_left');
    expect(propsAt(ctx.world, P(5, 0, 4))?.shape).toBe('straight');
  });

  it('stairs behind turned right make an outer right corner, updated when they arrive', () => {
    const ctx = setUp();
    build(ctx, 'stairs', [[5, 5]], YAW.north);
    build(ctx, 'stairs', [[5, 4]], YAW.east);
    expect(propsAt(ctx.world, P(5, 0, 5))?.shape).toBe('outer_right');
  });

  it('stairs in front turned across make an inner corner', () => {
    const ctx = setUp();
    build(ctx, 'stairs', [[5, 6]], YAW.east);
    build(ctx, 'stairs', [[5, 5]], YAW.north);
    expect(propsAt(ctx.world, P(5, 0, 5))?.shape).toBe('inner_right');
    breakBlock(ctx.world, ctx.catalogue, P(5, 0, 6));
    expect(propsAt(ctx.world, P(5, 0, 5))?.shape).toBe('straight');
  });

  it('stairs of the other half do not make a corner', () => {
    const ctx = setUp();
    const top = ctx.catalogue.withProperties(
      ctx.catalogue.get(id('stairs'))?.defaultState ?? { name: '', properties: {} },
      { facing: 'west', half: 'top' },
    );
    ctx.world.set(P(5, 0, 4), top);
    build(ctx, 'stairs', [[5, 5]], YAW.north);
    expect(propsAt(ctx.world, P(5, 0, 5))?.shape).toBe('straight');
  });

  it('a corner is not taken where it would cut stairs of the same run', () => {
    const ctx = setUp();
    const stairs = (facing: string) =>
      ctx.catalogue.withProperties(
        ctx.catalogue.get(id('stairs'))?.defaultState ?? { name: '', properties: {} },
        { facing },
      );
    ctx.world.set(P(5, 0, 4), stairs('west'));
    ctx.world.set(P(6, 0, 5), stairs('north'));
    expect(stairsShape(ctx.world, ctx.catalogue, P(5, 0, 5), stairs('north'))).toBe('straight');
  });
});

describe('door halves and support', () => {
  it('removes a door whose ground goes', () => {
    const ctx = setUp();
    placeBlock(ctx.world, ctx.catalogue, placeOn('cube', floor(5, 5)));
    placeBlock(ctx.world, ctx.catalogue, placeOn('door', P(5, 0, 5)));
    expect(ctx.world.count).toBe(3);
    const changes = breakBlock(ctx.world, ctx.catalogue, P(5, 0, 5));
    expect(changes.map((c) => c.state)).toEqual([null, null, null]);
    expect(ctx.world.count).toBe(0);
  });

  it('removes a half door left alone', () => {
    const ctx = setUp();
    placeBlock(ctx.world, ctx.catalogue, placeOn('door', floor(5, 5)));
    ctx.world.set(P(5, 1, 5), null);
    breakBlock(ctx.world, ctx.catalogue, P(6, 0, 5));
    placeBlock(ctx.world, ctx.catalogue, placeOn('cube', floor(6, 5)));
    expect(ctx.world.get(P(5, 0, 5))).toBeNull();
  });

  it('removes buttons, plates and plants that lose their block', () => {
    const ctx = setUp();
    placeBlock(ctx.world, ctx.catalogue, placeOn('cube', floor(5, 5)));
    placeBlock(
      ctx.world,
      ctx.catalogue,
      placeOn('button', P(5, 0, 5), { face: 'east', hit: { x: 1, y: 0.5, z: 0.5 } }),
    );
    placeBlock(ctx.world, ctx.catalogue, placeOn('plate', P(5, 0, 5)));
    expect(ctx.world.count).toBe(3);
    breakBlock(ctx.world, ctx.catalogue, P(5, 0, 5));
    expect(ctx.world.count).toBe(0);
    placeBlock(ctx.world, ctx.catalogue, placeOn('cube', floor(5, 5)));
    placeBlock(ctx.world, ctx.catalogue, placeOn('crop', P(5, 0, 5)));
    placeBlock(ctx.world, ctx.catalogue, placeOn('sapling', floor(6, 5)));
    breakBlock(ctx.world, ctx.catalogue, P(5, 0, 5));
    expect(ctx.world.get(P(5, 1, 5))).toBeNull();
    expect(ctx.world.get(P(6, 0, 5))?.name).toBe(id('sapling'));
  });
});
