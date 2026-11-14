/**
 * Entities: `ModEntities.java` (registration as the runtime's `MsmEntityRegistrar`:
 * `FabricEntityType.Builder.createMob(factory, category, mob -> mob.defaultAttributes(...)
 * .spawnPlacement(type, heightmap, rule)).sized(w, h).eyeHeight(f).fireImmune().build(key)`,
 * the spawn egg `SpawnEggItem(Item.Properties.setId(key).spawnEgg(type))` and the natural
 * spawn through `BiomeModifications.addSpawn`), and one `entity/<Name>Entity.java` per entity:
 * a `PathfinderMob implements GeoEntity` mirroring `MsmEntity` (attributes, goals, the four
 * trigger overrides, `msm:on_tick` from `customServerAiStep` with the shared `TickLimiter` and
 * `msm:on_spawn` from `finalizeSpawn` (ADR 0061 D3), the loot table, the mob sounds of ADR 0057
 * D6; `run_function` in the entity's events runs as the player when there is one, else as the
 * mob itself) and `MsmGeoEntity` (the
 * `msm_main` and `msm_triggered` controllers; `msm_main` plays the `sit`, `swim` and `fly`
 * states of ADR 0071 D6 as `GeoControllers.loop`). Taming, breeding and riding (ADR 0071 D9)
 * mirror `MobTaming`, `MobBreeding` and `MobRiding`: the right click's steps (breeding food,
 * taming food and the sit toggle, mounting, then `msm:on_interact`) as private methods, the
 * component goals after the definition's own, a wild tameable animal that never breeds, and
 * `PlayerRideableJumping` on rideable mobs. A `sounds` id that is not registered keeps the
 * vanilla sound and is warned about once the server has started, as the runtime's
 * `MsmEntityRegistrar.checkAfterStart`. Minecraft 26.3 and GeckoLib 5, Mojang names.
 *
 * @packageDocumentation
 */

import type { DefinitionInput } from '@msm/plugin-api';
import {
  type Events,
  eventMethod,
  eventMethods,
  fireCall,
  noteActions,
  playAnimations,
  readEvents,
  TRIGGERED_CONTROLLER,
} from './actions';
import { tabLine } from './blocks';
import { classPath, type GenerationContext, packageOf } from './context';
import {
  identifierExpression,
  indent,
  JavaFile,
  javaFloat,
  javaInt,
  javaString,
  trimBlank,
} from './java';
import { className, constantName, NameTable, splitId } from './names';
import { checkFormat, type Reader, readDefinition } from './read';

/** The GeckoLib controller that loops `idle` and `walk`. */
export const MAIN_CONTROLLER = 'msm_main';

const ENTITY_KEYS = [
  'format',
  'base',
  'category',
  'size',
  'eye_height',
  'loot_table',
  'spawn_egg',
  'spawn',
  'components',
  'events',
  'sounds',
];
const SOUND_KEYS = ['ambient', 'hurt', 'death', 'step', 'ambient_interval_ticks'];
/** A sound event id, with or without a namespace, as `Identifier.parse` accepts it. */
const SOUND_ID = /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;
const ENTITY_COMPONENTS = [
  'msm:animated_model',
  'msm:health',
  'msm:movement',
  'msm:attack',
  'msm:ai_goals',
  'msm:on_hurt',
  'msm:on_death',
  'msm:on_interact',
  'msm:on_tick',
  'msm:on_spawn',
  'msm:ranged_attack',
  'msm:variants',
  'msm:boss_bar',
  'msm:tameable',
  'msm:breedable',
  'msm:rideable',
];
export const CATEGORIES = [
  'monster',
  'creature',
  'ambient',
  'water_creature',
  'water_ambient',
  'underground_water_creature',
  'axolotls',
  'misc',
] as const;
const PLACEMENTS = ['on_ground', 'in_water', 'in_lava', 'no_restrictions'] as const;
const HEIGHTMAPS = [
  'motion_blocking_no_leaves',
  'motion_blocking',
  'world_surface',
  'ocean_floor',
] as const;
const RULES = [
  'mob',
  'monster',
  'surface_monster',
  'any_light_monster',
  'always',
  'animal',
  'water_animal',
] as const;
const GOAL_TYPES = [
  'wander',
  'look_at_player',
  'look_around',
  'melee_attack',
  'flee',
  'follow',
  'ranged_attack',
  'tempt',
  'panic',
  'leap_at_target',
];
/** `base` (ADR 0070 D1): the vanilla class each generated entity extends. */
const BASES = ['mob', 'animal', 'monster'] as const;
type Base = (typeof BASES)[number];
const BASE_CLASSES: Record<Base, string> = {
  mob: 'net.minecraft.world.entity.PathfinderMob',
  animal: 'net.minecraft.world.entity.TamableAnimal',
  monster: 'net.minecraft.world.entity.monster.Monster',
};
const MOVEMENT_MODES = ['walk', 'fly', 'swim', 'amphibious'] as const;
type MovementMode = (typeof MOVEMENT_MODES)[number];
const RENDERERS = ['auto', 'geckolib', 'vanilla'] as const;
const BOSS_BAR_COLOURS = ['pink', 'blue', 'red', 'green', 'yellow', 'purple', 'white'] as const;
const BOSS_BAR_OVERLAYS = [
  'progress',
  'notched_6',
  'notched_10',
  'notched_12',
  'notched_20',
] as const;
/**
 * The vanilla items a mob may fire on 26.3 (`TargetFacts.entities.projectileItems`, kept equal by
 * a test; this generator cannot import the target, which imports it).
 */
export const VANILLA_PROJECTILE_ITEMS: readonly string[] = [
  'minecraft:arrow',
  'minecraft:tipped_arrow',
  'minecraft:spectral_arrow',
  'minecraft:snowball',
  'minecraft:egg',
  'minecraft:blue_egg',
  'minecraft:brown_egg',
  'minecraft:experience_bottle',
  'minecraft:fire_charge',
  'minecraft:firework_rocket',
  'minecraft:splash_potion',
  'minecraft:lingering_potion',
  'minecraft:trident',
  'minecraft:wind_charge',
];
/** The `ArrowItem`s among them: shot through `ProjectileUtil.getMobArrow` with a bow. */
const ARROW_ITEMS = ['minecraft:arrow', 'minecraft:tipped_arrow', 'minecraft:spectral_arrow'];
/** A bee's flying move control turn (`MobMovement.FLY_MAX_TURN`). */
const FLY_MAX_TURN = 20;
/** The runtime's default `flying_speed` (`EntityComponents.DEFAULT_FLYING_SPEED`). */
const DEFAULT_FLYING_SPEED = 0.4;
/** `Animal.createAnimalAttributes`'s tempt range, which `TemptGoal` reads (`MsmEntityRegistrar.TEMPT_RANGE`). */
const TEMPT_RANGE = 10;
/** The wither's client tracking range in chunks, for boss bars (`MsmEntityRegistrar.BOSS_TRACKING_RANGE`). */
const BOSS_TRACKING_RANGE = 10;
/** A cow's breeding, tempting and parent-following speeds (`MobBreeding`). */
const BREED_SPEED = 1.0;
const BREED_TEMPT_SPEED = 1.25;
const FOLLOW_PARENT_SPEED = 1.25;
/** A vanilla baby's time to grow up (`-AgeableMob.BABY_START_AGE`). */
const VANILLA_GROW_UP_TICKS = 24000;
/** Distance between seats, front to back, in blocks at scale 1 (`MobRiding.SEAT_SPACING`). */
const SEAT_SPACING = 0.7;

interface Spawn {
  biomes: string[];
  weight: number;
  minGroup: number;
  maxGroup: number;
  placement: string;
  heightmap: string;
  rule: string;
}

/** The mob sounds of a definition (ADR 0057 D6); absent fields keep vanilla's. */
interface Sounds {
  readonly ambient: string | undefined;
  readonly hurt: string | undefined;
  readonly death: string | undefined;
  readonly step: string | undefined;
  readonly ambientIntervalTicks: number | undefined;
}

interface EntitySpec {
  readonly input: DefinitionInput;
  readonly reader: Reader;
  readonly category: string;
  readonly width: number;
  readonly height: number;
  readonly eyeHeight: number | undefined;
  readonly lootTable: string | undefined;
  readonly spawnEgg: { creativeTab: string } | undefined;
  readonly spawn: Spawn | undefined;
  readonly model: {
    model: string;
    animations: string;
    texture: string;
    scale: number;
    idle: string | undefined;
    walk: string | undefined;
    attack: string | undefined;
    shoot: string | undefined;
    sit: string | undefined;
    fly: string | undefined;
    swim: string | undefined;
    transitionTicks: number;
  };
  readonly base: Base;
  readonly maxHealth: number;
  readonly movement: {
    speed: number;
    followRange: number;
    knockbackResistance: number;
    swims: boolean;
    fireImmune: boolean;
    mode: MovementMode;
    flyingSpeed: number;
    hovers: boolean;
    breathesAir: boolean;
    dryOutTicks: number;
    stepHeight: number | undefined;
  };
  readonly ranged: RangedAttack | undefined;
  readonly variants: Variants | undefined;
  readonly bossBar: BossBar | undefined;
  readonly tameable: Tameable | undefined;
  readonly breedable: Breedable | undefined;
  readonly rideable: Rideable | undefined;
  readonly attack: { damage: number; knockback: number; onAttack: string | undefined } | undefined;
  readonly goals: Reader[];
  readonly onHurt: string | undefined;
  readonly onDeath: string | undefined;
  readonly onInteract: string | undefined;
  /** `msm:on_tick` (ADR 0061 D3): the event method and the interval. */
  readonly onTick: { method: string; interval: number } | undefined;
  /** Method of the `msm:on_spawn` event (ADR 0061 D3). */
  readonly onSpawn: string | undefined;
  readonly events: Events;
  readonly sounds: Sounds | undefined;
}

/** `msm:ranged_attack` (ADR 0070 D4) with the runtime's defaults. */
interface RangedAttack {
  readonly projectile: string;
  /** How `MobRanged.kind` shoots the projectile, known here from the project and the target. */
  readonly kind: 'arrow' | 'throwable' | 'item';
  readonly damage: number;
  readonly speed: number;
  readonly inaccuracy: number;
  readonly intervalTicks: number;
  readonly chargeTicks: number;
  readonly range: number;
  readonly sound: string;
  readonly onShoot: string | undefined;
}

/** `msm:variants` (ADR 0071 D4). */
interface Variants {
  readonly biome: boolean;
  readonly variants: readonly {
    id: string;
    /** The full texture path, `<ns>:textures/<path>.png`, as `msm:animated_model.texture`. */
    texture: string;
    weight: number;
    biomes: readonly string[];
  }[];
}

/** `msm:boss_bar` (ADR 0071 D5). */
interface BossBar {
  readonly colour: string;
  readonly overlay: string;
  readonly darkenSky: boolean;
  readonly fog: boolean;
  readonly music: boolean;
  readonly range: number | undefined;
}

/** `msm:tameable` (ADR 0071 D1) with the runtime's defaults (a wolf's). */
interface Tameable {
  readonly items: readonly string[];
  readonly chance: number;
  readonly sit: boolean;
  readonly followsOwner: boolean;
  readonly follow: { speed: number; startDistance: number; stopDistance: number };
  readonly defendsOwner: boolean;
  readonly tamedHealth: number | undefined;
  readonly onTame: string | undefined;
}

/** `msm:breedable` (ADR 0071 D2) with the runtime's defaults. */
interface Breedable {
  readonly items: readonly string[];
  readonly babyScale: number;
  readonly growUpTicks: number;
  readonly tempted: boolean;
  readonly followParents: boolean;
  readonly onBreed: string | undefined;
}

/** `msm:rideable` (ADR 0071 D3) with the runtime's defaults. */
interface Rideable {
  readonly saddle: boolean;
  /** `controlled_by: owner`. */
  readonly ownerOnly: boolean;
  readonly speed: number;
  readonly jump: number;
  readonly passengers: number;
  readonly riderOffset: readonly [number, number, number] | undefined;
  readonly saddleBone: string | undefined;
  readonly onMount: string | undefined;
}

/** Fails unless `value` is within `min..max` (either may be absent), as the runtime's Codec ranges. */
function inRange(reader: Reader, key: string, value: number, min?: number, max?: number): number {
  if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
    const range =
      max === undefined
        ? `at least ${min}`
        : min === undefined
          ? `at most ${max}`
          : `${min}..${max}`;
    reader.fail(`${key} ${value} is out of range (${range})`);
  }
  return value;
}

/** An id with its namespace (`minecraft:` when absent), as `Identifier.parse` reads it. */
function fullId(id: string): string {
  const { namespace, path } = splitId(id);
  return `${namespace}:${path}`;
}

/** An item or biome id, or a `#` tag of them, as the runtime's `MsmCodecs.ID_OR_TAG`. */
const ID_OR_TAG = /^#?([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;

function idsOrTags(reader: Reader, key: string, required: boolean): string[] {
  if (required && !reader.has(key)) reader.fail(`${key} is missing`);
  const values = reader.strings(key, []);
  for (const value of values) {
    if (!ID_OR_TAG.test(value)) reader.fail(`${key} entry '${value}' is not an id or #tag`);
  }
  return values;
}

/** The ids of the project's items with `msm:throwable` (ADR 0056), which `ThrownItemEntity` throws. */
function throwableItemIds(context: GenerationContext): Set<string> {
  const ids = new Set<string>();
  for (const item of context.input.items) {
    const components = item.definition.components;
    if (
      typeof components === 'object' &&
      components !== null &&
      !Array.isArray(components) &&
      Object.hasOwn(components, 'msm:throwable')
    ) {
      ids.add(fullId(item.id));
    }
  }
  return ids;
}

function readRanged(
  component: Reader | undefined,
  events: Events,
  throwables: ReadonlySet<string>,
): RangedAttack | undefined {
  if (component === undefined) return undefined;
  component.onlyKeys(
    [
      'projectile',
      'damage',
      'speed',
      'inaccuracy',
      'interval_ticks',
      'charge_ticks',
      'range',
      'sound',
      'on_shoot',
    ],
    'msm:ranged_attack field',
  );
  const projectile = fullId(component.requiredString('projectile'));
  let kind: RangedAttack['kind'];
  if (throwables.has(projectile)) kind = 'throwable';
  else if (ARROW_ITEMS.includes(projectile)) kind = 'arrow';
  else if (VANILLA_PROJECTILE_ITEMS.includes(projectile)) kind = 'item';
  else {
    // Stricter than msm_runtime, which logs one error at the first shot and shoots nothing.
    return component.fail(
      `projectile ${projectile} is neither an arrow, a vanilla projectile item nor a project item with msm:throwable`,
    );
  }
  const sound = component.optionalString('sound');
  if (sound !== undefined && !SOUND_ID.test(sound)) {
    component.fail(`sound '${sound}' is not a sound event id`);
  }
  const onShoot = component.optionalString('on_shoot');
  return {
    projectile,
    kind,
    damage: inRange(component, 'damage', component.number('damage', 2), 0),
    speed: inRange(component, 'speed', component.number('speed', 1.6), 0.1, 5),
    inaccuracy: inRange(component, 'inaccuracy', component.number('inaccuracy', 6), 0, 20),
    intervalTicks: inRange(component, 'interval_ticks', component.integer('interval_ticks', 40), 5),
    chargeTicks: inRange(component, 'charge_ticks', component.integer('charge_ticks', 20), 0, 200),
    range: inRange(component, 'range', component.number('range', 15), 1, 64),
    sound: fullId(sound ?? 'minecraft:entity.skeleton.shoot'),
    onShoot: onShoot === undefined ? undefined : eventMethod(component, events, onShoot),
  };
}

function readVariants(component: Reader | undefined): Variants | undefined {
  if (component === undefined) return undefined;
  component.onlyKeys(['choose', 'variants'], 'msm:variants field');
  const choose = component.enumConstant('choose', ['random', 'biome'], 'random');
  if (!component.has('variants')) component.fail('variants is missing');
  const entries = component.objects('variants');
  if (entries.length < 1 || entries.length > 32) {
    component.fail(`variants must list 1 to 32 variants, not ${entries.length}`);
  }
  return {
    biome: choose === 'BIOME',
    variants: entries.map((entry) => {
      entry.onlyKeys(['id', 'texture', 'weight', 'biomes'], 'msm:variants variant field');
      const texture = splitId(entry.requiredString('texture'));
      return {
        id: entry.requiredString('id'),
        texture: `${texture.namespace}:textures/${texture.path}.png`,
        weight: inRange(entry, 'weight', entry.integer('weight', 1), 1),
        biomes: idsOrTags(entry, 'biomes', false),
      };
    }),
  };
}

function readBossBar(component: Reader | undefined): BossBar | undefined {
  if (component === undefined) return undefined;
  component.onlyKeys(
    ['colour', 'overlay', 'darken_sky', 'fog', 'music', 'range'],
    'msm:boss_bar field',
  );
  const range = component.optionalNumber('range');
  return {
    colour: component.enumConstant('colour', BOSS_BAR_COLOURS, 'purple'),
    overlay: component.enumConstant('overlay', BOSS_BAR_OVERLAYS, 'progress'),
    darkenSky: component.boolean('darken_sky', false),
    fog: component.boolean('fog', false),
    music: component.boolean('music', false),
    range: range === undefined ? undefined : inRange(component, 'range', range, 8, 256),
  };
}

/**
 * `msm:tameable` (ADR 0071 D1). Stricter than msm_runtime, which logs an error and drops the
 * component on a base other than `animal`: that fails generation here.
 */
function readTameable(
  component: Reader | undefined,
  base: string,
  events: Events,
): Tameable | undefined {
  if (component === undefined) return undefined;
  if (base !== 'animal') component.fail("msm:tameable needs base 'animal'");
  component.onlyKeys(
    [
      'items',
      'chance',
      'sit',
      'follows_owner',
      'follow',
      'defends_owner',
      'tamed_health',
      'on_tame',
    ],
    'msm:tameable field',
  );
  const follow = component.object('follow');
  follow?.onlyKeys(['speed', 'start_distance', 'stop_distance'], 'msm:tameable follow field');
  const followNumber = (key: string, fallback: number): number =>
    follow === undefined ? fallback : inRange(follow, key, follow.number(key, fallback), 0);
  const tamedHealth = component.optionalNumber('tamed_health');
  const onTame = component.optionalString('on_tame');
  return {
    items: idsOrTags(component, 'items', true),
    chance: inRange(component, 'chance', component.number('chance', 0.33), 0, 1),
    sit: component.boolean('sit', true),
    followsOwner: component.boolean('follows_owner', true),
    follow: {
      speed: followNumber('speed', 1),
      startDistance: followNumber('start_distance', 10),
      stopDistance: followNumber('stop_distance', 2),
    },
    defendsOwner: component.boolean('defends_owner', true),
    tamedHealth:
      tamedHealth === undefined ? undefined : inRange(component, 'tamed_health', tamedHealth, 1),
    onTame: onTame === undefined ? undefined : eventMethod(component, events, onTame),
  };
}

/** `msm:breedable` (ADR 0071 D2); on a base other than `animal`, stricter than msm_runtime as taming. */
function readBreedable(
  component: Reader | undefined,
  base: string,
  events: Events,
): Breedable | undefined {
  if (component === undefined) return undefined;
  if (base !== 'animal') component.fail("msm:breedable needs base 'animal'");
  component.onlyKeys(
    ['items', 'baby_scale', 'grow_up_ticks', 'tempted', 'follow_parents', 'on_breed'],
    'msm:breedable field',
  );
  const onBreed = component.optionalString('on_breed');
  return {
    items: idsOrTags(component, 'items', true),
    babyScale: inRange(component, 'baby_scale', component.number('baby_scale', 0.5), 0.1, 1),
    growUpTicks: inRange(
      component,
      'grow_up_ticks',
      component.integer('grow_up_ticks', VANILLA_GROW_UP_TICKS),
      1,
    ),
    tempted: component.boolean('tempted', true),
    followParents: component.boolean('follow_parents', true),
    onBreed: onBreed === undefined ? undefined : eventMethod(component, events, onBreed),
  };
}

/** `msm:rideable` (ADR 0071 D3), any base. */
function readRideable(component: Reader | undefined, events: Events): Rideable | undefined {
  if (component === undefined) return undefined;
  component.onlyKeys(
    [
      'saddle',
      'controlled_by',
      'speed',
      'jump',
      'passengers',
      'rider_offset',
      'saddle_bone',
      'on_mount',
    ],
    'msm:rideable field',
  );
  let riderOffset: Rideable['riderOffset'];
  if (component.has('rider_offset')) {
    const raw = component.value.rider_offset;
    if (
      !Array.isArray(raw) ||
      raw.length !== 3 ||
      raw.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))
    ) {
      component.fail('rider_offset must be a list of exactly 3 numbers');
    }
    riderOffset = raw as [number, number, number];
  }
  const onMount = component.optionalString('on_mount');
  return {
    saddle: component.boolean('saddle', true),
    ownerOnly: component.enumConstant('controlled_by', ['anyone', 'owner'], 'anyone') === 'OWNER',
    speed: inRange(component, 'speed', component.number('speed', 1), 0),
    jump: inRange(component, 'jump', component.number('jump', 0), 0),
    passengers: inRange(component, 'passengers', component.integer('passengers', 1), 1, 4),
    riderOffset,
    saddleBone: component.optionalString('saddle_bone'),
    onMount: onMount === undefined ? undefined : eventMethod(component, events, onMount),
  };
}

function readSounds(reader: Reader): Sounds | undefined {
  const sounds = reader.object('sounds');
  if (sounds === undefined) return undefined;
  sounds.onlyKeys(SOUND_KEYS, 'sounds field');
  const id = (key: string): string | undefined => {
    const value = sounds.optionalString(key);
    if (value !== undefined && !SOUND_ID.test(value)) {
      sounds.fail(`${key} '${value}' is not a sound event id`);
    }
    return value;
  };
  const interval = sounds.has('ambient_interval_ticks')
    ? sounds.requiredInteger('ambient_interval_ticks')
    : undefined;
  if (interval !== undefined && interval < 20)
    sounds.fail('ambient_interval_ticks must be at least 20');
  return {
    ambient: id('ambient'),
    hurt: id('hurt'),
    death: id('death'),
    step: id('step'),
    ambientIntervalTicks: interval,
  };
}

/** The distinct sound event ids a definition names, in field order (the start-up check). */
function soundIds(sounds: Sounds | undefined): string[] {
  if (sounds === undefined) return [];
  const ids = [sounds.ambient, sounds.hurt, sounds.death, sounds.step].filter(
    (id): id is string => id !== undefined,
  );
  return [...new Set(ids)];
}

function eventOf(component: Reader | undefined, events: Events): string | undefined {
  if (component === undefined) return undefined;
  component.onlyKeys(['event'], `${component.where} field`);
  return eventMethod(component, events, component.requiredString('event'));
}

function readEntity(input: DefinitionInput, throwables: ReadonlySet<string>): EntitySpec {
  const reader = readDefinition(input);
  reader.onlyKeys(ENTITY_KEYS, 'top-level key');
  checkFormat(reader);
  const components = reader.requiredObject('components');
  components.onlyKeys(ENTITY_COMPONENTS, 'component');
  const events = readEvents(reader, 'entity');
  const size = reader.requiredObject('size');
  size.onlyKeys(['width', 'height'], 'size field');

  let spawnEgg: EntitySpec['spawnEgg'];
  const rawEgg = input.definition.spawn_egg;
  if (rawEgg === false) spawnEgg = undefined;
  else if (rawEgg === true) reader.fail('spawn_egg must be an object or false');
  else {
    const egg = reader.object('spawn_egg');
    egg?.onlyKeys(['creative_tab'], 'spawn_egg key');
    spawnEgg = { creativeTab: egg?.optionalString('creative_tab') ?? 'minecraft:spawn_eggs' };
  }

  const rawSpawn = reader.object('spawn');
  rawSpawn?.onlyKeys(
    ['biomes', 'weight', 'min_group', 'max_group', 'placement', 'heightmap', 'rule'],
    'spawn key',
  );
  const spawn: Spawn | undefined =
    rawSpawn === undefined
      ? undefined
      : {
          biomes: rawSpawn.strings('biomes', []),
          weight: rawSpawn.requiredInteger('weight'),
          minGroup: rawSpawn.requiredInteger('min_group'),
          maxGroup: rawSpawn.requiredInteger('max_group'),
          placement: rawSpawn.enumConstant('placement', PLACEMENTS, 'on_ground'),
          heightmap: rawSpawn.enumConstant('heightmap', HEIGHTMAPS, 'motion_blocking_no_leaves'),
          rule: rawSpawn.enumConstant('rule', RULES, 'mob').toLowerCase(),
        };
  if (rawSpawn !== undefined && !rawSpawn.has('biomes')) rawSpawn.fail('biomes is missing');

  const model = components.requiredObject('msm:animated_model');
  model.onlyKeys(
    [
      'model',
      'animations',
      'texture',
      'scale',
      'idle',
      'walk',
      'attack',
      'shoot',
      'sit',
      'fly',
      'swim',
      'transition_ticks',
      'renderer',
    ],
    'msm:animated_model field',
  );
  // ADR 0072 D8, limit M15: the Java project draws every entity with GeckoLib, whatever the renderer.
  model.enumConstant('renderer', RENDERERS, 'auto');
  const modelId = model.requiredString('model');
  const texture = splitId(model.requiredString('texture'));

  const health = components.object('msm:health');
  health?.onlyKeys(['max'], 'msm:health field');
  const movement = components.object('msm:movement');
  movement?.onlyKeys(
    [
      'speed',
      'follow_range',
      'knockback_resistance',
      'swims',
      'fire_immune',
      'mode',
      'flying_speed',
      'hovers',
      'breathes_air',
      'dry_out_ticks',
      'step_height',
    ],
    'msm:movement field',
  );
  const mode = (movement?.enumConstant('mode', MOVEMENT_MODES, 'walk') ?? 'WALK').toLowerCase();
  const flyingSpeed =
    movement?.number('flying_speed', DEFAULT_FLYING_SPEED) ?? DEFAULT_FLYING_SPEED;
  if (movement !== undefined) inRange(movement, 'flying_speed', flyingSpeed, 0);
  const dryOutTicks = movement?.integer('dry_out_ticks', 300) ?? 300;
  if (movement !== undefined) inRange(movement, 'dry_out_ticks', dryOutTicks, 20);
  const stepHeight = movement?.optionalNumber('step_height');
  if (movement !== undefined && stepHeight !== undefined) {
    inRange(movement, 'step_height', stepHeight, 0, 10);
  }
  const attack = components.object('msm:attack');
  attack?.onlyKeys(['damage', 'knockback', 'on_attack'], 'msm:attack field');
  const aiGoals = components.object('msm:ai_goals');
  aiGoals?.onlyKeys(['goals'], 'msm:ai_goals field');
  const goals = aiGoals?.objects('goals') ?? [];
  if (aiGoals !== undefined && !aiGoals.has('goals')) aiGoals.fail('goals is missing');
  for (const goal of goals) {
    const type = goal.requiredString('type');
    if (!GOAL_TYPES.includes(type)) goal.fail(`goal type '${type}' cannot be ejected`);
  }
  const base = reader.string('base', 'mob');
  if (!(BASES as readonly string[]).includes(base)) {
    reader.fail(`base '${base}' is not one of ${BASES.join(', ')}`);
  }
  const onAttack = attack?.optionalString('on_attack');
  const onTick = components.object('msm:on_tick');
  onTick?.onlyKeys(['event', 'interval_ticks'], 'msm:on_tick field');
  const tickInterval = onTick?.integer('interval_ticks', 20) ?? 20;
  if (tickInterval < 5) onTick?.fail('interval_ticks must be at least 5');

  return {
    input,
    reader,
    category: reader.enumConstant('category', CATEGORIES, ''),
    width: size.requiredNumber('width'),
    height: size.requiredNumber('height'),
    eyeHeight: reader.optionalNumber('eye_height'),
    lootTable: reader.optionalString('loot_table'),
    spawnEgg,
    spawn,
    model: {
      model: modelId,
      animations: model.optionalString('animations') ?? modelId,
      texture: `${texture.namespace}:textures/${texture.path}.png`,
      scale: model.number('scale', 1),
      idle: model.optionalString('idle'),
      walk: model.optionalString('walk'),
      attack: model.optionalString('attack'),
      shoot: model.optionalString('shoot'),
      sit: model.optionalString('sit'),
      fly: model.optionalString('fly'),
      swim: model.optionalString('swim'),
      transitionTicks: model.integer('transition_ticks', 0),
    },
    base: base as Base,
    maxHealth: health?.requiredNumber('max') ?? 20,
    movement: {
      speed: movement?.number('speed', 0.25) ?? 0.25,
      followRange: movement?.number('follow_range', 16) ?? 16,
      knockbackResistance: movement?.number('knockback_resistance', 0) ?? 0,
      swims: movement?.boolean('swims', true) ?? true,
      fireImmune: movement?.boolean('fire_immune', false) ?? false,
      mode: mode as MovementMode,
      flyingSpeed,
      hovers: movement?.boolean('hovers', true) ?? true,
      breathesAir: movement?.boolean('breathes_air', false) ?? false,
      dryOutTicks,
      stepHeight,
    },
    ranged: readRanged(components.object('msm:ranged_attack'), events, throwables),
    variants: readVariants(components.object('msm:variants')),
    bossBar: readBossBar(components.object('msm:boss_bar')),
    tameable: readTameable(components.object('msm:tameable'), base, events),
    breedable: readBreedable(components.object('msm:breedable'), base, events),
    rideable: readRideable(components.object('msm:rideable'), events),
    attack:
      attack === undefined
        ? undefined
        : {
            damage: attack.requiredNumber('damage'),
            knockback: attack.number('knockback', 0),
            onAttack: onAttack === undefined ? undefined : eventMethod(attack, events, onAttack),
          },
    goals,
    onHurt: eventOf(components.object('msm:on_hurt'), events),
    onDeath: eventOf(components.object('msm:on_death'), events),
    onInteract: eventOf(components.object('msm:on_interact'), events),
    onTick:
      onTick === undefined
        ? undefined
        : {
            method: eventMethod(onTick, events, onTick.requiredString('event')),
            interval: tickInterval,
          },
    onSpawn: eventOf(components.object('msm:on_spawn'), events),
    events,
    sounds: readSounds(reader),
  };
}

/** The generated names of one entity. */
export interface EntityNames {
  readonly spec: EntitySpec;
  readonly field: string;
  readonly entityClass: string;
  readonly modelClass: string;
}

/**
 * Generates `ModEntities.java` and the entity classes; returns nothing when there are no
 * entities.
 *
 * @returns The registration class's simple name and the names the client entrypoint needs.
 */
export function generateEntities(
  context: GenerationContext,
  classNames: NameTable,
): { className: string; entities: EntityNames[]; usesRangedGoal: boolean } | undefined {
  const { entities } = context.input;
  if (entities.length === 0) return undefined;
  if (!context.input.geckolib) {
    throw new Error(
      'Entities render through GeckoLib, but the project has no GeckoLib (JavaProjectInput.geckolib is false).',
    );
  }
  const throwables = throwableItemIds(context);
  const specs = entities.map((entity) => readEntity(entity, throwables));
  const fields = new NameTable();
  const file = new JavaFile(
    context.input.javaPackage,
    'the msm/<namespace>/entity/*.json definitions',
  );
  const registry = file.use('net.minecraft.core.Registry');
  const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
  const registries = file.use('net.minecraft.core.registries.Registries');
  const resourceKey = file.use('net.minecraft.resources.ResourceKey');
  const entityType = file.use('net.minecraft.world.entity.EntityType');
  const mobCategory = file.use('net.minecraft.world.entity.MobCategory');

  const body: string[] = [];
  const register: string[] = [];
  const names: EntityNames[] = [];
  let needsEggHelper = false;
  for (const spec of specs) {
    const { path } = splitId(spec.input.id);
    const field = fields.take(constantName(path), (name) => [
      name,
      `${name}_KEY`,
      `${name}_SPAWN_EGG`,
    ]);
    const entityClass = classNames.take(className(path, 'Entity'), (n) => [`entity.${n}`], '');
    const modelClass = classNames.take(className(path, 'Model'), (n) => [`client.entity.${n}`], '');
    names.push({ spec, field, entityClass, modelClass });
    writeEntityClass(context, spec, entityClass);
    const type = file.use(`${packageOf(context, 'entity')}.${entityClass}`);

    const fabricEntityType = file.use(
      'net.fabricmc.fabric.api.object.builder.v1.entity.FabricEntityType',
    );
    const placementTypes = file.use('net.minecraft.world.entity.SpawnPlacementTypes');
    const heightmap = file.use('net.minecraft.world.level.levelgen.Heightmap', 'Types');
    const placement = spec.spawn?.placement ?? 'ON_GROUND';
    const heightmapType = spec.spawn?.heightmap ?? 'MOTION_BLOCKING_NO_LEAVES';
    const builder = [
      `${fabricEntityType}.Builder.createMob(${type}::new, ${mobCategory}.${spec.category}, mob -> mob`,
      `                .defaultAttributes(${type}::createAttributes)`,
      `                .spawnPlacement(${placementTypes}.${placement}, ${heightmap}.${heightmapType}, ${ruleExpression(file, spec.spawn?.rule ?? 'mob')}))`,
      `        .sized(${javaFloat(spec.width)}, ${javaFloat(spec.height)})`,
    ];
    if (spec.eyeHeight !== undefined)
      builder.push(`        .eyeHeight(${javaFloat(spec.eyeHeight)})`);
    if (spec.movement.fireImmune) builder.push('        .fireImmune()');
    if (spec.bossBar !== undefined) {
      // ADR 0071 D5: the wither's tracking range, so far players get the bar.
      builder.push(`        .clientTrackingRange(${javaInt(BOSS_TRACKING_RANGE)})`);
    }
    builder.push(`        .build(${field}_KEY));`);
    body.push(
      '',
      `/** {@code ${spec.input.id}} (${spec.input.path}). */`,
      `public static final ${resourceKey}<${entityType}<?>> ${field}_KEY = ${resourceKey}.create(${registries}.ENTITY_TYPE, ${identifierExpression(file, spec.input.id)});`,
      `public static final ${entityType}<${type}> ${field} = ${registry}.register(${builtIn}.ENTITY_TYPE, ${field}_KEY,`,
      `        ${builder[0]}`,
      ...builder
        .slice(1)
        .flatMap((line) => line.split('\n'))
        .map((line) => `        ${line}`),
    );
    if (spec.spawnEgg !== undefined) {
      needsEggHelper = true;
      const spawnEggItem = file.use('net.minecraft.world.item.SpawnEggItem');
      body.push(
        `public static final ${spawnEggItem} ${field}_SPAWN_EGG = registerSpawnEgg(${javaString(`${spec.input.id}_spawn_egg`)}, ${field});`,
      );
      register.push(tabLine(file, spec.spawnEgg.creativeTab, `${field}_SPAWN_EGG`));
    }
    if (spec.spawn !== undefined) register.push(...spawnLines(file, spec, field));
  }
  const helpers: string[] = [];
  const soundChecks = specs.flatMap((spec) =>
    soundIds(spec.sounds).map(
      (id) => `    warnUnknownSound(${javaString(spec.input.path)}, ${javaString(id)});`,
    ),
  );
  if (soundChecks.length > 0) {
    // Other mods may register sound events after this one: check once the server runs.
    const lifecycle = file.use('net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents');
    register.push(`${lifecycle}.SERVER_STARTED.register(server -> {`, ...soundChecks, '});');
    const identifier = file.use('net.minecraft.resources.Identifier');
    const logger = file.use('org.slf4j.Logger');
    const loggerFactory = file.use('org.slf4j.LoggerFactory');
    body.unshift(
      '',
      `private static final ${logger} LOGGER = ${loggerFactory}.getLogger(${javaString(context.input.modId)});`,
    );
    helpers.push(
      '',
      '/** Warns about a sounds id that no mod registered; the vanilla sound stays (ADR 0057 D6). */',
      'private static void warnUnknownSound(String file, String id) {',
      `    if (!${builtIn}.SOUND_EVENT.containsKey(${identifier}.parse(id))) {`,
      '        LOGGER.warn("{}: unknown sound event in sounds {}; the vanilla sound stays", file, id);',
      '    }',
      '}',
    );
  }
  if (needsEggHelper) {
    const item = file.use('net.minecraft.world.item.Item');
    const spawnEggItem = file.use('net.minecraft.world.item.SpawnEggItem');
    const identifier = file.use('net.minecraft.resources.Identifier');
    helpers.push(
      '',
      `private static ${spawnEggItem} registerSpawnEgg(String id, ${entityType}<?> type) {`,
      `    ${resourceKey}<${item}> key = ${resourceKey}.create(${registries}.ITEM, ${identifier}.parse(id));`,
      `    return ${registry}.register(${builtIn}.ITEM, key, new ${spawnEggItem}(new ${item}.Properties().setId(key).spawnEgg(type)));`,
      '}',
    );
  }
  const lines = [
    '/** The entity types and spawn eggs, registered when the class loads. */',
    'public final class ModEntities {',
    ...indent(trimBlank(body)),
    '',
    '    private ModEntities() {}',
    '',
    soundChecks.length > 0
      ? '    /** Loads the class (registering every entity type), adds the spawn eggs to their tabs, the natural spawns and the sound check. */'
      : '    /** Loads the class (registering every entity type), adds the spawn eggs to their tabs and the natural spawns. */',
    '    public static void register() {',
    ...indent(register, 2),
    '    }',
    ...indent(helpers),
    '}',
  ];
  context.files.push({ path: classPath(context, '', 'ModEntities'), contents: file.render(lines) });
  const usesRangedGoal = specs.some(
    (spec) =>
      spec.ranged !== undefined &&
      spec.goals.some((goal) => goal.requiredString('type') === 'ranged_attack'),
  );
  return { className: 'ModEntities', entities: names, usesRangedGoal };
}

/** The vanilla spawn check of a rule, as the runtime's `MsmEntityRegistrar.rule`. */
function ruleExpression(file: JavaFile, rule: string): string {
  switch (rule) {
    case 'monster':
      return `${file.use('net.minecraft.world.entity.monster.Monster')}::checkMonsterSpawnRules`;
    case 'surface_monster':
      return `${file.use('net.minecraft.world.entity.monster.Monster')}::checkSurfaceMonstersSpawnRules`;
    case 'any_light_monster': {
      // Monster.checkAnyLightMonsterSpawnRules needs a Monster type: its body, not peaceful plus the mob rule.
      const difficulty = file.use('net.minecraft.world.Difficulty');
      const mob = file.use('net.minecraft.world.entity.Mob');
      return `(type, level, reason, pos, random) -> level.getDifficulty() != ${difficulty}.PEACEFUL && ${mob}.checkMobSpawnRules(type, level, reason, pos, random)`;
    }
    case 'always':
      return '(type, level, reason, pos, random) -> true';
    case 'animal': {
      // Animal.checkAnimalSpawnRules needs an Animal type: its body, for any base (ADR 0070 D6).
      const blockTags = file.use('net.minecraft.tags.BlockTags');
      const reason = file.use('net.minecraft.world.entity.EntitySpawnReason');
      return `(type, level, reason, pos, random) -> level.getBlockState(pos.below()).is(${blockTags}.ANIMALS_SPAWNABLE_ON)\n                        && (${reason}.ignoresLightRequirements(reason) || level.getRawBrightness(pos, 0) > 8)`;
    }
    case 'water_animal': {
      // WaterAnimal.checkSurfaceWaterAnimalSpawnRules needs a WaterAnimal type: its body (ADR 0070 D6).
      const fluidTags = file.use('net.minecraft.tags.FluidTags');
      const blocks = file.use('net.minecraft.world.level.block.Blocks');
      return `(type, level, reason, pos, random) -> pos.getY() >= level.getSeaLevel() - 13 && pos.getY() <= level.getSeaLevel()\n                        && level.getFluidState(pos.below()).is(${fluidTags}.WATER) && level.getBlockState(pos.above()).is(${blocks}.WATER)`;
    }
    default:
      return `${file.use('net.minecraft.world.entity.Mob')}::checkMobSpawnRules`;
  }
}

/** `BiomeModifications.addSpawn` over the union of the listed biomes and biome tags. */
function spawnLines(file: JavaFile, spec: EntitySpec, field: string): string[] {
  const spawn = spec.spawn as Spawn;
  if (spawn.minGroup > spawn.maxGroup) {
    return [
      `// ${spec.input.id}: spawn min_group ${spawn.minGroup} is above max_group ${spawn.maxGroup}; natural spawn not registered (as msm_runtime).`,
    ];
  }
  const modifications = file.use('net.fabricmc.fabric.api.biome.v1.BiomeModifications');
  const selectors = file.use('net.fabricmc.fabric.api.biome.v1.BiomeSelectors');
  const registries = file.use('net.minecraft.core.registries.Registries');
  const parts: string[] = [];
  const keys: string[] = [];
  for (const entry of spawn.biomes) {
    if (entry.startsWith('#')) {
      const tagKey = file.use('net.minecraft.tags.TagKey');
      parts.push(
        `${selectors}.tag(${tagKey}.create(${registries}.BIOME, ${identifierExpression(file, entry.slice(1))}))`,
      );
    } else {
      const resourceKey = file.use('net.minecraft.resources.ResourceKey');
      keys.push(`${resourceKey}.create(${registries}.BIOME, ${identifierExpression(file, entry)})`);
    }
  }
  if (keys.length > 0) {
    const list = file.use('java.util.List');
    parts.push(`${selectors}.includeByKey(${list}.of(${keys.join(', ')}))`);
  }
  let selector: string;
  if (parts.length === 0) {
    const context = file.use('net.fabricmc.fabric.api.biome.v1.BiomeSelectionContext');
    const predicate = file.use('java.util.function.Predicate');
    selector = `((${predicate}<${context}>) context -> false)`;
  } else {
    selector = parts.map((part, index) => (index === 0 ? part : `.or(${part})`)).join('');
  }
  const mobCategory = file.use('net.minecraft.world.entity.MobCategory');
  return [
    `${modifications}.addSpawn(${selector},`,
    `        ${mobCategory}.${spec.category}, ${field}, ${javaInt(spawn.weight)}, ${javaInt(spawn.minGroup)}, ${javaInt(spawn.maxGroup)});`,
  ];
}

/** The steps of a right click before `msm:on_interact` (ADR 0071 D1), as `MobDriver.mobInteract`. */
type InteractStep = 'breedingInteract' | 'tamingInteract' | 'ridingInteract';

const INTERACT_STEP_NAMES: Record<InteractStep, string> = {
  breedingInteract: 'the breeding food',
  tamingInteract: "the taming food and the owner's sit toggle",
  ridingInteract: 'mounting',
};

function interactSteps(spec: EntitySpec): InteractStep[] {
  const steps: InteractStep[] = [];
  if (spec.breedable !== undefined) steps.push('breedingInteract');
  if (spec.tameable !== undefined) steps.push('tamingInteract');
  if (spec.rideable !== undefined) steps.push('ridingInteract');
  return steps;
}

/**
 * The priority after the definition's last fighting or fleeing goal (`melee_attack` with
 * `msm:attack`, `ranged_attack` with `msm:ranged_attack`, `flee`, `panic`, `leap_at_target`);
 * 1 when there is none (`MobTaming.afterFighting`).
 */
function afterFighting(spec: EntitySpec): number {
  let last = 0;
  spec.goals.forEach((goal, n) => {
    const type = goal.requiredString('type');
    const fighting =
      type === 'melee_attack'
        ? spec.attack !== undefined
        : type === 'ranged_attack'
          ? spec.ranged !== undefined
          : type === 'flee' || type === 'panic' || type === 'leap_at_target';
    if (fighting) last = Math.max(last, goal.has('priority') ? goal.integer('priority', 0) : n + 1);
  });
  return last + 1;
}

/** Animation names to register as triggerable per controller, as `EntityDefinition.triggerableAnimations`. */
function triggerable(spec: EntitySpec): Map<string, string[]> {
  const out = new Map<string, string[]>([[TRIGGERED_CONTROLLER, []]]);
  const add = (controller: string, name: string): void => {
    const names = out.get(controller) ?? [];
    if (!names.includes(name)) names.push(name);
    out.set(controller, names);
  };
  for (const name of [spec.model.idle, spec.model.walk, spec.model.attack, spec.model.shoot]) {
    if (name !== undefined) add(TRIGGERED_CONTROLLER, name);
  }
  for (const [controller, name] of playAnimations(spec.events)) add(controller, name);
  return out;
}

function writeEntityClass(context: GenerationContext, spec: EntitySpec, name: string): void {
  const file = new JavaFile(packageOf(context, 'entity'), spec.input.path);
  const baseClass = file.use(BASE_CLASSES[spec.base]);
  const geoEntity = file.use('com.geckolib.animatable.GeoEntity');
  const entityType = file.use('net.minecraft.world.entity.EntityType');
  const level = file.use('net.minecraft.world.level.Level');
  const instanceCache = file.use('com.geckolib.animatable.instance.AnimatableInstanceCache');
  const geckoLibUtil = file.use('com.geckolib.util.GeckoLibUtil');
  const attributeSupplier = file.use('net.minecraft.world.entity.ai.attributes.AttributeSupplier');
  const attributes = file.use('net.minecraft.world.entity.ai.attributes.Attributes');
  const mob = file.use('net.minecraft.world.entity.Mob');
  const actions = noteActions(context, file, spec.events);
  const { mode } = spec.movement;

  const members: string[] = [];
  if (spec.events.byId.size > 0)
    members.push(`private static final String OWNER = ${javaString(spec.input.id)};`);

  // Goals: static type predicates, built before any instance (registerGoals runs in the Mob constructor).
  const goalLines: string[] = [];
  const predicates: string[] = [];
  const predicateFields = new NameTable();
  let usesOfTypes = false;
  let usesOfItems = false;
  let usesTempt = false;
  const ofTypes = (field: string, ids: string[]): string => {
    const predicate = file.use('java.util.function.Predicate');
    const livingEntity = file.use('net.minecraft.world.entity.LivingEntity');
    const name = predicateFields.take(field);
    usesOfTypes = true;
    predicates.push(
      `private static final ${predicate}<${livingEntity}> ${name} = ofTypes(${ids.map(javaString).join(', ')});`,
    );
    return name;
  };
  const ofItems = (field: string, ids: string[]): string => {
    const predicate = file.use('java.util.function.Predicate');
    const itemStack = file.use('net.minecraft.world.item.ItemStack');
    const name = predicateFields.take(field);
    usesOfItems = true;
    predicates.push(
      `private static final ${predicate}<${itemStack}> ${name} = ofItems(${ids.map(javaString).join(', ')});`,
    );
    return name;
  };
  /** The target goals of `melee_attack` and `ranged_attack`: retaliate (1) and targets (2). */
  const targetGoals = (goal: Reader, n: number, field: string): void => {
    if (goal.boolean('retaliate', false)) {
      goalLines.push(
        `targetSelector.addGoal(1, new ${file.use('net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal')}(this));`,
      );
    }
    const targets = goal.strings('targets', []);
    if (targets.length > 0) {
      const predicate = ofTypes(`${field}_${n + 1}`, targets);
      const targetGoal = file.use(
        'net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal',
      );
      const livingEntity = file.use('net.minecraft.world.entity.LivingEntity');
      goalLines.push(
        `targetSelector.addGoal(2, new ${targetGoal}<>(this, ${livingEntity}.class, ${goal.boolean('must_see', true)},`,
        `        (target, level) -> ${predicate}.test(target)));`,
      );
    }
  };
  // ADR 0070 D3: swimmers and amphibious mobs never float (the runtime removes the goal again).
  if (spec.movement.swims && (mode === 'walk' || mode === 'fly')) {
    goalLines.push(
      `goalSelector.addGoal(0, new ${file.use('net.minecraft.world.entity.ai.goal.FloatGoal')}(this));`,
    );
  }
  spec.goals.forEach((goal, n) => {
    const type = goal.requiredString('type');
    const priority = goal.has('priority') ? goal.integer('priority', 0) : n + 1;
    switch (type) {
      case 'wander': {
        goal.onlyKeys(['type', 'priority', 'speed', 'avoid_water'], 'wander field');
        const speed = javaFloat(goal.number('speed', 1));
        const avoidWater = goal.boolean('avoid_water', true);
        // MobMovement.wanderGoal: the mode decides the goal.
        let strollGoal: string;
        let extra = '';
        if (mode === 'fly') {
          strollGoal = file.use('net.minecraft.world.entity.ai.goal.WaterAvoidingRandomFlyingGoal');
        } else if (mode === 'swim') {
          strollGoal = file.use('net.minecraft.world.entity.ai.goal.RandomSwimmingGoal');
          extra = ', 40';
        } else if (mode === 'walk' && avoidWater) {
          strollGoal = file.use('net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal');
        } else {
          strollGoal = file.use('net.minecraft.world.entity.ai.goal.RandomStrollGoal');
        }
        goalLines.push(
          `goalSelector.addGoal(${priority}, new ${strollGoal}(this, ${speed}${extra}));`,
        );
        break;
      }
      case 'look_at_player': {
        goal.onlyKeys(['type', 'priority', 'distance'], 'look_at_player field');
        const lookGoal = file.use('net.minecraft.world.entity.ai.goal.LookAtPlayerGoal');
        const player = file.use('net.minecraft.world.entity.player.Player');
        goalLines.push(
          `goalSelector.addGoal(${priority}, new ${lookGoal}(this, ${player}.class, ${javaFloat(goal.number('distance', 8))}));`,
        );
        break;
      }
      case 'look_around':
        goal.onlyKeys(['type', 'priority'], 'look_around field');
        goalLines.push(
          `goalSelector.addGoal(${priority}, new ${file.use('net.minecraft.world.entity.ai.goal.RandomLookAroundGoal')}(this));`,
        );
        break;
      case 'melee_attack': {
        goal.onlyKeys(
          ['type', 'priority', 'speed', 'targets', 'must_see', 'retaliate'],
          'melee_attack field',
        );
        if (spec.attack === undefined) {
          goalLines.push(
            `// melee_attack (goal ${n + 1}) left out: without msm:attack the goal does nothing (as msm_runtime).`,
          );
          break;
        }
        const meleeGoal = file.use('net.minecraft.world.entity.ai.goal.MeleeAttackGoal');
        goalLines.push(
          `goalSelector.addGoal(${priority}, new ${meleeGoal}(this, ${javaFloat(goal.number('speed', 1))}, true));`,
        );
        targetGoals(goal, n, 'MELEE_TARGETS');
        break;
      }
      case 'ranged_attack': {
        goal.onlyKeys(
          ['type', 'priority', 'speed', 'strafe', 'targets', 'must_see', 'retaliate'],
          'ranged_attack field',
        );
        inRange(goal, 'speed', goal.number('speed', 1), 0);
        if (spec.ranged === undefined) {
          goalLines.push(
            `// ranged_attack (goal ${n + 1}) left out: without msm:ranged_attack the goal does nothing (as msm_runtime).`,
          );
          break;
        }
        const { chargeTicks, intervalTicks, range } = spec.ranged;
        goalLines.push(
          `goalSelector.addGoal(${priority}, new MobRangedAttackGoal<>(this, ${javaFloat(goal.number('speed', 1))}, ${javaInt(chargeTicks)}, ${javaInt(intervalTicks)}, ${javaFloat(range)}, ${goal.boolean('strafe', false)}));`,
        );
        targetGoals(goal, n, 'RANGED_TARGETS');
        break;
      }
      case 'tempt': {
        goal.onlyKeys(['type', 'priority', 'items', 'speed', 'scared'], 'tempt field');
        const speed = inRange(goal, 'speed', goal.number('speed', 1), 0);
        const field = ofItems(`TEMPT_ITEMS_${n + 1}`, idsOrTags(goal, 'items', true));
        usesTempt = true;
        goalLines.push(
          `goalSelector.addGoal(${priority}, new ${file.use('net.minecraft.world.entity.ai.goal.TemptGoal')}(this, ${javaFloat(speed)}, ${field}, ${goal.boolean('scared', false)}));`,
        );
        break;
      }
      case 'panic': {
        goal.onlyKeys(['type', 'priority', 'speed'], 'panic field');
        const speed = inRange(goal, 'speed', goal.number('speed', 1.25), 0);
        goalLines.push(
          `goalSelector.addGoal(${priority}, new ${file.use('net.minecraft.world.entity.ai.goal.PanicGoal')}(this, ${javaFloat(speed)}));`,
        );
        break;
      }
      case 'leap_at_target': {
        goal.onlyKeys(['type', 'priority', 'height'], 'leap_at_target field');
        const height = inRange(goal, 'height', goal.number('height', 0.4), 0);
        goalLines.push(
          `goalSelector.addGoal(${priority}, new ${file.use('net.minecraft.world.entity.ai.goal.LeapAtTargetGoal')}(this, ${javaFloat(height)}));`,
        );
        break;
      }
      case 'flee': {
        goal.onlyKeys(
          ['type', 'priority', 'from', 'distance', 'speed', 'sprint_speed'],
          'flee field',
        );
        if (!goal.has('from')) goal.fail('from is missing');
        const field = ofTypes(`FLEE_FROM_${n + 1}`, goal.strings('from', []));
        const avoidGoal = file.use('net.minecraft.world.entity.ai.goal.AvoidEntityGoal');
        const livingEntity = file.use('net.minecraft.world.entity.LivingEntity');
        goalLines.push(
          `goalSelector.addGoal(${priority}, new ${avoidGoal}<>(this, ${livingEntity}.class, ${javaFloat(goal.number('distance', 6))}, ${javaFloat(goal.number('speed', 1))}, ${javaFloat(goal.number('sprint_speed', 1.2))},`,
          `        ${field}::test));`,
        );
        break;
      }
      case 'follow': {
        goal.onlyKeys(
          ['type', 'priority', 'entities', 'speed', 'stop_distance', 'range'],
          'follow field',
        );
        if (!goal.has('entities')) goal.fail('entities is missing');
        context.usesFollowGoal = true;
        const field = ofTypes(`FOLLOW_${n + 1}`, goal.strings('entities', []));
        goalLines.push(
          `goalSelector.addGoal(${priority}, new FollowTypesGoal(this, ${field}, ${javaFloat(goal.number('speed', 1))}, ${javaFloat(goal.number('stop_distance', 2))}, ${javaFloat(goal.number('range', 16))}));`,
        );
        break;
      }
      default:
        goal.fail(`goal type '${type}' cannot be ejected`);
    }
  });
  // The component goals after the definition's own, as MobGoals.registerGoals: taming, then breeding.
  const after = afterFighting(spec);
  let tamingFood: string | undefined;
  let breedingFood: string | undefined;
  if (spec.tameable !== undefined) {
    const t = spec.tameable;
    tamingFood = ofItems('TAMING_FOOD', [...t.items]);
    if (t.sit) {
      goalLines.push(
        `goalSelector.addGoal(0, new ${file.use('net.minecraft.world.entity.ai.goal.SitWhenOrderedToGoal')}(this));`,
      );
    }
    if (t.followsOwner) {
      if (mode === 'walk' || mode === 'fly') {
        goalLines.push(
          `goalSelector.addGoal(${after}, new ${file.use('net.minecraft.world.entity.ai.goal.FollowOwnerGoal')}(this, ${javaFloat(t.follow.speed)}, ${javaFloat(t.follow.startDistance)}, ${javaFloat(t.follow.stopDistance)}));`,
        );
      } else {
        goalLines.push(
          `// follows_owner left out: FollowOwnerGoal takes only ground and flying navigation, not ${mode}'s (as msm_runtime).`,
        );
      }
    }
    if (t.defendsOwner) {
      goalLines.push(
        `targetSelector.addGoal(0, new ${file.use('net.minecraft.world.entity.ai.goal.target.OwnerHurtByTargetGoal')}(this));`,
        `targetSelector.addGoal(1, new ${file.use('net.minecraft.world.entity.ai.goal.target.OwnerHurtTargetGoal')}(this));`,
      );
    }
  }
  if (spec.breedable !== undefined) {
    const b = spec.breedable;
    breedingFood = ofItems('BREEDING_FOOD', [...b.items]);
    goalLines.push(
      `goalSelector.addGoal(${after + 1}, new ${file.use('net.minecraft.world.entity.ai.goal.BreedGoal')}(this, ${javaFloat(BREED_SPEED)}));`,
    );
    if (b.tempted) {
      usesTempt = true;
      goalLines.push(
        `goalSelector.addGoal(${after + 2}, new ${file.use('net.minecraft.world.entity.ai.goal.TemptGoal')}(this, ${javaFloat(BREED_TEMPT_SPEED)}, ${breedingFood}, false));`,
      );
    }
    if (b.followParents) {
      goalLines.push(
        `goalSelector.addGoal(${after + 3}, new ${file.use('net.minecraft.world.entity.ai.goal.FollowParentGoal')}(this, ${javaFloat(FOLLOW_PARENT_SPEED)}));`,
      );
    }
  }
  if (predicates.length > 0) members.push('', ...predicates);
  if (spec.variants !== undefined) members.push(...variantFields(file, spec.variants, name));
  if (spec.bossBar !== undefined) {
    members.push(
      '',
      '/** msm:boss_bar: built on the logical server on first use; never on the client. */',
      `private ${file.use('net.minecraft.server.level.ServerBossEvent')} bossEvent;`,
    );
  }
  members.push(
    '',
    `private final ${instanceCache} cache = ${geckoLibUtil}.createInstanceCache(this);`,
    '',
    `public ${name}(${entityType}<? extends ${baseClass}> type, ${level} level) {`,
    '    super(type, level);',
    ...indent(movementConstructor(file, spec)),
    '}',
    '',
    '/** The default attributes (msm:health, msm:movement, msm:attack). */',
    `public static ${attributeSupplier}.Builder createAttributes() {`,
    `    return ${mob}.createMobAttributes()`,
    `            .add(${attributes}.MAX_HEALTH, ${javaFloat(spec.maxHealth)})`,
    `            .add(${attributes}.MOVEMENT_SPEED, ${javaFloat(spec.movement.speed)})`,
    `            .add(${attributes}.FOLLOW_RANGE, ${javaFloat(spec.movement.followRange)})`,
    `            .add(${attributes}.KNOCKBACK_RESISTANCE, ${javaFloat(spec.movement.knockbackResistance)})`,
    `            .add(${attributes}.ATTACK_DAMAGE, ${spec.attack === undefined ? '0.0' : javaFloat(spec.attack.damage)})`,
    `            .add(${attributes}.ATTACK_KNOCKBACK, ${spec.attack === undefined ? '0.0' : javaFloat(spec.attack.knockback)})`,
  );
  const extraAttributes: string[] = [];
  if (usesTempt) extraAttributes.push(`.add(${attributes}.TEMPT_RANGE, ${javaFloat(TEMPT_RANGE)})`);
  if (mode === 'fly') {
    extraAttributes.push(
      `.add(${attributes}.FLYING_SPEED, ${javaFloat(spec.movement.flyingSpeed)})`,
    );
  }
  if (spec.movement.stepHeight !== undefined) {
    extraAttributes.push(`.add(${attributes}.STEP_HEIGHT, ${javaFloat(spec.movement.stepHeight)})`);
  }
  if (spec.rideable !== undefined && spec.rideable.jump > 0) {
    // jump 0 adds no attribute: a jump strength of 0 would stop the mob jumping at all.
    extraAttributes.push(`.add(${attributes}.JUMP_STRENGTH, ${javaFloat(spec.rideable.jump)})`);
  }
  for (const line of extraAttributes) members.push(`            ${line}`);
  members[members.length - 1] += ';';
  members.push('}');
  if (usesOfTypes) {
    const predicate = file.use('java.util.function.Predicate');
    const livingEntity = file.use('net.minecraft.world.entity.LivingEntity');
    const set = file.use('java.util.Set');
    const identifier = file.use('net.minecraft.resources.Identifier');
    const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
    const stream = file.use('java.util.stream.Stream');
    const collectors = file.use('java.util.stream.Collectors');
    members.push(
      '',
      '/** Matches living entities whose type id is in {@code ids}; {@code minecraft:player} matches players. */',
      `private static ${predicate}<${livingEntity}> ofTypes(String... ids) {`,
      `    ${set}<${identifier}> set = ${stream}.of(ids).map(${identifier}::parse).collect(${collectors}.toUnmodifiableSet());`,
      `    return e -> set.contains(${builtIn}.ENTITY_TYPE.getKey(e.getType()));`,
      '}',
    );
  }
  if (usesOfItems) {
    const predicate = file.use('java.util.function.Predicate');
    const itemStack = file.use('net.minecraft.world.item.ItemStack');
    const item = file.use('net.minecraft.world.item.Item');
    const set = file.use('java.util.Set');
    const list = file.use('java.util.List');
    const hashSet = file.use('java.util.HashSet');
    const arrayList = file.use('java.util.ArrayList');
    const tagKey = file.use('net.minecraft.tags.TagKey');
    const registries = file.use('net.minecraft.core.registries.Registries');
    const identifier = file.use('net.minecraft.resources.Identifier');
    const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
    members.push(
      '',
      "/** Matches stacks of the listed items; an entry starting with {@code #} is an item tag (as msm_runtime's MobGoals.ofItems). */",
      `private static ${predicate}<${itemStack}> ofItems(String... items) {`,
      `    ${set}<${identifier}> ids = new ${hashSet}<>();`,
      `    ${list}<${tagKey}<${item}>> tags = new ${arrayList}<>();`,
      '    for (String entry : items) {',
      '        if (entry.startsWith("#")) {',
      `            tags.add(${tagKey}.create(${registries}.ITEM, ${identifier}.parse(entry.substring(1))));`,
      '        } else {',
      `            ids.add(${identifier}.parse(entry));`,
      '        }',
      '    }',
      `    return stack -> !stack.isEmpty() && (ids.contains(${builtIn}.ITEM.getKey(stack.getItem()))`,
      '            || tags.stream().anyMatch(stack::is));',
      '}',
    );
  }
  members.push('', '@Override', 'protected void registerGoals() {', ...indent(goalLines), '}');
  members.push(...movementMembers(file, spec));

  const serverLevel = () => file.use('net.minecraft.server.level.ServerLevel');
  const player = () => file.use('net.minecraft.world.entity.player.Player');
  const damageSource = () => file.use('net.minecraft.world.damagesource.DamageSource');
  // With an apply_effect targeting `other`, the event methods also take the other entity:
  // the player, or the mob hit through on_attack (the runtime's EventContext.other).
  const fireArgs = (playerExpression: string, otherExpression = playerExpression) =>
    `level, blockPosition(), position(), ${playerExpression}, this${spec.events.otherParameter ? `, ${otherExpression}` : ''}`;

  if (spec.ranged !== undefined) {
    members.push(...rangedMembers(file, spec, spec.ranged, fireArgs));
  }
  if (spec.model.attack !== undefined || spec.attack?.onAttack !== undefined) {
    const entity = file.use('net.minecraft.world.entity.Entity');
    const inner: string[] = [];
    if (spec.model.attack !== undefined) {
      inner.push(
        `triggerAnim(${javaString(TRIGGERED_CONTROLLER)}, ${javaString(spec.model.attack)});`,
      );
    }
    if (spec.attack?.onAttack !== undefined) {
      inner.push(
        fireCall(
          spec.attack.onAttack,
          fireArgs(
            `target instanceof ${player()} p ? p : null`,
            `target instanceof ${file.use('net.minecraft.world.entity.LivingEntity')} living ? living : null`,
          ),
        ),
      );
    }
    members.push(
      '',
      '/** Plays the attack animation and fires msm:attack on_attack after a successful melee hit. */',
      '@Override',
      `public boolean doHurtTarget(${serverLevel()} level, ${entity} target) {`,
      '    boolean hit = super.doHurtTarget(level, target);',
      '    if (hit) {',
      ...indent(inner, 2),
      '    }',
      '    return hit;',
      '}',
    );
  }
  if (spec.onHurt !== undefined) {
    members.push(
      '',
      '/** msm:on_hurt: after damage is applied when the entity survives (a lethal hit fires msm:on_death). */',
      '@Override',
      `public boolean hurtServer(${serverLevel()} level, ${damageSource()} source, float amount) {`,
      '    boolean hurt = super.hurtServer(level, source, amount);',
      '    if (hurt && isAlive()) {',
      `        ${fireCall(spec.onHurt, fireArgs(`source.getEntity() instanceof ${player()} p ? p : null`))}`,
      '    }',
      '    return hurt;',
      '}',
    );
  }
  if (spec.onDeath !== undefined || spec.bossBar !== undefined) {
    const lines =
      spec.onDeath === undefined
        ? ['super.die(source);']
        : [
            'boolean wasDead = dead;',
            'super.die(source);',
            `if (!wasDead && dead && level() instanceof ${serverLevel()} level) {`,
            `    ${fireCall(spec.onDeath, fireArgs(`source.getEntity() instanceof ${player()} p ? p : null`))}`,
            '}',
          ];
    if (spec.bossBar !== undefined) {
      lines.push(
        'if (bossEvent != null) {',
        '    bossEvent.setProgress(0.0f);',
        '    bossEvent.removeAllPlayers();',
        '}',
      );
    }
    members.push(
      '',
      spec.onDeath === undefined
        ? '/** The boss bar empties and goes. */'
        : spec.bossBar === undefined
          ? '/** msm:on_death: once, on the logical server. */'
          : '/** msm:on_death: once, on the logical server; then the boss bar empties and goes. */',
      '@Override',
      `public void die(${damageSource()} source) {`,
      ...indent(lines),
      '}',
    );
  }
  const steps = interactSteps(spec);
  if (spec.onInteract !== undefined || steps.length > 0) {
    const interactionResult = file.use('net.minecraft.world.InteractionResult');
    const interactionHand = file.use('net.minecraft.world.InteractionHand');
    const body: string[] = [];
    if (steps.length > 0) {
      body.push(`${interactionResult} result = ${steps[0]}(player, hand);`);
      for (const step of steps.slice(1)) {
        body.push('if (result == null) {', `    result = ${step}(player, hand);`, '}');
      }
      body.push('if (result != null) {', '    return result;', '}');
    }
    if (spec.onInteract !== undefined) {
      body.push(
        `if (level() instanceof ${serverLevel()} level) {`,
        `    ${fireCall(spec.onInteract, fireArgs('player'))}`,
        '}',
        `return ${interactionResult}.SUCCESS;`,
      );
    } else {
      body.push('return super.mobInteract(player, hand);');
    }
    const doc =
      steps.length === 0
        ? 'msm:on_interact: a player right-clicks the entity.'
        : `A right click, in the order of ADR 0071 D1: ${steps.map((step) => INTERACT_STEP_NAMES[step]).join(', ')}, then ${spec.onInteract === undefined ? "vanilla's" : 'msm:on_interact (which answers every other right click)'}.`;
    members.push(
      '',
      `/** ${doc} */`,
      '@Override',
      `${spec.base === 'animal' ? 'public' : 'protected'} ${interactionResult} mobInteract(${player()} player, ${interactionHand} hand) {`,
      ...indent(body),
      '}',
    );
  }
  if (spec.onTick !== undefined || spec.bossBar !== undefined) {
    const lines = ['super.customServerAiStep(level);'];
    let doc = '';
    if (spec.onTick !== undefined) {
      context.usesTickLimiter = true;
      const tickLimiter = file.use(`${context.input.javaPackage}.TickLimiter`);
      doc = `msm:on_tick: every ${spec.onTick.interval} ticks while the AI runs (never with NoAI), staggered by entity id, within the shared tick cap`;
      lines.push(
        `if (${tickLimiter}.due(level, this, ${javaInt(spec.onTick.interval)}) && ${tickLimiter}.tryFire(level)) {`,
        `    ${fireCall(spec.onTick.method, fireArgs('null'))}`,
        '}',
      );
    }
    if (spec.bossBar !== undefined) {
      doc =
        doc === ''
          ? 'The boss bar: name, progress and, with a range, its players (as the wither, in the AI step)'
          : `${doc}; then the boss bar`;
      lines.push('tickBossBar(level);');
    }
    members.push(
      '',
      `/** ${doc}. */`,
      '@Override',
      `protected void customServerAiStep(${serverLevel()} level) {`,
      ...indent(lines),
      '}',
    );
  }
  if (spec.onSpawn !== undefined || spec.variants !== undefined) {
    const spawnGroupData = file.use('net.minecraft.world.entity.SpawnGroupData');
    const accessor = file.use('net.minecraft.world.level.ServerLevelAccessor');
    const difficulty = file.use('net.minecraft.world.DifficultyInstance');
    const reason = file.use('net.minecraft.world.entity.EntitySpawnReason');
    const lines = [
      `${spawnGroupData} out = super.finalizeSpawn(accessor, difficulty, reason, data);`,
    ];
    if (spec.variants !== undefined) {
      const matcher = spec.variants.biome
        ? 'biomeMatcher(accessor.getBiome(blockPosition())), '
        : '';
      lines.push(
        'if (!variantChosen) {',
        `    setVariant(pickVariant(${matcher}getRandom()));`,
        '}',
      );
    }
    if (spec.onSpawn !== undefined) {
      lines.push(
        `${serverLevel()} level = accessor.getLevel();`,
        fireCall(spec.onSpawn, fireArgs('null')),
      );
    }
    lines.push('return out;');
    const onSpawnDoc =
      'msm:on_spawn: once when the mob spawns (natural, egg, spawner, command), before it joins the level; not when it loads with its chunk';
    const variantDoc = 'Picks the variant unless saved data or a parent gave one (ADR 0071 D4)';
    const doc =
      spec.variants === undefined
        ? onSpawnDoc
        : spec.onSpawn === undefined
          ? variantDoc
          : `${variantDoc}; then ${onSpawnDoc}`;
    members.push(
      '',
      `/** ${doc}. */`,
      '@Override',
      `public ${spawnGroupData} finalizeSpawn(${accessor} accessor, ${difficulty} difficulty, ${reason} reason, ${spawnGroupData} data) {`,
      ...indent(lines),
      '}',
    );
  }
  if (spec.variants !== undefined) members.push(...variantMembers(file, spec.variants));
  if (spec.bossBar !== undefined) members.push(...bossBarMembers(file, spec.bossBar));
  if (spec.base === 'animal')
    members.push(...animalMembers(file, spec, name, breedingFood, tamingFood));
  if (spec.tameable !== undefined) {
    members.push(...tamingMembers(file, spec, spec.tameable, tamingFood as string, fireArgs));
  }
  if (spec.rideable !== undefined) {
    members.push(...ridingMembers(file, spec, spec.rideable, fireArgs));
  }
  if (spec.sounds !== undefined) members.push(...soundMembers(file, spec.sounds));
  if (spec.lootTable !== undefined) {
    const resourceKey = file.use('net.minecraft.resources.ResourceKey');
    const registries = file.use('net.minecraft.core.registries.Registries');
    members.push(
      '',
      "/** The definition's loot_table instead of the default entities/<path>. */",
      '@Override',
      `protected void dropFromLootTable(${serverLevel()} level, ${damageSource()} source, boolean playerKill) {`,
      `    dropFromLootTable(level, source, playerKill, ${resourceKey}.create(${registries}.LOOT_TABLE, ${identifierExpression(file, spec.lootTable)}));`,
      '}',
    );
  }

  // GeckoLib controllers, as MsmGeoEntity.registerControllers.
  const controllerRegistrar = file.use(
    'com.geckolib.animatable.manager.AnimatableManager',
    'ControllerRegistrar',
  );
  const animationController = file.use('com.geckolib.animation.AnimationController');
  const rawAnimation = file.use('com.geckolib.animation.RawAnimation');
  const playState = file.use('com.geckolib.animation.object.PlayState');
  const triggers = triggerable(spec);
  const loop = (value: string | undefined) =>
    value === undefined ? 'null' : `${rawAnimation}.begin().thenLoop(${javaString(value)})`;
  // ADR 0071 D6 (GeoControllers.loop): sit while sitting (animal bodies), swim while moving in
  // water, fly while moving in the air (mode fly); a state without its animation falls through.
  const states: { name: string; animation: string; condition: string }[] = [];
  if (spec.base === 'animal' && spec.model.sit !== undefined) {
    states.push({ name: 'sit', animation: spec.model.sit, condition: 'isInSittingPose()' });
  }
  if (spec.model.swim !== undefined) {
    states.push({
      name: 'swim',
      animation: spec.model.swim,
      condition: 'test.isMoving() && isInWater()',
    });
  }
  if (mode === 'fly' && spec.model.fly !== undefined) {
    states.push({
      name: 'fly',
      animation: spec.model.fly,
      condition: 'test.isMoving() && !onGround() && !isInWater()',
    });
  }
  const mainLoop =
    states.length === 0
      ? [`    ${rawAnimation} loop = test.isMoving() && walk != null ? walk : idle;`]
      : [
          `    ${rawAnimation} loop;`,
          ...states.map(
            (state, i) =>
              `    ${i === 0 ? '' : '} else '}if (${state.condition}) {\n        loop = ${state.name};`,
          ),
          '    } else {',
          '        loop = test.isMoving() && walk != null ? walk : idle;',
          '    }',
        ];
  const controllers: string[] = [
    `${rawAnimation} idle = ${loop(spec.model.idle)};`,
    `${rawAnimation} walk = ${loop(spec.model.walk)};`,
    ...states.map((state) => `${rawAnimation} ${state.name} = ${loop(state.animation)};`),
    `${animationController}<${name}> main = new ${animationController}<>(${javaString(MAIN_CONTROLLER)}, ${javaInt(spec.model.transitionTicks)}, test -> {`,
    ...mainLoop.flatMap((line) => line.split('\n')),
    `    return loop == null ? ${playState}.STOP : test.setAndContinue(loop);`,
    '});',
  ];
  for (const anim of triggers.get(MAIN_CONTROLLER) ?? []) {
    controllers.push(
      `main.triggerableAnim(${javaString(anim)}, ${rawAnimation}.begin().thenPlay(${javaString(anim)}));`,
    );
  }
  controllers.push('controllers.add(main);');
  const controllerNames = new NameTable();
  controllerNames.reserve('main', 'idle', 'walk', 'sit', 'swim', 'fly', 'controllers');
  for (const [controller, anims] of triggers) {
    if (controller === MAIN_CONTROLLER) continue;
    const variable = controllerNames.take(
      controller === TRIGGERED_CONTROLLER ? 'triggered' : 'controller',
      (v) => [v],
      '',
    );
    controllers.push(
      `${animationController}<${name}> ${variable} = new ${animationController}<>(${javaString(controller)}, 0, test -> ${playState}.STOP);`,
    );
    for (const anim of anims) {
      controllers.push(
        `${variable}.triggerableAnim(${javaString(anim)}, ${rawAnimation}.begin().thenPlay(${javaString(anim)}));`,
      );
    }
    controllers.push(`controllers.add(${variable});`);
  }
  members.push(
    '',
    states.length === 0
      ? '/** msm_main loops walk while moving and idle otherwise; the other controllers play animations on request. */'
      : `/** msm_main loops ${states.map((state) => state.name).join(', ')} in that order of precedence, then walk while moving and idle otherwise; the other controllers play animations on request. */`,
    '@Override',
    `public void registerControllers(${controllerRegistrar} controllers) {`,
    ...indent(controllers),
    '}',
    '',
    '@Override',
    `public ${instanceCache} getAnimatableInstanceCache() {`,
    '    return cache;',
    '}',
  );
  members.push(...eventMethods(file, spec.events, 'entity', actions));

  const interfaces = [geoEntity];
  if (spec.ranged !== undefined) {
    interfaces.push(file.use('net.minecraft.world.entity.monster.RangedAttackMob'));
  }
  if (spec.rideable !== undefined) {
    interfaces.push(file.use('net.minecraft.world.entity.PlayerRideableJumping'));
  }
  const kind = { mob: '', animal: ' (base animal)', monster: ' (base monster)' }[spec.base];
  const lines = [
    `/** The entity {@code ${spec.input.id}}${kind}, animated with GeckoLib. */`,
    `public class ${name} extends ${baseClass} implements ${interfaces.join(', ')} {`,
    ...indent(trimBlank(members)),
    '}',
  ];
  context.files.push({ path: classPath(context, 'entity', name), contents: file.render(lines) });
}

/**
 * The constructor tail of `MobMovement.afterConstruct` (ADR 0070 D3): the controls, gravity,
 * path costs and the goals a mode adds besides `msm:ai_goals`.
 */
function movementConstructor(file: JavaFile, spec: EntitySpec): string[] {
  const pathType = () => file.use('net.minecraft.world.level.pathfinder.PathType');
  switch (spec.movement.mode) {
    case 'walk':
      return [];
    case 'fly':
      return [
        "// msm:movement mode fly: a bee's flight (no gravity; a bee's and a parrot's path costs).",
        `moveControl = new ${file.use('net.minecraft.world.entity.ai.control.FlyingMoveControl')}<>(this, ${javaInt(FLY_MAX_TURN)}, ${spec.movement.hovers});`,
        'setNoGravity(true);',
        `setPathfindingMalus(${pathType()}.FIRE, -1.0f);`,
        `setPathfindingMalus(${pathType()}.FIRE_IN_NEIGHBOR, -1.0f);`,
        `setPathfindingMalus(${pathType()}.WATER, -1.0f);`,
        `setPathfindingMalus(${pathType()}.WATER_BORDER, 16.0f);`,
      ];
    case 'swim': {
      const lines = [
        "// msm:movement mode swim: a dolphin's controls.",
        `moveControl = new ${file.use('net.minecraft.world.entity.ai.control.SmoothSwimmingMoveControl')}<>(this, 85, 10, 0.02f, 0.1f, true);`,
        `lookControl = new ${file.use('net.minecraft.world.entity.ai.control.SmoothSwimmingLookControl')}(this, 10);`,
        `setPathfindingMalus(${pathType()}.WATER, 0.0f);`,
      ];
      if (spec.movement.breathesAir) {
        lines.push(
          '// breathes_air: surface for air and look for water when stranded, as a dolphin.',
          `goalSelector.addGoal(0, new ${file.use('net.minecraft.world.entity.ai.goal.BreathAirGoal')}(this));`,
          `goalSelector.addGoal(0, new ${file.use('net.minecraft.world.entity.ai.goal.TryFindLiquidGoal')}(this, ${file.use('net.minecraft.tags.FluidTags')}.WATER));`,
        );
      } else {
        lines.push(`setAirSupply(${javaInt(spec.movement.dryOutTicks)});`);
      }
      return lines;
    }
    case 'amphibious':
      return [
        '// msm:movement mode amphibious: walks on land and paths through water.',
        `setPathfindingMalus(${pathType()}.WATER, 0.0f);`,
      ];
  }
}

/** The movement overrides of `MobMovement` (ADR 0070 D3) for the definition's mode. */
function movementMembers(file: JavaFile, spec: EntitySpec): string[] {
  const { mode, breathesAir, dryOutTicks } = spec.movement;
  if (mode === 'walk') return [];
  const level = file.use('net.minecraft.world.level.Level');
  const pathNavigation = file.use('net.minecraft.world.entity.ai.navigation.PathNavigation');
  const members: string[] = [''];
  if (mode === 'fly') {
    const flying = file.use('net.minecraft.world.entity.ai.navigation.FlyingPathNavigation');
    const damageSource = file.use('net.minecraft.world.damagesource.DamageSource');
    members.push(
      '/** Flies along paths through the air: no doors, floats. */',
      '@Override',
      `protected ${pathNavigation} createNavigation(${level} level) {`,
      `    ${flying} navigation = new ${flying}(this, level);`,
      '    navigation.setCanOpenDoors(false);',
      '    navigation.setCanFloat(true);',
      '    return navigation;',
      '}',
      '',
      "/** Fliers take no fall damage (a bee's and a parrot's). */",
      '@Override',
      `public boolean causeFallDamage(double fallDistance, float multiplier, ${damageSource} source) {`,
      '    return false;',
      '}',
    );
    return members;
  }
  if (mode === 'amphibious') {
    members.push(
      '/** Paths over land and through water. */',
      '@Override',
      `protected ${pathNavigation} createNavigation(${level} level) {`,
      `    return new ${file.use('net.minecraft.world.entity.ai.navigation.AmphibiousPathNavigation')}(this, level);`,
      '}',
      '',
      '/** Breathes both air and water. */',
      '@Override',
      'public boolean canBreatheUnderwater() {',
      '    return true;',
      '}',
    );
    return members;
  }
  const vec3 = file.use('net.minecraft.world.phys.Vec3');
  const moverType = file.use('net.minecraft.world.entity.MoverType');
  const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
  const randomSource = file.use('net.minecraft.util.RandomSource');
  const soundEvents = file.use('net.minecraft.sounds.SoundEvents');
  members.push(
    '/** Paths only through water. */',
    '@Override',
    `protected ${pathNavigation} createNavigation(${level} level) {`,
    `    return new ${file.use('net.minecraft.world.entity.ai.navigation.WaterBoundPathNavigation')}(this, level);`,
    '}',
    '',
    "/** In water, moves as a dolphin: the move control's speed, friction 0.9, a slow sink without a target. */",
    '@Override',
    `public void travel(${vec3} input) {`,
    '    if (isInWater()) {',
    '        moveRelative(getSpeed(), input);',
    `        move(${moverType}.SELF, getDeltaMovement());`,
    '        setDeltaMovement(getDeltaMovement().scale(0.9));',
    '        if (getTarget() == null) {',
    '            setDeltaMovement(getDeltaMovement().add(0.0, -0.005, 0.0));',
    '        }',
    '        return;',
    '    }',
    '    super.travel(input);',
    '}',
    '',
    breathesAir
      ? '/** breathes_air: runs out of air under water, as a dolphin. */'
      : '/** Breathes water. */',
    '@Override',
    'public boolean canBreatheUnderwater() {',
    `    return ${!breathesAir};`,
    '}',
    '',
    '/** Not pushed by currents, as vanilla water animals. */',
    '@Override',
    'public boolean isPushedByFluid() {',
    '    return false;',
    '}',
    '',
    breathesAir
      ? '/** Out of water it flops on the ground. */'
      : `/** Out of water it flops on the ground and dries out: the first hurt (2 drowning damage) comes ${dryOutTicks} + 20 ticks after leaving the water, then every 20 ticks. */`,
    '@Override',
    'public void baseTick() {',
    ...(breathesAir ? [] : ['    int air = getAirSupply();']),
    '    super.baseTick();',
    `    if (!(level() instanceof ${serverLevel} level) || !isAlive()) {`,
    '        return;',
    '    }',
    '    boolean inWater = isInWater();',
    '    if (!inWater && onGround() && verticalCollision) {',
    `        ${randomSource} random = getRandom();`,
    '        setDeltaMovement(getDeltaMovement().add((random.nextFloat() * 2.0f - 1.0f) * 0.05f, 0.4,',
    '                (random.nextFloat() * 2.0f - 1.0f) * 0.05f));',
    '        setOnGround(false);',
    `        makeSound(${soundEvents}.${breathesAir ? 'DOLPHIN_JUMP' : 'COD_FLOP'});`,
    '    }',
  );
  if (!breathesAir) {
    members.push(
      '    if (inWater) {',
      `        setAirSupply(${javaInt(dryOutTicks)});`,
      '    } else {',
      '        air--;',
      '        if (air <= -20) {',
      '            air = 0;',
      '            hurtServer(level, damageSources().drown(), 2.0f);',
      '        }',
      '        setAirSupply(air);',
      '    }',
    );
  }
  members.push('}');
  return members;
}

/**
 * `RangedAttackMob.performRangedAttack` as `MobRanged.performRangedAttack` (ADR 0070 D4): the
 * projectile's kind is known when generating, so only its branch is written.
 */
function rangedMembers(
  file: JavaFile,
  spec: EntitySpec,
  ranged: RangedAttack,
  fireArgs: (player: string, other?: string) => string,
): string[] {
  const livingEntity = file.use('net.minecraft.world.entity.LivingEntity');
  const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
  const itemStack = file.use('net.minecraft.world.item.ItemStack');
  const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
  const projectileClass = file.use('net.minecraft.world.entity.projectile.Projectile');
  const speed = javaFloat(ranged.speed);
  const inaccuracy = javaFloat(ranged.inaccuracy);
  const body = [
    `if (!(level() instanceof ${serverLevel} level)) {`,
    '    return;',
    '}',
    `${itemStack} stack = new ${itemStack}(${builtIn}.ITEM.getValue(${identifierExpression(file, ranged.projectile)}));`,
  ];
  let what: string;
  switch (ranged.kind) {
    case 'arrow': {
      const arrow = file.use('net.minecraft.world.entity.projectile.arrow.AbstractArrow');
      what = 'an arrow, with a bow as the weapon and damage as the base damage';
      body.push(
        `${arrow} projectile = ${file.use('net.minecraft.world.entity.projectile.ProjectileUtil')}.getMobArrow(this, stack, power, new ${itemStack}(${file.use('net.minecraft.world.item.Items')}.BOW));`,
        `projectile.setBaseDamage(${javaFloat(ranged.damage)});`,
      );
      break;
    }
    case 'throwable': {
      const thrown = file.use(`${file.javaPackage}.ThrownItemEntity`);
      what =
        'the project throwable, with the mob as thrower (its damage, gravity and hit events apply; the copy never drops or returns)';
      body.push(
        `${thrown} projectile = new ${thrown}(level, this, stack.copy());`,
        'projectile.setCarriesItem(false);',
      );
      break;
    }
    case 'item': {
      const projectileItem = file.use('net.minecraft.world.item.ProjectileItem');
      what = 'the vanilla projectile item, through its asProjectile and its own shoot';
      body.push(
        `${projectileItem} item = (${projectileItem}) stack.getItem();`,
        `${projectileClass} projectile = item.asProjectile(level, new ${file.use('net.minecraft.world.phys.Vec3')}(getX(), getEyeY() - 0.1, getZ()), stack, getDirection());`,
        'projectile.setOwner(this);',
      );
      break;
    }
  }
  body.push(
    'double dx = target.getX() - getX();',
    'double dz = target.getZ() - getZ();',
    `double dy = target.getY(1.0 / 3.0) - projectile.getY() + projectileDrop(Math.sqrt(dx * dx + dz * dz), ${speed}, projectile.getGravity());`,
    ranged.kind === 'item'
      ? `${projectileClass}.spawnProjectile(projectile, level, stack, p -> item.shoot(p, dx, dy, dz, ${speed}, ${inaccuracy}));`
      : `${projectileClass}.spawnProjectileUsingShoot(projectile, level, stack, dx, dy, dz, ${speed}, ${inaccuracy});`,
    `${builtIn}.SOUND_EVENT.getOptional(${identifierExpression(file, ranged.sound)}).ifPresent(sound ->`,
    '        playSound(sound, 1.0f, 1.0f / (getRandom().nextFloat() * 0.4f + 0.8f)));',
  );
  if (spec.model.shoot !== undefined) {
    body.push(`triggerAnim(${javaString(TRIGGERED_CONTROLLER)}, ${javaString(spec.model.shoot)});`);
  }
  if (ranged.onShoot !== undefined) {
    body.push(
      fireCall(
        ranged.onShoot,
        fireArgs(
          `target instanceof ${file.use('net.minecraft.world.entity.player.Player')} p ? p : null`,
          'target',
        ),
      ),
    );
  }
  return [
    '',
    `/** msm:ranged_attack: one shot of ${what}, aimed at a third of the target's height and raised by the projectile's fall; then the sound${spec.model.shoot === undefined ? '' : ', the shoot animation'}${ranged.onShoot === undefined ? '' : ' and on_shoot (other = the target)'}. */`,
    '@Override',
    `public void performRangedAttack(${livingEntity} target, float power) {`,
    ...indent(body),
    '}',
    '',
    '/** How far a projectile falls over {@code horizontal} blocks at {@code speed} blocks per tick: g * t * (t + 1) / 2 (drag left out). */',
    'private static double projectileDrop(double horizontal, double speed, double gravity) {',
    '    double ticks = horizontal / speed;',
    '    return gravity * ticks * (ticks + 1) / 2;',
    '}',
  ];
}

/** The static tables and synched data of `msm:variants` (ADR 0071 D4). */
function variantFields(file: JavaFile, variants: Variants, name: string): string[] {
  const accessor = file.use('net.minecraft.network.syncher.EntityDataAccessor');
  const synched = file.use('net.minecraft.network.syncher.SynchedEntityData');
  const serializers = file.use('net.minecraft.network.syncher.EntityDataSerializers');
  const identifier = file.use('net.minecraft.resources.Identifier');
  const lines = [
    '',
    '/** msm:variants, in definition order: ids (saved as Variant), textures and weights. */',
    `private static final String[] VARIANT_IDS = {${variants.variants.map((v) => javaString(v.id)).join(', ')}};`,
    `private static final ${identifier}[] VARIANT_TEXTURES = {`,
    ...variants.variants.map(
      (v, i) =>
        `    ${identifierExpression(file, v.texture)}${i === variants.variants.length - 1 ? '' : ','}`,
    ),
    '};',
    `private static final int[] VARIANT_WEIGHTS = {${variants.variants.map((v) => javaInt(v.weight)).join(', ')}};`,
  ];
  if (variants.biome) {
    lines.push(
      '/** Where each variant is picked: biome ids or #biome tags; none = the fallback pool. */',
      `private static final String[][] VARIANT_BIOMES = {${variants.variants
        .map((v) => `{${v.biomes.map(javaString).join(', ')}}`)
        .join(', ')}};`,
    );
  }
  lines.push(
    `private static final ${accessor}<Integer> DATA_VARIANT = ${synched}.defineId(${name}.class, ${serializers}.INT);`,
    '/** Set once a variant came from saved data, a parent or a pick, so a later finalizeSpawn keeps it. */',
    'private boolean variantChosen;',
  );
  return lines;
}

/** The variant methods of `MobVariants` (ADR 0071 D4). */
function variantMembers(file: JavaFile, variants: Variants): string[] {
  const synched = file.use('net.minecraft.network.syncher.SynchedEntityData');
  const identifier = file.use('net.minecraft.resources.Identifier');
  const valueOutput = file.use('net.minecraft.world.level.storage.ValueOutput');
  const valueInput = file.use('net.minecraft.world.level.storage.ValueInput');
  const predicate = file.use('java.util.function.Predicate');
  const randomSource = file.use('net.minecraft.util.RandomSource');
  const list = file.use('java.util.List');
  const arrayList = file.use('java.util.ArrayList');
  const members = [
    '',
    '@Override',
    `protected void defineSynchedData(${synched}.Builder builder) {`,
    '    super.defineSynchedData(builder);',
    '    builder.define(DATA_VARIANT, 0);',
    '}',
    '',
    '/** The variant index (synched; out of range reads as the first). */',
    'public int variant() {',
    '    int index = getEntityData().get(DATA_VARIANT);',
    '    return index < 0 || index >= VARIANT_IDS.length ? 0 : index;',
    '}',
    '',
    '/** The current variant id. */',
    'public String variantId() {',
    '    return VARIANT_IDS[variant()];',
    '}',
    '',
    '/** The texture drawn in place of msm:animated_model.texture. */',
    `public ${identifier} variantTexture() {`,
    '    return VARIANT_TEXTURES[variant()];',
    '}',
    '',
    '/** Sets the variant by index (out of range: the first). */',
    'public void setVariant(int index) {',
    '    getEntityData().set(DATA_VARIANT, index < 0 || index >= VARIANT_IDS.length ? 0 : index);',
    '    variantChosen = true;',
    '}',
    '',
    '/** Sets the variant by id; an unknown id selects the first. */',
    'public void setVariantById(String id) {',
    '    int index = 0;',
    '    for (int i = 0; i < VARIANT_IDS.length; i++) {',
    '        if (VARIANT_IDS[i].equals(id)) {',
    '            index = i;',
    '            break;',
    '        }',
    '    }',
    '    setVariant(index);',
    '}',
    '',
    '@Override',
    `protected void addAdditionalSaveData(${valueOutput} output) {`,
    '    super.addAdditionalSaveData(output);',
    '    output.putString("Variant", variantId());',
    '}',
    '',
    '/** A saved Variant wins (unknown: the first); without the key the mob keeps its index. */',
    '@Override',
    `protected void readAdditionalSaveData(${valueInput} input) {`,
    '    super.readAdditionalSaveData(input);',
    '    input.getString("Variant").ifPresent(this::setVariantById);',
    '}',
    '',
    variants.biome
      ? '/** A weighted pick among the variants whose biomes match; none: those without biomes; none of those: every variant. */'
      : '/** A weighted pick over every variant. */',
    variants.biome
      ? `private static int pickVariant(${predicate}<String> matches, ${randomSource} random) {`
      : `private static int pickVariant(${randomSource} random) {`,
    `    ${list}<Integer> pool = new ${arrayList}<>();`,
  ];
  if (variants.biome) {
    members.push(
      '    if (matches != null) {',
      '        for (int i = 0; i < VARIANT_IDS.length; i++) {',
      '            for (String entry : VARIANT_BIOMES[i]) {',
      '                if (matches.test(entry)) {',
      '                    pool.add(i);',
      '                    break;',
      '                }',
      '            }',
      '        }',
      '        if (pool.isEmpty()) {',
      '            for (int i = 0; i < VARIANT_IDS.length; i++) {',
      '                if (VARIANT_BIOMES[i].length == 0) {',
      '                    pool.add(i);',
      '                }',
      '            }',
      '        }',
      '    }',
    );
  }
  members.push(
    ...(variants.biome
      ? [
          '    if (pool.isEmpty()) {',
          '        for (int i = 0; i < VARIANT_IDS.length; i++) {',
          '            pool.add(i);',
          '        }',
          '    }',
        ]
      : ['    for (int i = 0; i < VARIANT_IDS.length; i++) {', '        pool.add(i);', '    }']),
    '    int total = 0;',
    '    for (int i : pool) {',
    '        total += VARIANT_WEIGHTS[i];',
    '    }',
    '    int roll = random.nextInt(total);',
    '    for (int i : pool) {',
    '        roll -= VARIANT_WEIGHTS[i];',
    '        if (roll < 0) {',
    '            return i;',
    '        }',
    '    }',
    '    return pool.getLast();',
    '}',
  );
  if (variants.biome) {
    const holder = file.use('net.minecraft.core.Holder');
    const biome = file.use('net.minecraft.world.level.biome.Biome');
    const tagKey = file.use('net.minecraft.tags.TagKey');
    const registries = file.use('net.minecraft.core.registries.Registries');
    members.push(
      '',
      '/** Matches a biomes entry (#biome tag or biome id) against one biome. */',
      `private static ${predicate}<String> biomeMatcher(${holder}<${biome}> biome) {`,
      '    return entry -> {',
      `        ${identifier} id = ${identifier}.tryParse(entry.startsWith("#") ? entry.substring(1) : entry);`,
      '        if (id == null) {',
      '            return false;',
      '        }',
      `        return entry.startsWith("#") ? biome.is(${tagKey}.create(${registries}.BIOME, id)) : biome.is(id);`,
      '    };',
      '}',
    );
  }
  return members;
}

/** The boss event of `MobBossBar` (ADR 0071 D5), the wither's rule. */
function bossBarMembers(file: JavaFile, bar: BossBar): string[] {
  const bossEvent = file.use('net.minecraft.server.level.ServerBossEvent');
  const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
  const serverPlayer = file.use('net.minecraft.server.level.ServerPlayer');
  const component = file.use('net.minecraft.network.chat.Component');
  const mth = file.use('net.minecraft.util.Mth');
  const bossEventBase = file.use('net.minecraft.world.BossEvent');
  const members = [
    '',
    '/** The boss event, named by the display name, progress health / max health; null on the client. */',
    `private ${bossEvent} bossEvent() {`,
    `    if (bossEvent == null && level() instanceof ${serverLevel}) {`,
    `        bossEvent = new ${bossEvent}(${mth}.createInsecureUUID(getRandom()), getDisplayName(),`,
    `                ${bossEventBase}.BossBarColor.${bar.colour}, ${bossEventBase}.BossBarOverlay.${bar.overlay});`,
    `        bossEvent.setDarkenScreen(${bar.darkenSky});`,
    `        bossEvent.setPlayBossMusic(${bar.music});`,
    `        bossEvent.setCreateWorldFog(${bar.fog});`,
    '        bossEvent.setProgress(bossProgress());',
    '    }',
    '    return bossEvent;',
    '}',
    '',
    'private float bossProgress() {',
    '    return Math.clamp(getHealth() / getMaxHealth(), 0.0f, 1.0f);',
    '}',
    '',
    '/** Whether the mob may show its bar: alive, not dying and not removed. */',
    'private boolean showsBossBar() {',
    '    return isAlive() && !isDeadOrDying() && !isRemoved();',
    '}',
    '',
    `private void tickBossBar(${serverLevel} level) {`,
    `    ${bossEvent} bar = bossEvent();`,
    '    if (bar == null) {',
    '        return;',
    '    }',
    `    ${component} name = getDisplayName();`,
    '    if (!name.equals(bar.getName())) {',
    '        bar.setName(name);',
    '    }',
    '    bar.setProgress(bossProgress());',
  ];
  if (bar.range !== undefined) {
    const arrayList = file.use('java.util.ArrayList');
    members.push(
      '    if ((level.getGameTime() + getId()) % 10 == 0) {',
      '        updateBossRange(level, bar);',
      '    }',
      '}',
      '',
      `/** range: the players of the level within ${bar.range} blocks, checked every 10 ticks. */`,
      `private void updateBossRange(${serverLevel} level, ${bossEvent} bar) {`,
      `    double max = (double) ${javaFloat(bar.range)} * ${javaFloat(bar.range)};`,
      `    for (${serverPlayer} player : new ${arrayList}<>(bar.getPlayers())) {`,
      '        if (player.isRemoved() || player.level() != level || player.distanceToSqr(this) > max) {',
      '            bar.removePlayer(player);',
      '        }',
      '    }',
      '    if (!showsBossBar()) {',
      '        return;',
      '    }',
      `    for (${serverPlayer} player : level.players()) {`,
      '        if (!player.isRemoved() && player.distanceToSqr(this) <= max) {',
      '            bar.addPlayer(player);',
      '        }',
      '    }',
      '}',
    );
  } else {
    members.push(
      '}',
      '',
      '/** Players tracking the boss see its bar. */',
      '@Override',
      `public void startSeenByPlayer(${serverPlayer} player) {`,
      '    super.startSeenByPlayer(player);',
      '    if (!showsBossBar()) {',
      '        return;',
      '    }',
      `    ${bossEvent} bar = bossEvent();`,
      '    if (bar != null) {',
      '        bar.setProgress(bossProgress());',
      '        bar.addPlayer(player);',
      '    }',
      '}',
      '',
      '@Override',
      `public void stopSeenByPlayer(${serverPlayer} player) {`,
      '    super.stopSeenByPlayer(player);',
      '    if (bossEvent != null) {',
      '        bossEvent.removePlayer(player);',
      '    }',
      '}',
    );
  }
  const removalReason = file.use('net.minecraft.world.entity.Entity', 'RemovalReason');
  members.push(
    '',
    '/** Killed, discarded, unloaded or changed dimension: nobody sees the bar any more. */',
    '@Override',
    `public void remove(${removalReason} reason) {`,
    '    super.remove(reason);',
    '    if (bossEvent != null) {',
    '        bossEvent.removeAllPlayers();',
    '    }',
    '}',
    '',
    '/** A boss never despawns. */',
    '@Override',
    'public boolean requiresCustomPersistence() {',
    '    return true;',
    '}',
  );
  return members;
}

/**
 * The animal callbacks of `MsmAnimal` and `MobBreeding` (ADR 0071 D2): without `msm:breedable`
 * no breeding food; with it the food, the breeding step of a right click, the baby's scale and
 * grow-up time and `on_breed`. A spawn egg used on an adult makes a baby of the same type either
 * way, which takes a parent's variant.
 */
function animalMembers(
  file: JavaFile,
  spec: EntitySpec,
  name: string,
  food: string | undefined,
  tamingFood: string | undefined,
): string[] {
  const itemStack = file.use('net.minecraft.world.item.ItemStack');
  const ageableMob = file.use('net.minecraft.world.entity.AgeableMob');
  const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
  const reason = file.use('net.minecraft.world.entity.EntitySpawnReason');
  const { breedable, tameable } = spec;
  const offspring = [
    `${ageableMob} child = getType().create(level, ${reason}.BREEDING) instanceof ${ageableMob} made ? made : null;`,
  ];
  if (spec.variants !== undefined) {
    offspring.push(
      `if (child instanceof ${name} baby) {`,
      "    // A random parent's variant (partner is this mob for a spawn egg used on an adult).",
      `    ${name} parent = partner instanceof ${name} other && baby.getRandom().nextInt(2) == 1 ? other : this;`,
      '    baby.setVariant(parent.variant());',
      '}',
    );
  }
  if (tameable !== undefined) {
    offspring.push(
      "// A tamed parent's baby belongs to the same owner, tamed (Wolf.getBreedOffspring); no sitting, hearts or on_tame.",
      `if (child instanceof ${name} baby && isTame()) {`,
      '    baby.setOwnerReference(getOwnerReference());',
      '    baby.setTame(true, true);',
      ...(tameable.tamedHealth !== undefined ? ['    baby.applyTamedHealth();'] : []),
      '}',
    );
  }
  if (breedable !== undefined) offspring.push('lastOffspring = child;');
  offspring.push('return child;');
  if (breedable === undefined || food === undefined) {
    return [
      ...tamedHealthMember(file, spec),
      '',
      '/** No breeding food without msm:breedable. */',
      '@Override',
      `public boolean isFood(${itemStack} stack) {`,
      '    return false;',
      '}',
      '',
      '/** A new mob of the same type (a spawn egg used on an adult makes a baby). */',
      '@Override',
      `public ${ageableMob} getBreedOffspring(${serverLevel} level, ${ageableMob} partner) {`,
      ...indent(offspring),
      '}',
    ];
  }
  const interactionResult = file.use('net.minecraft.world.InteractionResult');
  const interactionHand = file.use('net.minecraft.world.InteractionHand');
  const player = file.use('net.minecraft.world.entity.player.Player');
  const serverPlayer = file.use('net.minecraft.server.level.ServerPlayer');
  const animal = file.use('net.minecraft.world.entity.animal.Animal');
  const members = [
    ...tamedHealthMember(file, spec),
    '',
    '/** The child getBreedOffspring made last, read back by spawnChildFromBreeding. */',
    `private ${ageableMob} lastOffspring;`,
    '',
    tameable === undefined
      ? '/** msm:breedable items. */'
      : "/** msm:breedable items, none while the mob is wild: an untamed pet does not breed (as wolves and cats), and vanilla's Animal.mobInteract cannot put it in love either. */",
    '@Override',
    `public boolean isFood(${itemStack} stack) {`,
    `    return ${food}.test(stack)${tameable === undefined ? '' : ' && isTame()'};`,
    '}',
    '',
    tameable === undefined
      ? "/** The breeding step of a right click: vanilla's feeding (love mode for a grown mob, growth for a baby), before msm:on_interact. Null passes on. */"
      : "/** The breeding step of a right click: vanilla's feeding (love mode for a grown mob, growth for a baby), before msm:on_interact. A wild mob gets no love mode: its taming food passes on to taming (a shared food tames), and its breeding food only grows a baby. Null passes on. */",
    `private ${interactionResult} breedingInteract(${player} player, ${interactionHand} hand) {`,
    `    ${itemStack} stack = player.getItemInHand(hand);`,
    `    if (!${food}.test(stack)) {`,
    '        return null;',
    '    }',
  ];
  if (tameable !== undefined) {
    members.push(
      '    boolean wild = !isTame();',
      `    if (wild && ${tamingFood}.test(stack)) {`,
      '        return null;',
      '    }',
    );
  }
  const wildAnd = tameable === undefined ? '' : '!wild && ';
  members.push(
    '    int age = getAge();',
    `    if (${wildAnd}player instanceof ${serverPlayer} && age == 0 && canFallInLove()) {`,
    '        stack.consume(1, player);',
    '        setInLove(player);',
    `        return ${interactionResult}.SUCCESS_SERVER;`,
    '    }',
    '    if (canAgeUp()) {',
    '        stack.consume(1, player);',
    `        ageUp(${ageableMob}.getSpeedUpSecondsWhenFeeding(-age), true);`,
    `        return ${interactionResult}.SUCCESS;`,
    '    }',
    `    return level().isClientSide()${tameable === undefined ? '' : ' && !wild'} ? ${interactionResult}.CONSUME : null;`,
    '}',
    '',
    '/** A new mob of the same type (also for a spawn egg used on an adult, where the partner is this mob). */',
    '@Override',
    `public ${ageableMob} getBreedOffspring(${serverLevel} level, ${ageableMob} partner) {`,
    ...indent(offspring),
    '}',
  );
  const after: string[] = [
    `${ageableMob} child = lastOffspring;`,
    'lastOffspring = null;',
    'if (child == null || child.isRemoved() || !child.isBaby()) {',
    '    return;',
    '}',
  ];
  if (breedable.growUpTicks !== VANILLA_GROW_UP_TICKS) {
    after.push(`child.setAge(${javaInt(-breedable.growUpTicks)});`);
  }
  if (breedable.onBreed !== undefined) {
    after.push(
      `if (child instanceof ${name} baby) {`,
      `    baby.${fireCall(breedable.onBreed, `level, baby.blockPosition(), baby.position(), cause, baby${spec.events.otherParameter ? ', cause' : ''}`)}`,
      '}',
    );
  }
  const what = [
    breedable.growUpTicks !== VANILLA_GROW_UP_TICKS ? 'the grow-up time' : undefined,
    breedable.onBreed !== undefined
      ? 'on_breed (self the baby, player the one who fed a parent)'
      : undefined,
  ].filter((part) => part !== undefined);
  members.push(
    '',
    `/** Vanilla's breeding (the baby, the cooldowns, hearts, experience), refused between two types${tameable === undefined ? '' : " and while either parent is wild (a wolf's and a cat's canMate)"}${what.length > 0 ? `; then ${what.join(' and ')}` : ''}. */`,
    '@Override',
    `public void spawnChildFromBreeding(${serverLevel} level, ${animal} partner) {`,
    tameable === undefined
      ? '    if (partner.getType() != getType()) {'
      : `    if (partner.getType() != getType() || !isTame() || !(partner instanceof ${name} other && other.isTame())) {`,
    '        resetLove();',
    '        partner.resetLove();',
    '        return;',
    '    }',
    ...(breedable.onBreed !== undefined
      ? [
          `    ${serverPlayer} cause = getLoveCause() != null ? getLoveCause() : partner.getLoveCause();`,
        ]
      : []),
    '    lastOffspring = null;',
    '    super.spawnChildFromBreeding(level, partner);',
    ...indent(after),
    '}',
    '',
    `/** baby_scale for a baby (also its hitbox). */`,
    '@Override',
    'public float getAgeScale() {',
    `    return isBaby() ? ${javaFloat(breedable.babyScale)} : super.getAgeScale();`,
    '}',
    '',
    '/** -grow_up_ticks, so spawn-egg and summoned babies grow up as bred ones do. */',
    '@Override',
    'protected int getBabyStartAge() {',
    `    return ${javaInt(-breedable.growUpTicks)};`,
    '}',
  );
  return members;
}

/** `tamed_health`, healed to full (`MobTaming.applyTamedHealth`): on taming and on a tamed parent's baby. */
function tamedHealthMember(file: JavaFile, spec: EntitySpec): string[] {
  const health = spec.tameable?.tamedHealth;
  if (health === undefined) return [];
  const attributeInstance = file.use('net.minecraft.world.entity.ai.attributes.AttributeInstance');
  const attributes = file.use('net.minecraft.world.entity.ai.attributes.Attributes');
  return [
    '',
    '/** tamed_health, healed to full. */',
    'private void applyTamedHealth() {',
    `    ${attributeInstance} max = getAttribute(${attributes}.MAX_HEALTH);`,
    '    if (max != null) {',
    `        max.setBaseValue(${javaFloat(health)});`,
    '    }',
    '    setHealth(getMaxHealth());',
    '}',
  ];
}

/** The taming members of `MobTaming` (ADR 0071 D1), a wolf's taming. */
function tamingMembers(
  file: JavaFile,
  spec: EntitySpec,
  tameable: Tameable,
  food: string,
  fireArgs: (player: string, other?: string) => string,
): string[] {
  const interactionResult = file.use('net.minecraft.world.InteractionResult');
  const interactionHand = file.use('net.minecraft.world.InteractionHand');
  const player = file.use('net.minecraft.world.entity.player.Player');
  const itemStack = file.use('net.minecraft.world.item.ItemStack');
  const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
  const livingEntity = file.use('net.minecraft.world.entity.LivingEntity');
  const tamableAnimal = file.use('net.minecraft.world.entity.TamableAnimal');
  const rideable = spec.rideable !== undefined;
  const members = [
    '',
    tameable.sit
      ? `/** The taming step of a right click: the taming food on a wild mob, then the owner's empty main hand toggling sitting${rideable ? ' while sneaking (an empty hand mounts)' : ''}. Null passes on. */`
      : '/** The taming step of a right click: the taming food on a wild mob. Null passes on. */',
    `private ${interactionResult} tamingInteract(${player} player, ${interactionHand} hand) {`,
    `    ${itemStack} stack = player.getItemInHand(hand);`,
    '    if (!isTame()) {',
    `        if (!${food}.test(stack)) {`,
    '            return null;',
    '        }',
    `        if (!(level() instanceof ${serverLevel} level)) {`,
    `            return ${interactionResult}.SUCCESS;`,
    '        }',
    '        stack.consume(1, player);',
    `        if (getRandom().nextFloat() < ${javaFloat(tameable.chance)}) {`,
    '            tameWithFood(level, player);',
    '        } else {',
    '            level.broadcastEntityEvent(this, (byte) 6); // smoke',
    '        }',
    `        return ${interactionResult}.SUCCESS_SERVER;`,
    '    }',
  ];
  if (tameable.sit) {
    members.push(
      `    if (isOwnedBy(player) && hand == ${interactionHand}.MAIN_HAND && stack.isEmpty()${rideable ? ' && player.isSecondaryUseActive()' : ''}) {`,
      `        if (!(level() instanceof ${serverLevel})) {`,
      `            return ${interactionResult}.SUCCESS;`,
      '        }',
      '        setOrderedToSit(!isOrderedToSit());',
      '        setJumping(false);',
      '        getNavigation().stop();',
      '        setTarget(null);',
      `        return ${interactionResult}.SUCCESS_SERVER;`,
      '    }',
    );
  }
  members.push('    return null;', '}');
  const tame = ['tame(player);'];
  if (tameable.tamedHealth !== undefined) tame.push('applyTamedHealth();');
  tame.push('getNavigation().stop();', 'setTarget(null);');
  if (tameable.sit) tame.push('setOrderedToSit(true);');
  tame.push('level.broadcastEntityEvent(this, (byte) 7); // hearts');
  if (tameable.onTame !== undefined) tame.push(fireCall(tameable.onTame, fireArgs('player')));
  const tameDoc = [
    'the owner',
    tameable.tamedHealth !== undefined ? 'tamed_health (healed to full)' : undefined,
    tameable.sit ? 'sitting' : undefined,
    'hearts',
    tameable.onTame !== undefined ? 'on_tame' : undefined,
  ].filter((part) => part !== undefined);
  members.push(
    '',
    `/** A wolf's taming: ${tameDoc.join(', ')}. */`,
    `private void tameWithFood(${serverLevel} level, ${player} player) {`,
    ...indent(tame),
    '}',
    '',
    "/** Asked by the owner target goals: never the owner, another pet of the same owner, or a player the owner may not hurt (a wolf's rule). */",
    '@Override',
    `public boolean wantsToAttack(${livingEntity} target, ${livingEntity} owner) {`,
    '    if (!super.wantsToAttack(target, owner) || target == owner) {',
    '        return false;',
    '    }',
    `    if (target instanceof ${tamableAnimal} pet && pet.isTame() && pet.getOwner() == owner) {`,
    '        return false;',
    '    }',
    `    return !(target instanceof ${player} targetPlayer && owner instanceof ${player} ownerPlayer && !ownerPlayer.canHarmPlayer(targetPlayer));`,
    '}',
  );
  if (spec.movement.mode === 'fly') {
    members.push(
      '',
      '/** Mode fly: teleports to an owner in the air. */',
      '@Override',
      'protected boolean canFlyToOwner() {',
      '    return true;',
      '}',
    );
  }
  if (spec.bossBar === undefined) {
    members.push(
      '',
      '/** A tamed mob is kept. */',
      '@Override',
      'public boolean requiresCustomPersistence() {',
      '    return super.requiresCustomPersistence() || isTame();',
      '}',
    );
  }
  return members;
}

/** The riding members of `MobRiding` (ADR 0071 D3) and `PlayerRideableJumping`. */
function ridingMembers(
  file: JavaFile,
  spec: EntitySpec,
  rideable: Rideable,
  fireArgs: (player: string, other?: string) => string,
): string[] {
  const interactionResult = file.use('net.minecraft.world.InteractionResult');
  const interactionHand = file.use('net.minecraft.world.InteractionHand');
  const player = file.use('net.minecraft.world.entity.player.Player');
  const itemStack = file.use('net.minecraft.world.item.ItemStack');
  const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
  const livingEntity = file.use('net.minecraft.world.entity.LivingEntity');
  const entity = file.use('net.minecraft.world.entity.Entity');
  const equipmentSlot = file.use('net.minecraft.world.entity.EquipmentSlot');
  const entityDimensions = file.use('net.minecraft.world.entity.EntityDimensions');
  const vec3 = file.use('net.minecraft.world.phys.Vec3');
  const mth = file.use('net.minecraft.util.Mth');
  const attributes = file.use('net.minecraft.world.entity.ai.attributes.Attributes');
  const { mode } = spec.movement;
  const animal = spec.base === 'animal';
  const canJump = rideable.jump > 0 && (mode === 'walk' || mode === 'amphibious');
  const steerable = rideable.saddle ? 'isSaddled()' : undefined;
  const members: string[] = [];
  if (canJump) {
    members.push(
      '',
      "/** The jump bar's scale, from onPlayerJump on the rider's client, used by tickRidden on the ground. */",
      'private float pendingJump;',
    );
  }
  if (rideable.ownerOnly) {
    members.push(
      '',
      animal
        ? '/** controlled_by owner: only the owner of the tamed mob (no owner, nobody). */'
        : '/** controlled_by owner without base animal: there is never an owner, so nobody steers (as msm_runtime). */',
      `private boolean allowedToSteer(${player} player) {`,
      `    return ${animal ? 'isTame() && isOwnedBy(player)' : 'false'};`,
      '}',
    );
  }
  // Mounting.
  const interact = [
    '    if (player.isSecondaryUseActive()) {',
    '        return null;',
    '    }',
    `    ${itemStack} stack = player.getItemInHand(hand);`,
    '    if (!stack.isEmpty()) {',
  ];
  if (rideable.saddle) {
    interact.push(
      `        boolean saddle = !isSaddled() && isEquippableInSlot(stack, ${equipmentSlot}.SADDLE);`,
      `        return saddle ? ${interactionResult}.PASS : null;`,
    );
  } else {
    interact.push('        return null;');
  }
  interact.push(
    '    }',
    `    if (isBaby() || hasPassenger(player) || getPassengers().size() >= ${javaInt(rideable.passengers)}) {`,
    '        return null;',
    '    }',
  );
  if (rideable.ownerOnly) {
    interact.push(
      '    if (getPassengers().isEmpty() && !allowedToSteer(player)) {',
      '        return null;',
      '    }',
    );
  }
  if (rideable.onMount === undefined) {
    interact.push(
      `    if (level() instanceof ${serverLevel} && !player.startRiding(this)) {`,
      '        return null;',
      '    }',
    );
  } else {
    interact.push(
      `    if (level() instanceof ${serverLevel} level) {`,
      '        if (!player.startRiding(this)) {',
      '            return null;',
      '        }',
      `        ${fireCall(rideable.onMount, fireArgs('player'))}`,
      '    }',
    );
  }
  interact.push(`    return ${interactionResult}.SUCCESS;`, '}');
  members.push(
    '',
    `/** The mounting step of a right click: an empty hand mounts (sneaking passes, as vanilla dismounts)${rideable.saddle ? "; a saddle the mob can take passes to vanilla's item use, which equips it" : ''}${rideable.ownerOnly ? "; the first seat is the owner's" : ''}; a full mob or a baby passes on${rideable.onMount === undefined ? '' : '; on_mount fires once per mount by right click (not for /ride)'}. Null passes on. */`,
    `private ${interactionResult} ridingInteract(${player} player, ${interactionHand} hand) {`,
    ...interact,
  );
  // Who steers.
  const conditions = [steerable, rideable.ownerOnly ? 'allowedToSteer(player)' : undefined].filter(
    (part) => part !== undefined,
  );
  members.push(
    '',
    `/** The first passenger steers when it is a player${rideable.saddle ? ' and the mob is saddled' : ''}${rideable.ownerOnly ? ' and it is the owner' : ''}; another player passenger only sits. */`,
    '@Override',
    `public ${livingEntity} getControllingPassenger() {`,
    `    if (getFirstPassenger() instanceof ${player} player) {`,
    conditions.length === 0
      ? '        return player;'
      : `        return ${conditions.join(' && ')} ? player : null;`,
    '    }',
    '    return super.getControllingPassenger();',
    '}',
    '',
    `/** passengers: ${rideable.passengers} seat${rideable.passengers === 1 ? '' : 's'}. */`,
    '@Override',
    `protected boolean canAddPassenger(${entity} passenger) {`,
    `    return getPassengers().size() < ${javaInt(rideable.passengers)};`,
    '}',
    '',
    rideable.saddle
      ? "/** The saddle slot exists on a grown, living mount (the pig's rule): vanilla's saddle equips it, shears take it off, it drops on death. */"
      : '/** saddle false: no saddle slot. */',
    '@Override',
    `public boolean canUseSlot(${equipmentSlot} slot) {`,
    `    if (slot != ${equipmentSlot}.SADDLE) {`,
    '        return super.canUseSlot(slot);',
    '    }',
    `    return ${rideable.saddle ? 'isAlive() && !isBaby()' : 'false'};`,
    '}',
  );
  // Seats.
  const offset = rideable.riderOffset;
  members.push(
    '',
    `/** Seat i at ${offset === undefined ? 'the top of the hitbox' : 'rider_offset (blocks from the feet, times the scale)'}, each further seat ${SEAT_SPACING} blocks behind the one before; turned with the mob. */`,
    '@Override',
    `protected ${vec3} getPassengerAttachmentPoint(${entity} passenger, ${entityDimensions} dimensions, float scale) {`,
    '    int index = Math.max(0, getPassengers().indexOf(passenger));',
    offset === undefined
      ? `    ${vec3} seat = new ${vec3}(0, dimensions.height(), 0);`
      : `    ${vec3} seat = new ${vec3}(${javaFloat(offset[0])} * scale, ${javaFloat(offset[1])} * scale, ${javaFloat(offset[2])} * scale);`,
    '    if (index > 0) {',
    `        seat = seat.add(0, 0, -${SEAT_SPACING} * index * scale);`,
    '    }',
    `    return seat.yRot(-getYRot() * ${mth}.DEG_TO_RAD);`,
    '}',
  );
  // Steering.
  const ridden = [
    'super.tickRidden(rider, input);',
    'setYRot(rider.getYRot() % 360.0f);',
    'setXRot((rider.getXRot() * 0.5f) % 360.0f);',
    'yRotO = getYRot();',
    'yBodyRot = getYRot();',
    'yHeadRot = getYRot();',
  ];
  if (canJump) {
    ridden.push(
      'if (isLocalInstanceAuthoritative() && onGround()) {',
      '    if (pendingJump > 0) {',
      '        rideJump(pendingJump, input);',
      '    }',
      '    pendingJump = 0;',
      '}',
    );
  }
  members.push(
    '',
    `/** The mob faces the rider's view (half the pitch, as horses)${canJump ? ', then a pending jump on the ground' : ''}. */`,
    '@Override',
    `protected void tickRidden(${player} rider, ${vec3} input) {`,
    ...indent(ridden),
    '}',
  );
  if (canJump) {
    members.push(
      '',
      "/** The horse's jump: jump_strength times the bar's scale and the block's jump factor, plus jump boost. */",
      `private void rideJump(float scale, ${vec3} input) {`,
      `    double power = getAttributeValue(${attributes}.JUMP_STRENGTH) * scale * getBlockJumpFactor() + getJumpBoostPower();`,
      `    ${vec3} motion = getDeltaMovement();`,
      '    setDeltaMovement(motion.x, power, motion.z);',
      '    needsSync = true;',
      '    if (input.z > 0) {',
      `        float sin = ${mth}.sin(getYRot() * ${mth}.DEG_TO_RAD);`,
      `        float cos = ${mth}.cos(getYRot() * ${mth}.DEG_TO_RAD);`,
      '        setDeltaMovement(getDeltaMovement().add(-0.4f * sin * scale, 0, 0.4f * cos * scale));',
      '    }',
      '}',
    );
  }
  const horse = [
    'float strafe = rider.xxa * 0.5f;',
    'float forward = rider.zza <= 0 ? rider.zza * 0.25f : rider.zza;',
    `return new ${vec3}(strafe, 0, forward);`,
  ];
  const view = (rise: boolean): string[] => [
    'float forward = 0;',
    'float up = 0;',
    'if (rider.zza != 0) {',
    `    float factor = rider.zza < 0 ? -0.5f : 1.0f;`,
    `    forward = ${mth}.cos(rider.getXRot() * ${mth}.DEG_TO_RAD) * factor;`,
    `    up = -${mth}.sin(rider.getXRot() * ${mth}.DEG_TO_RAD) * factor;`,
    '}',
    ...(rise ? ['if (rider.isJumping()) {', '    up += 0.5f;', '}'] : []),
    `return new ${vec3}(rider.xxa, up, forward);`,
  ];
  let input: string[];
  let inputDoc: string;
  switch (mode) {
    case 'fly':
      input = view(true);
      inputDoc =
        "Mode fly: the happy ghast's input, along the rider's view (backwards at half), rising while jump is held";
      break;
    case 'swim':
      input = view(false);
      inputDoc = "Mode swim: along the rider's view (backwards at half)";
      break;
    case 'amphibious':
      input = ['if (isInWater()) {', ...indent(view(false)), '}', ...horse];
      inputDoc =
        "Mode amphibious: along the rider's view in water (backwards at half), else the horse's input (strafe at half, backwards at a quarter)";
      break;
    default:
      input = horse;
      inputDoc = "The horse's input: strafe at half, backwards at a quarter";
  }
  members.push(
    '',
    `/** ${inputDoc}. */`,
    '@Override',
    `protected ${vec3} getRiddenInput(${player} rider, ${vec3} input) {`,
    ...indent(input),
    '}',
    '',
    '/** The movement_speed attribute times speed. */',
    '@Override',
    `protected float getRiddenSpeed(${player} rider) {`,
    `    return (float) (getAttributeValue(${attributes}.MOVEMENT_SPEED) * ${javaFloat(rideable.speed)});`,
    '}',
  );
  // Jump bar.
  if (canJump) {
    members.push(
      '',
      "/** On the rider's client: the bar's charge to a scale through vanilla's default curve. */",
      '@Override',
      'public void onPlayerJump(int strength) {',
      '    if (!canJump()) {',
      '        return;',
      '    }',
      '    pendingJump = getPlayerJumpPendingScale(Math.max(0, strength));',
      '}',
      '',
      `/** A jump bar while ${steerable === undefined ? 'ridden (no saddle needed)' : 'saddled'}. */`,
      '@Override',
      'public boolean canJump() {',
      `    return ${steerable ?? 'true'};`,
      '}',
    );
  } else {
    members.push(
      '',
      mode === 'fly' || mode === 'swim'
        ? `/** Mode ${mode} rises with the jump key instead: no jump bar. */`
        : '/** jump 0: no jump bar. */',
      '@Override',
      'public void onPlayerJump(int strength) {}',
      '',
      '@Override',
      'public boolean canJump() {',
      '    return false;',
      '}',
    );
  }
  members.push(
    '',
    "/** On the server when the rider releases the bar; the jump itself comes with the rider's movement. */",
    '@Override',
    'public void handleStartJump(int strength) {}',
    '',
    '@Override',
    'public void handleStopJump() {}',
  );
  if (rideable.saddleBone !== undefined) {
    members.push(
      '',
      `/** saddle_bone: the model bone hidden while the saddle slot is empty${rideable.saddle ? '' : ' (saddle false: always)'}; read by the GeckoLib model. */`,
      'public String hiddenBone() {',
      `    return isSaddled() ? null : ${javaString(rideable.saddleBone)};`,
      '}',
    );
  }
  return members;
}

/**
 * The mob sound overrides of `MsmEntity` (ADR 0057 D6): each configured id when it names a
 * registered sound event, else vanilla's sound; a configured step sound replaces the block's at
 * volume 0.15; `ambient_interval_ticks` replaces vanilla's interval.
 */
function soundMembers(file: JavaFile, sounds: Sounds): string[] {
  const soundEvent = file.use('net.minecraft.sounds.SoundEvent');
  const members: string[] = [];
  const configured = (id: string, signature: string, superCall: string, doc: string): string[] => [
    '',
    doc,
    '@Override',
    `${signature} {`,
    `    ${soundEvent} sound = sound(${javaString(id)});`,
    `    return sound != null ? sound : ${superCall};`,
    '}',
  ];
  if (sounds.ambient !== undefined) {
    members.push(
      ...configured(
        sounds.ambient,
        `protected ${soundEvent} getAmbientSound()`,
        'super.getAmbientSound()',
        '/** sounds.ambient, when registered; else the vanilla sound. */',
      ),
    );
  }
  if (sounds.ambientIntervalTicks !== undefined) {
    members.push(
      '',
      '/** sounds.ambient_interval_ticks. */',
      '@Override',
      'public int getAmbientSoundInterval() {',
      `    return ${javaInt(sounds.ambientIntervalTicks)};`,
      '}',
    );
  }
  if (sounds.hurt !== undefined) {
    const damageSource = file.use('net.minecraft.world.damagesource.DamageSource');
    members.push(
      ...configured(
        sounds.hurt,
        `protected ${soundEvent} getHurtSound(${damageSource} source)`,
        'super.getHurtSound(source)',
        '/** sounds.hurt, when registered; else the vanilla sound. */',
      ),
    );
  }
  if (sounds.death !== undefined) {
    members.push(
      ...configured(
        sounds.death,
        `protected ${soundEvent} getDeathSound()`,
        'super.getDeathSound()',
        '/** sounds.death, when registered; else the vanilla sound. */',
      ),
    );
  }
  if (sounds.step !== undefined) {
    const blockPos = file.use('net.minecraft.core.BlockPos');
    const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
    members.push(
      '',
      "/** sounds.step, when registered, at the volume most vanilla mobs use (0.15); else the block's step sound. */",
      '@Override',
      `protected void playStepSound(${blockPos} pos, ${blockState} state) {`,
      `    ${soundEvent} sound = sound(${javaString(sounds.step)});`,
      '    if (sound != null) {',
      '        playSound(sound, 0.15f, 1.0f);',
      '    } else {',
      '        super.playStepSound(pos, state);',
      '    }',
      '}',
    );
  }
  if (soundIds(sounds).length > 0) {
    const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
    const identifier = file.use('net.minecraft.resources.Identifier');
    members.push(
      '',
      '/** The registered sound event {@code id}, or null (the vanilla sound then stays). */',
      `private static ${soundEvent} sound(String id) {`,
      `    return ${builtIn}.SOUND_EVENT.getOptional(${identifier}.parse(id)).orElse(null);`,
      '}',
    );
  }
  return members;
}
