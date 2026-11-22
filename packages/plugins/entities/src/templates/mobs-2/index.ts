/**
 * "New element" templates of ADR 0109 (fish buckets, flight and the five habits; category
 * "Entities") and ADR 0107 D5 (a villager look; category "Villagers and traders"). They use
 * vanilla ids only (vanilla's own loot tables for bartering and digging), plus ids derived from
 * the new element's own id: the mobs' model `<ns>:entity/<path>`, animation set
 * `<ns>:entity/<path>_animations`, texture `<ns>:entity/<path>` and egg texture
 * `<ns>:item/<path>_spawn_egg`, the bucket picture `<ns>:item/<path>_bucket`, and the villager
 * look's pictures `<ns>:entity/villager/type/<path>` and `<ns>:entity/zombie_villager/type/<path>`
 * (the places the game reads them from). None of those exist until the user adds them, so the
 * validators report them; each description says so.
 */
import type { ElementTemplate, JsonObject, TemplateContext } from '@msm/plugin-api';
import { ENTITY_KIND, VILLAGER_TYPE_KIND } from '../../kinds';
import { villagerTypeTextureId } from '../../lowering/villager-type';
import { displayName } from '../index';
import { VILLAGER_TEMPLATE_CATEGORY } from '../villagers';

/** The picker category of the mob templates, as the other mob templates. */
export const MOB2_TEMPLATE_CATEGORY = 'Entities';

const MODEL_NOTE =
  'Its model and animations are named after the mob and are reported missing until you add or import them (for example from Blockbench).';

/** The `msm:animated_model` of a mob template, with ids derived from the element's own id. */
function mobModel(context: TemplateContext, states: readonly string[]): JsonObject {
  const own = `${context.namespace}:entity/${context.path}`;
  return {
    model: own,
    animations: `${own}_animations`,
    texture: own,
    renderer: 'auto',
    idle: 'idle',
    walk: 'walk',
    ...Object.fromEntries(states.map((state) => [state, state])),
  };
}

const eggTexture = (context: TemplateContext): string =>
  `${context.namespace}:item/${context.path}_spawn_egg`;

/** The bucket picture of the bucket fish template: `<ns>:item/<path>_bucket`. */
export const bucketTextureId = (context: Pick<TemplateContext, 'namespace' | 'path'>): string =>
  `${context.namespace}:item/${context.path}_bucket`;

const LOOKING_ABOUT = [{ type: 'wander' }, { type: 'look_at_player' }, { type: 'look_around' }];

const HOSTILE = { targets: ['minecraft:player'], retaliate: true };

export const mob2Templates: readonly ElementTemplate[] = Object.freeze([
  {
    id: 'msm_entity_bucket_fish',
    kind: ENTITY_KIND,
    category: MOB2_TEMPLATE_CATEGORY,
    title: 'Bucket fish',
    description: `A small fish you catch by using a water bucket on it, as vanilla's cod and axolotls: the bucket keeps its name and health, and using the bucket lets it out with the water. When badly hurt it plays dead for a while and recovers. Spawns in rivers, with a spawn egg. The bucket's picture is reported missing until you add it. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      category: 'water_ambient',
      size: { width: 0.5, height: 0.3 },
      spawn: {
        biomes: ['#minecraft:is_river'],
        weight: 8,
        min_group: 2,
        max_group: 4,
        placement: 'in_water',
        rule: 'water_animal',
      },
      spawn_egg: { texture: eggTexture(context) },
      bucket_texture: bucketTextureId(context),
      components: {
        'msm:health': { max: 6 },
        'msm:movement': { speed: 1, mode: 'swim', breathes_air: false, dry_out_ticks: 300 },
        'msm:bucketable': {},
        'msm:ai_goals': {
          goals: [
            { type: 'play_dead', below_health: 0.5, ticks: 200 },
            {
              type: 'flee',
              from: ['minecraft:player'],
              distance: 6,
              speed: 1.4,
              sprint_speed: 1.2,
            },
            { type: 'wander', speed: 1 },
          ],
        },
        'msm:animated_model': mobModel(context, ['swim']),
      },
    }),
  },
  {
    id: 'msm_entity_hovering',
    kind: ENTITY_KIND,
    category: MOB2_TEMPLATE_CATEGORY,
    title: 'Hovering creature',
    description: `A peaceful creature that floats four blocks above the ground, as a ghast or a blaze, drifting about without falling. Spawns in meadows, with a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      category: 'creature',
      size: { width: 1, height: 1 },
      spawn: {
        biomes: ['minecraft:meadow'],
        weight: 3,
        min_group: 1,
        max_group: 2,
        rule: 'animal',
      },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 14 },
        'msm:movement': { speed: 0.2, mode: 'hover', flying_speed: 0.3, hover_height: 4 },
        'msm:ai_goals': { goals: structuredClone(LOOKING_ABOUT) },
        'msm:animated_model': mobModel(context, ['fly']),
      },
    }),
  },
  {
    id: 'msm_entity_swooping',
    kind: ENTITY_KIND,
    category: MOB2_TEMPLATE_CATEGORY,
    title: 'Swooping flyer',
    description: `A phantom-like monster that circles high above a player, then dives and bites. Spawns in the dark, with a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      base: 'monster',
      category: 'monster',
      size: { width: 0.9, height: 0.5 },
      spawn: {
        biomes: ['#minecraft:is_overworld'],
        weight: 5,
        min_group: 1,
        max_group: 2,
        rule: 'monster',
      },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 20 },
        'msm:movement': { speed: 0.3, mode: 'fly', flying_speed: 0.6, hovers: false },
        'msm:attack': { damage: 2 },
        'msm:ai_goals': {
          goals: [
            { type: 'swoop', speed: 1, height: 12, ...structuredClone(HOSTILE) },
            { type: 'wander', speed: 1 },
            { type: 'look_around' },
          ],
        },
        'msm:animated_model': mobModel(context, ['fly', 'attack']),
      },
    }),
  },
  {
    id: 'msm_entity_phasing',
    kind: ENTITY_KIND,
    category: MOB2_TEMPLATE_CATEGORY,
    title: 'Phasing spirit',
    description: `A vex-like monster that flies at players and passes through walls while it charges. With a spawn egg; it does not spawn on its own. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      base: 'monster',
      category: 'monster',
      size: { width: 0.4, height: 0.8 },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 14 },
        'msm:movement': { speed: 0.3, mode: 'phase', flying_speed: 0.6 },
        'msm:attack': { damage: 4 },
        'msm:ai_goals': {
          goals: [
            { type: 'melee_attack', speed: 1, ...structuredClone(HOSTILE) },
            { type: 'wander', speed: 1 },
            { type: 'look_at_player', distance: 8 },
          ],
        },
        'msm:animated_model': mobModel(context, ['fly', 'attack']),
      },
    }),
  },
  {
    id: 'msm_entity_roosting',
    kind: ENTITY_KIND,
    category: MOB2_TEMPLATE_CATEGORY,
    title: 'Roosting flyer',
    description: `A bat-like ambient flyer that hangs upside down under a block through the day and flutters about at night; it lets go when a player comes near. Spawns across the Overworld, without a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      category: 'ambient',
      size: { width: 0.5, height: 0.9 },
      spawn: {
        biomes: ['#minecraft:is_overworld'],
        weight: 10,
        min_group: 2,
        max_group: 6,
      },
      spawn_egg: false,
      components: {
        'msm:health': { max: 6 },
        'msm:movement': { speed: 0.3, mode: 'fly', flying_speed: 0.5, hovers: false },
        'msm:ai_goals': {
          goals: [
            { type: 'roost', daylight: true, when_idle: false, range: 8 },
            { type: 'wander', speed: 1 },
          ],
        },
        'msm:animated_model': mobModel(context, ['fly']),
      },
    }),
  },
  {
    id: 'msm_entity_collector',
    kind: ENTITY_KIND,
    category: MOB2_TEMPLATE_CATEGORY,
    title: 'Item collector',
    description: `An allay-like flyer you tame with cookies. Give it an item and it picks up more of the same and brings them to you, or to a note block it heard play; use it with an empty hand to take the item back. Spawns in forests, with a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      base: 'animal',
      category: 'creature',
      size: { width: 0.35, height: 0.6 },
      spawn: {
        biomes: ['#minecraft:is_forest'],
        weight: 2,
        min_group: 1,
        max_group: 2,
        rule: 'animal',
      },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 20 },
        'msm:movement': { speed: 0.1, mode: 'fly', flying_speed: 0.1, hovers: true },
        'msm:tameable': {
          items: ['minecraft:cookie'],
          chance: 0.5,
          sit: false,
          follows_owner: true,
          defends_owner: false,
        },
        'msm:ai_goals': {
          goals: [
            { type: 'collect_items', speed: 1, range: 32, note_blocks: true },
            ...structuredClone(LOOKING_ABOUT),
          ],
        },
        'msm:animated_model': mobModel(context, ['fly']),
      },
    }),
  },
  {
    id: 'msm_entity_digger',
    kind: ENTITY_KIND,
    category: MOB2_TEMPLATE_CATEGORY,
    title: 'Digger',
    description: `A sniffer-like animal that now and then walks to a patch of dirt or moss, digs and turns up something from vanilla's sniffer digging loot. Spawns in old growth forests, with a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      base: 'animal',
      category: 'creature',
      size: { width: 1.9, height: 1.75 },
      spawn: {
        biomes: ['minecraft:old_growth_pine_taiga', 'minecraft:old_growth_spruce_taiga'],
        weight: 2,
        min_group: 1,
        max_group: 2,
        rule: 'animal',
      },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 14 },
        'msm:movement': { speed: 0.1 },
        'msm:ai_goals': {
          goals: [
            { type: 'panic', speed: 1.5 },
            {
              type: 'dig_items',
              dig_blocks: ['#minecraft:sniffer_diggable_block'],
              loot_table: 'minecraft:gameplay/sniffer_digging',
              interval_ticks: 2400,
              speed: 1,
            },
            ...structuredClone(LOOKING_ABOUT),
          ],
        },
        'msm:animated_model': mobModel(context, []),
      },
    }),
  },
  {
    id: 'msm_entity_barterer',
    kind: ENTITY_KIND,
    category: MOB2_TEMPLATE_CATEGORY,
    title: 'Barterer',
    description: `A piglin-like mob that takes gold ingots from players (use it with one) or picks them up from the ground, looks them over and drops something from vanilla's piglin bartering loot. With a spawn egg; it does not spawn on its own. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      category: 'creature',
      size: { width: 0.6, height: 1.95 },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 16 },
        'msm:movement': { speed: 0.3 },
        'msm:ai_goals': {
          goals: [
            {
              type: 'barter',
              item: 'minecraft:gold_ingot',
              loot_table: 'minecraft:gameplay/piglin_bartering',
              ticks: 120,
              from_ground: true,
            },
            { type: 'tempt', items: ['minecraft:gold_ingot'], speed: 1 },
            ...structuredClone(LOOKING_ABOUT),
          ],
        },
        'msm:animated_model': mobModel(context, []),
      },
    }),
  },
  {
    id: 'msm_entity_dash_mount',
    kind: ENTITY_KIND,
    category: MOB2_TEMPLATE_CATEGORY,
    title: 'Dashing mount',
    description: `A camel-like animal anyone can ride once it wears a vanilla saddle. Hold the jump key to fill the bar and let go to dash forward, about seven blocks at a full bar. Spawns in deserts, with a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      base: 'animal',
      category: 'creature',
      size: { width: 1.7, height: 2.375 },
      spawn: {
        biomes: ['minecraft:desert'],
        weight: 1,
        min_group: 1,
        max_group: 1,
        rule: 'animal',
      },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 32 },
        'msm:movement': { speed: 0.09 },
        'msm:rideable': {
          saddle: true,
          controlled_by: 'anyone',
          speed: 1,
          passengers: 1,
          dash: { power: 1, cooldown_ticks: 55 },
        },
        'msm:ai_goals': {
          goals: [{ type: 'panic', speed: 2 }, ...structuredClone(LOOKING_ABOUT)],
        },
        'msm:animated_model': mobModel(context, []),
      },
    }),
  },
  {
    id: 'msm_villager_type',
    kind: VILLAGER_TYPE_KIND,
    category: VILLAGER_TEMPLATE_CATEGORY,
    title: 'Villager look',
    description:
      'A new look for vanilla villagers and zombie villagers born or spawned in the biomes you list (here the cherry grove). The pictures are drawn over the villager at entity/villager/type/ and entity/zombie_villager/type/ (64 by 64, in the villager layout) and are reported missing until you add them. It brings no trades of its own.',
    data: (context) => ({
      format: 1,
      biomes: ['minecraft:cherry_grove'],
      textures: {
        villager: villagerTypeTextureId('villager', context.namespace, context.path),
        zombie_villager: villagerTypeTextureId('zombie_villager', context.namespace, context.path),
      },
    }),
  },
] satisfies ElementTemplate[]);
