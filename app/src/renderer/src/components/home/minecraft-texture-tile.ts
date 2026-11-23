/**
 * Home's **Change a Minecraft texture** tile (ADR 0129 D4): it picks one of the textures of the
 * user's own Minecraft, opens it in the painter, and saves the result as a resource pack override
 * at the same path, so the game shows the user's version. Kept in its own file so Home's gallery
 * can be rearranged without touching it. Pure.
 *
 * @packageDocumentation
 */

import type { MakeTile } from './tiles';

/** The palette command the tile runs (its search result folds into the command's). */
export const MINECRAFT_TEXTURE_COMMAND = 'changeMinecraftTexture';

/** The tile. */
export const MINECRAFT_TEXTURE_TILE: MakeTile = {
  id: 'minecraft-texture',
  label: 'Change a Minecraft texture',
  sentence: 'Paint over stone, dirt, a sword or a mob, and the game shows your version.',
  group: 'looks',
  action: { type: 'minecraft-texture' },
};
