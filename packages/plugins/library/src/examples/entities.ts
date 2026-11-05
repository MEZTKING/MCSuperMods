/**
 * Phase 5 examples (ADR 0028, ADR 0029): one per-kind example each for `msm:entity`,
 * `msm:geo_model` and `msm:animation`, plus entity behaviour examples (a hostile mob and
 * natural spawning). Every example is a complete mob: entity, geo model, animation set and
 * placeholder textures, so it previews and exports on its own. New entities need the Fabric
 * mod jar export; the vanilla pack exports carry only the models, textures and language keys.
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
import { hasGeckolib } from '../content/supports';
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

/** The per-kind examples of the entities and the models and animation plugins, in kind order. */
export const entityKindExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_msm_entity',
    supports: hasGeckolib,
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
    supports: hasGeckolib,
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
    supports: hasGeckolib,
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
    supports: hasGeckolib,
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
    supports: hasGeckolib,
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
];
