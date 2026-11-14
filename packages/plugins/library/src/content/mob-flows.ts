/**
 * Shared parts of the mob Creator flows (ADR 0073 D2): Pet, Farm animal, Mount, Flying mob,
 * Water mob and Boss, and the variants of the Custom mob. Each flow writes ordinary
 * `msm:entity`, `msm:geo_model`, `msm:animation`, texture, loot table and language elements on
 * a preset model (ADR 0073 D1) with `renderer` `auto`, so it works with GeckoLib on a target
 * that has it and with the runtime's own renderer on one that has not (ADR 0072 D6).
 *
 * Variants (ADR 0071 D4) are an "Extra variants" count and up to three slots, each with a
 * colour, an optional picture and where it appears: the wizard has no list parameter, so the
 * slots stand in for "Add a variant".
 *
 * @packageDocumentation
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  JsonObject,
  StarterParameter,
} from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import {
  COLOURS,
  element,
  KINDS,
  modIdFromNamespace,
  PACK_NOTES,
  packElement,
  rl,
  texture,
} from './bundle';
import {
  MOB_PRESETS,
  type MobPresetName,
  presetAnimationFields,
  presetSkinPng,
} from './mob-presets';
import {
  decodePngDataUrl,
  hexFromRgb,
  imageValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  type NameForms,
  numberValue,
  type ParameterValues,
  rgbFromHex,
  stringValue,
} from './parameters';

/** The largest skin picture the mob flows accept. */
export const MOB_PICTURE_MAX_BYTES = 256 * 1024;

/** The most extra variants a flow offers. */
export const MOB_VARIANT_SLOTS = 3;

// Where mobs spawn ------------------------------------------------------------------------

/** One "Spawns in" choice: its biomes (none for spawn egg only) and the words the notes use. */
export interface SpawnChoice {
  value: string;
  label: string;
  /** Biome ids and tags; empty: the mob spawns only from its egg or a command. */
  biomes: readonly string[];
  /** For the notes: "every forest". */
  words: string;
}

/** Land biome groups, with "Nowhere" last. */
export const LAND_SPAWNS: readonly SpawnChoice[] = Object.freeze([
  { value: 'forests', label: 'Forests', biomes: ['#minecraft:is_forest'], words: 'every forest' },
  {
    value: 'plains',
    label: 'Plains and meadows',
    biomes: ['minecraft:plains', 'minecraft:sunflower_plains', 'minecraft:meadow'],
    words: 'plains and meadows',
  },
  { value: 'taigas', label: 'Taigas', biomes: ['#minecraft:is_taiga'], words: 'every taiga' },
  { value: 'jungles', label: 'Jungles', biomes: ['#minecraft:is_jungle'], words: 'every jungle' },
  {
    value: 'savannas',
    label: 'Savannas',
    biomes: ['#minecraft:is_savanna'],
    words: 'every savanna',
  },
  {
    value: 'mountains',
    label: 'Mountains',
    biomes: ['#minecraft:is_mountain'],
    words: 'every mountain biome',
  },
  {
    value: 'badlands',
    label: 'Badlands',
    biomes: ['#minecraft:is_badlands'],
    words: 'all badlands',
  },
  { value: 'beaches', label: 'Beaches', biomes: ['#minecraft:is_beach'], words: 'every beach' },
  {
    value: 'nowhere',
    label: 'Nowhere: spawn egg only',
    biomes: [],
    words: 'nowhere on its own',
  },
]);

/** Water biome groups, with "Nowhere" last. */
export const WATER_SPAWNS: readonly SpawnChoice[] = Object.freeze([
  { value: 'oceans', label: 'Oceans', biomes: ['#minecraft:is_ocean'], words: 'every ocean' },
  { value: 'rivers', label: 'Rivers', biomes: ['#minecraft:is_river'], words: 'every river' },
  {
    value: 'swamps',
    label: 'Swamps',
    biomes: ['minecraft:swamp', 'minecraft:mangrove_swamp'],
    words: 'swamps and mangrove swamps',
  },
  {
    value: 'nowhere',
    label: 'Nowhere: spawn egg only',
    biomes: [],
    words: 'nowhere on its own',
  },
]);

/** The "Spawns in" parameter over `choices`. */
export function spawnParameter(
  choices: readonly SpawnChoice[],
  defaultValue: string,
  group = 'Spawning',
): StarterParameter {
  return {
    id: 'spawn_biomes',
    label: 'Spawns in',
    group,
    type: 'choice',
    default: defaultValue,
    choices: choices.map((choice) => ({ value: choice.value, label: choice.label })),
  };
}

/** The chosen spawn group of `choices` (the first one for an unknown value). */
export function spawnChoice(values: ParameterValues, choices: readonly SpawnChoice[]): SpawnChoice {
  const value = stringValue(values, 'spawn_biomes');
  return choices.find((choice) => choice.value === value) ?? (choices[0] as SpawnChoice);
}

// Variants --------------------------------------------------------------------------------

/** Where a variant appears: anywhere, or in the listed biomes. */
export interface VariantPlace {
  value: string;
  label: string;
  biomes: readonly string[];
}

/** Variant places for land mobs, "Anywhere" first. */
export const LAND_VARIANT_PLACES: readonly VariantPlace[] = Object.freeze([
  { value: 'anywhere', label: 'Anywhere (random)', biomes: [] },
  {
    value: 'cold',
    label: 'Cold biomes',
    biomes: ['#minecraft:spawns_cold_variant_farm_animals'],
  },
  {
    value: 'warm',
    label: 'Warm biomes',
    biomes: ['#minecraft:spawns_warm_variant_farm_animals'],
  },
  { value: 'forests', label: 'Forests', biomes: ['#minecraft:is_forest'] },
  { value: 'taigas', label: 'Taigas', biomes: ['#minecraft:is_taiga'] },
  { value: 'jungles', label: 'Jungles', biomes: ['#minecraft:is_jungle'] },
  { value: 'savannas', label: 'Savannas', biomes: ['#minecraft:is_savanna'] },
  { value: 'mountains', label: 'Mountains', biomes: ['#minecraft:is_mountain'] },
  { value: 'badlands', label: 'Badlands', biomes: ['#minecraft:is_badlands'] },
]);

/** Variant places for water mobs, "Anywhere" first. */
export const WATER_VARIANT_PLACES: readonly VariantPlace[] = Object.freeze([
  { value: 'anywhere', label: 'Anywhere (random)', biomes: [] },
  {
    value: 'warm_oceans',
    label: 'Warm oceans',
    biomes: ['minecraft:warm_ocean', 'minecraft:lukewarm_ocean', 'minecraft:deep_lukewarm_ocean'],
  },
  {
    value: 'cold_oceans',
    label: 'Cold oceans',
    biomes: [
      'minecraft:cold_ocean',
      'minecraft:deep_cold_ocean',
      'minecraft:frozen_ocean',
      'minecraft:deep_frozen_ocean',
    ],
  },
  { value: 'rivers', label: 'Rivers', biomes: ['#minecraft:is_river'] },
  { value: 'swamps', label: 'Swamps', biomes: ['minecraft:swamp', 'minecraft:mangrove_swamp'] },
]);

/** The default colours of the three variant slots: library colours, so the skins are known. */
const VARIANT_COLOURS: readonly Rgb[] = [COLOURS.frost, COLOURS.slate, COLOURS.jade];

/**
 * The "Variants" step: how many extra looks the mob can spawn with, and per slot its colour,
 * an optional picture and where it appears.
 */
export function variantParameters(places: readonly VariantPlace[]): StarterParameter[] {
  const parameters: StarterParameter[] = [
    {
      id: 'variant_count',
      label: 'Extra variants',
      description:
        'How many other looks the mob can spawn with, besides its own skin (0 to 3). Each one below is used only when this number reaches it.',
      group: 'Variants',
      type: 'number',
      default: 0,
      min: 0,
      max: MOB_VARIANT_SLOTS,
      step: 1,
    },
  ];
  for (let slot = 1; slot <= MOB_VARIANT_SLOTS; slot += 1) {
    parameters.push(
      {
        id: `variant_${slot}_colour`,
        label: `Variant ${slot} colour`,
        description: `The colour of variant ${slot}'s placeholder skin.`,
        group: 'Variants',
        type: 'colour',
        default: hexFromRgb(VARIANT_COLOURS[slot - 1] as Rgb),
      },
      {
        id: `variant_${slot}_picture`,
        label: `Variant ${slot} picture`,
        description: `A skin PNG for variant ${slot}, the same size as the model's texture; leave it empty for the placeholder.`,
        group: 'Variants',
        type: 'image',
        default: null,
        maxBytes: MOB_PICTURE_MAX_BYTES,
        maxSize: 64,
      },
      {
        id: `variant_${slot}_biome`,
        label: `Variant ${slot} appears in`,
        group: 'Variants',
        type: 'choice',
        default: 'anywhere',
        choices: places.map((place) => ({ value: place.value, label: place.label })),
      },
    );
  }
  return parameters;
}

/** One extra variant of a mob. */
export interface MobVariant {
  /** The id saved in the mob's data, such as `variant_1`. */
  id: string;
  colour: Rgb;
  picture: string | null;
  /** Biomes where it is picked; empty: anywhere. */
  biomes: readonly string[];
  /** The place's label, for the notes. */
  place: string;
}

/** The extra variants the answers ask for. */
export function readVariants(
  values: ParameterValues,
  places: readonly VariantPlace[],
): MobVariant[] {
  const count = Math.max(
    0,
    Math.min(MOB_VARIANT_SLOTS, Math.floor(numberValue(values, 'variant_count'))),
  );
  const variants: MobVariant[] = [];
  for (let slot = 1; slot <= count; slot += 1) {
    const place =
      places.find((entry) => entry.value === stringValue(values, `variant_${slot}_biome`)) ??
      (places[0] as VariantPlace);
    variants.push({
      id: `variant_${slot}`,
      colour: rgbFromHex(
        stringValue(values, `variant_${slot}_colour`),
        VARIANT_COLOURS[slot - 1] as Rgb,
      ),
      picture: imageValue(values, `variant_${slot}_picture`),
      biomes: place.biomes,
      place: place.label.toLowerCase(),
    });
  }
  return variants;
}

// Shared parameters -----------------------------------------------------------------------

/** The name parameter of a mob flow. */
export function mobNameParameter(id: string, label: string, defaultName: string): StarterParameter {
  return {
    id,
    label,
    description: `The English name. Ids derive from it: ${defaultName} gives ${defaultName.toLowerCase().replace(/ /g, '_')}.`,
    group: 'Mob',
    type: 'string',
    default: defaultName,
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  };
}

/** The model parameter: a choice of `presets`, the first being the default. */
export function presetParameter(presets: readonly MobPresetName[]): StarterParameter {
  return {
    id: 'preset',
    label: 'Model',
    description: 'The shape of the mob. Import your own Blockbench model later to replace it.',
    group: 'Mob',
    type: 'choice',
    default: presets[0] as string,
    choices: presets.map((name) => ({
      value: name,
      label: `${MOB_PRESETS[name].label}: ${MOB_PRESETS[name].description.replace(/\.$/, '')}`,
    })),
  };
}

/** The chosen preset (the first of `presets` for an unknown value). */
export function presetValue(
  values: ParameterValues,
  presets: readonly MobPresetName[],
): MobPresetName {
  const value = stringValue(values, 'preset');
  return presets.find((name) => name === value) ?? (presets[0] as MobPresetName);
}

/** The colour and picture parameters of a mob's skin. */
export function skinParameters(colour: Rgb): StarterParameter[] {
  return [
    {
      id: 'colour',
      label: 'Colour',
      description: 'The colour of the placeholder skin and spawn egg.',
      group: 'Mob',
      type: 'colour',
      default: hexFromRgb(colour),
    },
    {
      id: 'picture',
      label: 'Skin picture',
      description:
        "A skin PNG of the model's texture size (64 by 64, or 64 by 32 for the bird and fish). Leave it empty for a placeholder in the colour.",
      group: 'Mob',
      type: 'image',
      default: null,
      maxBytes: MOB_PICTURE_MAX_BYTES,
      maxSize: 64,
    },
  ];
}

/** A number parameter of the "Behaviour" step. */
export function behaviourNumber(
  id: string,
  label: string,
  description: string,
  value: number,
  range: { min: number; max: number; step: number },
): StarterParameter {
  return {
    id,
    label,
    description,
    group: 'Behaviour',
    type: 'number',
    default: value,
    ...range,
  };
}

// Sizes -----------------------------------------------------------------------------------

/** The hitbox of each preset at scale 1, in blocks. */
const PRESET_SIZES: Readonly<Record<MobPresetName, { width: number; height: number }>> = {
  quadruped: { width: 0.9, height: 1.1 },
  bird: { width: 0.5, height: 0.9 },
  fish: { width: 0.5, height: 0.5 },
  flyer: { width: 0.8, height: 0.8 },
  biped: { width: 0.6, height: 1.95 },
  cube_creature: { width: 0.9, height: 1 },
};

/** The hitbox of `preset` drawn at `scale`, rounded to 0.05 blocks. */
export function presetSize(
  preset: MobPresetName,
  scale: number,
): { width: number; height: number } {
  const round = (value: number): number => Math.round(value * scale * 20) / 20;
  const size = PRESET_SIZES[preset];
  return { width: round(size.width), height: round(size.height) };
}

// The bundle ------------------------------------------------------------------------------

/**
 * A skin texture at `textures/<path>.png`: the picked PNG when it has the preset's texture
 * size, else the preset's placeholder skin in `colour`.
 */
export function presetSkinAsset(
  namespace: string,
  path: string,
  preset: MobPresetName,
  colour: Rgb,
  picture: string | null,
): ContentBundleAsset {
  const decoded = picture === null ? null : decodePngDataUrl(picture);
  const { width, height } = MOB_PRESETS[preset].texture;
  if (decoded !== null && decoded.width === width && decoded.height === height) {
    return { namespace, path: `textures/${path}.png`, bytes: decoded.bytes };
  }
  return { namespace, path: `textures/${path}.png`, bytes: presetSkinPng(preset, { colour }) };
}

/** The `msm:variants` component of a mob with extra `variants`, or `undefined` without any. */
export function variantsComponent(
  namespace: string,
  id: string,
  variants: readonly MobVariant[],
): JsonObject | undefined {
  if (variants.length === 0) return undefined;
  const byBiome = variants.some((variant) => variant.biomes.length > 0);
  return {
    choose: byBiome ? 'biome' : 'random',
    variants: [
      { id: 'default', texture: rl(namespace, `entity/${id}`) },
      ...variants.map((variant) => ({
        id: variant.id,
        texture: rl(namespace, `entity/${id}_${variant.id}`),
        ...(variant.biomes.length > 0 ? { biomes: [...variant.biomes] } : {}),
      })),
    ],
  };
}

/** Sentences on the variants, for the entity's notes; empty without any. */
export function variantNotes(variants: readonly MobVariant[]): string {
  if (variants.length === 0) return '';
  const byBiome = variants.some((variant) => variant.biomes.length > 0);
  const list = variants.map((variant) => `${variant.id} (${variant.place})`).join(', ');
  return byBiome
    ? ` msm:variants gives it ${variants.length + 1} looks picked by biome when it spawns: default and ${list}; a variant without biomes is picked where no other fits, and babies take a parent's look.`
    : ` msm:variants gives it ${variants.length + 1} looks picked at random when it spawns: default and ${list}; babies take a parent's look.`;
}

/** The mod note of the mob flows. */
export const MOB_MOD_NOTES =
  'The mod metadata, written to fabric.mod.json when you export the Fabric mod jar. New mobs exist only in that jar, which also needs Fabric API, msm_runtime and, on targets that have it, GeckoLib (nested in the jar unless you choose to keep them separate); without GeckoLib the runtime draws the mob itself. The mod id must stay unique among the mods you install.';

/** What a mob flow puts together. */
export interface MobFlowInput {
  context: Pick<BundleContext, 'namespace' | 'projectName'>;
  name: NameForms;
  preset: MobPresetName;
  colour: Rgb;
  picture: string | null;
  /** The render scale of the model; the hitbox follows it. */
  scale: number;
  /**
   * The entity data besides `format`, `display_name`, `size`, `spawn_egg` and `loot_table`;
   * `components` without `msm:animated_model` and `msm:variants`.
   */
  entity: JsonObject;
  variants: readonly MobVariant[];
  /** The loot table `<ns>:entities/<id>`, if the mob drops anything. */
  loot?: { data: JsonObject; notes: string };
  /** The mod's one-line description. */
  modDescription: string;
  /** The entity's notes, before the variant sentences. */
  entityNotes: string;
  /** More elements and assets, after the mob's own. */
  extra?: ContentBundle;
}

/**
 * A complete mob on a preset: pack, mod, entity (renderer `auto`, the preset's animation
 * fields), geo model, animation set, optional loot table, the skin, its variants' skins and the
 * spawn egg texture.
 */
export function mobFlowBundle(input: MobFlowInput): ContentBundle {
  const { namespace, projectName } = input.context;
  const { name, preset } = input;
  const facts = MOB_PRESETS[preset];
  const id = name.id;
  const model = rl(namespace, `entity/${id}`);
  const animations = rl(namespace, `entity/${id}_animations`);
  const egg = rl(namespace, `item/${id}_spawn_egg`);
  const loot = rl(namespace, `entities/${id}`);
  const components = (input.entity.components ?? {}) as JsonObject;
  const variants = variantsComponent(namespace, id, input.variants);
  const entityData: JsonObject = {
    format: 1,
    display_name: name.display,
    ...input.entity,
    size: presetSize(preset, input.scale),
    ...(input.loot === undefined ? {} : { loot_table: loot }),
    spawn_egg: { texture: egg },
    components: {
      ...components,
      ...(variants === undefined ? {} : { 'msm:variants': variants }),
      'msm:animated_model': {
        model,
        animations,
        texture: model,
        renderer: 'auto',
        ...(input.scale === 1 ? {} : { scale: input.scale }),
        ...presetAnimationFields(preset),
      },
    },
  };
  const states = facts.states.length === 0 ? '' : `, and ${facts.states.join(', ')}`;
  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: the ${name.display}, a new mob`, PACK_NOTES),
    element(
      rl(namespace, 'mod'),
      KINDS.mod,
      {
        mod_id: modIdFromNamespace(namespace),
        version: '1.0.0',
        name: projectName,
        description: input.modDescription,
        authors: [],
        licence: 'All-Rights-Reserved',
      },
      MOB_MOD_NOTES,
    ),
    element(
      rl(namespace, id),
      KINDS.entity,
      entityData,
      `${input.entityNotes}${variantNotes(input.variants)} msm:animated_model names the model, animation set and texture with renderer auto: GeckoLib draws it where the target has GeckoLib, the runtime's own renderer elsewhere. Export the Fabric mod jar to try it in game.`,
    ),
    element(
      model,
      KINDS.geoModel,
      facts.geometry(id),
      `The geo model, the ${facts.label.toLowerCase()} preset: bones ${facts.bones.join(', ')} over a ${facts.texture.width}x${facts.texture.height} texture.${facts.saddleBone === undefined ? '' : ` The ${facts.saddleBone} bone is the saddle, shown only while a rideable mob is saddled.`} Replace it with your own by importing a Blockbench model; keep the bone names, or update the animations to match.`,
    ),
    element(
      animations,
      KINDS.animation,
      facts.animations(),
      `The animation set: idle while standing and walk while moving${states}, each named after the state it plays in. Plain numbers and linear keyframes only, so both renderers play it fully.`,
    ),
  ];
  if (input.loot !== undefined) {
    elements.push(element(loot, KINDS.lootTable, input.loot.data, input.loot.notes));
  }
  const assets: ContentBundleAsset[] = [
    presetSkinAsset(namespace, `entity/${id}`, preset, input.colour, input.picture),
    ...input.variants.map((variant) =>
      presetSkinAsset(
        namespace,
        `entity/${id}_${variant.id}`,
        preset,
        variant.colour,
        variant.picture,
      ),
    ),
    texture(namespace, `item/${id}_spawn_egg`, 'egg', input.colour),
  ];
  return {
    elements: [...elements, ...(input.extra?.elements ?? [])],
    assets: [...assets, ...(input.extra?.assets ?? [])],
  };
}

/** The `spawn` field for `choice`, or nothing for "Nowhere". */
export function spawnField(
  choice: SpawnChoice,
  fields: { weight: number; min: number; max: number; rule: string; placement?: string },
): JsonObject {
  if (choice.biomes.length === 0) return {};
  return {
    spawn: {
      biomes: [...choice.biomes],
      weight: fields.weight,
      min_group: fields.min,
      max_group: fields.max,
      ...(fields.placement === undefined ? {} : { placement: fields.placement }),
      rule: fields.rule,
    },
  };
}

/** A loot table dropping 1 to `max` of `item` (cooked when the mob burns, for raw meat). */
export function dropLoot(item: string, max: number, cooked: boolean, table: string): JsonObject {
  return {
    type: 'minecraft:entity',
    pools: [
      {
        rolls: 1,
        entries: [
          {
            type: 'minecraft:item',
            name: item,
            modifier: [
              {
                type: 'minecraft:set_count',
                count: { type: 'minecraft:uniform', min: Math.min(1, max), max },
              },
              ...(cooked
                ? [
                    {
                      type: 'minecraft:furnace_smelt',
                      condition: {
                        type: 'minecraft:entity_properties',
                        entity: 'this',
                        predicate: { flags: { is_on_fire: true } },
                      },
                    },
                  ]
                : []),
            ],
          },
        ],
      },
    ],
    random_sequence: table,
  };
}

// Ranged attacks --------------------------------------------------------------------------

/** One projectile a flow's mob may shoot: a vanilla projectile item on every target. */
export interface ProjectileChoice {
  value: string;
  label: string;
  /** The sound of each shot. */
  sound: string;
  /** Arrows take a base damage; thrown items deal their own. */
  arrow: boolean;
}

/** The projectiles the flows offer, arrows first. */
export const PROJECTILES: readonly ProjectileChoice[] = Object.freeze([
  {
    value: 'minecraft:arrow',
    label: 'Arrows',
    sound: 'minecraft:entity.skeleton.shoot',
    arrow: true,
  },
  {
    value: 'minecraft:snowball',
    label: 'Snowballs',
    sound: 'minecraft:entity.snowball.throw',
    arrow: false,
  },
  {
    value: 'minecraft:fire_charge',
    label: 'Fire charges',
    sound: 'minecraft:entity.blaze.shoot',
    arrow: false,
  },
  {
    value: 'minecraft:wind_charge',
    label: 'Wind charges',
    sound: 'minecraft:entity.breeze.shoot',
    arrow: false,
  },
  { value: 'minecraft:egg', label: 'Eggs', sound: 'minecraft:entity.egg.throw', arrow: false },
]);

/** The "Projectile" parameter of the "Behaviour" step. */
export function projectileParameter(defaultValue: string, description: string): StarterParameter {
  return {
    id: 'projectile',
    label: 'Projectile',
    description,
    group: 'Behaviour',
    type: 'choice',
    default: defaultValue,
    choices: PROJECTILES.map(({ value, label }) => ({ value, label })),
  };
}

/** The chosen projectile (arrows for an unknown value). */
export function projectileValue(values: ParameterValues): ProjectileChoice {
  const value = stringValue(values, 'projectile');
  return PROJECTILES.find((entry) => entry.value === value) ?? (PROJECTILES[0] as ProjectileChoice);
}

/** The `msm:ranged_attack` component shooting `projectile`. */
export function rangedAttack(
  projectile: ProjectileChoice,
  fields: { damage: number; interval: number; range: number },
): JsonObject {
  return {
    projectile: projectile.value,
    ...(projectile.arrow ? { damage: fields.damage } : {}),
    speed: 1.6,
    inaccuracy: 6,
    interval_ticks: fields.interval,
    charge_ticks: 20,
    range: fields.range,
    sound: projectile.sound,
  };
}
