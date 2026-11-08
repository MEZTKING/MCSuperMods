/**
 * Entities: `ModEntities.java` (registration as the runtime's `MsmEntityRegistrar`:
 * `FabricEntityType.Builder.createMob(factory, category, mob -> mob.defaultAttributes(...)
 * .spawnPlacement(type, heightmap, rule)).sized(w, h).eyeHeight(f).fireImmune().build(key)`,
 * the spawn egg `SpawnEggItem(Item.Properties.setId(key).spawnEgg(type))` and the natural
 * spawn through `BiomeModifications.addSpawn`), and one `entity/<Name>Entity.java` per entity:
 * a `PathfinderMob implements GeoEntity` mirroring `MsmEntity` (attributes, goals, the four
 * trigger overrides, the loot table) and `MsmGeoEntity` (the `msm_main` and `msm_triggered`
 * controllers). Minecraft 26.3 and GeckoLib 5, Mojang names.
 *
 * @packageDocumentation
 */

import type { DefinitionInput } from '@msm/plugin-api';
import {
  type Events,
  eventMethod,
  eventMethods,
  fireCall,
  playAnimations,
  readEvents,
  TRIGGERED_CONTROLLER,
  usesActions,
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
  'category',
  'size',
  'eye_height',
  'loot_table',
  'spawn_egg',
  'spawn',
  'components',
  'events',
];
const ENTITY_COMPONENTS = [
  'msm:animated_model',
  'msm:health',
  'msm:movement',
  'msm:attack',
  'msm:ai_goals',
  'msm:on_hurt',
  'msm:on_death',
  'msm:on_interact',
];
const CATEGORIES = [
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
const RULES = ['mob', 'monster', 'surface_monster', 'any_light_monster', 'always'] as const;
const GOAL_TYPES = ['wander', 'look_at_player', 'look_around', 'melee_attack', 'flee', 'follow'];

interface Spawn {
  biomes: string[];
  weight: number;
  minGroup: number;
  maxGroup: number;
  placement: string;
  heightmap: string;
  rule: string;
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
    transitionTicks: number;
  };
  readonly maxHealth: number;
  readonly movement: {
    speed: number;
    followRange: number;
    knockbackResistance: number;
    swims: boolean;
    fireImmune: boolean;
  };
  readonly attack: { damage: number; knockback: number; onAttack: string | undefined } | undefined;
  readonly goals: Reader[];
  readonly onHurt: string | undefined;
  readonly onDeath: string | undefined;
  readonly onInteract: string | undefined;
  readonly events: Events;
}

function eventOf(component: Reader | undefined, events: Events): string | undefined {
  if (component === undefined) return undefined;
  component.onlyKeys(['event'], `${component.where} field`);
  return eventMethod(component, events, component.requiredString('event'));
}

function readEntity(input: DefinitionInput): EntitySpec {
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
    ['model', 'animations', 'texture', 'scale', 'idle', 'walk', 'attack', 'transition_ticks'],
    'msm:animated_model field',
  );
  const modelId = model.requiredString('model');
  const texture = splitId(model.requiredString('texture'));

  const health = components.object('msm:health');
  health?.onlyKeys(['max'], 'msm:health field');
  const movement = components.object('msm:movement');
  movement?.onlyKeys(
    ['speed', 'follow_range', 'knockback_resistance', 'swims', 'fire_immune'],
    'msm:movement field',
  );
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
  const onAttack = attack?.optionalString('on_attack');

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
      transitionTicks: model.integer('transition_ticks', 0),
    },
    maxHealth: health?.requiredNumber('max') ?? 20,
    movement: {
      speed: movement?.number('speed', 0.25) ?? 0.25,
      followRange: movement?.number('follow_range', 16) ?? 16,
      knockbackResistance: movement?.number('knockback_resistance', 0) ?? 0,
      swims: movement?.boolean('swims', true) ?? true,
      fireImmune: movement?.boolean('fire_immune', false) ?? false,
    },
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
    events,
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
): { className: string; entities: EntityNames[] } | undefined {
  const { entities } = context.input;
  if (entities.length === 0) return undefined;
  if (!context.input.geckolib) {
    throw new Error(
      'Entities render through GeckoLib, but the project has no GeckoLib (JavaProjectInput.geckolib is false).',
    );
  }
  const specs = entities.map(readEntity);
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
    builder.push(`        .build(${field}_KEY));`);
    body.push(
      '',
      `/** {@code ${spec.input.id}} (${spec.input.path}). */`,
      `public static final ${resourceKey}<${entityType}<?>> ${field}_KEY = ${resourceKey}.create(${registries}.ENTITY_TYPE, ${identifierExpression(file, spec.input.id)});`,
      `public static final ${entityType}<${type}> ${field} = ${registry}.register(${builtIn}.ENTITY_TYPE, ${field}_KEY,`,
      `        ${builder[0]}`,
      ...builder.slice(1).map((line) => `        ${line}`),
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
    '    /** Loads the class (registering every entity type), adds the spawn eggs to their tabs and the natural spawns. */',
    '    public static void register() {',
    ...indent(register, 2),
    '    }',
    ...indent(helpers),
    '}',
  ];
  context.files.push({ path: classPath(context, '', 'ModEntities'), contents: file.render(lines) });
  return { className: 'ModEntities', entities: names };
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

/** Animation names to register as triggerable per controller, as `EntityDefinition.triggerableAnimations`. */
function triggerable(spec: EntitySpec): Map<string, string[]> {
  const out = new Map<string, string[]>([[TRIGGERED_CONTROLLER, []]]);
  const add = (controller: string, name: string): void => {
    const names = out.get(controller) ?? [];
    if (!names.includes(name)) names.push(name);
    out.set(controller, names);
  };
  for (const name of [spec.model.idle, spec.model.walk, spec.model.attack]) {
    if (name !== undefined) add(TRIGGERED_CONTROLLER, name);
  }
  for (const [controller, name] of playAnimations(spec.events)) add(controller, name);
  return out;
}

function writeEntityClass(context: GenerationContext, spec: EntitySpec, name: string): void {
  const file = new JavaFile(packageOf(context, 'entity'), spec.input.path);
  const pathfinderMob = file.use('net.minecraft.world.entity.PathfinderMob');
  const geoEntity = file.use('com.geckolib.animatable.GeoEntity');
  const entityType = file.use('net.minecraft.world.entity.EntityType');
  const level = file.use('net.minecraft.world.level.Level');
  const instanceCache = file.use('com.geckolib.animatable.instance.AnimatableInstanceCache');
  const geckoLibUtil = file.use('com.geckolib.util.GeckoLibUtil');
  const attributeSupplier = file.use('net.minecraft.world.entity.ai.attributes.AttributeSupplier');
  const attributes = file.use('net.minecraft.world.entity.ai.attributes.Attributes');
  const mob = file.use('net.minecraft.world.entity.Mob');
  const usesHelper = usesActions(spec.events);
  const actions = usesHelper ? file.use(`${context.input.javaPackage}.Actions`) : 'Actions';
  if (usesHelper) context.usesActions = true;
  if (spec.events.appliesEffects) context.usesApplyEffect = true;
  if (spec.events.launches) context.usesLaunch = true;

  const members: string[] = [];
  if (spec.events.byId.size > 0)
    members.push(`private static final String OWNER = ${javaString(spec.input.id)};`);

  // Goals: static type predicates, built before any instance (registerGoals runs in the Mob constructor).
  const goalLines: string[] = [];
  const predicates: string[] = [];
  const predicateFields = new NameTable();
  const ofTypes = (field: string, ids: string[]): string => {
    const predicate = file.use('java.util.function.Predicate');
    const livingEntity = file.use('net.minecraft.world.entity.LivingEntity');
    const name = predicateFields.take(field);
    predicates.push(
      `private static final ${predicate}<${livingEntity}> ${name} = ofTypes(${ids.map(javaString).join(', ')});`,
    );
    return name;
  };
  if (spec.movement.swims) {
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
        const strollGoal = goal.boolean('avoid_water', true)
          ? file.use('net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal')
          : file.use('net.minecraft.world.entity.ai.goal.RandomStrollGoal');
        goalLines.push(`goalSelector.addGoal(${priority}, new ${strollGoal}(this, ${speed}));`);
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
        if (goal.boolean('retaliate', false)) {
          goalLines.push(
            `targetSelector.addGoal(1, new ${file.use('net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal')}(this));`,
          );
        }
        const targets = goal.strings('targets', []);
        if (targets.length > 0) {
          const field = ofTypes(`MELEE_TARGETS_${n + 1}`, targets);
          const targetGoal = file.use(
            'net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal',
          );
          const livingEntity = file.use('net.minecraft.world.entity.LivingEntity');
          goalLines.push(
            `targetSelector.addGoal(2, new ${targetGoal}<>(this, ${livingEntity}.class, ${goal.boolean('must_see', true)},`,
            `        (target, level) -> ${field}.test(target)));`,
          );
        }
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
  if (predicates.length > 0) members.push('', ...predicates);
  members.push(
    '',
    `private final ${instanceCache} cache = ${geckoLibUtil}.createInstanceCache(this);`,
    '',
    `public ${name}(${entityType}<? extends ${pathfinderMob}> type, ${level} level) {`,
    '    super(type, level);',
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
    `            .add(${attributes}.ATTACK_KNOCKBACK, ${spec.attack === undefined ? '0.0' : javaFloat(spec.attack.knockback)});`,
    '}',
  );
  if (predicates.length > 0) {
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
  members.push('', '@Override', 'protected void registerGoals() {', ...indent(goalLines), '}');

  const serverLevel = () => file.use('net.minecraft.server.level.ServerLevel');
  const player = () => file.use('net.minecraft.world.entity.player.Player');
  const damageSource = () => file.use('net.minecraft.world.damagesource.DamageSource');
  // With an apply_effect targeting `other`, the event methods also take the other entity:
  // the player, or the mob hit through on_attack (the runtime's EventContext.other).
  const fireArgs = (playerExpression: string, otherExpression = playerExpression) =>
    `level, blockPosition(), position(), ${playerExpression}, this${spec.events.otherParameter ? `, ${otherExpression}` : ''}`;

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
  if (spec.onDeath !== undefined) {
    members.push(
      '',
      '/** msm:on_death: once, on the logical server. */',
      '@Override',
      `public void die(${damageSource()} source) {`,
      '    boolean wasDead = dead;',
      '    super.die(source);',
      `    if (!wasDead && dead && level() instanceof ${serverLevel()} level) {`,
      `        ${fireCall(spec.onDeath, fireArgs(`source.getEntity() instanceof ${player()} p ? p : null`))}`,
      '    }',
      '}',
    );
  }
  if (spec.onInteract !== undefined) {
    const interactionResult = file.use('net.minecraft.world.InteractionResult');
    const interactionHand = file.use('net.minecraft.world.InteractionHand');
    members.push(
      '',
      '/** msm:on_interact: a player right-clicks the entity. */',
      '@Override',
      `protected ${interactionResult} mobInteract(${player()} player, ${interactionHand} hand) {`,
      `    if (level() instanceof ${serverLevel()} level) {`,
      `        ${fireCall(spec.onInteract, fireArgs('player'))}`,
      '    }',
      `    return ${interactionResult}.SUCCESS;`,
      '}',
    );
  }
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
  const controllers: string[] = [
    `${rawAnimation} idle = ${loop(spec.model.idle)};`,
    `${rawAnimation} walk = ${loop(spec.model.walk)};`,
    `${animationController}<${name}> main = new ${animationController}<>(${javaString(MAIN_CONTROLLER)}, ${javaInt(spec.model.transitionTicks)}, test -> {`,
    `    ${rawAnimation} loop = test.isMoving() && walk != null ? walk : idle;`,
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
  controllerNames.reserve('main', 'idle', 'walk', 'controllers');
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
    '/** msm_main loops walk while moving and idle otherwise; the other controllers play animations on request. */',
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

  const lines = [
    `/** The entity {@code ${spec.input.id}}, animated with GeckoLib. */`,
    `public class ${name} extends ${pathfinderMob} implements ${geoEntity} {`,
    ...indent(trimBlank(members)),
    '}',
  ];
  context.files.push({ path: classPath(context, 'entity', name), contents: file.render(lines) });
}
