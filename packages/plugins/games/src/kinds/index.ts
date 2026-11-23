/**
 * Element kinds contributed by `@msm/plugin-games` (ADR 0113 D2 to D7). The six stub kinds are
 * declared here by id and not yet registered: B549 adds `games.mcdoc` and the schema refs, then
 * registers them.
 */

/** The kind ids this plugin will contribute. */
export const GAMES_KIND_IDS = [
  'msm:world_setup',
  'msm:one_block',
  'msm:team',
  'msm:objective',
  'msm:timer',
  'msm:area',
] as const;

/** A kind id of this plugin. */
export type GamesKindId = (typeof GAMES_KIND_IDS)[number];
