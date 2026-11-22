/**
 * The world examples (ADR 0119 D11): one World Type from each "Make a world" flow, with answers
 * of its own, without the pack element (an example is copied into a project that has one). Each
 * holds the World Type, its terrain files (noises, density functions and noise settings of
 * MSM's own), the `#minecraft:normal` world preset tag entry and the English name, so each is
 * mirrored as a project of its own under `examples/worlds/`. Every one draws on the live map
 * without the player's Minecraft files.
 */
import type { BundleContext, ContentBundle, ExampleProject, Json } from '@msm/plugin-api';
import { KINDS } from '../content/bundle';
import {
  worldCavesBundle,
  worldEmptySkyBundle,
  worldIslandsBundle,
  worldMountainsBundle,
  worldOneBiomeBundle,
} from '../starters/custom-world';
import { defineExample } from './define';

/** The gallery category of the world examples. */
export const WORLDS_CATEGORY = 'Worlds';

/** A flow's bundle with `values`, without its pack element. */
function fromFlow(
  build: (context: BundleContext) => ContentBundle,
  values: Readonly<Record<string, Json>>,
): (context: BundleContext) => ContentBundle {
  return (context) => {
    const bundle = build({ ...context, values: { ...values } });
    return {
      elements: bundle.elements.filter((entry) => entry.kind !== KINDS.pack),
      assets: bundle.assets,
    };
  };
}

export const worldExamples: readonly ExampleProject[] = Object.freeze([
  defineExample({
    id: 'example_world_coral_isles',
    title: 'Coral Isles',
    description:
      'Small islands far apart in a wide sea, with many trees: jungle and savanna, from the Islands flow.',
    kind: KINDS.worldPreset,
    category: WORLDS_CATEGORY,
    tags: ['world', 'islands'],
    build: fromFlow(worldIslandsBundle, {
      world_name: 'Coral Isles',
      island_size: 'small',
      sea: 'lots',
      biomes: ['jungle', 'dry'],
      trees: 'many',
    }),
  }),
  defineExample({
    id: 'example_world_frost_peaks',
    title: 'Frost Peaks',
    description:
      'Jagged mountains as tall as the world allows, snowy from low down, with snowy pine woods and bare stone, from the Tall mountains flow.',
    kind: KINDS.worldPreset,
    category: WORLDS_CATEGORY,
    tags: ['world', 'mountains'],
    build: fromFlow(worldMountainsBundle, {
      world_name: 'Frost Peaks',
      height: 'tallest',
      jagged: 'jagged',
      snow_line: 'low',
      biomes: ['snowy_pine', 'stony'],
    }),
  }),
  defineExample({
    id: 'example_world_endless_blossom',
    title: 'Endless Blossom',
    description:
      'A whole world of cherry grove over gentle hills and lakes, from the One biome everywhere flow.',
    kind: KINDS.worldPreset,
    category: WORLDS_CATEGORY,
    tags: ['world', 'biome'],
    build: fromFlow(worldOneBiomeBundle, {
      world_name: 'Endless Blossom',
      biome: 'minecraft:cherry_grove',
      shape: 'hills',
    }),
  }),
  defineExample({
    id: 'example_world_ember_caverns',
    title: 'Ember Caverns',
    description:
      'Deepslate caves under a roof of rock, with lava lakes at the bottom and shroomlight glowing on the cave roofs, from the Caves only flow.',
    kind: KINDS.worldPreset,
    category: WORLDS_CATEGORY,
    tags: ['world', 'caves'],
    build: fromFlow(worldCavesBundle, {
      world_name: 'Ember Caverns',
      top: 'roof',
      rock: 'minecraft:deepslate',
      lakes: 'lava',
      glow: 'shroomlight',
    }),
  }),
  defineExample({
    id: 'example_world_cloud_realm',
    title: 'Cloud Realm',
    description:
      'An empty sky that is all cherry grove, for a Skyblock, from the Empty sky with a start island flow; the start island comes with Skyblock.',
    kind: KINDS.worldPreset,
    category: WORLDS_CATEGORY,
    tags: ['world', 'skyblock'],
    build: fromFlow(worldEmptySkyBundle, {
      world_name: 'Cloud Realm',
      biome: 'minecraft:cherry_grove',
    }),
  }),
]);
