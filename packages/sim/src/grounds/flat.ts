/**
 * The Flat world ground (ADR 0087 D1): the superflat layers bedrock, dirt, dirt and grass block
 * from the bottom of the area, over its whole width and depth.
 */

import { type GroundBlocks, GroundBuilder } from './ground.js';

/** The flat world's layers from the bottom up (ADR 0087 D1). */
export const FLAT_WORLD_LAYERS: readonly string[] = Object.freeze([
  'minecraft:bedrock',
  'minecraft:dirt',
  'minecraft:dirt',
  'minecraft:grass_block[snowy=false]',
]);

/** The Flat world ground: {@link FLAT_WORLD_LAYERS} filling the bottom of the area. */
export function flatGround(): GroundBlocks {
  const ground = new GroundBuilder();
  const { size } = ground;
  FLAT_WORLD_LAYERS.forEach((state, y) => {
    for (let z = 0; z < size.z; z += 1) {
      for (let x = 0; x < size.x; x += 1) ground.set(x, y, z, state);
    }
  });
  return ground.build();
}
