/**
 * The boxes of each block type, as the player collides with them and points at them (ADR 0085
 * D5: `msm:shape` boxes for walking and picking). `msm:shape` boxes turn with the block's axis
 * or facing as the runtime turns them (ADR 0067 D3). The type shapes are MSM's own reading of
 * the game's visible outlines and walls, in pixels; where they matter for a scenario, the
 * parity fixture checks them (ADR 0085 D10).
 */
import type { BlockState, Box } from '../types.js';
import {
  clockwise,
  counterClockwise,
  HORIZONTALS,
  type Horizontal,
  isHorizontal,
  opposite,
} from './directions.js';

/** A box in pixels, 0 to 16 inside the block. */
export type PixelBox = readonly [number, number, number, number, number, number];

/** The full cube, in block units. */
export const FULL_CUBE: Box = Object.freeze([0, 0, 0, 1, 1, 1]) as Box;

/** No boxes. */
export const NO_BOXES: readonly Box[] = Object.freeze([]);

/** A pixel box as a block-unit box, each axis ordered. */
export function toBox(box: PixelBox): Box {
  const [x1, y1, z1, x2, y2, z2] = box;
  return Object.freeze([
    Math.min(x1, x2) / 16,
    Math.min(y1, y2) / 16,
    Math.min(z1, z2) / 16,
    Math.max(x1, x2) / 16,
    Math.max(y1, y2) / 16,
    Math.max(z1, z2) / 16,
  ]) as Box;
}

/** A quarter turn about Y as a model's `y: 90` (north to east), in pixels. */
export function turnY(b: PixelBox): PixelBox {
  return [16 - b[5], b[1], b[0], 16 - b[2], b[4], b[3]];
}

/** A quarter turn about X as a model's `x: 90` (north to down, up to north), in pixels. */
export function turnX(b: PixelBox): PixelBox {
  return [b[0], b[2], 16 - b[4], b[3], b[5], 16 - b[1]];
}

const repeat = (turn: (b: PixelBox) => PixelBox, times: number) => (b: PixelBox) => {
  let out = b;
  for (let i = 0; i < times; i += 1) out = turn(out);
  return out;
};

/** Boxes written for axis `y` turned to `axis`, as the pillar block state turns its model. */
export function pillarTurn(axis: string): (b: PixelBox) => PixelBox {
  if (axis === 'z') return turnX;
  if (axis === 'x') return (b) => turnY(turnX(b));
  return (b) => b;
}

/** Boxes written facing north turned to `facing`, as the facing block states turn their model. */
export function facingTurn(facing: string): (b: PixelBox) => PixelBox {
  switch (facing) {
    case 'east':
      return turnY;
    case 'south':
      return repeat(turnY, 2);
    case 'west':
      return repeat(turnY, 3);
    case 'down':
      return turnX;
    case 'up':
      return repeat(turnX, 3);
    default:
      return (b) => b;
  }
}

/** Boxes written for a block facing north (or the north side), turned to a horizontal side. */
const onSide = (side: Horizontal, box: PixelBox): PixelBox => facingTurn(side)(box);

const boxes = (...pixels: PixelBox[]): readonly Box[] => Object.freeze(pixels.map(toBox));

const prop = (state: BlockState, name: string): string | undefined => state.properties[name];

/** The side a horizontal state property names, or north. */
const horizontalOf = (state: BlockState, name = 'facing'): Horizontal => {
  const value = prop(state, name);
  return value !== undefined && isHorizontal(value) ? value : 'north';
};

/** Slabs: the half, or the full cube for a double slab. */
function slabBoxes(state: BlockState): readonly Box[] {
  const type = prop(state, 'type');
  if (type === 'double') return [FULL_CUBE];
  return type === 'top' ? boxes([0, 8, 0, 16, 16, 16]) : boxes([0, 0, 0, 16, 8, 16]);
}

/** One eighth of a cube in the upper or lower layer, at the corner of two horizontal sides. */
function quarter(layer: 'upper' | 'lower', a: Horizontal, b: Horizontal): PixelBox {
  const xs: [number, number] =
    a === 'east' || b === 'east' ? [8, 16] : a === 'west' || b === 'west' ? [0, 8] : [0, 16];
  const zs: [number, number] =
    a === 'south' || b === 'south' ? [8, 16] : a === 'north' || b === 'north' ? [0, 8] : [0, 16];
  const ys: [number, number] = layer === 'upper' ? [8, 16] : [0, 8];
  return [xs[0], ys[0], zs[0], xs[1], ys[1], zs[1]];
}

/** Stairs: the half slab plus the steps of their shape (straight, inner or outer corners). */
function stairsBoxes(state: BlockState): readonly Box[] {
  const facing = horizontalOf(state);
  const top = prop(state, 'half') === 'top';
  const base: PixelBox = top ? [0, 8, 0, 16, 16, 16] : [0, 0, 0, 16, 8, 16];
  const layer = top ? 'lower' : 'upper';
  const back = facing;
  const front = opposite(facing);
  const left = counterClockwise(facing);
  const right = clockwise(facing);
  const shape = prop(state, 'shape') ?? 'straight';
  const steps: PixelBox[] = [];
  switch (shape) {
    case 'outer_left':
      steps.push(quarter(layer, back, left));
      break;
    case 'outer_right':
      steps.push(quarter(layer, back, right));
      break;
    case 'inner_left':
      steps.push(quarter(layer, back, back), quarter(layer, front, left));
      break;
    case 'inner_right':
      steps.push(quarter(layer, back, back), quarter(layer, front, right));
      break;
    default:
      steps.push(quarter(layer, back, back));
  }
  return boxes(base, ...steps);
}

/** A post and arms towards each connected side, as fences, walls and panes have. */
function crossBoxes(
  state: BlockState,
  post: PixelBox,
  arm: (side: Horizontal, value: string) => PixelBox | undefined,
): readonly Box[] {
  const out: PixelBox[] = [post];
  for (const side of HORIZONTALS) {
    const value = prop(state, side);
    if (value === undefined) continue;
    const box = arm(side, value);
    if (box !== undefined) out.push(box);
  }
  return boxes(...out);
}

/** Fences: a 4-pixel post and 2-pixel arms; walls one and a half blocks high. */
function fenceBoxes(state: BlockState, height: number): readonly Box[] {
  return crossBoxes(state, [6, 0, 6, 10, height, 10], (side, value) =>
    value === 'true' ? onSide(side, [7, 0, 0, 9, height, 6]) : undefined,
  );
}

/** Walls: an 8-pixel post when `up`, and 6-pixel sides, low or tall. */
function wallBoxes(state: BlockState, collision: boolean): readonly Box[] {
  const tall = collision ? 24 : 16;
  const low = collision ? 24 : 14;
  const post: PixelBox = [4, 0, 4, 12, prop(state, 'up') === 'false' ? 0 : tall, 12];
  const out = crossBoxes(state, post, (side, value) => {
    if (value === 'none') return undefined;
    return onSide(side, [5, 0, 0, 11, value === 'tall' ? tall : low, 8]);
  });
  return out.filter((box) => box[4] > box[1]);
}

/** Panes: a 2-pixel post and arms. */
function paneBoxes(state: BlockState): readonly Box[] {
  return crossBoxes(state, [7, 0, 7, 9, 16, 9], (side, value) =>
    value === 'true' ? onSide(side, [7, 0, 0, 9, 16, 7]) : undefined,
  );
}

/** Fence gates: across the facing, one and a half blocks high to walk into, lowered in a wall. */
function gateBoxes(state: BlockState, collision: boolean): readonly Box[] {
  if (collision && prop(state, 'open') === 'true') return NO_BOXES;
  const facing = horizontalOf(state);
  const height = collision ? 24 : prop(state, 'in_wall') === 'true' ? 13 : 16;
  const alongX = facing === 'north' || facing === 'south';
  return boxes(alongX ? [0, 0, 6, 16, height, 10] : [6, 0, 0, 10, height, 16]);
}

/** A 3-pixel panel against one side. */
const panel = (side: Horizontal): PixelBox => onSide(side, [0, 0, 0, 16, 16, 3]);

/**
 * Doors: a 3-pixel panel on the side nearest the player who placed it; open, it swings to the
 * hinge side (counter-clockwise of the facing for a left hinge, clockwise for a right one).
 */
function doorBoxes(state: BlockState): readonly Box[] {
  const facing = horizontalOf(state);
  if (prop(state, 'open') !== 'true') return boxes(panel(opposite(facing)));
  const hingeRight = prop(state, 'hinge') === 'right';
  return boxes(panel(hingeRight ? clockwise(facing) : counterClockwise(facing)));
}

/** Trapdoors: a 3-pixel slab in their half, or, open, a panel against the block they hang on. */
function trapdoorBoxes(state: BlockState): readonly Box[] {
  if (prop(state, 'open') === 'true') return boxes(panel(opposite(horizontalOf(state))));
  return prop(state, 'half') === 'top'
    ? boxes([0, 13, 0, 16, 16, 16])
    : boxes([0, 0, 0, 16, 3, 16]);
}

/** Buttons: 6 by 4 pixels, 2 deep (1 when pressed), on a floor, ceiling or wall. */
function buttonBoxes(state: BlockState): readonly Box[] {
  const facing = horizontalOf(state);
  const depth = prop(state, 'powered') === 'true' ? 1 : 2;
  const face = prop(state, 'face') ?? 'wall';
  if (face === 'wall') {
    // On the side opposite its facing, against the block it is pressed into.
    return boxes(onSide(opposite(facing), [5, 6, 0, 11, 10, depth]));
  }
  const alongX = facing === 'north' || facing === 'south';
  const [x1, x2, z1, z2] = alongX ? [5, 11, 6, 10] : [6, 10, 5, 11];
  return face === 'ceiling'
    ? boxes([x1, 16 - depth, z1, x2, 16, z2])
    : boxes([x1, 0, z1, x2, depth, z2]);
}

/** Pressure plates: one pixel high, half a pixel when pressed. */
function plateBoxes(state: BlockState): readonly Box[] {
  const pressed = prop(state, 'powered') === 'true' || Number(prop(state, 'power') ?? '0') > 0;
  return boxes([1, 0, 1, 15, pressed ? 0.5 : 1, 15]);
}

/** Portals: a 4-pixel sheet across the axis. */
function portalBoxes(state: BlockState): readonly Box[] {
  return prop(state, 'axis') === 'z' ? boxes([6, 0, 0, 10, 16, 16]) : boxes([0, 0, 6, 16, 16, 10]);
}

/** What the type shapes need to know about a block beyond its state. */
export interface ShapeFacts {
  /** The block type. */
  readonly type: string;
  /** `msm:shape` boxes in pixels, when the block has the component. */
  readonly shapeBoxes?: readonly PixelBox[];
  /** False when `msm:shape` makes the block walk-through. */
  readonly shapeCollision?: boolean;
  /** A crop's outline height per age, in pixels. */
  readonly stageHeights?: readonly number[];
}

/** The `msm:shape` boxes turned to the state's axis or facing (ADR 0067 D3). */
function msmShapeBoxes(facts: ShapeFacts, state: BlockState): readonly Box[] {
  const pixels = facts.shapeBoxes ?? [];
  let turn = (b: PixelBox) => b;
  if (facts.type === 'pillar') turn = pillarTurn(prop(state, 'axis') ?? 'y');
  if (facts.type === 'horizontal' || facts.type === 'directional') {
    turn = facingTurn(prop(state, 'facing') ?? 'north');
  }
  return boxes(...pixels.map(turn));
}

/** The outline of a block of a type in a state. */
export function outlineBoxes(facts: ShapeFacts, state: BlockState): readonly Box[] {
  if (facts.shapeBoxes !== undefined) return msmShapeBoxes(facts, state);
  switch (facts.type) {
    case 'slab':
      return slabBoxes(state);
    case 'stairs':
      return stairsBoxes(state);
    case 'fence':
      return fenceBoxes(state, 16);
    case 'wall':
      return wallBoxes(state, false);
    case 'pane':
      return paneBoxes(state);
    case 'fence_gate':
      return gateBoxes(state, false);
    case 'door':
      return doorBoxes(state);
    case 'trapdoor':
      return trapdoorBoxes(state);
    case 'button':
      return buttonBoxes(state);
    case 'pressure_plate':
      return plateBoxes(state);
    case 'crop': {
      const age = Number(prop(state, 'age') ?? '0');
      const height = facts.stageHeights?.[age] ?? 16;
      return boxes([0, 0, 0, 16, height, 16]);
    }
    case 'sapling':
      return boxes([2, 0, 2, 14, 12, 14]);
    case 'portal':
      return portalBoxes(state);
    default:
      return [FULL_CUBE];
  }
}

/** The boxes a block of a type in a state stops the player with. */
export function collisionBoxes(facts: ShapeFacts, state: BlockState): readonly Box[] {
  if (facts.shapeBoxes !== undefined) {
    return facts.shapeCollision === false ? NO_BOXES : msmShapeBoxes(facts, state);
  }
  switch (facts.type) {
    case 'fence':
      return fenceBoxes(state, 24);
    case 'wall':
      return wallBoxes(state, true);
    case 'fence_gate':
      return gateBoxes(state, true);
    case 'button':
    case 'pressure_plate':
    case 'crop':
    case 'sapling':
    case 'portal':
      return NO_BOXES;
    default:
      return outlineBoxes(facts, state);
  }
}

/** Whether boxes cover the whole top face of the block (something can stand on it). */
export function coversTop(list: readonly Box[]): boolean {
  return list.some((b) => b[0] <= 0 && b[2] <= 0 && b[3] >= 1 && b[5] >= 1 && b[4] >= 1);
}

/** Whether boxes reach the top in the middle of the block (a plate can rest on a post). */
export function supportsCentre(list: readonly Box[]): boolean {
  return list.some((b) => b[0] <= 0.5 && b[3] >= 0.5 && b[2] <= 0.5 && b[5] >= 0.5 && b[4] >= 1);
}

/** Whether boxes are exactly the full cube. */
export function isFullCube(list: readonly Box[]): boolean {
  if (list.length !== 1) return false;
  const [b] = list as [Box];
  return b[0] <= 0 && b[1] <= 0 && b[2] <= 0 && b[3] >= 1 && b[4] >= 1 && b[5] >= 1;
}
