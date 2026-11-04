/**
 * `@msm/interop`: Blockbench, NBT and Minecraft installation access.
 *
 * Phase 1 provides `minecraft-install/` (locate the game directory, list installed versions,
 * extract preview assets into the cache, ADR 0011), `launchers/` (game locations across the
 * official launcher, Prism/MultiMC and CurseForge instances, ADR 0019) and a PNG header reader. This entry point
 * stays free of Node built-ins; the Node adapter lives under `@msm/interop/node`.
 */

export * from './launchers/index';
export * from './minecraft-install/index';
export { PngFormatError, type PngHeader, readPngHeader } from './png';
