/**
 * The Fluid Creator flow (ADR 0101 D2, ADR 0099 D1): a new liquid. One `msm:fluid` element is
 * the fluid, its liquid block (the element id) and its bucket (`<id>_bucket`, made by lowering).
 * It behaves like water (you swim in it, it puts out fire) or like lava (it burns and glows), or
 * like neither, flows at the speed and distance picked and may make new sources. It is drawn
 * with vanilla's own moving water or lava pictures (named, never bundled) under the colour as a
 * tint, or with still pictures MSM draws in the colour, or with the user's picture; the bucket
 * picture is always MSM's own. Players inside may get an effect (an `on_entity_inside` event in
 * the fluid's own `events`). If chosen, lakes of it generate in the world: a `minecraft:lake`
 * feature, its placed feature (one in N chunks) and an `msm:biome_addition`. Ids derive from
 * `fluid_name`. Fluids need the Fabric mod jar export; the vanilla packs keep only the pictures,
 * models and language keys.
 *
 * Since ADR 0108 (B539), if chosen: where water touches it (lava, for a water-like liquid) it
 * turns into a block, as lava turns into obsidian and cobblestone (`mixing`, the same on both
 * targets once a rule is given), and it fills cauldrons and glass bottles (`cauldron` with three
 * levels and `bottle`, drunk like a potion and giving the effect picked for someone in it; a
 * lava-like liquid's cauldron fills all at once and it has no bottle).
 *
 * Limits (ADR 0099 D5, ADR 0108): no boats on it or waterlogging with it, and `like neither`
 * behaves differently on each target.
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
import { bucketItemPng, liquidPng } from '../assets/vanilla-parity/batch2';
import { element, KINDS, modElement, PACK_NOTES, packElement, rl } from '../content/bundle';
import {
  booleanValue,
  decodePngDataUrl,
  hexFromRgb,
  imageValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** Kind id of fluids, named by string (the library imports no plugin). */
const FLUID_KIND = 'msm:fluid';

/** The default colour: a fresh mint green. */
const MINT: Rgb = [60, 200, 140];

/** What the fluid behaves like, with the words the notes use. */
const BEHAVIOURS: readonly { value: 'water' | 'lava' | 'none'; label: string }[] = [
  { value: 'water', label: 'Like water: you swim in it and it puts out fire' },
  { value: 'lava', label: 'Like lava: it burns, glows and flows slowly' },
  { value: 'none', label: 'Like neither: you walk through it' },
];

/** Flow numbers per speed, for water-like and lava-like fluids. */
const SPEEDS: Readonly<Record<string, { water: number; lava: number; label: string }>> = {
  usual: { water: 5, lava: 30, label: 'As water or lava does' },
  quick: { water: 3, lava: 10, label: 'Quickly' },
  slow: { water: 20, lava: 60, label: 'Slowly, like honey' },
};

/** How far the fluid spreads on flat ground (slope distance and drop-off). */
const SPREADS: Readonly<Record<string, { slope: number; dropOff: number; label: string }>> = {
  usual: { slope: 0, dropOff: 0, label: 'As water or lava does' },
  far: { slope: 8, dropOff: 1, label: 'Far' },
  near: { slope: 2, dropOff: 3, label: 'Only a little' },
};

/** Effects players and mobs in the fluid can get. */
const EFFECTS: readonly { value: string; label: string }[] = [
  { value: 'none', label: 'Nothing' },
  { value: 'minecraft:regeneration', label: 'They heal' },
  { value: 'minecraft:speed', label: 'They move faster' },
  { value: 'minecraft:slowness', label: 'They slow down' },
  { value: 'minecraft:levitation', label: 'They float up' },
  { value: 'minecraft:poison', label: 'They are poisoned' },
];

/** What the liquid turns into where the other liquid touches it: a source, then flowing. */
const MIXES: readonly { value: string; label: string; source?: string; flowing?: string }[] = [
  { value: 'none', label: 'Nothing' },
  {
    value: 'obsidian',
    label: 'Obsidian and cobblestone, as lava',
    source: 'minecraft:obsidian',
    flowing: 'minecraft:cobblestone',
  },
  { value: 'stone', label: 'Stone', source: 'minecraft:stone', flowing: 'minecraft:stone' },
  { value: 'basalt', label: 'Basalt', source: 'minecraft:basalt', flowing: 'minecraft:basalt' },
  { value: 'mud', label: 'Mud', source: 'minecraft:mud', flowing: 'minecraft:mud' },
];

/** Where lakes of it can generate. */
const LAKE_PLACES: readonly { value: string; label: string; biomes: string[] }[] = [
  { value: 'overworld', label: 'Anywhere in the overworld', biomes: ['#minecraft:is_overworld'] },
  { value: 'deserts', label: 'Deserts', biomes: ['minecraft:desert'] },
  { value: 'swamps', label: 'Swamps', biomes: ['minecraft:swamp', 'minecraft:mangrove_swamp'] },
  { value: 'forests', label: 'Forests', biomes: ['#minecraft:is_forest'] },
  { value: 'badlands', label: 'Badlands', biomes: ['#minecraft:is_badlands'] },
];

/** The largest picture the flow takes. */
const PICTURE_MAX_BYTES = 64 * 1024;

/** The Fluid flow's questions, groups "Fluid", "Flowing" and "World". */
export const FLUID_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'fluid_name',
    label: 'What is it called?',
    description:
      'Ids derive from it: Mint Water gives mint_water and its bucket mint_water_bucket.',
    group: 'Fluid',
    type: 'string',
    default: 'Mint Water',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'behaves_like',
    label: 'How does it behave?',
    group: 'Fluid',
    type: 'choice',
    default: 'water',
    choices: BEHAVIOURS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'colour',
    label: 'Colour',
    group: 'Fluid',
    type: 'colour',
    default: hexFromRgb(MINT),
  },
  {
    id: 'look',
    label: 'Pictures',
    description:
      "Vanilla's moving water or lava in your colour, or still pictures drawn in your colour.",
    group: 'Fluid',
    type: 'choice',
    default: 'moving',
    choices: [
      { value: 'moving', label: 'Moving water or lava, in my colour' },
      { value: 'drawn', label: 'Still pictures drawn in my colour' },
    ],
  },
  {
    id: 'picture',
    label: 'My own picture',
    description:
      'A square PNG for the still and flowing liquid; leave it empty for the pictures above.',
    group: 'Fluid',
    type: 'image',
    default: null,
    maxBytes: PICTURE_MAX_BYTES,
    maxSize: 64,
  },
  {
    id: 'light',
    label: 'Light it gives',
    description: '0 to 15. 0 keeps the usual: none for water, 15 for lava.',
    group: 'Fluid',
    type: 'number',
    default: 0,
    min: 0,
    max: 15,
    step: 1,
  },
  {
    id: 'effect',
    label: 'What happens to someone in it?',
    group: 'Fluid',
    type: 'choice',
    default: 'none',
    choices: EFFECTS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'cauldron',
    label: 'Fills cauldrons and bottles',
    description:
      'Pour it into a cauldron with its bucket, and fill glass bottles from it to drink; a bottle gives the effect above. A lava-like liquid fills a cauldron all at once and has no bottle.',
    group: 'Fluid',
    type: 'boolean',
    default: false,
  },
  {
    id: 'speed',
    label: 'How fast does it flow?',
    group: 'Flowing',
    type: 'choice',
    default: 'usual',
    choices: Object.entries(SPEEDS).map(([value, { label }]) => ({ value, label })),
  },
  {
    id: 'spread',
    label: 'How far does it spread?',
    group: 'Flowing',
    type: 'choice',
    default: 'usual',
    choices: Object.entries(SPREADS).map(([value, { label }]) => ({ value, label })),
  },
  {
    id: 'sources',
    label: 'Two pools make a new one',
    description:
      'Water does this: a gap between two pools fills up for good, so a bucket never runs dry. Lava does not.',
    group: 'Flowing',
    type: 'choice',
    default: 'usual',
    choices: [
      { value: 'usual', label: 'As water or lava does' },
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    id: 'mixes_into',
    label: 'Mixes with water into',
    description:
      'What it turns into where water touches it, as lava turns into obsidian and cobblestone. A liquid that behaves like water mixes with lava instead.',
    group: 'Flowing',
    type: 'choice',
    default: 'none',
    choices: MIXES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'lakes',
    label: 'Lakes of it in the world',
    group: 'World',
    type: 'boolean',
    default: false,
  },
  {
    id: 'lake_biomes',
    label: 'Lakes appear in',
    group: 'World',
    type: 'choice',
    default: 'overworld',
    choices: LAKE_PLACES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'lake_rarity',
    label: 'One lake in how many chunks?',
    description: 'Vanilla lava lakes on the surface are one in 200.',
    group: 'World',
    type: 'number',
    default: 60,
    min: 4,
    max: 500,
    step: 1,
  },
]);

/** The ids a fluid of `id` in `namespace` writes. */
export function fluidIds(namespace: string, id: string) {
  return {
    fluid: rl(namespace, id),
    bucket: rl(namespace, `${id}_bucket`),
    still: rl(namespace, `block/${id}_still`),
    flowing: rl(namespace, `block/${id}_flow`),
    bucketPicture: rl(namespace, `item/${id}_bucket`),
    inside: rl(namespace, `${id}_inside`),
    lake: rl(namespace, `${id}_lake`),
    lakePlaced: rl(namespace, `${id}_lake_placed`),
    lakes: rl(namespace, `${id}_lakes`),
  };
}

/** An RGB colour as the number `tint` takes. */
const tintOf = (rgb: Rgb): number => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];

export function fluidBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(FLUID_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'fluid_name'));
  const behaviour =
    BEHAVIOURS.find((entry) => entry.value === stringValue(values, 'behaves_like')) ??
    (BEHAVIOURS[0] as (typeof BEHAVIOURS)[number]);
  const lavaLike = behaviour.value === 'lava';
  const colour = rgbFromHex(stringValue(values, 'colour'), MINT);
  const picked = imageValue(values, 'picture');
  const decoded = picked === null ? null : decodePngDataUrl(picked);
  const own = decoded !== null && decoded.width === decoded.height ? decoded.bytes : null;
  const drawn = own === null && stringValue(values, 'look') === 'drawn';
  const moving = own === null && !drawn;
  const light = Math.round(numberValue(values, 'light'));
  const effect = EFFECTS.find((entry) => entry.value === stringValue(values, 'effect'));
  const speed = SPEEDS[stringValue(values, 'speed')] ?? (SPEEDS.usual as (typeof SPEEDS)[string]);
  const spread =
    SPREADS[stringValue(values, 'spread')] ?? (SPREADS.usual as (typeof SPREADS)[string]);
  const sources = stringValue(values, 'sources');
  const lakes = booleanValue(values, 'lakes');
  const place =
    LAKE_PLACES.find((entry) => entry.value === stringValue(values, 'lake_biomes')) ??
    (LAKE_PLACES[0] as (typeof LAKE_PLACES)[number]);
  const rarity = Math.max(4, Math.round(numberValue(values, 'lake_rarity')));
  const ids = fluidIds(namespace, name.id);
  const mix = MIXES.find((entry) => entry.value === stringValue(values, 'mixes_into'));
  const mixWith = behaviour.value === 'water' ? 'lava' : 'water';
  const cauldron = booleanValue(values, 'cauldron');

  // Water's numbers are 5, 4, 1 and infinite, lava's 30, 2, 2 and not (ADR 0099 D1).
  const usual = lavaLike
    ? { slope: 2, dropOff: 2, infinite: false }
    : { slope: 4, dropOff: 1, infinite: true };
  const flow = {
    tick_delay: lavaLike ? speed.lava : speed.water,
    slope_distance: spread.slope === 0 ? usual.slope : spread.slope,
    drop_off: spread.dropOff === 0 ? usual.dropOff : spread.dropOff,
    infinite: sources === 'yes' ? true : sources === 'no' ? false : usual.infinite,
  };
  const textures: JsonObject = moving
    ? lavaLike
      ? {
          still: 'minecraft:block/lava_still',
          flowing: 'minecraft:block/lava_flow',
          bucket: ids.bucketPicture,
        }
      : {
          still: 'minecraft:block/water_still',
          flowing: 'minecraft:block/water_flow',
          overlay: 'minecraft:block/water_overlay',
          bucket: ids.bucketPicture,
        }
    : { still: ids.still, flowing: ids.flowing, bucket: ids.bucketPicture };
  const data: JsonObject = {
    format: 1,
    display_name: name.display,
    bucket_display_name: `Bucket of ${name.display}`,
    behaves_like: behaviour.value,
    flow,
    ...(light > 0 ? { light } : {}),
    ...(moving ? { tint: tintOf(colour) } : {}),
    textures,
  };
  if (mix?.source !== undefined) {
    data.mixing = [{ with: mixWith, source: mix.source, flowing: mix.flowing ?? mix.source }];
  }
  if (cauldron) {
    data.cauldron_display_name = `${name.display} Cauldron`;
    if (lavaLike) {
      data.cauldron = {};
    } else {
      data.cauldron = { levels: true };
      data.bottle_display_name = `Bottle of ${name.display}`;
      data.bottle =
        effect !== undefined && effect.value !== 'none'
          ? { effects: [{ effect: effect.value, seconds: 30 }] }
          : {};
    }
  }
  if (effect !== undefined && effect.value !== 'none') {
    data.on_entity_inside = ids.inside;
    data.events = {
      [ids.inside]: {
        actions: [
          { type: 'apply_effect', effect: effect.value, seconds: 3, amplifier: 0, target: 'other' },
        ],
      },
    };
  }

  const how =
    behaviour.value === 'water'
      ? 'It behaves like water: it joins the water tag, so players and mobs swim in it, drown in it and are put out when burning'
      : behaviour.value === 'lava'
        ? 'It behaves like lava: it joins the lava tag, sets players and mobs on fire and hurts them'
        : 'It behaves like neither water nor lava: players walk through it';
  const lookWords = moving
    ? `It is drawn with vanilla's moving ${lavaLike ? 'lava' : 'water'} pictures under the tint ${hexFromRgb(colour)}; give it pictures of its own in textures to change that`
    : 'It is drawn with its own still and flowing pictures';
  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower}, a new liquid`, PACK_NOTES),
    modElement(namespace, projectName, `Adds ${name.lower}, a new liquid, and its bucket.`),
    element(
      ids.fluid,
      FLUID_KIND,
      data,
      `A new liquid with its block (${ids.fluid}) and its bucket (${ids.bucket}), made from this one element. ${how}. It flows one block every ${flow.tick_delay} ticks (tick_delay), finds slopes up to ${flow.slope_distance} blocks away (slope_distance) and loses ${flow.drop_off} level${flow.drop_off === 1 ? '' : 's'} with every block it flows (drop_off); ${flow.infinite ? 'a gap between two pools fills up for good (infinite)' : 'it never makes new sources'}.${light > 0 ? ` It gives light of level ${light}.` : ''} ${lookWords}; the bucket has a picture of its own.${mix?.source === undefined ? '' : ` Where ${mixWith} touches it, a source turns into ${mix.source} and flowing ${name.lower} into ${mix.flowing ?? mix.source}, with lava's fizz (mixing).`}${!cauldron ? '' : lavaLike ? ` Its bucket fills an empty cauldron, which becomes ${ids.fluid}_cauldron, full at once as lava's is (cauldron), and the bucket takes it back.` : ` Its bucket fills an empty cauldron, which becomes ${ids.fluid}_cauldron with three levels as water's has (cauldron levels true); a glass bottle takes one level, or fills from a source, giving ${ids.fluid}_bottle, drunk in 1.6 seconds as a potion${effect !== undefined && effect.value !== 'none' ? ` and giving ${effect.value} for 30 seconds (bottle effects)` : ''}.`}${data.on_entity_inside === undefined ? '' : ` Anyone in it gets ${effect?.label.toLowerCase().replace(/^they /, '')} for three seconds: on_entity_inside names the event ${ids.inside}, declared in events, fired at most every ten ticks for each one inside.`} Fluids need the Fabric mod jar export.`,
    ),
  ];
  const assets: ContentBundleAsset[] = [
    { namespace, path: `textures/item/${name.id}_bucket.png`, bytes: bucketItemPng(colour) },
  ];
  if (!moving) {
    assets.push(
      {
        namespace,
        path: `textures/block/${name.id}_still.png`,
        bytes: own ?? liquidPng(colour, false),
      },
      {
        namespace,
        path: `textures/block/${name.id}_flow.png`,
        bytes: own ?? liquidPng(colour, true),
      },
    );
  }
  if (lakes) elements.push(...lakeElements(ids, name.lower, place, rarity));
  return { elements, assets };
}

/** A block predicate: the block is not in `tag`. */
const notInTag = (tag: string): JsonObject => ({
  type: 'minecraft:not',
  predicate: { type: 'minecraft:matching_block_tag', tag },
});

/**
 * A `minecraft:lake` feature of the liquid block `fluid` lined with `barrier`: it may be placed
 * anywhere, never hollows out or lines blocks features cannot replace, and never lines blocks
 * lava pools leave alone.
 */
export function lakeFeatureData(fluid: string, barrier: string): JsonObject {
  return {
    type: 'minecraft:lake',
    fluid: { type: 'minecraft:simple', state: fluid },
    barrier: { type: 'minecraft:simple', state: barrier },
    can_place_feature: { type: 'minecraft:true' },
    can_replace_with_air_or_fluid: notInTag('minecraft:features_cannot_replace'),
    can_replace_with_barrier: {
      type: 'minecraft:all_of',
      predicates: [
        notInTag('minecraft:features_cannot_replace'),
        notInTag('minecraft:lava_pool_stone_cannot_replace'),
      ],
    },
  };
}

/** The lake feature, its placed feature and the world addition that adds it to `place`. */
function lakeElements(
  ids: ReturnType<typeof fluidIds>,
  lower: string,
  place: (typeof LAKE_PLACES)[number],
  rarity: number,
): ContentBundleElement[] {
  return [
    element(
      ids.lake,
      KINDS.feature,
      lakeFeatureData(ids.fluid, 'minecraft:stone'),
      `A lake of ${lower}: the lake feature hollows out a rounded pool, fills it with the liquid block (fluid) and lines its edges with stone (barrier) where the liquid would leak out. The three predicates keep it away from blocks features never replace (#minecraft:features_cannot_replace, and for the stone lining #minecraft:lava_pool_stone_cannot_replace). On its own a feature places nothing: the placed feature ${ids.lakePlaced} says where and how often.`,
    ),
    element(
      ids.lakePlaced,
      KINDS.placedFeature,
      {
        feature: ids.lake,
        placement: [
          { type: 'minecraft:rarity_filter', chance: rarity },
          { type: 'minecraft:in_square' },
          { type: 'minecraft:heightmap', heightmap: 'WORLD_SURFACE_WG' },
          { type: 'minecraft:biome' },
        ],
      },
      `Where lakes go: one chunk in ${rarity} tries (rarity_filter), at a random spot in the chunk (in_square), on the surface (heightmap). The biome filter keeps it to the biomes that list it.`,
    ),
    element(
      ids.lakes,
      KINDS.biomeAddition,
      {
        format: 1,
        biomes: [...place.biomes],
        features: [{ feature: ids.lakePlaced, step: 'lakes' }],
      },
      `A world addition: it adds the placed feature ${ids.lakePlaced} to ${place.label.toLowerCase()} at the lakes step, as vanilla lakes are. Only chunks generated after you install the mod get lakes, so explore new land or start a new world. World additions need the Fabric mod jar export.`,
    ),
  ];
}
