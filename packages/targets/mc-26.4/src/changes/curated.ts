/**
 * The curated half of this target's change set (ADR 0136 D2), written by a person over
 * `generated.json` (which only `tools/diff-targets` writes): the steps that make a change
 * (`default_block` dropped, as `noiseSettingsDefaultBlock: false` says), the renames confirmed
 * from the diff's candidates, and a plain sentence, hint and in-game check for the changes that
 * touch the library's examples and fixtures (counted over `examples/` and `fixtures/` on
 * 2026-11-25).
 *
 * Sources of the renames: the diff's candidates and B810's reading of Mojang's snapshot notes
 * (`docs/reference/spikes/b810/README.md` V1, V7), the speleothem rename the right way round
 * (the notes of snapshot 3 give it reversed). Only a rename of the same shape is ever applied;
 * every one here is reported with its hint, because none is (the speleothem config gained the
 * required `base_block`; tags, sprites and density functions have no shape to prove, or another
 * one). `test/changes.test.ts` proves each claimed shape against both versions' vanilla-mcdoc.
 */

import type { CuratedChange, CuratedChangeSet } from '@msm/target-migrate';
import generated from './generated.json' with { type: 'json' };

/** Ids of the generated changes that start with `prefix`, in the set's order. */
function idsStartingWith(prefix: string): string[] {
  return generated.changes.map((change) => change.id).filter((id) => id.startsWith(prefix));
}

/** The vanilla mob whose sound variants a `<mob>_sound_variant` change id names. */
function soundVariantMob(id: string): string {
  return /resource\/([a-z]+)_sound_variant#/.exec(id)?.[1] ?? 'mob';
}

/** The field a format change id names (`#/adult_sounds/ambient_sound` → `adult_sounds/ambient_sound`). */
function fieldOf(id: string): string {
  return id.slice(id.indexOf('#/') + 2);
}

const SOUND_VARIANTS: CuratedChange[] = idsStartingWith('formats:minecraft:resource/')
  .filter((id) => id.includes('_sound_variant#/'))
  .map((id) => ({
    id,
    sentence: `Minecraft 26.4 makes ${fieldOf(id)} of a ${soundVariantMob(id)} sound variant optional.`,
    inGameCheck: `Listen to a ${soundVariantMob(id)} of each of your sound variants: it should make every sound you gave it.`,
  }));

const ZOMBIE_FREEZING: CuratedChange[] = idsStartingWith('formats:minecraft:entity/')
  .filter((id) => id.endsWith('#/FreezingTime') || id.endsWith('#/FrostbiteConversionTime'))
  .map((id) => ({
    id,
    sentence: `Minecraft 26.4 adds the optional ${fieldOf(id)} to the saved data of the ${/entity\/([a-z_]+)#/.exec(id)?.[1] ?? 'mob'}; mods need not set it.`,
    inGameCheck:
      'Summon the zombies your mod makes or changes and check that they behave as before.',
  }));

const POOL_CORNERS: CuratedChange[] = idsStartingWith('formats:minecraft:template_pool_element/')
  .filter((id) => id.endsWith('#/corner_constraint'))
  .map((id) => ({
    id,
    sentence:
      'Minecraft 26.4 adds the optional corner_constraint to the pieces of a template pool; pieces without it need no change.',
    inGameCheck:
      'Find or place your jigsaw structures in a new world and check that their pieces join and sit on the ground as before.',
  }));

const EXPLODE_EFFECTS: CuratedChange[] = [
  ...idsStartingWith('formats:minecraft:entity_effect/explode#/'),
  ...idsStartingWith('formats:minecraft:location_based_effect/explode#/'),
].map((id) => ({
  id,
  sentence: `Minecraft 26.4 makes the ${fieldOf(id).replace('_', ' ')} of an explode effect optional.`,
}));

/** This target's curated change set, from `mc-26.3`. */
export const curated: CuratedChangeSet = {
  from: 'mc-26.3',
  to: 'mc-26.4',
  changes: [
    // Noise settings lost default_block (ADR 0036 D8): dropped from noise settings elements and
    // from noise settings written inline in dimensions and world presets.
    {
      id: 'formats:minecraft:resource/worldgen/noise_settings#/default_block',
      handling: 'auto',
      sentence:
        'Minecraft 26.4 noise settings have no default block: the surface rules choose the stone under the surface, so MCSuperMods removes default_block.',
      inGameCheck:
        'Make a new world with your terrain and look at the stone under the surface: the surface rules now choose it.',
      steps: [
        {
          op: 'drop',
          places: [{ kind: 'minecraft:worldgen/noise_settings', at: '' }],
          field: 'default_block',
          because: 'which noise settings no longer have (the surface rules choose the stone)',
        },
      ],
    },
    {
      id: 'formats:::java::data::worldgen::noise_settings::NoiseGeneratorSettingsRef#/default_block',
      handling: 'auto',
      sentence:
        'Noise settings written inside a dimension or a world preset have no default block in Minecraft 26.4 either, so MCSuperMods removes default_block there too.',
      inGameCheck:
        'Make a new world with your dimension or world preset and look at the stone under the surface: the surface rules now choose it.',
      steps: [
        {
          op: 'drop',
          places: [
            { kind: 'minecraft:dimension', at: '/generator/settings' },
            { kind: 'minecraft:worldgen/world_preset', at: '/dimensions/*/generator/settings' },
          ],
          field: 'default_block',
          because: 'which noise settings no longer have (the surface rules choose the stone)',
        },
      ],
    },
    {
      id: 'formats:::java::data::worldgen::feature::LargeSpeleothemConfig#/base_block',
      sentence:
        'The large speleothem feature, which replaces large dripstone in Minecraft 26.4, needs a base block.',
      hint: 'set base_block, for example to minecraft:dripstone_block for dripstone as before',
    },
    {
      id: 'formats:minecraft:placement_modifier/fixed_placement#/positions',
      sentence: 'In Minecraft 26.4 a fixed placement needs at least one position.',
      hint: 'give each fixed placement one position or more, or remove it',
    },
    // Renames confirmed from the candidates; none has the same shape, so each is reported.
    {
      id: 'ids:worldgen/feature_type/large_dripstone',
      rename: { to: 'large_speleothem', shape: 'superset', dispatcher: 'minecraft:feature_config' },
      sentence:
        'Minecraft 26.4 renames the large dripstone feature type to large speleothem, which also needs a base block.',
      hint: 'use minecraft:large_speleothem and add its required base_block (for example minecraft:dripstone_block)',
      inGameCheck:
        'Find your feature in a cave of a new world and check that its large speleothems are made of the base block you chose.',
    },
    {
      id: 'ids:worldgen/density_function_type/interpolated',
      rename: { to: 'upscale', shape: 'differs', dispatcher: 'minecraft:density_function' },
      sentence:
        'Minecraft 26.4 replaces the interpolated density function with upscale, which takes other fields.',
      hint: 'use minecraft:upscale and fill in its fields',
      inGameCheck:
        'Make a new world with your terrain and compare its shape with the same seed before the move.',
    },
    {
      id: 'ids:tag/entity_type/freeze_immune_entity_types',
      rename: { to: 'immune_to_freezing', shape: 'none' },
      sentence:
        'Minecraft 26.4 renames the entity type tag freeze_immune_entity_types to immune_to_freezing.',
      hint: 'use #minecraft:immune_to_freezing, its new name',
      inGameCheck: 'Check that the mobs of your tag freeze, or do not, in powder snow as before.',
    },
    {
      id: 'ids:tag/entity_type/ignores_poison_and_regen',
      sentence:
        'Minecraft 26.4 splits the entity type tag ignores_poison_and_regen into immune_to_poison and immune_to_regeneration.',
      hint: 'use #minecraft:immune_to_poison, #minecraft:immune_to_regeneration or both',
      inGameCheck: 'Check that poison and regeneration act on the mobs of your tag as before.',
    },
    {
      id: 'ids:texture/gui/sprites/friends/button',
      rename: { to: 'gui/sprites/friends/tab', shape: 'none' },
      hint: 'use minecraft:gui/sprites/friends/tab, its new name',
    },
    {
      id: 'ids:texture/gui/sprites/friends/button_highlighted',
      rename: { to: 'gui/sprites/friends/tab_highlighted', shape: 'none' },
      hint: 'use minecraft:gui/sprites/friends/tab_highlighted, its new name',
    },
    {
      id: 'ids:texture/gui/sprites/friends/loading',
      rename: { to: 'gui/sprites/widget/loading', shape: 'none' },
      hint: 'use minecraft:gui/sprites/widget/loading, its new name',
    },
    {
      id: 'ids:texture/gui/sprites/pause_menu/social_interactions',
      rename: { to: 'gui/sprites/pause_menu/feedback', shape: 'none' },
      hint: 'use minecraft:gui/sprites/pause_menu/feedback, its new name',
    },
    {
      id: 'ids:fluid/flowing_water',
      sentence:
        'Minecraft 26.4 has one water fluid: flowing water is no longer a fluid of its own.',
      hint: 'use minecraft:water',
    },
    {
      id: 'ids:fluid/flowing_lava',
      sentence: 'Minecraft 26.4 has one lava fluid: flowing lava is no longer a fluid of its own.',
      hint: 'use minecraft:lava',
    },
    {
      id: 'ids:particle_type/item_snowball',
      sentence: 'Minecraft 26.4 has no snowball particle.',
    },
    {
      id: 'ids:sound_event/intentionally_empty',
      sentence: 'Minecraft 26.4 has no intentionally_empty sound event.',
    },
    // Formats, commands and block states the examples use; news, nothing to do.
    ...SOUND_VARIANTS,
    ...ZOMBIE_FREEZING,
    ...POOL_CORNERS,
    ...EXPLODE_EFFECTS,
    {
      id: 'formats:minecraft:trunk_placer/straight_trunk_placer#/trunk_width',
      sentence:
        'Minecraft 26.4 adds the optional trunk_width to the straight trunk placer; trees without it need no change.',
      inGameCheck: 'Grow each of your trees from a sapling and look at its trunk.',
    },
    {
      id: 'formats:minecraft:block_predicate/matching_fluids#/state',
      sentence: 'Minecraft 26.4 adds the optional state to the matching fluids block predicate.',
      inGameCheck: 'Check that the places your block predicates allow are the same as before.',
    },
    {
      id: 'block-states:jukebox#playlist_mode',
      sentence: 'Minecraft 26.4 gives the jukebox a new block state, playlist_mode.',
      inGameCheck: 'Play each of your music discs in a jukebox and listen to it to the end.',
    },
    {
      id: 'commands:effect give <targets> <effect>',
      sentence: 'In Minecraft 26.4 /effect give also takes a tag of effects.',
      inGameCheck: 'Run the functions that give effects and check that each effect is given.',
    },
    {
      id: 'commands:effect clear <targets> <effect>',
      sentence: 'In Minecraft 26.4 /effect clear also takes a tag of effects.',
      inGameCheck: 'Run the functions that clear effects and check that each effect is cleared.',
    },
    // Pack formats: written by the export for the version the mod is made for.
    {
      id: 'packs:data_pack_format',
      sentence: 'Minecraft 26.4 has a new data pack format; MCSuperMods writes it when it exports.',
      inGameCheck:
        'Open the world with your data pack and check that the game does not mark it as made for another version.',
    },
    {
      id: 'packs:resource_pack_format',
      sentence:
        'Minecraft 26.4 has a new resource pack format; MCSuperMods writes it when it exports.',
      inGameCheck:
        "Look at your resource pack in the game's list and check that it is not marked as made for another version.",
    },
    {
      id: 'packs:data_version',
      sentence:
        'Minecraft 26.4 saves worlds with a new data version: a world opened there is upgraded and cannot go back to 26.3.',
    },
  ],
};
