import { describe, expect, it } from 'vitest';
import {
  applyEdits,
  CHUNK_BLOCKS,
  clampY0,
  cutAtTop,
  editsLine,
  GENERATED_MOVE_BLOCKS,
  type GeneratedWindow,
  GROUND_AIR,
  GROUND_KINDS,
  GROUND_SIZE,
  GroundBuilder,
  generatedGround,
  groundStateAt,
  LocalWorldSource,
  liftedFeet,
  sameWindow,
  shiftWindow,
  windowAround,
  windowCentre,
  windowY0,
  worldOf,
} from '../../src/index.js';
import { FAKE_TARGET, testFiles } from '../blocks/helpers.js';

const OVERWORLD = { minY: -64, height: 384, seaLevel: 63 };

/** Stone up to `top` (area y), grass on it: the engine's layout. */
function hill(top: number): {
  size: { x: number; y: number; z: number };
  palette: string[];
  blocks: Uint16Array;
} {
  const builder = new GroundBuilder();
  for (let x = 0; x < GROUND_SIZE.x; x += 1) {
    for (let z = 0; z < GROUND_SIZE.z; z += 1) {
      for (let y = 0; y < top; y += 1) builder.set(x, y, z, 'minecraft:stone');
      builder.set(x, top, z, 'minecraft:grass_block[snowy=false]');
    }
  }
  const built = builder.build();
  return { size: built.size, palette: [...built.palette], blocks: built.blocks };
}

const WINDOW: GeneratedWindow = { x0: 16, y0: 50, z0: -48, sizeX: 48, sizeY: 32, sizeZ: 48 };

describe('the generated ground (B584, ADR 0119 D8)', () => {
  it('is one of the grounds', () => {
    expect(GROUND_KINDS).toContain('generated');
  });

  it('cuts a window of 3 by 3 whole chunks around a block, the surface a third of the way up', () => {
    const window = windowAround({ x: 37, z: -20 }, 70, OVERWORLD);
    expect(window).toEqual({ x0: 16, y0: 60, z0: -48, sizeX: 48, sizeY: 32, sizeZ: 48 });
    expect(Math.abs(window.x0 % CHUNK_BLOCKS)).toBe(0);
    expect(Math.abs(window.z0 % CHUNK_BLOCKS)).toBe(0);
    // The block asked for lies in the middle chunk.
    expect(Math.floor(37 / 16) * 16 - window.x0).toBe(16);
    expect(Math.floor(-20 / 16) * 16 - window.z0).toBe(16);
    expect(windowCentre(window)).toEqual({ x: 40, z: -24 });
    // Unknown surface: the sea level.
    expect(windowAround({ x: 0, z: 0 }, null, OVERWORLD).y0).toBe(53);
  });

  it('keeps the window inside the world, also when moved', () => {
    expect(windowY0(-80, OVERWORLD)).toBe(-64);
    expect(windowY0(400, OVERWORLD)).toBe(320 - 32);
    expect(clampY0(10, { minY: 0, height: 16 })).toBe(0);
    const low = windowAround({ x: 0, z: 0 }, -60, OVERWORLD);
    expect(shiftWindow(low, -GENERATED_MOVE_BLOCKS, OVERWORLD)).toEqual(low);
    const up = shiftWindow(low, GENERATED_MOVE_BLOCKS, OVERWORLD);
    expect(up.y0).toBe(low.y0 + GENERATED_MOVE_BLOCKS);
    expect(sameWindow(low, up)).toBe(false);
    expect(sameWindow(low, { ...low })).toBe(true);
  });

  it('takes the engine columns as they are (palette 0 air, (y * sizeZ + z) * sizeX + x)', () => {
    const columns = hill(10);
    const ground = generatedGround(columns);
    expect(ground.size).toEqual(GROUND_SIZE);
    expect(ground.palette).toEqual(columns.palette);
    expect(ground.blocks).toEqual(columns.blocks);
    expect(ground.blocks).not.toBe(columns.blocks);
    expect(groundStateAt(ground, 5, 10, 7)).toBe('minecraft:grass_block[snowy=false]');
    expect(groundStateAt(ground, 5, 11, 7)).toBe(GROUND_AIR);
  });

  it('pads a smaller window with air and puts air first in a palette without it', () => {
    const ground = generatedGround({
      size: { x: 2, y: 1, z: 2 },
      palette: ['minecraft:stone', 'minecraft:dirt'],
      blocks: Uint16Array.from([0, 1, 1, 0]),
    });
    expect(ground.size).toEqual(GROUND_SIZE);
    expect(ground.palette[0]).toBe(GROUND_AIR);
    expect(groundStateAt(ground, 0, 0, 0)).toBe('minecraft:stone');
    expect(groundStateAt(ground, 1, 0, 0)).toBe('minecraft:dirt');
    expect(groundStateAt(ground, 0, 0, 1)).toBe('minecraft:dirt');
    expect(groundStateAt(ground, 2, 0, 0)).toBe(GROUND_AIR);
  });

  it('says when tall land is cut at the window top (WL8)', () => {
    expect(cutAtTop(generatedGround(hill(10)))).toBe(false);
    expect(cutAtTop(generatedGround(hill(GROUND_SIZE.y - 1)))).toBe(true);
  });

  it('keeps placed blocks where they still fit and counts the rest', () => {
    const ground = generatedGround(hill(10));
    const at = (x: number, y: number, z: number) => worldOf(WINDOW, { x, y, z });
    const edits = [
      { ...at(3, 11, 3), state: 'msm:ruby_block' }, // on the grass: fits
      { ...at(3, 5, 3), state: 'msm:ruby_block' }, // inside the stone: gone
      { ...at(4, 10, 4), state: 'minecraft:grass_block[snowy=false]' }, // the same block: fits
      { ...at(6, 9, 6), state: null }, // broken: broken again
      { ...at(60, 0, 0), state: 'msm:ruby_block' }, // outside the window: held
    ];
    const applied = applyEdits(ground, WINDOW, edits);
    expect(applied.lost).toBe(1);
    expect(applied.outside).toBe(1);
    expect(applied.kept).toHaveLength(4);
    expect(applied.kept).not.toContainEqual(edits[1]);
    expect(groundStateAt(applied.ground, 3, 11, 3)).toBe('msm:ruby_block');
    expect(groundStateAt(applied.ground, 3, 5, 3)).toBe('minecraft:stone');
    expect(groundStateAt(applied.ground, 6, 9, 6)).toBe(GROUND_AIR);
    // The land handed in is not changed.
    expect(groundStateAt(ground, 6, 9, 6)).toBe('minecraft:stone');
    expect(editsLine(applied.lost, applied.outside)).toBe(
      '1 block you placed is gone: the new land fills its place; 1 change of yours is outside the window now and comes back when it does.',
    );
    expect(editsLine(0, 0)).toBeNull();
    expect(editsLine(3, 0)).toBe('3 blocks you placed are gone: the new land fills their places.');
  });

  it('lifts the player out of land that grew over them, and leaves them when free', () => {
    const solid = (_x: number, y: number) => y < 12;
    expect(liftedFeet({ x: 4.5, y: 5, z: 4.5 }, solid, 32)).toEqual({ x: 4.5, y: 12, z: 4.5 });
    expect(liftedFeet({ x: 4.5, y: 20, z: 4.5 }, solid, 32)).toEqual({ x: 4.5, y: 20, z: 4.5 });
    expect(liftedFeet({ x: 4.5, y: 5, z: 4.5 }, () => true, 32).y).toBe(32);
  });

  it('loads into the area as any ground: the player stands on its surface', () => {
    const source = new LocalWorldSource({ files: testFiles(), target: FAKE_TARGET });
    const result = source.loadGround('generated', generatedGround(hill(10)));
    expect(source.ground).toBe('generated');
    expect(result.blocks).toBe(GROUND_SIZE.x * GROUND_SIZE.z * 11);
    expect(result.start.y).toBe(11);
  });
});
