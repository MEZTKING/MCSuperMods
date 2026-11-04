/**
 * Locations of the vendored data for this target. Consumers read these with their own file
 * access; `@msm/core` and `@msm/schemas` never read files themselves.
 *
 * The files under `vendor/` are regenerated only by `tools/sync-mcdoc` and `tools/sync-mcmeta`.
 */
export const vendored = {
  /** Spyglass symbol export of vanilla-mcdoc at `target.mcdocRef`. */
  vanillaMcdocSymbols: new URL('../vendor/vanilla-mcdoc/symbols.json', import.meta.url),
  /** misode/mcmeta `version.json` from the `<mcmetaRef>-summary` tag. */
  mcmetaVersion: new URL('../vendor/mcmeta/version.json', import.meta.url),
  /** misode/mcmeta registry contents (ids without namespace) from the summary tag. */
  mcmetaRegistries: new URL('../vendor/mcmeta/registries.json', import.meta.url),
  /** misode/mcmeta Brigadier command tree (`commands/data.min.json`) from the summary tag. */
  mcmetaCommands: new URL('../vendor/mcmeta/commands.json', import.meta.url),
  /** misode/mcmeta block states, `[properties, defaults]` per block (`blocks/data.min.json`). */
  mcmetaBlocks: new URL('../vendor/mcmeta/blocks.json', import.meta.url),
} as const;
