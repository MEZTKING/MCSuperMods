import { describe, expect, it } from 'vitest';
import {
  floodFill,
  fromHex,
  PixelHistory,
  paletteOf,
  pixelAt,
  type Rgba,
  type RgbaImage,
  setPixel,
  toHex,
} from '../../src/renderer/src/components/texture-editor/pixels';

const RED: Rgba = [255, 0, 0, 255];
const BLUE: Rgba = [0, 0, 255, 255];

function blank(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

describe('texture editor pixels', () => {
  it('sets pixels inside the image only', () => {
    const image = blank(2, 2);
    expect(setPixel(image, 1, 0, RED)).toBe(true);
    expect(setPixel(image, 1, 0, RED)).toBe(false);
    expect(setPixel(image, 5, 0, RED)).toBe(false);
    expect(pixelAt(image, 1, 0)).toEqual(RED);
    expect(pixelAt(image, -1, 0)).toBeNull();
  });

  it('flood-fills the connected area of one colour', () => {
    const image = blank(3, 3);
    // A wall down the middle column.
    for (let y = 0; y < 3; y += 1) setPixel(image, 1, y, BLUE);
    expect(floodFill(image, 0, 0, RED)).toBe(3);
    expect(pixelAt(image, 0, 2)).toEqual(RED);
    expect(pixelAt(image, 2, 0)).toEqual([0, 0, 0, 0]);
    expect(floodFill(image, 0, 0, RED)).toBe(0);
  });

  it('lists the palette by use and converts hex', () => {
    const image = blank(3, 1);
    setPixel(image, 0, 0, RED);
    setPixel(image, 1, 0, RED);
    setPixel(image, 2, 0, BLUE);
    expect(paletteOf(image)).toEqual([RED, BLUE]);
    expect(toHex([200, 40, 60, 255])).toBe('#c8283c');
    expect(fromHex('#C8283C')).toEqual([200, 40, 60, 255]);
    expect(fromHex('nope')).toBeNull();
  });

  it('undoes and redoes whole images', () => {
    const history = new PixelHistory();
    let image = blank(1, 1);
    history.push(image);
    setPixel(image, 0, 0, RED);
    const undone = history.undo(image);
    expect(undone && pixelAt(undone, 0, 0)).toEqual([0, 0, 0, 0]);
    image = undone as RgbaImage;
    const redone = history.redo(image);
    expect(redone && pixelAt(redone, 0, 0)).toEqual(RED);
    expect(history.canRedo).toBe(false);
  });
});
