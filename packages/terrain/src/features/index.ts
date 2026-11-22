/**
 * The engine's features seam (ADR 0119 D3, D6; B583): trees, plants and ores placed into a
 * window by the data's own placement modifiers, in the world's feature order, with MSM's own
 * shapes and random sequence. They are "about right" (the notes say so), not block for block.
 *
 * For each chunk the window touches, and the ring of chunks around it (their trees and ores
 * reach in), the chunk's biomes are found; then, step by step, every placed feature of the
 * world's order that one of those biomes lists (or a biome addition adds) is placed from the
 * chunk's corner with a random seeded by the world seed, the chunk, the step and the feature's
 * place in the order, so the same seed gives the same placements in any window. Types the engine
 * does not draw are reported by name (`kinds.ts`).
 */

import type { ColumnWindow, Unsupported } from '../api';
import type { EngineWorld, FlatWorldShape } from '../world';
import { readAdditions } from './additions';
import { BlockTags, guessedTag } from './blocks';
import { type FeatureContext, NoteSink } from './context';
import { placePlaced, reportLeftOut } from './kinds';
import { FeatureLevel } from './level';
import { featureOrder } from './order';
import type { Reach } from './placement';
import { FEATURE_FOLDERS } from './providers';
import { FeatureRandom, seedWords } from './random';

export { ADDITIONS_FOLDER } from './additions';
export { FEATURE_TYPES, leftOutWords } from './kinds';
export type { FeatureFacts } from './order';
export { APPROXIMATE_MODIFIERS, PLACEMENT_MODIFIER_TYPES } from './placement';

/** A column window's blocks as the `features` stage sees them. */
export interface FeatureInput {
  readonly size: { x: number; y: number; z: number };
  readonly palette: readonly string[];
  readonly blocks: Uint16Array;
  readonly notes: readonly Unsupported[];
}

/** Where the window is (`columns.ts` `buildWindow` passes it). */
export interface FeaturePlace {
  readonly world: EngineWorld;
  readonly window: ColumnWindow;
}

/** The note every features stage carries (ADR 0119 D6, the plan's Very easy wording). */
export const ABOUT_RIGHT: Unsupported = Object.freeze({
  kind: 'feature',
  type: 'about_right',
  where: 'features',
  drawnInstead: 'Trees, plants and ores are about right here; the game places them exactly.',
});

/** Heights of the chunk's biome samples, besides the window's middle (blocks apart). */
const BIOME_ROWS = 64;

/**
 * Places features into a window. Without `place` (no world to read) it returns its input with
 * one note.
 */
export function placeFeatures(input: FeatureInput, place?: FeaturePlace): FeatureInput {
  if (!place) {
    return {
      ...input,
      notes: [
        ...input.notes,
        {
          kind: 'feature',
          type: 'all',
          where: 'features',
          drawnInstead: 'Trees, plants and ores are not drawn here.',
        },
      ],
    };
  }
  const { world, window } = place;
  // A flat world has features only when its settings ask for them (B581 passes `features`).
  const flat = world.flat as (FlatWorldShape & { readonly features?: boolean }) | undefined;
  if ((!world.noise && flat?.features !== true) || input.blocks.length === 0) {
    return { ...input, notes: [...input.notes, ABOUT_RIGHT] };
  }
  const level = new FeatureLevel(world, window, input.palette, input.blocks);
  const files = world.files;
  const additions = readAdditions(files, world.facts);
  const order = featureOrder(world, additions);
  const tags = new BlockTags((id) => files.get(FEATURE_FOLDERS.blockTags, id));
  const notes = new NoteSink();
  const worldgen = { minY: world.minY, height: world.height, seaLevel: world.seaLevel };
  const seed = seedWords(world.seed);
  const biomeHas = (biome: string, placed: string) =>
    order.anyStep.get(biome)?.has(placed) ?? false;

  const walked = new Set<unknown>();
  const reaches = new Map<unknown, Reach>();
  const cx0 = (window.x0 >> 4) - 1;
  const cz0 = (window.z0 >> 4) - 1;
  const cx1 = ((window.x0 + window.sizeX - 1) >> 4) + 1;
  const cz1 = ((window.z0 + window.sizeZ - 1) >> 4) + 1;
  const middle = Math.floor(window.y0 + window.sizeY / 2);
  for (let cz = cz0; cz <= cz1; cz += 1) {
    for (let cx = cx0; cx <= cx1; cx += 1) {
      const biomes = chunkBiomes(level, cx, cz, middle);
      for (let step = 0; step < order.steps.length; step += 1) {
        const listed = new Set<string>();
        for (const b of biomes) for (const f of order.byBiome.get(b)?.[step] ?? []) listed.add(f);
        if (listed.size === 0) continue;
        const features = order.steps[step] as readonly string[];
        for (let i = 0; i < features.length; i += 1) {
          const id = features[i] as string;
          if (!listed.has(id)) continue;
          const ctx: FeatureContext = {
            level,
            files,
            tags,
            worldgen,
            notes,
            random: FeatureRandom.forFeature(seed, cx, cz, step, i),
            chunkX: cx,
            chunkZ: cz,
            topFeature: id,
            biomeHas,
            reaches,
          };
          if (!walked.has(id)) reportLeftOut(ctx, id, walked);
          placePlaced(ctx, id, [cx * 16, world.minY, cz * 16], false);
        }
      }
    }
  }
  for (const tag of [...tags.unknown].sort()) {
    if (guessedTag(tag)) continue;
    notes.add({
      kind: 'feature',
      type: `#${tag}`,
      where: 'tags/block',
      drawnInstead: 'This block tag is not in the files: it matches nothing here.',
    });
  }
  return {
    size: input.size,
    palette: level.palette,
    blocks: level.blocks,
    notes: [...input.notes, ABOUT_RIGHT, ...notes.list],
  };
}

/** The biomes of a chunk: a 4 by 4 grid of columns at the window's middle and every 64 blocks. */
function chunkBiomes(level: FeatureLevel, cx: number, cz: number, middle: number): Set<string> {
  const out = new Set<string>();
  const ys = [Math.min(level.maxY, Math.max(level.minY, middle))];
  for (let y = level.minY; y <= level.maxY; y += BIOME_ROWS) ys.push(y);
  for (const y of ys) {
    for (let dx = 2; dx < 16; dx += 4) {
      for (let dz = 2; dz < 16; dz += 4) out.add(level.biome(cx * 16 + dx, y, cz * 16 + dz));
    }
  }
  return out;
}
