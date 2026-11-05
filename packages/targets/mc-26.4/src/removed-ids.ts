/**
 * Registry members that exist in the 26.3 vendored registries and not in this target's
 * (ADR 0037 D3), as data. Ids carry no namespace, as in `registries.json`; consumers add
 * `minecraft:`.
 *
 * `test/removed-ids.test.ts` computes the diff of `mc-26.3/vendor/mcmeta/registries.json` and
 * this target's `vendor/mcmeta/registries.json` and asserts it equals {@link REMOVED_IDS},
 * {@link MOVED_REGISTRIES} and {@link STILL_REGISTERED_ELSEWHERE}; rerun it (and update these
 * tables) on every re-pin.
 */

/** Registry name to the ids removed from it since 26.3, both sorted. */
export const REMOVED_IDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  fluid: ['flowing_lava', 'flowing_water'],
  model: ['block/cube_top'],
  particle_type: ['item_snowball'],
  rule_test: [
    'all_of',
    'always_true',
    'any_of',
    'block_match',
    'blockstate_match',
    'height_match',
    'not',
    'random_block_match',
    'random_blockstate_match',
    'tag_match',
  ],
  sound_event: ['intentionally_empty'],
  'tag/entity_type': ['freeze_immune_entity_types', 'ignores_poison_and_regen'],
  texture: [
    'gui/sprites/friends/button',
    'gui/sprites/friends/button_disabled',
    'gui/sprites/friends/button_highlighted',
    'gui/sprites/friends/loading',
    'gui/sprites/friends/remove',
    'gui/sprites/pause_menu/player_reporting',
    'gui/sprites/pause_menu/social_interactions',
    'gui/sprites/toast/social_interactions',
  ],
  'worldgen/density_function_type': ['interpolated'],
  'worldgen/feature_type': ['large_dripstone'],
});

/**
 * Registries that are gone in this target while every member lives on, unchanged, in the
 * named registry (`rule_test` became `rule_test_type`). Their ids still mean the same thing,
 * so the migration does not report them.
 */
export const MOVED_REGISTRIES: Readonly<Record<string, string>> = Object.freeze({
  rule_test: 'rule_test_type',
});

/**
 * Removed members whose id is still an entry of another registry in this target (registry →
 * id → the registries that keep it). `large_dripstone` is no longer a feature type, but the
 * vanilla configured and placed features of that name remain, so the migration reports it only
 * where it is a feature's `type`.
 */
export const STILL_REGISTERED_ELSEWHERE: Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
> = Object.freeze({
  'worldgen/feature_type': { large_dripstone: ['worldgen/feature', 'worldgen/placed_feature'] },
});

/** A removed id with a known replacement (ADR 0037 D3). */
export interface KnownRename {
  /** The registry the id was removed from. */
  registry: string;
  /** The removed id, without namespace. */
  from: string;
  /** The replacement id in the same registry, without namespace. */
  to: string;
  /**
   * Whether the replacement takes exactly the same fields, checked against the vendored
   * vanilla-mcdoc by `test/removed-ids.test.ts`. Only then does the migration rewrite the id;
   * otherwise it reports the id and names the replacement.
   */
  sameShape: boolean;
  /** What the user has to change when `sameShape` is false, in British English. */
  hint?: string;
}

/** Known renames from 26.3 to this target. */
export const KNOWN_RENAMES: readonly KnownRename[] = Object.freeze([
  {
    registry: 'worldgen/feature_type',
    from: 'large_dripstone',
    to: 'large_speleothem',
    // LargeSpeleothemConfig gained the required `base_block` in 26.4.
    sameShape: false,
    hint: 'use minecraft:large_speleothem and add its required base_block (for example minecraft:dripstone_block)',
  },
]);
