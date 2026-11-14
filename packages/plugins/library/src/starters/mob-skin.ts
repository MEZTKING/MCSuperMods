/**
 * The Mob skin Creator flow (ADR 0064 D6): a new variant of a vanilla wolf, cat, pig, cow,
 * chicken or frog with tinted placeholder textures of the vanilla sizes (wolves get tame and
 * angry looks, babies their own texture) and where it appears: in one chosen biome or biome
 * tag with priority 1, or everywhere with priority 0, mixed in with the vanilla skins. Data
 * only, so it works in a vanilla data and resource pack. The variant id derives from
 * `skin_name`.
 */
import type { BundleContext, ContentBundle, StarterParameter } from '@msm/plugin-api';
import { COLOURS, element, PACK_NOTES, packElement, rl } from '../content/bundle';
import {
  mobSkinVariant,
  SKIN_ANIMALS,
  type SkinAnimal,
  spawnConditions,
} from '../content/mob-skins';
import {
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** The animals, in choice order. */
const ANIMALS: readonly { value: SkinAnimal; label: string }[] = [
  { value: 'wolf', label: 'Wolf' },
  { value: 'cat', label: 'Cat' },
  { value: 'pig', label: 'Pig' },
  { value: 'cow', label: 'Cow' },
  { value: 'chicken', label: 'Chicken' },
  { value: 'frog', label: 'Frog' },
];

/**
 * The biomes and biome tags the skin can be tied to. Checked against each target's biome
 * registry and biome tags in the tests.
 */
export const MOB_SKIN_BIOMES: readonly { value: string; label: string }[] = Object.freeze([
  { value: '#minecraft:is_forest', label: 'Forests' },
  { value: '#minecraft:is_taiga', label: 'Taigas' },
  { value: 'minecraft:snowy_taiga', label: 'Snowy taiga' },
  { value: 'minecraft:grove', label: 'Grove' },
  { value: '#minecraft:is_savanna', label: 'Savannas' },
  { value: '#minecraft:is_badlands', label: 'Badlands' },
  { value: '#minecraft:is_jungle', label: 'Jungles' },
  { value: 'minecraft:plains', label: 'Plains' },
  { value: 'minecraft:meadow', label: 'Meadow' },
  { value: 'minecraft:cherry_grove', label: 'Cherry grove' },
  { value: 'minecraft:flower_forest', label: 'Flower forest' },
  { value: 'minecraft:swamp', label: 'Swamp' },
  { value: 'minecraft:mangrove_swamp', label: 'Mangrove swamp' },
]);

/** The Mob skin flow's questions, groups "Skin" and "Where". */
export const MOB_SKIN_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'skin_name',
    label: 'Name',
    description: 'A name for the skin. Its id derives from it: Ember Coat gives ember_coat.',
    group: 'Skin',
    type: 'string',
    default: 'Ember Coat',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'animal',
    label: 'Animal',
    description: 'The vanilla animal that gets the new skin.',
    group: 'Skin',
    type: 'choice',
    default: 'wolf',
    choices: ANIMALS.map((entry) => ({ ...entry })),
  },
  {
    id: 'colour',
    label: 'Colour',
    description:
      'The colour of the placeholder textures, made at the size the animal needs. Paint over them, or use Picture to texture, to make the skin.',
    group: 'Skin',
    type: 'colour',
    default: hexFromRgb(COLOURS.amber),
  },
  {
    id: 'where',
    label: 'Where it appears',
    description:
      'In one biome, where it joins the vanilla skins of that biome, or everywhere the animal spawns, mixed in where no biome skin applies.',
    group: 'Where',
    type: 'choice',
    default: 'biome',
    choices: [
      { value: 'biome', label: 'In a biome' },
      { value: 'everywhere', label: 'Everywhere' },
    ],
  },
  {
    id: 'biome',
    label: 'Biome',
    description: 'Used when Where it appears is In a biome. The animal must spawn there.',
    group: 'Where',
    type: 'choice',
    default: '#minecraft:is_forest',
    choices: MOB_SKIN_BIOMES.map((entry) => ({ ...entry })),
  },
]);

export function mobSkinBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(MOB_SKIN_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'skin_name'));
  const animal =
    ANIMALS.find((entry) => entry.value === stringValue(values, 'animal'))?.value ?? 'wolf';
  const facts = SKIN_ANIMALS[animal];
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.amber);
  const everywhere = stringValue(values, 'where') === 'everywhere';
  const biome =
    MOB_SKIN_BIOMES.find((entry) => entry.value === stringValue(values, 'biome')) ??
    (MOB_SKIN_BIOMES[0] as { value: string; label: string });

  const id = rl(namespace, name.id);
  const built = mobSkinVariant(
    animal,
    namespace,
    name.id,
    colour,
    spawnConditions(everywhere ? undefined : biome.value),
  );
  const textureWords = facts.wolfLayout
    ? `six textures: wild, tame and angry, each for a grown wolf (${facts.adult.width} by ${facts.adult.height} pixels) and a pup (${facts.baby?.width} by ${facts.baby?.height})`
    : facts.baby === undefined
      ? `one texture (${facts.adult.width} by ${facts.adult.height} pixels)`
      : `a texture for a grown ${facts.label} (${facts.adult.width} by ${facts.adult.height} pixels) and one for a baby (${facts.baby.width} by ${facts.baby.height})`;
  const whereWords = everywhere
    ? 'One spawn condition with priority 0 and no condition mixes it in wherever no biome skin of a higher priority applies.'
    : `Its spawn condition ties it to ${biome.label.toLowerCase()} (${biome.value}) with priority 1, so it joins the vanilla skins of that biome; the game picks among the matching skins of the highest priority.`;
  const notes = `A new ${facts.label} skin with ${textureWords}, under textures/entity/${animal}/. ${whereWords} ${facts.spawns} Paint over the placeholders, keeping their size, to make the skin. Try /summon minecraft:${animal} ~ ~ ~ {variant:"${id}"}.`;
  return {
    elements: [
      packElement(namespace, `${projectName}: ${name.lower} ${facts.label} skin`, PACK_NOTES),
      element(id, facts.kind, built.data, notes),
    ],
    assets: built.assets,
  };
}
