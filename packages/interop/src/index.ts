/**
 * `@msm/interop`: Blockbench, NBT and Minecraft installation access.
 *
 * Phase 1 provides `minecraft-install/` (locate the game directory, list installed versions,
 * extract preview assets into the cache, ADR 0011) and a PNG header reader. This entry point
 * stays free of Node built-ins; the Node adapter lives under `@msm/interop/node`.
 */

export * from './minecraft-install/index';
export { PngFormatError, type PngHeader, readPngHeader } from './png';
