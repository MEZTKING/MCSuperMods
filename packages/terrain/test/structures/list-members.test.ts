/**
 * Every member of a list pool element (J18; B712): the piece names each template of the element in
 * the element's order, each with its processors and its own box at the piece's origin and turn; a
 * single, feature or empty element's piece has no `members`, so nothing else changes.
 */

import { describe, expect, it } from 'vitest';
import type { AssembledPiece, PieceBox, PoolElementData } from '../../src/structures/api';
import { assemble, pieceOrigin } from '../../src/structures/assemble';
import { unionBox } from '../../src/structures/boxes';
import { FixtureWorld, fixtureWorld, jig, pool, single, tpl } from './fixtures';

function listElement(
  members: { location?: string; processors?: string; type?: string }[],
): PoolElementData {
  return {
    weight: 1,
    type: 'minecraft:list_pool_element',
    projection: 'rigid',
    elements: members.map((m) => ({
      element_type: m.type ?? 'minecraft:single_pool_element',
      projection: 'rigid',
      ...(m.location === undefined ? {} : { location: m.location }),
      ...(m.processors === undefined ? {} : { processors: m.processors }),
    })),
  } as PoolElementData;
}

/** A hub with an arm on each side; the arms are a list of three templates of different sizes. */
function threeWorld(): FixtureWorld {
  const arm = { name: 'lx:arm' };
  return new FixtureWorld(
    [
      tpl(
        'lx:hub',
        [5, 3, 5],
        [
          jig([2, 1, 0], 'north_up', { target: 'lx:arm', pool: 'lx:arms' }),
          jig([4, 1, 2], 'east_up', { target: 'lx:arm', pool: 'lx:arms' }),
          jig([2, 1, 4], 'south_up', { target: 'lx:arm', pool: 'lx:arms' }),
          jig([0, 1, 2], 'west_up', { target: 'lx:arm', pool: 'lx:arms' }),
        ],
      ),
      tpl('lx:a', [3, 3, 3], [jig([0, 1, 1], 'west_up', arm)]),
      tpl('lx:b', [2, 5, 2], []),
      tpl('lx:c', [4, 2, 1], []),
    ],
    [
      pool('lx:start', [single('lx:hub')]),
      pool('lx:arms', [
        listElement([
          { location: 'lx:a', processors: 'lx:mossy' },
          { type: 'minecraft:empty_pool_element' },
          { location: 'lx:b' },
          { location: 'lx:c', processors: 'minecraft:empty' },
        ]),
      ]),
    ],
  );
}

function boxOfSize(
  piece: AssembledPiece,
  member: { box: PieceBox },
  size: readonly [number, number, number],
) {
  return pieceOrigin({ box: member.box, rotation: piece.rotation }, size);
}

describe('a list element names every member (B712)', () => {
  it('a list of three templates yields three members, in order, at one origin and turn', () => {
    const world = threeWorld();
    for (let seed = 0n; seed < 40n; seed += 1n) {
      const { pieces } = assemble(world.input({ startPool: 'lx:start', size: 1 }, seed));
      expect(pieces).toHaveLength(5);
      const [hub, ...arms] = pieces as AssembledPiece[];
      expect(hub?.members).toBeUndefined();
      expect('members' in (hub as AssembledPiece)).toBe(false);
      for (const arm of arms) {
        const members = arm.members ?? [];
        expect(members.map((m) => m.template)).toEqual(['lx:a', 'lx:b', 'lx:c']);
        expect(members.map((m) => m.processors)).toEqual(['lx:mossy', null, null]);
        expect(members.map((m) => m.source)).toEqual(['project', 'project', 'project']);
        // The first still names the piece.
        expect(arm.template).toBe('lx:a');
        expect(arm.processors).toBe('lx:mossy');
        // Every member stands at the same origin; together their boxes are the piece's box.
        const origins = members.map((m) =>
          boxOfSize(arm, m, world.templates.get(m.template)?.size ?? [0, 0, 0]),
        );
        for (const o of origins) expect(o).toEqual(origins[0]);
        const union = members.map((m) => m.box).reduce((a, b) => unionBox(a, b));
        expect(union).toEqual(arm.box);
        const height = (m: { box: PieceBox }) => m.box.maxY - m.box.minY + 1;
        expect(members.map(height)).toEqual([3, 5, 2]);
      }
    }
  });

  it('turned members: each box is its own template turned with the piece', () => {
    const world = threeWorld();
    const turns = new Set<string>();
    for (let seed = 0n; seed < 40n; seed += 1n) {
      for (const arm of assemble(world.input({ startPool: 'lx:start', size: 1 }, seed)).pieces) {
        if (!arm.members) continue;
        turns.add(arm.rotation);
        const c = arm.members[2]?.box as PieceBox;
        const quarter = arm.rotation === 'clockwise_90' || arm.rotation === 'counterclockwise_90';
        expect(c.maxX - c.minX + 1).toBe(quarter ? 1 : 4);
        expect(c.maxZ - c.minZ + 1).toBe(quarter ? 4 : 1);
      }
    }
    expect(turns.size).toBe(4);
  });

  it('misc (the spike fixture): the list piece names l1 then l2; the feature and hub name none', () => {
    const world = fixtureWorld();
    for (let seed = 0n; seed < 30n; seed += 1n) {
      const { pieces } = assemble(world.input({ startPool: 'fx:start_misc' }, seed));
      const list = pieces.find((p) => p.template === 'fx:l1') as AssembledPiece;
      expect(list.members?.map((m) => m.template)).toEqual(['fx:l1', 'fx:l2']);
      for (const p of pieces) if (p !== list) expect(p.members).toBeUndefined();
    }
  });

  it('single elements are unchanged: no piece of the lattice or the town has members', () => {
    const world = fixtureWorld();
    const lattice = assemble(
      world.input({ startPool: 'fx:start_grid', size: 7, maxDistanceFromCenter: 116 }, 3n),
    );
    expect(lattice.pieces).toHaveLength(113);
    const town = assemble(
      world.input({ startPool: 'fx:town', size: 6, maxDistanceFromCenter: 40 }, 3n),
    );
    for (const p of [...lattice.pieces, ...town.pieces]) expect('members' in p).toBe(false);
  });
});
