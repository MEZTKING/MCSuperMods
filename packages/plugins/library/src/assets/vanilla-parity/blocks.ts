/**
 * Block pictures of the vanilla parity flows (B459), drawn by MSM: metal plates and cut tiles,
 * doors, trapdoors and bars that age in four stages towards a patina colour, stone that ages
 * the same way, torches, lanterns, chains and candles, a bed, a cake or a pie, the four ages of
 * a berry bush, and the two sign writing-screen pictures. Each follows ADR 0092's rules: four to
 * six hue-shifted shades, light from the top left, clustered noise, no outline on full blocks.
 * Nothing is copied or traced from a Minecraft texture.
 *
 * @packageDocumentation
 */

import { generateArt } from '../../art/generator';
import { hashSeed, rng } from '../../art/noise';
import { generateRamp } from '../../art/ramp';
import type { Rgb } from '../png';
import { Canvas, lighten, mix, noise, type Ramp, rampOf, shade } from './painter';

/** The four weathering stages, as copper's: 0 unaffected to 3 oxidised. */
export type AgeStage = 0 | 1 | 2 | 3;

/** How much of a picture the patina covers at each stage. */
const PATINA_SHARE: readonly number[] = [0, 0.32, 0.7, 1];

/** A shade map: one index per pixel into a six-shade ramp (0 darkest), or -1 for clear. */
type ShadeMap = Int8Array;

const SHADES = 6;

/** Paints a shade map on `material`, with `patina` on the share of pixels the stage covers. */
function paintAged(
  map: ShadeMap,
  size: { width: number; height: number },
  material: Rgb,
  patina: Rgb,
  stage: AgeStage,
  seed: readonly (string | number)[],
): Uint8Array {
  const base = generateRamp(material, { count: SHADES, anchor: 3 });
  const green = generateRamp(patina, { count: SHADES, anchor: 3 });
  // Half way, the metal itself darkens and dulls, as copper's middle stages do.
  const dull = generateRamp(mix(material, patina, 0.35), { count: SHADES, anchor: 3 });
  const field = noise(size.width, size.height, 'patina', ...seed);
  const share = PATINA_SHARE[stage] ?? 0;
  const canvas = new Canvas(size.width, size.height);
  for (let i = 0; i < map.length; i += 1) {
    const index = map[i] ?? -1;
    if (index < 0) continue;
    const covered = (field[i] ?? 1) < share;
    const ramp = covered ? green : stage >= 2 ? dull : base;
    canvas.set(i % size.width, Math.floor(i / size.width), shade(ramp, index));
  }
  return canvas.png();
}

/** A bevelled plate on tiles of `tile` pixels: lit top-left edges, dark bottom-right ones. */
function plateMap(size: number, tile: number, ...seed: readonly (string | number)[]): ShadeMap {
  const map = new Int8Array(size * size);
  const field = noise(size, size, 'plate', ...seed);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const tx = x % tile;
      const ty = y % tile;
      const rank = field[y * size + x] ?? 0.5;
      let index = rank < 0.25 ? 2 : rank > 0.8 ? 4 : 3;
      if (tx === 0 || ty === 0) index = tx === tile - 1 || ty === tile - 1 ? 3 : 5;
      else if (tx === tile - 1 || ty === tile - 1) index = 1;
      else if (tx === 1 || ty === 1) index = Math.max(index, 4);
      map[y * size + x] = index;
    }
  }
  return map;
}

/**
 * A metal block (`cut` false) or cut metal of four tiles (`cut` true) at `stage`.
 *
 * @param colour - The metal.
 * @param patina - What it turns into.
 * @param stage - 0 unaffected to 3 oxidised.
 */
export function agedPlatePng(colour: Rgb, patina: Rgb, stage: AgeStage, cut: boolean): Uint8Array {
  const map = plateMap(16, cut ? 8 : 16, cut ? 'cut' : 'block');
  return paintAged(map, { width: 16, height: 16 }, colour, patina, stage, [cut ? 'cut' : 'block']);
}

/** The top or bottom half of a metal door with a window in the top, at `stage`. */
export function agedDoorPng(
  colour: Rgb,
  patina: Rgb,
  stage: AgeStage,
  half: 'top' | 'bottom',
): Uint8Array {
  const map = new Int8Array(256);
  const field = noise(16, 16, 'door', half);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const rank = field[y * 16 + x] ?? 0.5;
      let index = rank < 0.3 ? 2 : 3;
      const frame = x <= 1 || x >= 14 || (half === 'top' ? y <= 1 : y >= 14);
      if (frame) index = x === 0 || y === 0 ? 5 : x === 15 || y === 15 ? 1 : 4;
      // Two panes in the top half, two raised panels in the bottom.
      const inPanel = (x0: number, x1: number, y0: number, y1: number): boolean =>
        x >= x0 && x <= x1 && y >= y0 && y <= y1;
      if (half === 'top' && (inPanel(3, 6, 3, 12) || inPanel(9, 12, 3, 12))) {
        index = x === 3 || x === 9 || y === 3 ? 0 : 1;
      }
      if (half === 'bottom' && (inPanel(3, 6, 2, 11) || inPanel(9, 12, 2, 11))) {
        index = x === 3 || x === 9 || y === 2 ? 5 : x === 6 || x === 12 || y === 11 ? 1 : 3;
      }
      map[y * 16 + x] = index;
    }
  }
  return paintAged(map, { width: 16, height: 16 }, colour, patina, stage, ['door', half]);
}

/** A metal trapdoor: a frame, a cross bar and four sunken panels, at `stage`. */
export function agedTrapdoorPng(colour: Rgb, patina: Rgb, stage: AgeStage): Uint8Array {
  const map = new Int8Array(256);
  const field = noise(16, 16, 'trapdoor');
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const rank = field[y * 16 + x] ?? 0.5;
      let index = rank < 0.3 ? 2 : 3;
      if (x <= 1 || y <= 1 || x >= 14 || y >= 14 || x === 7 || x === 8 || y === 7 || y === 8) {
        index = x === 0 || y === 0 || x === 8 || y === 8 ? 5 : x === 15 || y === 15 ? 1 : 4;
      } else if (x === 2 || y === 2 || x === 9 || y === 9) {
        index = 1;
      }
      map[y * 16 + x] = index;
    }
  }
  return paintAged(map, { width: 16, height: 16 }, colour, patina, stage, ['trapdoor']);
}

/** Metal bars on a clear background: three upright pairs and two bands, at `stage`. */
export function agedBarsPng(colour: Rgb, patina: Rgb, stage: AgeStage): Uint8Array {
  const map = new Int8Array(256).fill(-1);
  for (let y = 0; y < 16; y += 1) {
    for (const x0 of [1, 7, 13]) {
      map[y * 16 + x0] = y % 4 === 0 ? 5 : 4;
      map[y * 16 + x0 + 1] = y % 4 === 2 ? 1 : 2;
    }
  }
  for (const y0 of [2, 12]) {
    for (let x = 0; x < 16; x += 1) {
      map[y0 * 16 + x] = 5;
      map[(y0 + 1) * 16 + x] = 1;
    }
  }
  return paintAged(map, { width: 16, height: 16 }, colour, patina, stage, ['bars']);
}

/** A stone block in clustered shades that ages towards `patina` (moss or lichen) by stage. */
export function agedStonePng(colour: Rgb, patina: Rgb, stage: AgeStage, kind: string): Uint8Array {
  const map = new Int8Array(256);
  const field = noise(16, 16, 'stone', kind);
  for (let i = 0; i < 256; i += 1) {
    const rank = field[i] ?? 0.5;
    map[i] = rank < 0.08 ? 1 : rank < 0.3 ? 2 : rank < 0.68 ? 3 : rank < 0.9 ? 4 : 5;
  }
  if (kind === 'bricks') {
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const offset = (y >> 2) % 2 === 0 ? 0 : 4;
        if (y % 4 === 3 || (x + offset) % 8 === 7) map[y * 16 + x] = 0;
      }
    }
  }
  if (kind === 'polished') {
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        if (x === 0 || y === 0) map[y * 16 + x] = 5;
        else if (x === 15 || y === 15) map[y * 16 + x] = 1;
        else map[y * 16 + x] = Math.max(2, Math.min(4, map[y * 16 + x] ?? 3));
      }
    }
  }
  return paintAged(map, { width: 16, height: 16 }, colour, patina, stage, ['stone', kind]);
}

/** The flame and glow colours of a light of `colour`. */
function flameRamp(colour: Rgb): Ramp {
  return [
    lighten(colour, -0.12),
    colour,
    lighten(colour, 0.12),
    mix(colour, [255, 255, 240], 0.75),
  ];
}

/**
 * A torch: a two-pixel stick in the middle columns with a glowing head, as a torch's model
 * reads its picture; the flat item shows the same picture.
 */
export function torchPng(stick: Rgb, flame: Rgb): Uint8Array {
  const canvas = new Canvas(16, 16);
  const wood = rampOf(stick, 4, 2);
  const fire = flameRamp(flame);
  for (let y = 6; y < 16; y += 1) {
    canvas.set(7, y, shade(wood, y < 8 ? 3 : 2));
    canvas.set(8, y, shade(wood, y < 8 ? 2 : 1));
  }
  canvas.set(7, 6, shade(fire, 3));
  canvas.set(8, 6, shade(fire, 2));
  canvas.set(7, 7, shade(fire, 2));
  canvas.set(8, 7, shade(fire, 1));
  // A faint glow above the head for the flat item.
  canvas.set(7, 5, shade(fire, 1), 160);
  canvas.set(8, 5, shade(fire, 0), 120);
  return canvas.png();
}

/**
 * A lantern's block picture: a metal cage over glowing glass, filling the picture so every
 * part of the lantern's model finds the frame or the glow.
 */
export function lanternPng(metal: Rgb, flame: Rgb): Uint8Array {
  const canvas = new Canvas(16, 16);
  const frame = rampOf(metal, 5, 2);
  const fire = flameRamp(flame);
  const field = noise(16, 16, 'lantern');
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const rank = field[y * 16 + x] ?? 0.5;
      const bar = x % 6 === 0 || x % 6 === 5 || y % 7 === 0 || y % 7 === 1;
      if (bar)
        canvas.set(
          x,
          y,
          shade(frame, (x % 6 === 0 || y % 7 === 0 ? 3 : 1) + (rank > 0.85 ? 1 : 0)),
        );
      else canvas.set(x, y, shade(fire, rank < 0.3 ? 1 : rank > 0.85 ? 3 : 2));
    }
  }
  return canvas.png();
}

/** A chain's block picture: two columns of links on a clear background. */
export function chainPng(metal: Rgb): Uint8Array {
  const canvas = new Canvas(16, 16);
  const ramp = rampOf(metal, 5, 2);
  for (let y = 0; y < 16; y += 1) {
    const link = y % 4;
    for (const x0 of [0, 3]) {
      if (link === 3) {
        canvas.set(x0 + 1, y, shade(ramp, 2));
        continue;
      }
      canvas.set(x0, y, shade(ramp, link === 0 ? 4 : 3));
      canvas.set(x0 + 2, y, shade(ramp, 1));
      if (link === 0) canvas.set(x0 + 1, y, shade(ramp, 4));
      if (link === 2) canvas.set(x0 + 1, y, shade(ramp, 0));
    }
  }
  return canvas.png();
}

/**
 * A candle's block picture, wax over the whole picture with a wick at the top of the first
 * columns (lit: a glowing tip), so the candle templates find wax wherever they read.
 */
export function candlePng(wax: Rgb, flame: Rgb, lit: boolean): Uint8Array {
  const canvas = new Canvas(16, 16);
  const ramp = rampOf(wax, 5, 2);
  const fire = flameRamp(flame);
  const field = noise(16, 16, 'candle');
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const rank = field[y * 16 + x] ?? 0.5;
      let index = rank < 0.25 ? 1 : rank > 0.8 ? 3 : 2;
      if (x % 2 === 0) index += 1;
      canvas.set(x, y, shade(ramp, index));
    }
  }
  const wick: Rgb = [52, 44, 40];
  for (let y = 4; y < 6; y += 1) canvas.set(0, y, lit ? shade(fire, 7 - y) : wick);
  canvas.set(1, 5, lit ? shade(fire, 1) : wick);
  return canvas.png();
}

/** A bed's picture, on every face of the bed: a pale pillow at the top, a quilted blanket. */
export function bedPng(blanket: Rgb, pillow: Rgb = [232, 228, 218]): Uint8Array {
  const canvas = new Canvas(16, 16);
  const cloth = rampOf(blanket, 5, 2);
  const soft = rampOf(pillow, 4, 2);
  const field = noise(16, 16, 'bed');
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const rank = field[y * 16 + x] ?? 0.5;
      if (y < 5) {
        let index = rank < 0.25 ? 1 : 2;
        if (y === 0 || x === 0) index = 3;
        if (y === 4 || x === 15) index = 0;
        canvas.set(x, y, shade(soft, index));
        continue;
      }
      let index = rank < 0.2 ? 1 : rank > 0.85 ? 3 : 2;
      if (y === 5) index = 4;
      // Quilting: stitched squares of four.
      if ((x + 2) % 4 === 0 && y % 4 === 1) index = 0;
      if (y === 15 || x === 15) index = Math.min(index, 1);
      canvas.set(x, y, shade(cloth, index));
    }
  }
  return canvas.png();
}

/** The cake pictures of a cake or a pie. */
export type CakeFace = 'top' | 'side' | 'bottom' | 'inside';

/**
 * One face of a cake (`pie` false: icing over sponge, the icing in `topping`, berries of
 * `filling` on top) or a pie (`pie` true: a lattice crust over `filling`).
 */
export function cakePng(face: CakeFace, topping: Rgb, filling: Rgb, pie: boolean): Uint8Array {
  const canvas = new Canvas(16, 16);
  const sponge = rampOf(pie ? [206, 150, 84] : [226, 186, 120], 5, 2);
  const icing = rampOf(topping, 5, 2);
  const fruit = rampOf(filling, 4, 2);
  const field = noise(16, 16, 'cake', face, pie ? 1 : 0);
  const random = rng(hashSeed('sprinkles', face));
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const rank = field[y * 16 + x] ?? 0.5;
      const plain = rank < 0.25 ? 1 : rank > 0.85 ? 3 : 2;
      let colour: Rgb;
      if (face === 'top') {
        if (pie) {
          const lattice = (x + y) % 5 === 0 || (x - y + 20) % 5 === 0;
          colour = lattice ? shade(sponge, plain + 1) : shade(fruit, plain - 1);
        } else {
          colour = shade(icing, plain + 1);
        }
        if (x === 0 || y === 0) colour = pie ? shade(sponge, 4) : shade(icing, 4);
        if (x === 15 || y === 15) colour = pie ? shade(sponge, 1) : shade(icing, 1);
      } else if (face === 'bottom') {
        colour = shade(sponge, plain - 1);
      } else {
        // The side and the cut face repeat every eight rows: the cake is eight pixels high.
        const row = y % 8;
        if (pie) {
          colour =
            face === 'inside' && row >= 2 && row <= 5 ? shade(fruit, plain) : shade(sponge, plain);
          if (row === 0) colour = shade(sponge, 4);
        } else if (row <= 1 || (row === 2 && (x * 7 + y) % 3 === 0)) {
          colour = shade(icing, row === 0 ? 4 : 3);
        } else if (row === 5) {
          colour = shade(fruit, face === 'inside' ? 2 : 1);
        } else {
          colour = shade(sponge, face === 'inside' ? plain + 1 : plain);
        }
        if (row === 7) colour = shade(sponge, 0);
      }
      canvas.set(x, y, colour);
    }
  }
  if (face === 'top' && !pie) {
    for (let k = 0; k < 7; k += 1) {
      const x = 2 + Math.floor(random() * 12);
      const y = 2 + Math.floor(random() * 12);
      canvas.set(x, y, shade(fruit, 2));
      canvas.set(x + 1, y + 1, shade(fruit, 0));
      canvas.set(x, y + 1, shade(fruit, 1));
    }
  }
  return canvas.png();
}

/**
 * Age `age` (0 to 3) of a berry bush, drawn as a cross plant on a clear background: a sprout,
 * a bush, a bush with a few unripe berries and a bush full of ripe ones.
 */
export function berryBushPng(age: number, leaf: Rgb, berry: Rgb): Uint8Array {
  const canvas = new Canvas(16, 16);
  const leaves = generateRamp(leaf, { count: 5, anchor: 2 });
  const fruit = rampOf(berry, 4, 2);
  const unripe = rampOf(mix(berry, leaf, 0.55), 4, 2);
  const field = noise(16, 16, 'bush', age);
  const radius = [3.2, 5.6, 6.6, 7.2][age] ?? 6;
  const cx = 7.5;
  const cy = 15.5 - radius * 0.9;
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const rank = field[y * 16 + x] ?? 0.5;
      const d = Math.hypot((x - cx) / 1.05, (y - cy) / 0.95);
      if (d > radius - rank * 1.4) continue;
      if (rank < 0.08) continue; // gaps between the leaves
      const lit = x < cx && y < cy ? 1 : 0;
      canvas.set(x, y, shade(leaves, (rank < 0.35 ? 1 : rank > 0.8 ? 3 : 2) + lit));
    }
  }
  if (age >= 2) {
    // Berries spread over the bush: three unripe ones, then six ripe ones.
    const spots: readonly (readonly [number, number])[] = [
      [4, 7],
      [10, 6],
      [7, 11],
      [11, 10],
      [3, 11],
      [7, 4],
    ];
    const ramp = age === 2 ? unripe : fruit;
    for (const [x, y] of spots.slice(0, age === 2 ? 3 : 6)) {
      canvas.set(x, y, shade(ramp, 3));
      canvas.set(x + 1, y, shade(ramp, 2));
      canvas.set(x, y + 1, shade(ramp, 1));
      canvas.set(x + 1, y + 1, shade(ramp, 0));
    }
  }
  return canvas.png();
}

/**
 * The writing screen picture of a standing sign, 24 by 26 pixels: a board of boards in `wood`
 * on a post. Saved at `textures/gui/signs/<path>.png`.
 */
export function signGuiPng(wood: Rgb): Uint8Array {
  const canvas = new Canvas(24, 26);
  const ramp = rampOf(wood, 5, 2);
  const field = noise(24, 26, 'sign-gui');
  for (let y = 0; y < 26; y += 1) {
    for (let x = 0; x < 24; x += 1) {
      const rank = field[y * 24 + x] ?? 0.5;
      const board = y < 13;
      const post = !board && x >= 10 && x <= 13;
      if (!board && !post) continue;
      let index = rank < 0.25 ? 1 : rank > 0.85 ? 3 : 2;
      if (board) {
        if (y % 4 === 3) index = 1;
        if (x === 0 || y === 0) index = 4;
        if (x === 23 || y === 12) index = 0;
      } else {
        if (x === 10) index = 3;
        if (x === 13) index = 0;
      }
      canvas.set(x, y, shade(ramp, index));
    }
  }
  return canvas.png();
}

/**
 * The writing screen picture of a hanging sign, 16 by 16 pixels: two chains above a board in
 * `wood`. Saved at `textures/gui/hanging_signs/<path>.png`.
 */
export function hangingSignGuiPng(wood: Rgb, chain: Rgb = [92, 96, 108]): Uint8Array {
  const canvas = new Canvas(16, 16);
  const ramp = rampOf(wood, 5, 2);
  const links = rampOf(chain, 4, 2);
  const field = noise(16, 16, 'hanging-sign-gui');
  for (let y = 0; y < 4; y += 1) {
    for (const x of [3, 12]) canvas.set(x, y, shade(links, y % 2 === 0 ? 3 : 1));
  }
  for (let y = 4; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const rank = field[y * 16 + x] ?? 0.5;
      let index = rank < 0.25 ? 1 : rank > 0.85 ? 3 : 2;
      if (x === 0 || y === 4) index = 4;
      if (x === 15 || y === 15) index = 0;
      if (y === 9) index = 1;
      canvas.set(x, y, shade(ramp, index));
    }
  }
  return canvas.png();
}

/** A plain bevelled block of `colour` (a gem finish), for the Creative tab flow's first block. */
export function plainBlockPng(colour: Rgb): Uint8Array {
  const image = generateArt('block', { colour, finish: 'gem', seed: 7 });
  const canvas = new Canvas(16, 16);
  canvas.data.set(image.data);
  return canvas.png();
}
