/**
 * A placed piece's blocks where they stand (ADR 0122; B640), for the structures worker: each
 * block of the template turned about the piece's origin with the engine's own turn of a vector
 * (passed in, so the two never disagree), its state turned with it, a jigsaw block replaced by
 * its `final_state`. Imports types only, so the worker's chunk carries nothing else of the view.
 *
 * @packageDocumentation
 */

import type { PieceTemplate } from '../vanilla-pieces';
import type { Cell, PieceCells } from './client';

/** Turns a vector clockwise seen from above by quarter turns (the engine's `rotateVec`). */
export type TurnVector = (v: Cell, turns: number) => Cell;

const HORIZONTAL = ['north', 'east', 'south', 'west'] as const;

function turnDirection(direction: string, turns: number): string {
  const index = HORIZONTAL.indexOf(direction as (typeof HORIZONTAL)[number]);
  return index < 0 ? direction : (HORIZONTAL[(index + turns) % 4] as string);
}

/**
 * A block state turned clockwise by quarter turns, as far as its common properties say:
 * `facing`, `axis`, `rotation` (0 to 15), the four side properties and a jigsaw's or crafter's
 * `orientation`. Other properties are kept (the view is about right there).
 */
export function turnState(state: string, turns: number): string {
  const t = ((turns % 4) + 4) % 4;
  const open = state.indexOf('[');
  if (t === 0 || open < 0 || !state.endsWith(']')) return state;
  const name = state.slice(0, open);
  const pairs = state
    .slice(open + 1, -1)
    .split(',')
    .filter((pair) => pair.includes('='))
    .map((pair) => {
      const eq = pair.indexOf('=');
      return [pair.slice(0, eq).trim(), pair.slice(eq + 1).trim()] as [string, string];
    });
  const sides = new Map(pairs.filter(([key]) => HORIZONTAL.includes(key as 'north')));
  const out = pairs.map(([key, value]): [string, string] => {
    if (key === 'facing') return [key, turnDirection(value, t)];
    if (key === 'axis' && t % 2 === 1 && (value === 'x' || value === 'z')) {
      return [key, value === 'x' ? 'z' : 'x'];
    }
    if (key === 'rotation' && /^\d+$/.test(value))
      return [key, String((Number(value) + 4 * t) % 16)];
    if (key === 'orientation') {
      return [
        key,
        value
          .split('_')
          .map((part) => turnDirection(part, t))
          .join('_'),
      ];
    }
    if (sides.has(key)) {
      // The side that turns onto this one gives its value.
      const from = HORIZONTAL[(HORIZONTAL.indexOf(key as 'north') - t + 4) % 4] as string;
      return [key, sides.get(from) ?? value];
    }
    return [key, value];
  });
  return `${name}[${out.map(([key, value]) => `${key}=${value}`).join(',')}]`;
}

const JIGSAW_BLOCK = 'minecraft:jigsaw';
const VOID = 'minecraft:structure_void';
/** The edges of a piece known only by its size (D7: Minecraft's piece without the jar). */
const BOX_EDGE = 'minecraft:white_stained_glass';

/**
 * A placed piece's blocks where they stand: each block of the template turned about the
 * piece's origin, its state turned with it, and a jigsaw block replaced by its `final_state`
 * (left out when that is structure void). A template known only by its size draws its edges.
 */
export function pieceCells(
  template: PieceTemplate,
  origin: Cell,
  turns: number,
  turn: TurnVector,
): PieceCells {
  const palette: string[] = [];
  const index = new Map<string, number>();
  const stateIndex = (state: string): number => {
    const turned = turnState(state, turns);
    let i = index.get(turned);
    if (i === undefined) {
      i = palette.length;
      palette.push(turned);
      index.set(turned, i);
    }
    return i;
  };
  const blocks: number[] = [];
  const put = (pos: Cell, state: string): void => {
    const [x, y, z] = turn(pos, turns);
    blocks.push(origin[0] + x, origin[1] + y, origin[2] + z, stateIndex(state));
  };
  if (template.blocks === null) {
    const [sx, sy, sz] = template.size;
    for (let x = 0; x < sx; x += 1) {
      for (let y = 0; y < sy; y += 1) {
        for (let z = 0; z < sz; z += 1) {
          const edges =
            Number(x === 0 || x === sx - 1) +
            Number(y === 0 || y === sy - 1) +
            Number(z === 0 || z === sz - 1);
          if (edges >= 2) put([x, y, z], BOX_EDGE);
        }
      }
    }
    return { palette, blocks };
  }
  const finalAt = new Map<string, string>();
  for (const jigsaw of template.jigsaws) finalAt.set(jigsaw.pos.join(','), jigsaw.finalState);
  for (const block of template.blocks) {
    let state = template.palette[block.state] ?? 'minecraft:air';
    if (state === VOID || state.startsWith(`${VOID}[`)) continue;
    if (state === JIGSAW_BLOCK || state.startsWith(`${JIGSAW_BLOCK}[`)) {
      state = finalAt.get(block.pos.join(',')) ?? 'minecraft:air';
      if (state === VOID) continue;
    }
    put(block.pos, state);
  }
  return { palette, blocks };
}

/** The jigsaw block state a jigsaw is drawn as when it met another (its own block, turned). */
export function jigsawState(orientation: string, turns: number): string {
  return turnState(`${JIGSAW_BLOCK}[orientation=${orientation}]`, turns);
}
