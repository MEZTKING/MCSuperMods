import { describe, expect, it } from 'vitest';
import {
  backgroundOf,
  convertPicture,
  cropImage,
  fitRect,
  hardenAlpha,
  isLegacySkin,
  reduceColours,
  removeBackground,
  resizeImage,
  upgradeLegacySkin,
} from '../../src/renderer/src/components/texture-editor/image-convert';
import {
  pixelAt,
  type Rgba,
  type RgbaImage,
} from '../../src/renderer/src/components/texture-editor/pixels';

function filled(width: number, height: number, colour: Rgba): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let at = 0; at < data.length; at += 4) data.set(colour, at);
  return { width, height, data };
}

function paint(image: RgbaImage, x: number, y: number, colour: Rgba): void {
  image.data.set(colour, (y * image.width + x) * 4);
}

const WHITE: Rgba = [255, 255, 255, 255];
const RED: Rgba = [200, 20, 40, 255];
const BLUE: Rgba = [20, 40, 220, 255];

describe('picture to texture', () => {
  it('crops and fits a rectangle of an aspect', () => {
    const image = filled(10, 6, WHITE);
    paint(image, 3, 2, RED);
    const cropped = cropImage(image, { x: 3, y: 2, width: 4, height: 3 });
    expect([cropped.width, cropped.height]).toEqual([4, 3]);
    expect(pixelAt(cropped, 0, 0)).toEqual(RED);
    expect(fitRect(10, 6, 1)).toEqual({ x: 2, y: 0, width: 6, height: 6 });
    expect(fitRect(10, 6, 2)).toEqual({ x: 0, y: 0, width: 10, height: 5 });
  });

  it('scales sharp by sampling and smooth by averaging', () => {
    const image = filled(4, 4, RED);
    for (let y = 0; y < 4; y += 1) for (let x = 2; x < 4; x += 1) paint(image, x, y, BLUE);
    const sharp = resizeImage(image, 2, 2, 'sharp');
    expect(pixelAt(sharp, 0, 0)).toEqual(RED);
    expect(pixelAt(sharp, 1, 1)).toEqual(BLUE);
    const smooth = resizeImage(image, 1, 1, 'smooth');
    expect(pixelAt(smooth, 0, 0)).toEqual([110, 30, 130, 255]);
  });

  it('cuts away the background connected to the border, not inside the subject', () => {
    const image = filled(5, 5, WHITE);
    for (let y = 1; y < 4; y += 1) for (let x = 1; x < 4; x += 1) paint(image, x, y, RED);
    paint(image, 2, 2, WHITE);
    expect(backgroundOf(image)).toEqual(WHITE);
    expect(removeBackground(image, 20)).toBe(16);
    expect(pixelAt(image, 0, 0)?.[3]).toBe(0);
    expect(pixelAt(image, 2, 2)).toEqual(WHITE);
  });

  it('hardens alpha and reduces colours', () => {
    const image = filled(4, 1, RED);
    paint(image, 1, 0, [210, 30, 50, 255]);
    paint(image, 2, 0, BLUE);
    paint(image, 3, 0, [0, 0, 0, 100]);
    hardenAlpha(image);
    expect(pixelAt(image, 3, 0)?.[3]).toBe(0);
    reduceColours(image, 2);
    expect(pixelAt(image, 0, 0)).toEqual(pixelAt(image, 1, 0));
    expect(pixelAt(image, 2, 0)).toEqual(BLUE);
  });

  it('brings a legacy skin to 64 by 64 with mirrored left limbs', () => {
    const legacy = filled(64, 32, [0, 0, 0, 0]);
    // Right leg front face starts at (4, 20); right arm front at (44, 20).
    paint(legacy, 4, 20, RED);
    paint(legacy, 44, 20, BLUE);
    expect(isLegacySkin(legacy)).toBe(true);
    const skin = upgradeLegacySkin(legacy);
    expect([skin.width, skin.height]).toEqual([64, 64]);
    expect(pixelAt(skin, 4, 20)).toEqual(RED);
    // Left leg front face (20, 52), mirrored: the first column lands in the last.
    expect(pixelAt(skin, 23, 52)).toEqual(RED);
    // Left arm front face (36, 52), mirrored.
    expect(pixelAt(skin, 39, 52)).toEqual(BLUE);
  });

  it('runs the whole pipeline to the target size', () => {
    const image = filled(64, 48, WHITE);
    for (let y = 8; y < 40; y += 1) for (let x = 16; x < 48; x += 1) paint(image, x, y, RED);
    const out = convertPicture(image, {
      crop: fitRect(64, 48, 1),
      width: 16,
      height: 16,
      scale: 'smooth',
      backgroundTolerance: 24,
      colours: 4,
    });
    expect([out.width, out.height]).toEqual([16, 16]);
    expect(pixelAt(out, 0, 0)?.[3]).toBe(0);
    expect(pixelAt(out, 8, 8)).toEqual(RED);
  });
});
