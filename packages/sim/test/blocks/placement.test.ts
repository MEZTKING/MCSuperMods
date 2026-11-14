/**
 * Placement table: for each block type, each face, both halves and each look direction, the
 * state the block takes (or why it is refused). Every type has at least six cases.
 */
import { describe, expect, it } from 'vitest';
import {
  type BlockCatalogue,
  type BlockPos,
  breakBlock,
  type Face,
  placeBlock,
  SIM_BLOCK_TYPES,
  type SimWorld,
  type Vec3,
} from '../../src/index.js';
import { floor, id, placeOn, propsAt, setUp, YAW } from './helpers.js';

interface Case {
  readonly name: string;
  /** Blocks placed first, as [block path, position, properties]. */
  readonly before?: readonly (readonly [string, BlockPos, Record<string, string>?])[];
  readonly block: string;
  readonly pos: BlockPos;
  readonly face?: Face;
  readonly hit?: Vec3;
  readonly yaw?: number;
  readonly pitch?: number;
  /** Where the block lands and the properties it has there; `null`: refused. */
  readonly expect: { at: BlockPos; props: Record<string, string> } | null;
}

const P = (x: number, y: number, z: number): BlockPos => ({ x, y, z });
const C = P(5, 0, 5);
const ABOVE = P(5, 1, 5);
const side = (y: number, x = 0.5, z = 0.5): Vec3 => ({ x, y, z });

/** The cases, by block type. */
const CASES: Record<string, Case[]> = {
  block: [
    { name: 'on the floor', block: 'cube', pos: floor(5, 5), expect: { at: C, props: {} } },
    {
      name: 'on a block',
      before: [['cube', C]],
      block: 'cube',
      pos: C,
      expect: { at: ABOVE, props: {} },
    },
    {
      name: 'against the north face',
      before: [['cube', C]],
      block: 'cube',
      pos: C,
      face: 'north',
      hit: side(0.5, 0.5, 0),
      expect: { at: P(5, 0, 4), props: {} },
    },
    {
      name: 'against the east face',
      before: [['cube', C]],
      block: 'cube',
      pos: C,
      face: 'east',
      hit: side(0.5, 1),
      expect: { at: P(6, 0, 5), props: {} },
    },
    {
      name: 'under a block',
      before: [['cube', ABOVE]],
      block: 'cube',
      pos: ABOVE,
      face: 'down',
      hit: side(0),
      expect: { at: C, props: {} },
    },
    {
      name: 'not into a block',
      before: [
        ['cube', C],
        ['cube', ABOVE],
      ],
      block: 'cube',
      pos: C,
      expect: null,
    },
    {
      name: 'not past the edge',
      before: [['cube', P(15, 0, 5)]],
      block: 'cube',
      pos: P(15, 0, 5),
      face: 'east',
      hit: side(0.5, 1),
      expect: null,
    },
    {
      name: 'not above the top',
      before: [['cube', P(5, 7, 5)]],
      block: 'cube',
      pos: P(5, 7, 5),
      expect: null,
    },
  ],
  pillar: (['up', 'down', 'north', 'south', 'west', 'east'] as const).map((face) => ({
    name: `clicked ${face}`,
    before: [['cube', P(5, 2, 5)]],
    block: 'log',
    pos: P(5, 2, 5),
    face,
    expect: {
      at: {
        up: P(5, 3, 5),
        down: P(5, 1, 5),
        north: P(5, 2, 4),
        south: P(5, 2, 6),
        west: P(4, 2, 5),
        east: P(6, 2, 5),
      }[face],
      props: {
        axis:
          face === 'up' || face === 'down' ? 'y' : face === 'north' || face === 'south' ? 'z' : 'x',
      },
    },
  })),
  horizontal: [
    ...(['north', 'east', 'south', 'west'] as const).map((look) => ({
      name: `looking ${look}`,
      block: 'furnace',
      pos: floor(5, 5),
      yaw: YAW[look],
      expect: {
        at: C,
        props: {
          facing: { north: 'south', south: 'north', east: 'west', west: 'east' }[look],
          lit: 'false',
        },
      },
    })),
    {
      name: 'looking steeply down',
      block: 'furnace',
      pos: floor(5, 5),
      yaw: YAW.east,
      pitch: 89,
      expect: { at: C, props: { facing: 'west', lit: 'false' } },
    },
    {
      name: 'against a side',
      before: [['cube', C]],
      block: 'furnace',
      pos: C,
      face: 'west',
      hit: side(0.5, 0),
      yaw: YAW.east,
      expect: { at: P(4, 0, 5), props: { facing: 'west', lit: 'false' } },
    },
  ],
  directional: [
    ...(['north', 'east', 'south', 'west'] as const).map((look) => ({
      name: `looking ${look}`,
      block: 'observer',
      pos: floor(5, 5),
      yaw: YAW[look],
      pitch: 10,
      expect: {
        at: C,
        props: { facing: { north: 'south', south: 'north', east: 'west', west: 'east' }[look] },
      },
    })),
    {
      name: 'looking down',
      block: 'observer',
      pos: floor(5, 5),
      pitch: 80,
      expect: { at: C, props: { facing: 'up' } },
    },
    {
      name: 'looking up',
      before: [['cube', P(5, 3, 5)]],
      block: 'observer',
      pos: P(5, 3, 5),
      face: 'down',
      hit: side(0),
      pitch: -80,
      expect: { at: P(5, 2, 5), props: { facing: 'down' } },
    },
  ],
  slab: [
    {
      name: 'on top: bottom half',
      block: 'slab',
      pos: floor(5, 5),
      expect: { at: C, props: { type: 'bottom' } },
    },
    {
      name: 'from below: top half',
      before: [['cube', P(5, 2, 5)]],
      block: 'slab',
      pos: P(5, 2, 5),
      face: 'down',
      hit: side(0),
      expect: { at: ABOVE, props: { type: 'top' } },
    },
    {
      name: 'side, low: bottom half',
      before: [['cube', C]],
      block: 'slab',
      pos: C,
      face: 'north',
      hit: side(0.3, 0.5, 0),
      expect: { at: P(5, 0, 4), props: { type: 'bottom' } },
    },
    {
      name: 'side, high: top half',
      before: [['cube', C]],
      block: 'slab',
      pos: C,
      face: 'north',
      hit: side(0.7, 0.5, 0),
      expect: { at: P(5, 0, 4), props: { type: 'top' } },
    },
    {
      name: 'onto a bottom slab: double',
      before: [['slab', C, { type: 'bottom' }]],
      block: 'slab',
      pos: C,
      hit: side(0.5),
      expect: { at: C, props: { type: 'double' } },
    },
    {
      name: 'under a top slab: double',
      before: [['slab', C, { type: 'top' }]],
      block: 'slab',
      pos: C,
      face: 'down',
      hit: side(0.5),
      expect: { at: C, props: { type: 'double' } },
    },
    {
      name: 'side of a bottom slab, high: double',
      before: [['slab', C, { type: 'bottom' }]],
      block: 'slab',
      pos: C,
      face: 'east',
      hit: side(0.7, 1),
      expect: { at: C, props: { type: 'double' } },
    },
    {
      name: 'next to a slab of its kind: double',
      before: [
        ['cube', P(4, 0, 5)],
        ['slab', C, { type: 'top' }],
      ],
      block: 'slab',
      pos: P(4, 0, 5),
      face: 'east',
      hit: side(0.2, 1),
      expect: { at: C, props: { type: 'double' } },
    },
    {
      name: 'not onto another slab',
      before: [['furnace', C]],
      block: 'slab',
      pos: C,
      expect: { at: ABOVE, props: { type: 'bottom' } },
    },
    {
      name: 'not onto a double slab',
      before: [
        ['slab', C, { type: 'double' }],
        ['cube', ABOVE],
      ],
      block: 'slab',
      pos: C,
      expect: null,
    },
  ],
  stairs: [
    ...(['north', 'east', 'south', 'west'] as const).map((look) => ({
      name: `looking ${look}`,
      block: 'stairs',
      pos: floor(5, 5),
      yaw: YAW[look],
      expect: { at: C, props: { facing: look, half: 'bottom', shape: 'straight' } },
    })),
    {
      name: 'from below: upside down',
      before: [['cube', P(5, 2, 5)]],
      block: 'stairs',
      pos: P(5, 2, 5),
      face: 'down',
      hit: side(0),
      yaw: YAW.west,
      expect: { at: ABOVE, props: { facing: 'west', half: 'top', shape: 'straight' } },
    },
    {
      name: 'side, high: upside down',
      before: [['cube', C]],
      block: 'stairs',
      pos: C,
      face: 'south',
      hit: side(0.8, 0.5, 1),
      yaw: YAW.north,
      expect: { at: P(5, 0, 6), props: { facing: 'north', half: 'top', shape: 'straight' } },
    },
    {
      name: 'side, low: upright',
      before: [['cube', C]],
      block: 'stairs',
      pos: C,
      face: 'south',
      hit: side(0.2, 0.5, 1),
      yaw: YAW.north,
      expect: { at: P(5, 0, 6), props: { facing: 'north', half: 'bottom', shape: 'straight' } },
    },
  ],
  wall: [
    {
      name: 'alone: a post',
      block: 'wall',
      pos: floor(5, 5),
      expect: {
        at: C,
        props: { up: 'true', north: 'none', east: 'none', south: 'none', west: 'none' },
      },
    },
    {
      name: 'against a block',
      before: [['cube', P(5, 0, 4)]],
      block: 'wall',
      pos: floor(5, 5),
      expect: {
        at: C,
        props: { up: 'true', north: 'low', east: 'none', south: 'none', west: 'none' },
      },
    },
    {
      name: 'between two walls: no post',
      before: [
        ['wall', P(4, 0, 5)],
        ['wall', P(6, 0, 5)],
      ],
      block: 'wall',
      pos: floor(5, 5),
      expect: {
        at: C,
        props: { up: 'false', north: 'none', east: 'low', south: 'none', west: 'low' },
      },
    },
    {
      name: 'a corner keeps its post',
      before: [
        ['wall', P(6, 0, 5)],
        ['wall', P(5, 0, 6)],
      ],
      block: 'wall',
      pos: floor(5, 5),
      expect: {
        at: C,
        props: { up: 'true', north: 'none', east: 'low', south: 'low', west: 'none' },
      },
    },
    {
      name: 'to a pane',
      before: [['pane', P(4, 0, 5)]],
      block: 'wall',
      pos: floor(5, 5),
      expect: {
        at: C,
        props: { up: 'true', north: 'none', east: 'none', south: 'none', west: 'low' },
      },
    },
    {
      name: 'not to a fence',
      before: [['fence', P(4, 0, 5)]],
      block: 'wall',
      pos: floor(5, 5),
      expect: {
        at: C,
        props: { up: 'true', north: 'none', east: 'none', south: 'none', west: 'none' },
      },
    },
    {
      name: 'under a block: tall sides',
      before: [
        ['cube', P(4, 0, 5)],
        ['cube', ABOVE],
      ],
      block: 'wall',
      pos: ABOVE,
      face: 'down',
      hit: side(0),
      expect: {
        at: C,
        props: { up: 'true', north: 'none', east: 'none', south: 'none', west: 'tall' },
      },
    },
  ],
  fence: [
    {
      name: 'alone: a post',
      block: 'fence',
      pos: floor(5, 5),
      expect: { at: C, props: { north: 'false', east: 'false', south: 'false', west: 'false' } },
    },
    {
      name: 'to a wooden fence',
      before: [['fence', P(4, 0, 5)]],
      block: 'fence',
      pos: floor(5, 5),
      expect: { at: C, props: { north: 'false', east: 'false', south: 'false', west: 'true' } },
    },
    {
      name: 'not to a stone fence',
      before: [['stone_fence', P(4, 0, 5)]],
      block: 'fence',
      pos: floor(5, 5),
      expect: { at: C, props: { north: 'false', east: 'false', south: 'false', west: 'false' } },
    },
    {
      name: 'to a solid block',
      before: [['cube', P(5, 0, 6)]],
      block: 'fence',
      pos: floor(5, 5),
      expect: { at: C, props: { north: 'false', east: 'false', south: 'true', west: 'false' } },
    },
    {
      name: 'to a gate side',
      before: [['gate', P(6, 0, 5), { facing: 'north' }]],
      block: 'fence',
      pos: floor(5, 5),
      expect: { at: C, props: { north: 'false', east: 'true', south: 'false', west: 'false' } },
    },
    {
      name: 'not to a gate front',
      before: [['gate', P(6, 0, 5), { facing: 'east' }]],
      block: 'fence',
      pos: floor(5, 5),
      expect: { at: C, props: { north: 'false', east: 'false', south: 'false', west: 'false' } },
    },
    {
      name: 'not to leaves',
      before: [['leaves', P(5, 0, 4)]],
      block: 'fence',
      pos: floor(5, 5),
      expect: { at: C, props: { north: 'false', east: 'false', south: 'false', west: 'false' } },
    },
  ],
  fence_gate: [
    ...(['north', 'east', 'south', 'west'] as const).map((look) => ({
      name: `looking ${look}`,
      block: 'gate',
      pos: floor(5, 5),
      yaw: YAW[look],
      expect: { at: C, props: { facing: look, in_wall: 'false', open: 'false' } },
    })),
    {
      name: 'between walls: in a wall',
      before: [
        ['wall', P(4, 0, 5)],
        ['wall', P(6, 0, 5)],
      ],
      block: 'gate',
      pos: floor(5, 5),
      yaw: YAW.north,
      expect: { at: C, props: { facing: 'north', in_wall: 'true', open: 'false' } },
    },
    {
      name: 'a wall in front: not in a wall',
      before: [['wall', P(5, 0, 4)]],
      block: 'gate',
      pos: floor(5, 5),
      yaw: YAW.north,
      expect: { at: C, props: { facing: 'north', in_wall: 'false', open: 'false' } },
    },
  ],
  door: [
    ...(['north', 'east', 'south', 'west'] as const).map((look) => ({
      name: `looking ${look}`,
      block: 'door',
      pos: floor(5, 5),
      yaw: YAW[look],
      hit: { x: 0.2, y: 1, z: 0.2 },
      expect: {
        at: C,
        props: {
          facing: look,
          half: 'lower',
          hinge: { north: 'left', south: 'right', east: 'left', west: 'right' }[look],
          open: 'false',
        },
      },
    })),
    {
      name: 'clicked on the right: right hinge',
      block: 'door',
      pos: floor(5, 5),
      yaw: YAW.north,
      hit: { x: 0.8, y: 1, z: 0.5 },
      expect: { at: C, props: { facing: 'north', half: 'lower', hinge: 'right', open: 'false' } },
    },
    {
      name: 'walls on the left: left hinge',
      before: [
        ['cube', P(4, 0, 5)],
        ['cube', P(4, 1, 5)],
      ],
      block: 'door',
      pos: floor(5, 5),
      yaw: YAW.north,
      hit: { x: 0.8, y: 1, z: 0.5 },
      expect: { at: C, props: { facing: 'north', half: 'lower', hinge: 'left', open: 'false' } },
    },
    {
      name: 'beside a door: pairs with it',
      before: [
        ['door', P(4, 0, 5), { facing: 'north', half: 'lower', hinge: 'left' }],
        ['door', P(4, 1, 5), { facing: 'north', half: 'upper', hinge: 'left' }],
      ],
      block: 'door',
      pos: floor(5, 5),
      yaw: YAW.north,
      hit: { x: 0.2, y: 1, z: 0.5 },
      expect: { at: C, props: { facing: 'north', half: 'lower', hinge: 'right', open: 'false' } },
    },
    {
      name: 'no room for the top half',
      before: [['cube', P(5, 1, 5)]],
      block: 'door',
      pos: P(5, 1, 5),
      face: 'north',
      hit: side(0.5, 0.5, 0),
      expect: null,
    },
    { name: 'not on a bottom slab', before: [['slab', C]], block: 'door', pos: C, expect: null },
    {
      name: 'not at the top of the area',
      before: [['cube', P(5, 6, 5)]],
      block: 'door',
      pos: P(5, 6, 5),
      expect: null,
    },
  ],
  trapdoor: [
    ...(['north', 'east', 'south', 'west'] as const).map((face) => ({
      name: `against the ${face} face, low`,
      before: [['cube', C] as const],
      block: 'trapdoor',
      pos: C,
      face,
      hit: side(0.3),
      expect: {
        at: { north: P(5, 0, 4), south: P(5, 0, 6), east: P(6, 0, 5), west: P(4, 0, 5) }[face],
        props: { facing: face, half: 'bottom', open: 'false' },
      },
    })),
    {
      name: 'against a side, high',
      before: [['cube', C]],
      block: 'trapdoor',
      pos: C,
      face: 'east',
      hit: side(0.9, 1),
      expect: { at: P(6, 0, 5), props: { facing: 'east', half: 'top', open: 'false' } },
    },
    {
      name: 'on top: bottom, facing the player',
      block: 'trapdoor',
      pos: floor(5, 5),
      yaw: YAW.west,
      expect: { at: C, props: { facing: 'east', half: 'bottom', open: 'false' } },
    },
    {
      name: 'from below: top',
      before: [['cube', P(5, 2, 5)]],
      block: 'trapdoor',
      pos: P(5, 2, 5),
      face: 'down',
      hit: side(0),
      yaw: YAW.south,
      expect: { at: ABOVE, props: { facing: 'north', half: 'top', open: 'false' } },
    },
  ],
  button: [
    {
      name: 'on the floor',
      block: 'button',
      pos: floor(5, 5),
      yaw: YAW.east,
      expect: { at: C, props: { face: 'floor', facing: 'east', powered: 'false' } },
    },
    {
      name: 'on a ceiling',
      before: [['cube', P(5, 2, 5)]],
      block: 'button',
      pos: P(5, 2, 5),
      face: 'down',
      hit: side(0),
      yaw: YAW.south,
      expect: { at: ABOVE, props: { face: 'ceiling', facing: 'south', powered: 'false' } },
    },
    ...(['north', 'east', 'south', 'west'] as const).map((face) => ({
      name: `on the ${face} face`,
      before: [['cube', C] as const],
      block: 'button',
      pos: C,
      face,
      hit: side(0.5),
      expect: {
        at: { north: P(5, 0, 4), south: P(5, 0, 6), east: P(6, 0, 5), west: P(4, 0, 5) }[face],
        props: { face: 'wall', facing: face, powered: 'false' },
      },
    })),
  ],
  pressure_plate: [
    {
      name: 'on the floor',
      block: 'plate',
      pos: floor(5, 5),
      expect: { at: C, props: { powered: 'false' } },
    },
    {
      name: 'on a block',
      before: [['cube', C]],
      block: 'plate',
      pos: C,
      expect: { at: ABOVE, props: { powered: 'false' } },
    },
    {
      name: 'on a fence post',
      before: [['fence', C]],
      block: 'plate',
      pos: C,
      expect: { at: ABOVE, props: { powered: 'false' } },
    },
    {
      name: 'weighted: power 0',
      block: 'weighted_plate',
      pos: floor(5, 5),
      expect: { at: C, props: { power: '0' } },
    },
    {
      name: 'not in the air',
      before: [['cube', ABOVE]],
      block: 'plate',
      pos: ABOVE,
      face: 'east',
      hit: side(0.5, 1),
      expect: null,
    },
    { name: 'not on a bottom slab', before: [['slab', C]], block: 'plate', pos: C, expect: null },
    {
      name: 'on a top slab',
      before: [['slab', C, { type: 'top' }]],
      block: 'plate',
      pos: C,
      expect: { at: ABOVE, props: { powered: 'false' } },
    },
  ],
  pane: [
    {
      name: 'alone',
      block: 'pane',
      pos: floor(5, 5),
      expect: { at: C, props: { north: 'false', east: 'false', south: 'false', west: 'false' } },
    },
    {
      name: 'to a pane',
      before: [['pane', P(5, 0, 4)]],
      block: 'pane',
      pos: floor(5, 5),
      expect: { at: C, props: { north: 'true', east: 'false', south: 'false', west: 'false' } },
    },
    {
      name: 'to a wall',
      before: [['wall', P(6, 0, 5)]],
      block: 'pane',
      pos: floor(5, 5),
      expect: { at: C, props: { north: 'false', east: 'true', south: 'false', west: 'false' } },
    },
    {
      name: 'to a solid block',
      before: [['cube', P(4, 0, 5)]],
      block: 'pane',
      pos: floor(5, 5),
      expect: { at: C, props: { north: 'false', east: 'false', south: 'false', west: 'true' } },
    },
    {
      name: 'not to a fence',
      before: [['fence', P(5, 0, 6)]],
      block: 'pane',
      pos: floor(5, 5),
      expect: { at: C, props: { north: 'false', east: 'false', south: 'false', west: 'false' } },
    },
    {
      name: 'between panes',
      before: [
        ['pane', P(4, 0, 5)],
        ['pane', P(6, 0, 5)],
      ],
      block: 'pane',
      pos: floor(5, 5),
      expect: { at: C, props: { north: 'false', east: 'true', south: 'false', west: 'true' } },
    },
  ],
  crop: [
    {
      name: 'on the floor',
      block: 'crop',
      pos: floor(5, 5),
      expect: { at: C, props: { age: '0' } },
    },
    {
      name: 'on a block',
      before: [['cube', C]],
      block: 'crop',
      pos: C,
      expect: { at: ABOVE, props: { age: '0' } },
    },
    {
      name: 'looking anywhere',
      block: 'crop',
      pos: floor(5, 5),
      yaw: YAW.east,
      pitch: -20,
      expect: { at: C, props: { age: '0' } },
    },
    {
      name: 'not in the air',
      before: [['cube', ABOVE]],
      block: 'crop',
      pos: ABOVE,
      face: 'north',
      hit: side(0.5, 0.5, 0),
      expect: null,
    },
    {
      name: 'not hanging',
      before: [['cube', P(5, 2, 5)]],
      block: 'crop',
      pos: P(5, 2, 5),
      face: 'down',
      hit: side(0),
      expect: null,
    },
    {
      name: 'not into a block',
      before: [
        ['cube', C],
        ['cube', ABOVE],
      ],
      block: 'crop',
      pos: C,
      expect: null,
    },
  ],
  sapling: [
    {
      name: 'on the floor',
      block: 'sapling',
      pos: floor(5, 5),
      expect: { at: C, props: { stage: '0' } },
    },
    {
      name: 'on a block',
      before: [['cube', C]],
      block: 'sapling',
      pos: C,
      expect: { at: ABOVE, props: { stage: '0' } },
    },
    {
      name: 'against a side above the floor',
      before: [['cube', C]],
      block: 'sapling',
      pos: C,
      face: 'west',
      hit: side(0.5, 0),
      expect: { at: P(4, 0, 5), props: { stage: '0' } },
    },
    {
      name: 'not in the air',
      before: [['cube', ABOVE]],
      block: 'sapling',
      pos: ABOVE,
      face: 'west',
      hit: side(0.5, 0),
      expect: null,
    },
    {
      name: 'not hanging',
      before: [['cube', P(5, 2, 5)]],
      block: 'sapling',
      pos: P(5, 2, 5),
      face: 'down',
      hit: side(0),
      expect: null,
    },
    { name: 'not past the edge', block: 'sapling', pos: floor(16, 5), expect: null },
  ],
  leaves: [
    { name: 'on the floor', block: 'leaves', pos: floor(5, 5), expect: { at: C, props: {} } },
    {
      name: 'on a block',
      before: [['cube', C]],
      block: 'leaves',
      pos: C,
      expect: { at: ABOVE, props: {} },
    },
    {
      name: 'against a side',
      before: [['cube', ABOVE]],
      block: 'leaves',
      pos: ABOVE,
      face: 'south',
      hit: side(0.5, 0.5, 1),
      expect: { at: P(5, 1, 6), props: {} },
    },
    {
      name: 'under a block',
      before: [['cube', P(5, 3, 5)]],
      block: 'leaves',
      pos: P(5, 3, 5),
      face: 'down',
      hit: side(0),
      expect: { at: P(5, 2, 5), props: {} },
    },
    {
      name: 'on leaves',
      before: [['leaves', C]],
      block: 'leaves',
      pos: C,
      expect: { at: ABOVE, props: {} },
    },
    {
      name: 'not into a block',
      before: [
        ['leaves', C],
        ['leaves', ABOVE],
      ],
      block: 'leaves',
      pos: C,
      expect: null,
    },
  ],
  portal: [
    ...(['north', 'east', 'south', 'west'] as const).map((look) => ({
      name: `looking ${look}`,
      block: 'portal',
      pos: floor(5, 5),
      yaw: YAW[look],
      expect: { at: C, props: { axis: look === 'north' || look === 'south' ? 'x' : 'z' } },
    })),
    {
      name: 'on a block',
      before: [['cube', C]],
      block: 'portal',
      pos: C,
      yaw: YAW.east,
      expect: { at: ABOVE, props: { axis: 'z' } },
    },
    {
      name: 'not into a block',
      before: [
        ['cube', C],
        ['cube', ABOVE],
      ],
      block: 'portal',
      pos: C,
      expect: null,
    },
  ],
};

function prepare(world: SimWorld, catalogue: BlockCatalogue, before: Case['before']): void {
  for (const [path, pos, props] of before ?? []) {
    const state = catalogue.get(id(path))?.defaultState;
    if (state === undefined) throw new Error(`no block ${path}`);
    world.set(pos, catalogue.withProperties(state, props ?? {}));
  }
}

describe('placement table', () => {
  it('has at least six cases for every block type', () => {
    for (const type of SIM_BLOCK_TYPES) {
      expect(CASES[type]?.length ?? 0, type).toBeGreaterThanOrEqual(6);
    }
  });

  for (const [type, cases] of Object.entries(CASES)) {
    describe(type, () => {
      for (const one of cases) {
        it(one.name, () => {
          const { world, catalogue } = setUp();
          prepare(world, catalogue, one.before);
          const result = placeBlock(
            world,
            catalogue,
            placeOn(one.block, one.pos, {
              ...(one.face !== undefined ? { face: one.face } : {}),
              ...(one.hit !== undefined ? { hit: one.hit } : {}),
              ...(one.yaw !== undefined ? { yaw: one.yaw } : {}),
              ...(one.pitch !== undefined ? { pitch: one.pitch } : {}),
            }),
          );
          if (one.expect === null) {
            expect(result.placed).toBe(false);
            return;
          }
          expect(result.placed).toBe(true);
          expect(world.get(one.expect.at)?.name).toBe(id(one.block));
          expect(propsAt(world, one.expect.at)).toEqual(one.expect.props);
        });
      }
    });
  }
});

describe('placeBlock', () => {
  it('places both halves of a door and breaks both from either half', () => {
    const { world, catalogue } = setUp();
    const result = placeBlock(world, catalogue, placeOn('door', floor(5, 5), { yaw: YAW.east }));
    expect(result.placed && result.changes.map((c) => c.pos)).toEqual([C, ABOVE]);
    expect(propsAt(world, ABOVE)).toEqual({
      facing: 'east',
      half: 'upper',
      hinge: 'left',
      open: 'false',
    });
    const changes = breakBlock(world, catalogue, ABOVE);
    expect(changes.map((c) => c.pos)).toEqual([ABOVE, C]);
    expect(world.count).toBe(0);
  });

  it('places a vanilla block as a prop and refuses blocks it does not know', () => {
    const { world, catalogue, log } = setUp();
    const placed = placeBlock(world, catalogue, {
      ...placeOn('x', floor(1, 1)),
      block: 'minecraft:stone',
    });
    expect(placed.placed).toBe(true);
    expect(world.get(P(1, 0, 1))).toEqual({ name: 'minecraft:stone', properties: {} });
    expect(log.only.some((line) => line.includes('Stone is a vanilla block'))).toBe(true);
    const refused = placeBlock(world, catalogue, {
      ...placeOn('x', floor(2, 2)),
      block: 'othermod:thing',
    });
    expect(refused).toEqual({
      placed: false,
      reason: 'othermod:thing is not a block of this project',
    });
  });

  it('says once that crops, saplings and portals do more in the game', () => {
    const { world, catalogue, log } = setUp();
    const before = log.only.length;
    placeBlock(world, catalogue, placeOn('crop', floor(1, 1)));
    placeBlock(world, catalogue, placeOn('crop', floor(2, 1)));
    placeBlock(world, catalogue, placeOn('sapling', floor(3, 1)));
    placeBlock(world, catalogue, placeOn('portal', floor(4, 1)));
    expect(log.only.slice(before)).toEqual([
      'Crop is planted only on #minecraft:supports_crops; the preview plants it on anything',
      'Sapling is planted only on #minecraft:supports_vegetation; the preview plants it on anything',
      'Portal is lit in its frame and takes you to another dimension; the preview places it as a plain block',
    ]);
  });

  it('breaks nothing where there is nothing', () => {
    const { world, catalogue } = setUp();
    expect(breakBlock(world, catalogue, C)).toEqual([]);
  });
});
