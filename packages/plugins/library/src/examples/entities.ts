/**
 * Phase 5 examples (ADR 0028, ADR 0029): one per-kind example each for `msm:entity`,
 * `msm:geo_model` and `msm:animation`, plus entity behaviour examples (a hostile mob and
 * natural spawning) and the mob examples of ADR 0073 D4 on the preset models: a tameable pet,
 * a rideable flying mount, an archer throwing a project throwable, a fish school with biome
 * variants, a boss with a boss bar and a mob drawn by the runtime's own renderer. Every example
 * is a complete mob: entity, geo model, animation set and placeholder textures, so it previews
 * and exports on its own. New entities need the Fabric mod jar export; the vanilla pack exports
 * carry only the models, textures and language keys. Mobs use renderer `auto` (absent, or
 * written out) or `vanilla`, so every example works on targets without GeckoLib (ADR 0072 D6).
 */
import type {
  ContentBundle,
  ContentBundleElement,
  ExampleProject,
  JsonObject,
} from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import { COLOURS, element, KINDS, rl, skinTexture, texture } from '../content/bundle';
import {
  bipedAnimations,
  bipedGeometry,
  cubeCreatureAnimations,
  cubeCreatureGeometry,
} from '../content/entities';
import {
  type MobVariant,
  presetSize,
  presetSkinAsset,
  variantsComponent,
} from '../content/mob-flows';
import { MOB_PRESETS, type MobPresetName, presetAnimationFields } from '../content/mob-presets';
import { hasFabric } from '../content/supports';
import { defineExample } from './define';

type Shape = 'biped' | 'cube';

interface MobInput {
  namespace: string;
  /** The entity's path; the model is `entity/<name>`, the animations `entity/<name>_animations`. */
  name: string;
  shape: Shape;
  colour: Rgb;
  /** Entity data without `msm:animated_model`, which is filled in from the shape. */
  entity: JsonObject;
  components: JsonObject;
  /** Whether the entity has a spawn egg with a texture `item/<name>_spawn_egg`. */
  egg: boolean;
  /** Whether the animation set has an `attack` animation (biped only). */
  attack?: boolean;
  notes: { entity: string; model: string; animations: string };
}

/** A complete mob: the entity, its geo model, animation set, skin and egg texture. */
function mob(input: MobInput): ContentBundle {
  const { namespace, name } = input;
  const id = rl(namespace, name);
  const model = rl(namespace, `entity/${name}`);
  const animations = rl(namespace, `entity/${name}_animations`);
  const attack = input.attack === true;
  const elements: ContentBundleElement[] = [
    element(
      id,
      KINDS.entity,
      {
        format: 1,
        ...input.entity,
        ...(input.egg
          ? { spawn_egg: { texture: rl(namespace, `item/${name}_spawn_egg`) } }
          : { spawn_egg: false }),
        components: {
          ...input.components,
          'msm:animated_model': {
            model,
            animations,
            texture: model,
            idle: 'idle',
            walk: 'walk',
            ...(attack ? { attack: 'attack' } : {}),
          },
        },
      },
      input.notes.entity,
    ),
    element(
      model,
      KINDS.geoModel,
      input.shape === 'biped' ? bipedGeometry(name) : cubeCreatureGeometry(name),
      input.notes.model,
    ),
    element(
      animations,
      KINDS.animation,
      input.shape === 'biped' ? bipedAnimations(attack) : cubeCreatureAnimations(),
      input.notes.animations,
    ),
  ];
  const assets = [skinTexture(namespace, `entity/${name}`, input.colour)];
  if (input.egg) assets.push(texture(namespace, `item/${name}_spawn_egg`, 'egg', input.colour));
  return { elements, assets };
}

interface PresetMobInput {
  namespace: string;
  /** The entity's path; the model is `entity/<name>`, the animations `entity/<name>_animations`. */
  name: string;
  preset: MobPresetName;
  colour: Rgb;
  scale?: number;
  /** `auto` unless given. */
  renderer?: 'auto' | 'vanilla';
  /** Entity data without `format`, `size`, `spawn_egg` and the model and variant components. */
  entity: JsonObject;
  components: JsonObject;
  variants?: readonly MobVariant[];
  notes: { entity: string; model: string; animations: string };
}

/**
 * A complete mob on a preset model (ADR 0073 D1): the entity with a spawn egg, the preset's
 * geo model and animation set, its skin, its variants' skins and the egg texture.
 */
function presetMob(input: PresetMobInput): ContentBundle {
  const { namespace, name, preset } = input;
  const scale = input.scale ?? 1;
  const model = rl(namespace, `entity/${name}`);
  const animations = rl(namespace, `entity/${name}_animations`);
  const variants = input.variants ?? [];
  const variantData = variantsComponent(namespace, name, variants);
  const elements: ContentBundleElement[] = [
    element(
      rl(namespace, name),
      KINDS.entity,
      {
        format: 1,
        ...input.entity,
        size: presetSize(preset, scale),
        spawn_egg: { texture: rl(namespace, `item/${name}_spawn_egg`) },
        components: {
          ...input.components,
          ...(variantData === undefined ? {} : { 'msm:variants': variantData }),
          'msm:animated_model': {
            model,
            animations,
            texture: model,
            renderer: input.renderer ?? 'auto',
            ...(scale === 1 ? {} : { scale }),
            ...presetAnimationFields(preset),
          },
        },
      },
      input.notes.entity,
    ),
    element(model, KINDS.geoModel, MOB_PRESETS[preset].geometry(name), input.notes.model),
    element(animations, KINDS.animation, MOB_PRESETS[preset].animations(), input.notes.animations),
  ];
  const assets = [
    presetSkinAsset(namespace, `entity/${name}`, preset, input.colour, null),
    ...variants.map((variant) =>
      presetSkinAsset(namespace, `entity/${name}_${variant.id}`, preset, variant.colour, null),
    ),
    texture(namespace, `item/${name}_spawn_egg`, 'egg', input.colour),
  ];
  return { elements, assets };
}

/** A variant of an example mob. */
const variant = (id: string, colour: Rgb, biomes: string[], place: string): MobVariant => ({
  id,
  colour,
  picture: null,
  biomes,
  place,
});

/** The per-kind examples of the entities and the models and animation plugins, in kind order. */
export const entityKindExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_msm_entity',
    supports: hasFabric,
    title: 'Wandering creature',
    description:
      'A peaceful mob that strolls about, looks at players and has a spawn egg, with its model, animations and textures.',
    kind: KINDS.entity,
    category: 'Entities',
    tags: ['entity', 'ai_goals', 'spawn_egg', 'mod'],
    build: ({ namespace }) =>
      mob({
        namespace,
        name: 'wanderer',
        shape: 'cube',
        colour: COLOURS.jade,
        entity: {
          display_name: 'Wanderer',
          category: 'creature',
          size: { width: 0.9, height: 0.9 },
        },
        components: {
          'msm:health': { max: 12 },
          'msm:movement': { speed: 0.22 },
          'msm:ai_goals': {
            goals: [
              { type: 'wander', speed: 1 },
              { type: 'look_at_player', distance: 6 },
              { type: 'look_around' },
            ],
          },
        },
        egg: true,
        notes: {
          entity:
            'A new mob, registered as an entity type in the Fabric mod jar. category creature makes it a peaceful animal-like mob, and size is its hitbox in blocks. msm:ai_goals lists what it does, highest priority first: wander strolls about, look_at_player turns its head to players within 6 blocks and look_around glances about. msm:animated_model names the GeckoLib model, animation set and texture, and which animations play while standing and walking. The spawn egg appears in the Spawn Eggs creative tab with its own texture.',
          model:
            'The GeckoLib geo model of the wanderer: a body and a head bone over a 64x64 texture.',
          animations:
            'The wanderer breathes while idle and waddles while walking; the entity names these animations idle and walk.',
        },
      }),
  }),
  defineExample({
    id: 'example_msm_geo_model',
    supports: hasFabric,
    title: 'Cube creature model',
    description:
      'A box-shaped GeckoLib model with a body and a head bone over a 64x64 texture, shown on a small mob.',
    kind: KINDS.geoModel,
    category: 'Entity models',
    tags: ['geo_model', 'geckolib', 'bones', 'cubes'],
    build: ({ namespace }) =>
      mob({
        namespace,
        name: 'cube_critter',
        shape: 'cube',
        colour: COLOURS.amber,
        entity: {
          display_name: 'Cube Critter',
          category: 'creature',
          size: { width: 0.9, height: 0.9 },
        },
        components: {
          'msm:health': { max: 8 },
          'msm:ai_goals': { goals: [{ type: 'wander' }, { type: 'look_around' }] },
        },
        egg: false,
        notes: {
          entity:
            'A small mob that shows the cube creature model in game. It has no spawn egg; summon it with /summon.',
          model:
            'A GeckoLib geo model in Bedrock geometry format: a list of bones, each with a pivot and cubes. Units are pixels, 16 to a block, and origin is the lowest corner of a cube. head names body as its parent, so it moves with the body. uv is the top-left corner of the box layout on the 64x64 texture (texture_width and texture_height). Import a Blockbench model to replace it, or edit the numbers and watch the preview.',
          animations:
            'Idle and walk animations for the cube creature: a slow breathing scale on the body and a waddle.',
        },
      }),
  }),
  defineExample({
    id: 'example_msm_animation',
    supports: hasFabric,
    title: 'Idle and walk animations',
    description:
      'An idle bob and a walk cycle that swings the arms and legs of a biped model, shown on a small mob.',
    kind: KINDS.animation,
    category: 'Entity animations',
    tags: ['animation', 'geckolib', 'keyframes'],
    build: ({ namespace }) =>
      mob({
        namespace,
        name: 'marcher',
        shape: 'biped',
        colour: COLOURS.sapphire,
        entity: {
          display_name: 'Marcher',
          category: 'creature',
          size: { width: 0.6, height: 1.95 },
        },
        components: {
          'msm:movement': { speed: 0.25 },
          'msm:ai_goals': { goals: [{ type: 'wander' }, { type: 'look_at_player' }] },
        },
        egg: false,
        notes: {
          entity:
            'A small biped that shows the idle and walk animations in game. It has no spawn egg; summon it with /summon.',
          model: 'A biped geo model on the player skin layout: body, head, two arms and two legs.',
          animations:
            'A GeckoLib animation set: named animations that move bones of the geo model. Each animation has a length in seconds and loop true repeats it. Under bones, each bone name has rotation, position or scale channels, keyed by time in seconds; values between keyframes are blended linearly. walk swings the legs and arms 30 and 25 degrees about x, the opposite way on each side, once a second. The entity plays idle while standing and walk while moving.',
        },
      }),
  }),
];

/** Entity behaviour examples beyond the one per kind, in gallery order. */
export const entityBehaviourExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_msm_hostile_mob',
    supports: hasFabric,
    title: 'Hostile mob',
    description:
      'A monster that chases and hits players, fights back when hurt and spawns in the dark.',
    kind: KINDS.entity,
    category: 'Entities',
    tags: ['monster', 'melee_attack', 'msm:attack', 'mod'],
    build: ({ namespace }) => {
      const hit = rl(namespace, 'brute_hit');
      return mob({
        namespace,
        name: 'brute',
        shape: 'biped',
        colour: COLOURS.violet,
        attack: true,
        entity: {
          display_name: 'Brute',
          category: 'monster',
          size: { width: 0.6, height: 1.95 },
          spawn: {
            biomes: ['#minecraft:is_overworld'],
            weight: 40,
            min_group: 1,
            max_group: 2,
            rule: 'monster',
          },
          events: {
            [hit]: {
              actions: [
                { type: 'play_sound', sound: 'minecraft:entity.zombie.attack_iron_door' },
                { type: 'play_animation', animation: 'attack' },
              ],
            },
          },
        },
        components: {
          'msm:health': { max: 24 },
          'msm:movement': { speed: 0.23, follow_range: 32 },
          'msm:attack': { damage: 5, knockback: 0.5, on_attack: hit },
          'msm:ai_goals': {
            goals: [
              { type: 'melee_attack', speed: 1.1, targets: ['minecraft:player'], retaliate: true },
              { type: 'wander', speed: 0.8 },
              { type: 'look_at_player', distance: 8 },
              { type: 'look_around' },
            ],
          },
        },
        egg: true,
        notes: {
          entity: `A hostile mob. category monster puts it with the zombies: it despawns far from players and does not spawn on Peaceful. melee_attack with targets minecraft:player hunts players it can see, and retaliate makes it fight back against anything that hurts it. msm:attack sets the damage of each hit (5, two and a half hearts) and fires ${hit}, which plays a sound and the attack animation. The spawn rule monster spawns it only in the dark, anywhere in the overworld (#minecraft:is_overworld).`,
          model: 'The biped geo model of the brute.',
          animations:
            'Idle, walk and a one-shot attack that swings both arms down; loop is false, so attack plays once each time.',
        },
      });
    },
  }),
  defineExample({
    id: 'example_msm_natural_spawn',
    supports: hasFabric,
    title: 'Natural spawning',
    description:
      'A creature that spawns on its own in forests and plains, using a biome tag and a biome id.',
    kind: KINDS.entity,
    category: 'Entities',
    tags: ['spawn', 'biomes', 'weight', 'mod'],
    build: ({ namespace }) =>
      mob({
        namespace,
        name: 'meadow_hopper',
        shape: 'cube',
        colour: COLOURS.jade,
        entity: {
          display_name: 'Meadow Hopper',
          category: 'creature',
          size: { width: 0.8, height: 0.8 },
          spawn: {
            biomes: ['#minecraft:is_forest', 'minecraft:plains'],
            weight: 10,
            min_group: 2,
            max_group: 4,
            placement: 'on_ground',
            heightmap: 'motion_blocking_no_leaves',
            rule: 'mob',
          },
        },
        components: {
          'msm:health': { max: 8 },
          'msm:movement': { speed: 0.3 },
          'msm:ai_goals': {
            goals: [
              {
                type: 'flee',
                from: ['minecraft:wolf', 'minecraft:fox'],
                distance: 8,
                speed: 1,
                sprint_speed: 1.4,
              },
              { type: 'wander' },
              { type: 'look_around' },
            ],
          },
        },
        egg: true,
        notes: {
          entity:
            'Natural spawning. spawn.biomes mixes a biome tag (#minecraft:is_forest, every forest) and a single biome (minecraft:plains); the mob spawns in all of them. weight is its share among the other creatures of those biomes: cows and sheep have 12 and pigs 10, so 10 makes it about as common as pigs. Groups have two to four hoppers. placement on_ground, heightmap motion_blocking_no_leaves and rule mob are the defaults, written out here: on solid ground, under the open sky or tree tops, with the usual light check.',
          model: 'The cube creature geo model of the meadow hopper.',
          animations: 'Idle and walk animations of the meadow hopper.',
        },
      }),
  }),
  defineExample({
    id: 'example_msm_tameable_pet',
    supports: hasFabric,
    title: 'Tameable fox-like pet',
    description:
      'A fox-like animal you tame with sweet berries: it sits when told, follows and defends you, has babies and grows a white coat in snowy biomes.',
    kind: KINDS.entity,
    category: 'Entities',
    tags: ['msm:tameable', 'msm:breedable', 'msm:variants', 'animal', 'mod'],
    build: ({ namespace }) =>
      presetMob({
        namespace,
        name: 'ember_fox',
        preset: 'quadruped',
        colour: COLOURS.amber,
        scale: 0.7,
        entity: {
          display_name: 'Ember Fox',
          base: 'animal',
          category: 'creature',
          spawn: {
            biomes: ['#minecraft:is_taiga'],
            weight: 6,
            min_group: 2,
            max_group: 3,
            rule: 'animal',
          },
        },
        components: {
          'msm:health': { max: 10 },
          'msm:movement': { speed: 0.3 },
          'msm:attack': { damage: 2 },
          'msm:tameable': {
            items: ['minecraft:sweet_berries', 'minecraft:glow_berries'],
            chance: 0.33,
            sit: true,
            follows_owner: true,
            follow: { speed: 1.2, start_distance: 10, stop_distance: 2 },
            defends_owner: true,
            tamed_health: 20,
          },
          'msm:breedable': {
            items: ['minecraft:cooked_chicken', 'minecraft:cooked_rabbit'],
            baby_scale: 0.5,
          },
          'msm:ai_goals': {
            goals: [
              { type: 'leap_at_target', height: 0.4 },
              { type: 'melee_attack', speed: 1.2, retaliate: true },
              { type: 'wander', speed: 1 },
              { type: 'look_at_player', distance: 8 },
              { type: 'look_around' },
            ],
          },
        },
        variants: [
          variant('snow', COLOURS.frost, ['#minecraft:spawns_snow_foxes'], 'snowy biomes'),
        ],
        notes: {
          entity:
            "A tameable pet. base animal is needed for taming and breeding. msm:tameable tames it one time in three when a player feeds it sweet or glow berries; once tamed it follows its owner (follow sets its speed and distances), sits or stands when the owner right-clicks it with an empty hand, attacks what hurts its owner or what its owner attacks, never despawns and has 20 health. msm:breedable makes two foxes fed cooked chicken or rabbit have a half-size baby; taming and breeding foods differ, so feeding one never does the other. msm:variants with choose biome gives foxes that spawn in #minecraft:spawns_snow_foxes the snow coat and every other fox the default one; babies take a parent's coat.",
          model:
            'The four-legged preset model: body, head, tail, four legs and a saddle bone (unused here) over a 64x64 texture.',
          animations:
            'The four-legged preset animations: idle, walk, sit (played while it sits), swim, attack and shoot.',
        },
      }),
  }),
  defineExample({
    id: 'example_msm_flying_mount',
    supports: hasFabric,
    title: 'Rideable flying mount',
    description:
      'A big round flyer you saddle and ride through the air: it flies where you look and rises while you hold jump.',
    kind: KINDS.entity,
    category: 'Entities',
    tags: ['msm:rideable', 'fly', 'saddle', 'mod'],
    build: ({ namespace }) => {
      const mount = rl(namespace, 'sky_ray_mount');
      return presetMob({
        namespace,
        name: 'sky_ray',
        preset: 'flyer',
        colour: COLOURS.sapphire,
        scale: 2,
        entity: {
          display_name: 'Sky Ray',
          base: 'animal',
          category: 'creature',
          events: {
            [mount]: {
              actions: [{ type: 'play_sound', sound: 'minecraft:entity.phantom.flap' }],
            },
          },
        },
        components: {
          'msm:health': { max: 30 },
          'msm:movement': { speed: 0.3, mode: 'fly', flying_speed: 0.8, hovers: true },
          'msm:rideable': {
            saddle: true,
            controlled_by: 'anyone',
            speed: 1.5,
            passengers: 2,
            saddle_bone: 'saddle',
            on_mount: mount,
          },
          'msm:ai_goals': {
            goals: [
              { type: 'wander', speed: 1 },
              { type: 'look_at_player', distance: 8 },
              { type: 'look_around' },
            ],
          },
        },
        notes: {
          entity: `A flying mount. mode fly makes it fly and hover when idle (hovers), with flying_speed 0.8, and it takes no fall damage. msm:rideable lets a player get on with an empty hand; once it wears a vanilla saddle (saddle true) the first rider steers it along their view, rising while they hold jump, at 1.5 times its movement speed. passengers 2 seats a second rider behind; saddle_bone shows the model's saddle bone only while it is saddled, and on_mount fires ${mount}, a flap sound. It has no natural spawn: use its spawn egg.`,
          model:
            'The round flyer preset model: a body with four wings and a saddle bone over a 64x64 texture, drawn twice as big (scale 2).',
          animations:
            'The round flyer preset animations: idle, walk, fly (played while it moves in the air), attack and shoot.',
        },
      });
    },
  }),
  defineExample({
    id: 'example_msm_throwing_archer',
    supports: hasFabric,
    title: 'Archer with a throwable',
    description:
      'A skeleton-like monster that circles players and throws ice shards, a project item with msm:throwable, from a distance.',
    kind: KINDS.entity,
    category: 'Entities',
    tags: ['msm:ranged_attack', 'ranged_attack', 'msm:throwable', 'monster', 'mod'],
    build: ({ namespace }) => {
      const shard = rl(namespace, 'ice_shard');
      const shardModel = rl(namespace, 'item/ice_shard');
      const archer = presetMob({
        namespace,
        name: 'frost_archer',
        preset: 'biped',
        colour: COLOURS.frost,
        entity: {
          display_name: 'Frost Archer',
          base: 'monster',
          category: 'monster',
          spawn: {
            biomes: ['#minecraft:is_taiga'],
            weight: 30,
            min_group: 1,
            max_group: 2,
            rule: 'monster',
          },
        },
        components: {
          'msm:health': { max: 20 },
          'msm:movement': { speed: 0.25, follow_range: 16 },
          'msm:ranged_attack': {
            projectile: shard,
            speed: 1.4,
            inaccuracy: 4,
            interval_ticks: 30,
            charge_ticks: 15,
            range: 14,
            sound: 'minecraft:entity.snowball.throw',
          },
          'msm:ai_goals': {
            goals: [
              {
                type: 'ranged_attack',
                speed: 1,
                strafe: true,
                targets: ['minecraft:player'],
                retaliate: true,
              },
              { type: 'wander', speed: 1 },
              { type: 'look_at_player', distance: 8 },
              { type: 'look_around' },
            ],
          },
        },
        notes: {
          entity: `A ranged monster. msm:ranged_attack names its projectile: ${shard}, a project item with msm:throwable, so the archer throws it as a player would, with the item's own damage, gravity and hit events (an arrow would take damage here instead). The ranged_attack goal walks into range (14 blocks), aims for charge_ticks (the shoot animation plays), throws every 30 ticks and circles its target (strafe), as a skeleton does. base monster makes it an enemy removed in Peaceful; rule monster spawns it in dark taigas.`,
          model:
            'The two-legged preset model on the player skin layout: body, head, two arms and two legs.',
          animations:
            'The two-legged preset animations: idle, walk, sit, attack and shoot (played on each throw).',
        },
      });
      return {
        elements: [
          ...archer.elements,
          element(
            shard,
            KINDS.item,
            {
              format: 1,
              model: shardModel,
              display_name: 'Ice Shard',
              max_stack_size: 16,
              creative_tab: 'minecraft:combat',
              components: {
                'msm:throwable': {
                  speed: 1.4,
                  gravity: 0.03,
                  damage: 3,
                  after_throw: 'consume',
                  sound: 'minecraft:entity.snowball.throw',
                },
              },
            },
            'The projectile the archer throws: msm:throwable gives it its speed, a light gravity and 3 damage on a hit. Players can throw it too; each throw uses one.',
          ),
          element(
            shardModel,
            KINDS.model,
            { parent: 'minecraft:item/generated', textures: { layer0: shardModel } },
            'A flat item model drawn from textures/item/ice_shard.png.',
          ),
        ],
        assets: [...archer.assets, texture(namespace, 'item/ice_shard', 'ball', COLOURS.frost)],
      };
    },
  }),
  defineExample({
    id: 'example_msm_fish_school',
    supports: hasFabric,
    title: 'Fish school with biome variants',
    description:
      'A fish that swims in schools in every ocean, orange in warm oceans and pale in cold ones, and flops and dries out on land.',
    kind: KINDS.entity,
    category: 'Entities',
    tags: ['swim', 'msm:variants', 'water_ambient', 'mod'],
    build: ({ namespace }) =>
      presetMob({
        namespace,
        name: 'reef_fish',
        preset: 'fish',
        colour: COLOURS.sapphire,
        entity: {
          display_name: 'Reef Fish',
          category: 'water_ambient',
          spawn: {
            biomes: ['#minecraft:is_ocean'],
            weight: 12,
            min_group: 4,
            max_group: 8,
            placement: 'in_water',
            rule: 'water_animal',
          },
        },
        components: {
          'msm:health': { max: 3 },
          'msm:movement': { speed: 1, mode: 'swim', breathes_air: false, dry_out_ticks: 300 },
          'msm:ai_goals': {
            goals: [
              {
                type: 'flee',
                from: ['minecraft:player'],
                distance: 8,
                speed: 1.6,
                sprint_speed: 1.4,
              },
              { type: 'wander', speed: 1 },
            ],
          },
        },
        variants: [
          variant(
            'warm',
            COLOURS.amber,
            ['minecraft:warm_ocean', 'minecraft:lukewarm_ocean', 'minecraft:deep_lukewarm_ocean'],
            'warm oceans',
          ),
          variant(
            'cold',
            COLOURS.frost,
            [
              'minecraft:cold_ocean',
              'minecraft:deep_cold_ocean',
              'minecraft:frozen_ocean',
              'minecraft:deep_frozen_ocean',
            ],
            'cold oceans',
          ),
        ],
        notes: {
          entity:
            'A school fish. mode swim moves it in water at speed 1 (swimmers need a speed near 1), it flops on land and loses health 300 ticks after leaving the water (dry_out_ticks). The water_ambient category, placement in_water and rule water_animal spawn schools of four to eight in every ocean, between 13 blocks below sea level and sea level. msm:variants with choose biome picks the warm look in warm and lukewarm oceans, the cold look in cold and frozen ones, and the default variant, which lists no biomes, everywhere else. flee makes it dart away from players.',
          model:
            'The fish preset model: a body, a tail fin, a top fin and two side fins over 64x32.',
          animations:
            'The fish preset animations: idle, walk (a flop on land) and swim (played while it moves in water).',
        },
      }),
  }),
  defineExample({
    id: 'example_msm_boss_bar',
    supports: hasFabric,
    title: 'Boss with a boss bar',
    description:
      'A giant monster with a red boss bar that darkens the sky and fogs the world, summoned only from its spawn egg.',
    kind: KINDS.entity,
    category: 'Entities',
    tags: ['msm:boss_bar', 'boss', 'monster', 'mod'],
    build: ({ namespace }) =>
      presetMob({
        namespace,
        name: 'stone_titan',
        preset: 'biped',
        colour: COLOURS.slate,
        scale: 2,
        entity: { display_name: 'Stone Titan', base: 'monster', category: 'monster' },
        components: {
          'msm:health': { max: 300 },
          'msm:movement': {
            speed: 0.28,
            follow_range: 40,
            knockback_resistance: 1,
            fire_immune: true,
          },
          'msm:attack': { damage: 15, knockback: 2 },
          'msm:boss_bar': {
            colour: 'red',
            overlay: 'notched_12',
            darken_sky: true,
            fog: true,
            music: false,
            range: 64,
          },
          'msm:ai_goals': {
            goals: [
              { type: 'melee_attack', speed: 1, targets: ['minecraft:player'], retaliate: true },
              { type: 'wander', speed: 0.8 },
              { type: 'look_at_player', distance: 16 },
              { type: 'look_around' },
            ],
          },
        },
        notes: {
          entity:
            "A boss. msm:boss_bar shows its health in a red bar with 12 notches to every player within 64 blocks (range), darkens the sky and fogs the world; a boss never despawns. It has 300 health, cannot be knocked back (knockback_resistance 1), ignores fire and hits for 15 damage. It has no spawn field, so it never spawns on its own: summon it with its spawn egg or /summon. scale 2 draws the model twice as big, and its hitbox is twice the biped's.",
          model: 'The two-legged preset model, drawn twice as big.',
          animations: 'The two-legged preset animations: idle, walk, sit, attack and shoot.',
        },
      }),
  }),
  defineExample({
    id: 'example_msm_vanilla_renderer',
    supports: hasFabric,
    title: 'Drawn without GeckoLib',
    description:
      "A small creature drawn by the runtime's own renderer, never GeckoLib, so it needs no GeckoLib on any target.",
    kind: KINDS.entity,
    category: 'Entities',
    tags: ['renderer', 'vanilla', 'mod'],
    build: ({ namespace }) =>
      presetMob({
        namespace,
        name: 'pebble_crab',
        preset: 'cube_creature',
        colour: COLOURS.jade,
        scale: 0.6,
        renderer: 'vanilla',
        entity: {
          display_name: 'Pebble Crab',
          category: 'creature',
          spawn: {
            biomes: ['#minecraft:is_beach'],
            weight: 8,
            min_group: 2,
            max_group: 4,
            rule: 'mob',
          },
        },
        components: {
          'msm:health': { max: 6 },
          'msm:movement': { speed: 0.2 },
          'msm:ai_goals': {
            goals: [
              { type: 'panic', speed: 1.5 },
              { type: 'wander', speed: 1 },
              { type: 'look_around' },
            ],
          },
        },
        notes: {
          entity:
            "A mob drawn by the runtime's own renderer. renderer vanilla never uses GeckoLib: the jar never nests GeckoLib for it, on any target. That renderer plays a subset of GeckoLib's animations (no Molang, easings, sound or particle keyframes); the preset animations stay inside it. renderer auto (the default) would use GeckoLib where the target has it. panic makes it scuttle off when hurt; it spawns on beaches.",
          model: 'The cube creature preset model: a body and a head, drawn at 0.6 times its size.',
          animations: 'The cube creature preset animations: idle, walk, sit and attack.',
        },
      }),
  }),
];
