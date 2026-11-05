/**
 * `@msm/interop`: Blockbench, NBT and Minecraft installation access.
 *
 * Phase 1 provides `minecraft-install/` (locate the game directory, list installed versions,
 * extract preview assets into the cache, ADR 0011), `launchers/` (game locations across the
 * official launcher, Prism/MultiMC and CurseForge instances, ADR 0019), a PNG header reader and
 * (Phase 3) `nbt/` (`readLevelName` for `level.dat`) and (Phase 4) `fabric/` (Test in Minecraft:
 * mods-folder installs, the managed Prism instance, Fabric API download cache, launch
 * arguments; ADR 0026 D5) and (Phase 5) `blockbench/` (`.bbmodel` to GeckoLib geometry and
 * animations, the `blockbench` importer; ADR 0029 D3). This entry point
 * stays free of Node built-ins; the Node adapter lives under `@msm/interop/node`.
 */

export * from './blockbench/index';
export * from './fabric/index';
export * from './launchers/index';
export * from './minecraft-install/index';
export * from './nbt/index';
export { PngFormatError, type PngHeader, readPngHeader } from './png';
