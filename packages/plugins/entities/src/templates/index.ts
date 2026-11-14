/**
 * "New element" templates of `@msm/plugin-entities` (ADR 0028 D6): Creature, Monster and
 * Ambient critter, plus the mob templates of ADR 0073 D3: Pet, Farm animal, Mount, Flying
 * creature, Fish, Archer and Boss (renderer `auto`: GeckoLib where the target has it, the
 * vanilla renderer otherwise). They use vanilla ids only, plus ids derived from the new element's
 * own id:
 * the model `<ns>:entity/<path>`, the animation set `<ns>:entity/<path>_animations`, the
 * texture `<ns>:entity/<path>` and the egg texture `<ns>:item/<path>_spawn_egg`. The model and
 * animation set do not exist until the user adds or imports them, so the validators report
 * them; each description says so.
 */
import type { ElementTemplate, JsonObject, TemplateContext } from '@msm/plugin-api';
import { ENTITY_KIND } from '../kinds';

const CATEGORY = 'Entities';

const MODEL_NOTE =
  'Its model and animations are named after the entity and are reported missing until you add or import them (for example from Blockbench).';

/** `ruby_golem` (or `mobs/ruby_golem`) becomes `Ruby Golem`: the last path segment in title case. */
export function displayName(path: string): string {
  const last = path.split('/').pop() ?? path;
  return last
    .split(/[_\-.]+/)
    .filter((word) => word.length > 0)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

/** The `msm:animated_model` of a template, with ids derived from the element's own id. */
function animatedModel(context: TemplateContext, attack: boolean): JsonObject {
  const own = `${context.namespace}:entity/${context.path}`;
  return {
    model: own,
    animations: `${own}_animations`,
    texture: own,
    idle: 'idle',
    walk: 'walk',
    ...(attack ? { attack: 'attack' } : {}),
  };
}

/** Animation fields beyond `idle` and `walk`, each naming the animation of the same name. */
type StateAnimation = 'attack' | 'sit' | 'fly' | 'swim' | 'shoot';

/**
 * The `msm:animated_model` of a mob template of ADR 0073 D3: {@link animatedModel} with
 * `renderer` `auto` and the state animations the mob plays.
 */
function mobModel(context: TemplateContext, states: readonly StateAnimation[]): JsonObject {
  return {
    ...animatedModel(context, false),
    renderer: 'auto',
    ...Object.fromEntries(states.map((state) => [state, state])),
  };
}

const eggTexture = (context: TemplateContext): string =>
  `${context.namespace}:item/${context.path}_spawn_egg`;

export const entitiesTemplates: readonly ElementTemplate[] = Object.freeze([
  {
    id: 'msm_entity_creature',
    kind: ENTITY_KIND,
    category: CATEGORY,
    title: 'Creature',
    description: `A passive mob that wanders, looks at players and spawns in forests, with a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      category: 'creature',
      size: { width: 0.9, height: 1.4 },
      spawn: { biomes: ['#minecraft:is_forest'], weight: 8, min_group: 2, max_group: 4 },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 10 },
        'msm:movement': { speed: 0.25 },
        'msm:ai_goals': {
          goals: [{ type: 'wander' }, { type: 'look_at_player' }, { type: 'look_around' }],
        },
        'msm:animated_model': animatedModel(context, false),
      },
    }),
  },
  {
    id: 'msm_entity_monster',
    kind: ENTITY_KIND,
    category: CATEGORY,
    title: 'Monster',
    description: `A hostile mob that chases and hits players, fights back when hurt and spawns in the dark, with a spawn egg. Its \`sounds\` use vanilla zombie sounds; replace them with your own sound keys (from your project's sounds element) or remove the block for the vanilla defaults. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      category: 'monster',
      size: { width: 0.6, height: 1.95 },
      spawn: {
        biomes: ['#minecraft:is_overworld'],
        weight: 50,
        min_group: 1,
        max_group: 3,
        rule: 'monster',
      },
      spawn_egg: { texture: eggTexture(context) },
      sounds: {
        ambient: 'minecraft:entity.zombie.ambient',
        hurt: 'minecraft:entity.zombie.hurt',
        death: 'minecraft:entity.zombie.death',
        step: 'minecraft:entity.zombie.step',
        ambient_interval_ticks: 120,
      },
      components: {
        'msm:health': { max: 24 },
        'msm:movement': { speed: 0.23, follow_range: 32 },
        'msm:attack': { damage: 3 },
        'msm:ai_goals': {
          goals: [
            {
              type: 'melee_attack',
              speed: 1,
              targets: ['minecraft:player'],
              retaliate: true,
            },
            { type: 'wander', speed: 0.8 },
            { type: 'look_at_player', distance: 8 },
            { type: 'look_around' },
          ],
        },
        'msm:animated_model': animatedModel(context, true),
      },
    }),
  },
  {
    id: 'msm_entity_ambient',
    kind: ENTITY_KIND,
    category: CATEGORY,
    title: 'Ambient critter',
    description: `A small ambient mob that runs away from players, without a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      category: 'ambient',
      size: { width: 0.4, height: 0.4 },
      spawn_egg: false,
      components: {
        'msm:health': { max: 4 },
        'msm:movement': { speed: 0.3 },
        'msm:ai_goals': {
          goals: [
            { type: 'flee', from: ['minecraft:player'], distance: 6, speed: 1, sprint_speed: 1.4 },
            { type: 'wander' },
            { type: 'look_around' },
          ],
        },
        'msm:animated_model': animatedModel(context, false),
      },
    }),
  },
  {
    id: 'msm_entity_pet',
    kind: ENTITY_KIND,
    category: CATEGORY,
    title: 'Pet',
    description: `A wolf-like animal you tame with bones: it sits when you right-click it with an empty hand, follows you, defends you and has babies when fed cooked meat. Spawns in forests, with a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      base: 'animal',
      category: 'creature',
      size: { width: 0.6, height: 0.85 },
      spawn: {
        biomes: ['#minecraft:is_forest'],
        weight: 5,
        min_group: 2,
        max_group: 4,
        rule: 'animal',
      },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 8 },
        'msm:movement': { speed: 0.3 },
        'msm:attack': { damage: 4 },
        'msm:tameable': {
          items: ['minecraft:bone'],
          chance: 0.33,
          sit: true,
          follows_owner: true,
          defends_owner: true,
          tamed_health: 40,
        },
        'msm:breedable': {
          items: ['minecraft:cooked_beef', 'minecraft:cooked_porkchop', 'minecraft:cooked_chicken'],
          baby_scale: 0.5,
        },
        'msm:ai_goals': {
          goals: [
            { type: 'leap_at_target', height: 0.4 },
            { type: 'melee_attack', speed: 1, retaliate: true },
            { type: 'wander', speed: 1 },
            { type: 'look_at_player', distance: 8 },
            { type: 'look_around' },
          ],
        },
        'msm:animated_model': mobModel(context, ['attack', 'sit']),
      },
    }),
  },
  {
    id: 'msm_entity_farm_animal',
    kind: ENTITY_KIND,
    category: CATEGORY,
    title: 'Farm animal',
    description: `A cow-like animal that follows players holding wheat, breeds with it, has babies and runs about when hurt. Spawns in plains, with a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      base: 'animal',
      category: 'creature',
      size: { width: 0.9, height: 1.4 },
      spawn: {
        biomes: ['minecraft:plains', 'minecraft:sunflower_plains', 'minecraft:meadow'],
        weight: 8,
        min_group: 2,
        max_group: 4,
        rule: 'animal',
      },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 10 },
        'msm:movement': { speed: 0.2 },
        'msm:breedable': {
          items: ['minecraft:wheat'],
          baby_scale: 0.5,
          grow_up_ticks: 24000,
          tempted: true,
          follow_parents: true,
        },
        'msm:ai_goals': {
          goals: [
            { type: 'panic', speed: 2 },
            { type: 'wander', speed: 1 },
            { type: 'look_at_player', distance: 6 },
            { type: 'look_around' },
          ],
        },
        'msm:animated_model': mobModel(context, []),
      },
    }),
  },
  {
    id: 'msm_entity_mount',
    kind: ENTITY_KIND,
    category: CATEGORY,
    title: 'Mount',
    description: `A horse-like animal anyone can ride and steer once it wears a vanilla saddle, with a jump bar; the model's \`saddle\` bone shows only while it is saddled. Spawns in plains, with a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      base: 'animal',
      category: 'creature',
      size: { width: 1.4, height: 1.6 },
      spawn: {
        biomes: ['minecraft:plains', 'minecraft:savanna'],
        weight: 5,
        min_group: 2,
        max_group: 4,
        rule: 'animal',
      },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 24 },
        'msm:movement': { speed: 0.25 },
        'msm:rideable': {
          saddle: true,
          controlled_by: 'anyone',
          speed: 1,
          jump: 0.7,
          passengers: 1,
          saddle_bone: 'saddle',
        },
        'msm:ai_goals': {
          goals: [
            { type: 'panic', speed: 1.2 },
            { type: 'wander', speed: 0.7 },
            { type: 'look_at_player', distance: 6 },
            { type: 'look_around' },
          ],
        },
        'msm:animated_model': mobModel(context, []),
      },
    }),
  },
  {
    id: 'msm_entity_flying',
    kind: ENTITY_KIND,
    category: CATEGORY,
    title: 'Flying creature',
    description: `A peaceful bee-like flyer that drifts through the air, hovers in place when idle and takes no fall damage. Spawns in flower forests and meadows, with a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      category: 'creature',
      size: { width: 0.7, height: 0.6 },
      spawn: {
        biomes: ['minecraft:flower_forest', 'minecraft:meadow'],
        weight: 6,
        min_group: 1,
        max_group: 3,
        rule: 'animal',
      },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 10 },
        'msm:movement': { speed: 0.3, mode: 'fly', flying_speed: 0.6, hovers: true },
        'msm:ai_goals': {
          goals: [
            { type: 'wander', speed: 1 },
            { type: 'look_at_player', distance: 6 },
            { type: 'look_around' },
          ],
        },
        'msm:animated_model': mobModel(context, ['fly']),
      },
    }),
  },
  {
    id: 'msm_entity_fish',
    kind: ENTITY_KIND,
    category: CATEGORY,
    title: 'Fish',
    description: `A small fish that swims about in schools, darts away from players and flops and dries out on land. Spawns in oceans and rivers, with a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      category: 'water_ambient',
      size: { width: 0.5, height: 0.3 },
      spawn: {
        biomes: ['#minecraft:is_ocean', '#minecraft:is_river'],
        weight: 10,
        min_group: 3,
        max_group: 6,
        placement: 'in_water',
        rule: 'water_animal',
      },
      spawn_egg: { texture: eggTexture(context) },
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
        'msm:animated_model': mobModel(context, ['swim']),
      },
    }),
  },
  {
    id: 'msm_entity_archer',
    kind: ENTITY_KIND,
    category: CATEGORY,
    title: 'Archer',
    description: `A skeleton-like monster that circles players and shoots arrows at them from a distance, fights back when hurt and spawns in the dark, with a spawn egg. Its \`sounds\` use vanilla skeleton sounds; replace them with your own sound keys or remove the block for the vanilla defaults. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      base: 'monster',
      category: 'monster',
      size: { width: 0.6, height: 1.99 },
      spawn: {
        biomes: ['#minecraft:is_overworld'],
        weight: 40,
        min_group: 1,
        max_group: 2,
        rule: 'monster',
      },
      spawn_egg: { texture: eggTexture(context) },
      sounds: {
        ambient: 'minecraft:entity.skeleton.ambient',
        hurt: 'minecraft:entity.skeleton.hurt',
        death: 'minecraft:entity.skeleton.death',
        step: 'minecraft:entity.skeleton.step',
      },
      components: {
        'msm:health': { max: 20 },
        'msm:movement': { speed: 0.25, follow_range: 16 },
        'msm:ranged_attack': {
          projectile: 'minecraft:arrow',
          damage: 2,
          speed: 1.6,
          inaccuracy: 6,
          interval_ticks: 40,
          charge_ticks: 20,
          range: 15,
          sound: 'minecraft:entity.skeleton.shoot',
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
        'msm:animated_model': mobModel(context, ['shoot']),
      },
    }),
  },
  {
    id: 'msm_entity_boss',
    kind: ENTITY_KIND,
    category: CATEGORY,
    title: 'Boss',
    description: `A large, strong monster with a boss bar that darkens the sky, cannot be knocked back and ignores fire. It never spawns on its own: summon it with its spawn egg or a command. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      base: 'monster',
      category: 'monster',
      size: { width: 1.2, height: 3 },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 200 },
        'msm:movement': {
          speed: 0.3,
          follow_range: 40,
          knockback_resistance: 1,
          fire_immune: true,
        },
        'msm:attack': { damage: 12, knockback: 1.5 },
        'msm:boss_bar': {
          colour: 'purple',
          overlay: 'notched_10',
          darken_sky: true,
          fog: false,
          music: false,
        },
        'msm:ai_goals': {
          goals: [
            {
              type: 'melee_attack',
              speed: 1,
              targets: ['minecraft:player'],
              retaliate: true,
            },
            { type: 'wander', speed: 0.8 },
            { type: 'look_at_player', distance: 16 },
            { type: 'look_around' },
          ],
        },
        'msm:animated_model': { ...mobModel(context, ['attack']), scale: 1.5 },
      },
    }),
  },
] satisfies ElementTemplate[]);
