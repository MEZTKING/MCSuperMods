/**
 * The Creator's armour preview (ADR 0043 D3): a humanoid Bedrock geometry written from scratch
 * for MSM (not taken from any Mojang or Blockbench file), drawn by the geo renderer with the
 * two armour layer textures. Preview only; nothing here is exported.
 *
 * The box UV offsets follow the vanilla humanoid layout that 64x32 armour layers are painted
 * in, as the library's `armor_layer_1` and `armor_layer_2` placeholders are (verify at
 * implementation against later targets): head `[0, 0]` (8x8x8), body `[16, 16]` (8x12x4),
 * arms `[40, 16]` (4x12x4, the left one mirrored), legs `[0, 16]` (4x12x4, the left one
 * mirrored). Layer 1 draws the helmet (head), chestplate (body and arms) and boots (legs);
 * layer 2 draws the leggings (body and legs). The geometry reads one 64x64 texture: layer 1 in
 * the top half and layer 2 in the bottom half ({@link composeArmourTexture}).
 *
 * Inflation follows the game's two armour models: 1.0 for layer 1 pieces, 0.5 for the
 * leggings, so the layers do not z-fight.
 *
 * @packageDocumentation
 */

import type { JsonObject } from '@msm/plugin-api';

/** The four humanoid armour pieces. */
export type ArmourPiece = 'helmet' | 'chestplate' | 'leggings' | 'boots';

/** Every piece, head to feet. */
export const ARMOUR_PIECES: readonly ArmourPiece[] = ['helmet', 'chestplate', 'leggings', 'boots'];

/** Size of one armour layer texture. */
export const ARMOUR_LAYER_WIDTH = 64;
export const ARMOUR_LAYER_HEIGHT = 32;

/** Inflation of layer 1 pieces and of the leggings. */
const OUTER = 1;
const INNER = 0.5;

interface Part {
  name: string;
  pivot: [number, number, number];
  origin: [number, number, number];
  size: [number, number, number];
  uv: [number, number];
  mirror?: boolean;
}

const HEAD: Part = {
  name: 'head',
  pivot: [0, 24, 0],
  origin: [-4, 24, -4],
  size: [8, 8, 8],
  uv: [0, 0],
};
const BODY: Part = {
  name: 'body',
  pivot: [0, 24, 0],
  origin: [-4, 12, -2],
  size: [8, 12, 4],
  uv: [16, 16],
};
const RIGHT_ARM: Part = {
  name: 'right_arm',
  pivot: [-5, 22, 0],
  origin: [-8, 12, -2],
  size: [4, 12, 4],
  uv: [40, 16],
};
const LEFT_ARM: Part = {
  name: 'left_arm',
  pivot: [5, 22, 0],
  origin: [4, 12, -2],
  size: [4, 12, 4],
  uv: [40, 16],
  mirror: true,
};
const RIGHT_LEG: Part = {
  name: 'right_leg',
  pivot: [-1.9, 12, 0],
  origin: [-3.9, 0, -2],
  size: [4, 12, 4],
  uv: [0, 16],
};
const LEFT_LEG: Part = {
  name: 'left_leg',
  pivot: [1.9, 12, 0],
  origin: [-0.1, 0, -2],
  size: [4, 12, 4],
  uv: [0, 16],
  mirror: true,
};

/** The parts each piece covers, its layer and inflation. */
const PIECES: Readonly<Record<ArmourPiece, { parts: Part[]; layer: 1 | 2; inflate: number }>> = {
  helmet: { parts: [HEAD], layer: 1, inflate: OUTER },
  chestplate: { parts: [BODY, RIGHT_ARM, LEFT_ARM], layer: 1, inflate: OUTER },
  leggings: { parts: [BODY, RIGHT_LEG, LEFT_LEG], layer: 2, inflate: INNER },
  boots: { parts: [RIGHT_LEG, LEFT_LEG], layer: 1, inflate: OUTER },
};

/** The geo model id of the preview geometry. */
export const ARMOUR_GEOMETRY_ID = 'geometry.msm_armour_preview';

/**
 * A Bedrock geometry (format 1.12.0) with one bone per worn piece and part, for the 64x64
 * texture of {@link composeArmourTexture}. Pieces not listed are left out; an empty list gives
 * a geometry without bones.
 */
export function armourGeometry(pieces: Iterable<ArmourPiece>): JsonObject {
  const chosen = new Set(pieces);
  const bones: JsonObject[] = [];
  for (const piece of ARMOUR_PIECES) {
    if (!chosen.has(piece)) continue;
    const { parts, layer, inflate } = PIECES[piece];
    for (const part of parts) {
      const cube: JsonObject = {
        origin: [...part.origin],
        size: [...part.size],
        uv: [part.uv[0], part.uv[1] + (layer === 2 ? ARMOUR_LAYER_HEIGHT : 0)],
        inflate,
      };
      if (part.mirror === true) cube.mirror = true;
      bones.push({ name: `${piece}_${part.name}`, pivot: [...part.pivot], cubes: [cube] });
    }
  }
  return {
    format_version: '1.12.0',
    'minecraft:geometry': [
      {
        description: {
          identifier: ARMOUR_GEOMETRY_ID,
          texture_width: ARMOUR_LAYER_WIDTH,
          texture_height: ARMOUR_LAYER_HEIGHT * 2,
        },
        bones,
      },
    ],
  };
}

/**
 * One 64x64 PNG with layer 1 in the top half and layer 2 in the bottom half (a missing layer
 * stays transparent). Needs a DOM with `createImageBitmap` and a 2D canvas; the geo canvas
 * calls it, never the tests.
 */
export async function composeArmourTexture(
  layer1: Uint8Array | null,
  layer2: Uint8Array | null,
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = ARMOUR_LAYER_WIDTH;
  canvas.height = ARMOUR_LAYER_HEIGHT * 2;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('No 2D canvas context.');
  const draw = async (bytes: Uint8Array | null, y: number): Promise<void> => {
    if (bytes === null) return;
    try {
      const bitmap = await createImageBitmap(new Blob([bytes.slice()], { type: 'image/png' }));
      context.drawImage(bitmap, 0, y, ARMOUR_LAYER_WIDTH, ARMOUR_LAYER_HEIGHT);
      bitmap.close();
    } catch {
      // A layer that does not decode stays transparent.
    }
  };
  await draw(layer1, 0);
  await draw(layer2, ARMOUR_LAYER_HEIGHT);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result === null ? reject(new Error('Could not encode the texture.')) : resolve(result),
      'image/png',
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}
