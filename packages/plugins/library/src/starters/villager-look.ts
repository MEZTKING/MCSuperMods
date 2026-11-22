/**
 * The Villager look Creator flow (ADR 0112 D2, ADR 0107 D5; B539): a new look for vanilla's
 * villagers and zombie villagers born or spawned in the biomes picked, as one
 * `msm:villager_type`. Its pictures, clothes in the colours picked over the villager's body and
 * long coat, are drawn by MSM's art generator (the `villager_robe` recipe, ADR 0092) and saved
 * where the game reads them (`textures/entity/villager/type/<id>.png` and
 * `textures/entity/zombie_villager/type/<id>.png`), so the game draws them with no code of the
 * mod's own. A look brings no trades of its own (limit N11, as vanilla's).
 *
 * The biome may be one a vanilla look already has (the plains, say): the project's look then
 * takes it over, the first project look in a biome winning (ADR 0107's vetoable default). Ids
 * derive from `look_name`. Villager looks need the Fabric mod jar export.
 */
import type { BundleContext, ContentBundle, StarterParameter } from '@msm/plugin-api';
import { artLookPng } from '../art/draw';
import type { Rgb } from '../assets/png';
import { artSeed, element, modElement, PACK_NOTES, packElement, rl } from '../content/bundle';
import {
  booleanValue,
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** The villager type kind (ADR 0107 D5), named by string (the library imports no plugin). */
const VILLAGER_TYPE_KIND = 'msm:villager_type';

/** The default clothes: cherry blossom pink with a cream hem. */
const BLOSSOM: Rgb = [214, 120, 150];
const CREAM: Rgb = [232, 220, 180];

/** Where villagers wear the look: biomes vanilla gives no look of their own, then a few it does. */
export const VILLAGER_LOOK_PLACES: readonly { value: string; label: string; biomes: string[] }[] =
  Object.freeze([
    { value: 'cherry_grove', label: 'Cherry groves', biomes: ['minecraft:cherry_grove'] },
    { value: 'meadow', label: 'Meadows', biomes: ['minecraft:meadow'] },
    {
      value: 'birch_forest',
      label: 'Birch forests',
      biomes: ['minecraft:birch_forest', 'minecraft:old_growth_birch_forest'],
    },
    { value: 'dark_forest', label: 'Dark forests', biomes: ['minecraft:dark_forest'] },
    { value: 'mushroom', label: 'Mushroom fields', biomes: ['minecraft:mushroom_fields'] },
    { value: 'badlands', label: 'Badlands', biomes: ['#minecraft:is_badlands'] },
    {
      value: 'flower_forest',
      label: 'Flower forests and sunflower plains',
      biomes: ['minecraft:flower_forest', 'minecraft:sunflower_plains'],
    },
  ]);

/** The Villager look's questions, group "Look". */
export const VILLAGER_LOOK_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'look_name',
    label: 'What is the look called?',
    description:
      'Only for you: villagers show no name for it. Ids derive from it: Blossom gives blossom.',
    group: 'Look',
    type: 'string',
    default: 'Blossom',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'place',
    label: 'Where villagers wear it',
    description: 'Villagers born or spawned there wear this look, and so do zombie villagers.',
    group: 'Look',
    type: 'choice',
    default: 'cherry_grove',
    choices: VILLAGER_LOOK_PLACES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'colour',
    label: 'Clothes colour',
    group: 'Look',
    type: 'colour',
    default: hexFromRgb(BLOSSOM),
  },
  {
    id: 'trim_colour',
    label: 'Hem colour',
    group: 'Look',
    type: 'colour',
    default: hexFromRgb(CREAM),
  },
  {
    id: 'sash',
    label: 'A sash',
    description: 'A band of the hem colour across the middle and down the front of the coat.',
    group: 'Look',
    type: 'boolean',
    default: true,
  },
]);

/** The ids a look of `id` in `namespace` writes. */
export function villagerLookIds(namespace: string, id: string) {
  return {
    type: rl(namespace, id),
    villager: rl(namespace, `entity/villager/type/${id}`),
    zombie: rl(namespace, `entity/zombie_villager/type/${id}`),
  };
}

export function villagerLookBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(VILLAGER_LOOK_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'look_name'));
  const place =
    VILLAGER_LOOK_PLACES.find((entry) => entry.value === stringValue(values, 'place')) ??
    (VILLAGER_LOOK_PLACES[0] as (typeof VILLAGER_LOOK_PLACES)[number]);
  const colour = rgbFromHex(stringValue(values, 'colour'), BLOSSOM);
  const trim = rgbFromHex(stringValue(values, 'trim_colour'), CREAM);
  const sash = booleanValue(values, 'sash');
  const ids = villagerLookIds(namespace, name.id);
  const path = `entity/villager/type/${name.id}`;
  const picture = artLookPng({
    recipe: 'villager_robe',
    colour,
    accent: trim,
    finish: sash ? 'sash' : 'hem',
    seed: artSeed(namespace, path, 'villager_robe'),
  });
  return {
    elements: [
      packElement(namespace, `${projectName}: the ${name.lower} villager look`, PACK_NOTES),
      modElement(
        namespace,
        projectName,
        `Adds the ${name.lower} look for villagers of ${place.label.toLowerCase()}.`,
      ),
      element(
        ids.type,
        VILLAGER_TYPE_KIND,
        {
          format: 1,
          biomes: [...place.biomes],
          textures: { villager: ids.villager, zombie_villager: ids.zombie },
        },
        `A villager look (villager type): villagers born or spawned in ${place.label.toLowerCase()} (biomes) wear it, drawn over the villager's own skin and under its job's apron. The pictures in textures already sit where the game reads them (textures/entity/villager/type/${name.id}.png and the zombie villager's textures/entity/zombie_villager/type/${name.id}.png), drawn by MSM in your colours; zombie villagers of those biomes wear it too. A look brings no trades of its own. Villager looks need the Fabric mod jar export.`,
      ),
    ],
    assets: [
      { namespace, path: `textures/${path}.png`, bytes: picture },
      { namespace, path: `textures/entity/zombie_villager/type/${name.id}.png`, bytes: picture },
    ],
  };
}
