/**
 * The painting's 3D scene for the geo renderer (B628 over B623's shapes): one geometry holding
 * the wall and the painting, on one picture that holds the painting's own picture at its real
 * size (top left) and MSM's plain wall texture beside it. The painting stretches its picture over
 * its `width` by `height` blocks whatever the picture's size, as the game does.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import { blankPixels, drawOver, fillRect, type Pixels, setPixel } from '../banner/pixels';
import type { GeoJson } from '../bodies/index';
import { frameShape, wallShape } from '../bodies/shapes';

/** A painting is 1 to 16 blocks on a side (the data's range). */
export function paintingBlocks(value: Json | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(16, Math.max(1, Math.round(value)))
    : 1;
}

/** MSM's wall: a pale plaster block with a faint edge. */
const WALL: readonly [number, number, number, number] = [196, 190, 178, 255];
const WALL_EDGE: readonly [number, number, number, number] = [176, 170, 158, 255];
/** MSM's stand-in when the painting has no picture yet: a pale canvas with a cross. */
const CANVAS: readonly [number, number, number, number] = [232, 226, 210, 255];
const CANVAS_MARK: readonly [number, number, number, number] = [180, 160, 130, 255];

/** MSM's stand-in picture, 16 texels a block. */
export function standInPicture(widthBlocks: number, heightBlocks: number): Pixels {
  const w = widthBlocks * 16;
  const h = heightBlocks * 16;
  const picture = blankPixels(w, h);
  fillRect(picture, [0, 0, w, h], CANVAS);
  for (let i = 0; i < Math.max(w, h); i += 1) {
    setPixel(
      picture,
      Math.floor((i * w) / Math.max(w, h)),
      Math.floor((i * h) / Math.max(w, h)),
      CANVAS_MARK,
    );
    setPixel(
      picture,
      w - 1 - Math.floor((i * w) / Math.max(w, h)),
      Math.floor((i * h) / Math.max(w, h)),
      CANVAS_MARK,
    );
  }
  return picture;
}

/** The scene's picture: the painting's picture at (0, 0) and the wall's 16 by 16 beside it. */
export function paintingAtlas(picture: Pixels): Pixels {
  const atlas = blankPixels(picture.width + 16, Math.max(picture.height, 16));
  drawOver(atlas, picture);
  const u = picture.width;
  fillRect(atlas, [u, 0, 16, 16], WALL);
  for (let i = 0; i < 16; i += 1) {
    setPixel(atlas, u + i, 15, WALL_EDGE);
    setPixel(atlas, u + 15, i, WALL_EDGE);
  }
  return atlas;
}

/** Each bone of `geo` with its faces' texels moved by (`du`, `dv`). */
function bonesOf(geo: GeoJson, du: number, dv: number): JsonObject[] {
  const geometry = (geo as JsonObject)['minecraft:geometry'];
  const first = Array.isArray(geometry) ? (geometry[0] as JsonObject | undefined) : undefined;
  const bones = Array.isArray(first?.bones) ? (first.bones as JsonObject[]) : [];
  return bones.map((bone) => ({
    ...bone,
    cubes: ((bone.cubes as JsonObject[] | undefined) ?? []).map((cube) => {
      const uv: JsonObject = {};
      for (const [face, value] of Object.entries((cube.uv as JsonObject | undefined) ?? {})) {
        const face0 = value as JsonObject;
        const [u, v] = face0.uv as [number, number];
        uv[face] = { ...face0, uv: [u + du, v + dv] };
      }
      return { ...cube, uv };
    }),
  }));
}

/**
 * The wall and the painting as one geometry on {@link paintingAtlas}'s picture (`frameShape`
 * given the picture's real size, `wallShape` moved to the wall texture).
 */
export function paintingGeo(
  widthBlocks: number,
  heightBlocks: number,
  pictureWidth: number,
  pictureHeight: number,
): GeoJson {
  const frame = frameShape(widthBlocks, heightBlocks, pictureWidth, pictureHeight);
  const wall = wallShape(widthBlocks, heightBlocks);
  return {
    format_version: '1.12.0',
    'minecraft:geometry': [
      {
        description: {
          identifier: 'geometry.msm.shape.painting_on_wall',
          texture_width: pictureWidth + 16,
          texture_height: Math.max(pictureHeight, 16),
        },
        bones: [...bonesOf(wall, pictureWidth, 0), ...bonesOf(frame, 0, 0)],
      },
    ],
  };
}
