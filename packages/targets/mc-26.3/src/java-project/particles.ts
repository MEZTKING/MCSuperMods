/**
 * Particles (ADR 0080 D11): `ModParticles.java` registers the project's particle types
 * (`msm/<namespace>/particle/*.json`) as option-less types with Fabric's
 * `FabricParticleTypes.simple(always_show)`, right after the sound events and before the status
 * effects, potions, blocks and items, as the runtime's `MsmParticles.registerAll`; the generated
 * client entrypoint registers one `client/particle/ModParticleProvider` per type through Fabric's
 * `ParticleProviderRegistry`, with the definition's `ParticleLook.Spec` (the runtime's
 * `MsmRuntimeClient.registerParticleProviders`). The client classes `ModParticle`,
 * `ModParticleProvider` and `ParticleLook` are copies of the runtime's `MsmParticle`,
 * `MsmParticleProvider` and `ParticleLook`; a dedicated server never loads them.
 *
 * Particles named by events and blocks (ADR 0080 D5, D6): a `spawn_particle` with an options
 * object, `motion` or `force` calls the generated `particle/ParticleSpecs.spawn` (a copy of the
 * runtime's `ParticleSpecs`) with a constant parsed once; a plain id without `motion` and `force`
 * keeps the `Actions.spawnParticle` call of earlier generators, so projects without the new
 * forms generate the same Java. `msm:ambient_particles` becomes an `AmbientParticles.Spec`
 * constant and an `animateTick` override (super first) calling the generated
 * `particle/AmbientParticles` (a copy of the runtime's).
 *
 * Generation is stricter than the runtime: a particle definition the runtime's Codec refuses, a
 * plain id of a type that takes options, an options object whose fields do not fit its type
 * (unknown or missing fields, wrong value shapes, a block state written as `{Name, Properties}`,
 * which vanilla 26.3 does not decode) and `msm:ambient_particles` on a portal (`portals.ts`) fail
 * generation, where the runtime reports a load or start error and sends nothing. Block and item
 * ids inside an options object are looked up when the particle is first sent. Minecraft 26.3,
 * Mojang names.
 *
 * @packageDocumentation
 */

import type { DefinitionInput, Json, JsonObject } from '@msm/plugin-api';
import { classPath, type GenerationContext, packageOf } from './context';
import { identifierExpression, indent, JavaFile, javaFloat, javaInt, javaString } from './java';
import { constantName, NameTable, splitId } from './names';
import { OPTION_PARTICLES } from './portals';
import { checkFormat, type Reader, readDefinition } from './read';
import { ambientParticlesJava } from './templates/ambient-particles-java';
import { modParticleJava } from './templates/particle-java';
import { particleLookJava } from './templates/particle-look-java';
import { modParticleProviderJava } from './templates/particle-provider-java';
import { particleSpecsJava } from './templates/particle-specs-java';

/** The keys of a particle definition (the runtime's `ParticleDefinition.KEYS`). */
export const PARTICLE_KEYS = [
  'format',
  'textures',
  'animation',
  'frame_ticks',
  'lifetime',
  'size',
  'size_end',
  'gravity',
  'friction',
  'collision',
  'color',
  'color_end',
  'alpha',
  'fade',
  'emissive',
  'translucent',
  'spin',
  'always_show',
] as const;

/** The most frames one particle may have (`ParticleDefinition.MAX_TEXTURES`). */
export const MAX_TEXTURES = 64;
/** The longest lifetime in ticks (`ParticleDefinition.MAX_LIFETIME`). */
export const MAX_LIFETIME = 6000;
/** The most particles one `spawn_particle` sends (`ParticleSpecs.MAX_COUNT`). */
export const MAX_SPAWN_COUNT = 1000;
/** The most particles one animation tick of `msm:ambient_particles` shows. */
export const MAX_AMBIENT_COUNT = 16;

const ANIMATIONS = ['age', 'loop', 'random'];
const FADES = ['none', 'out', 'in_out'];

/** `spawn_particle` fields (`Action.SpawnParticle`). */
export const SPAWN_PARTICLE_KEYS = [
  'type',
  'particle',
  'count',
  'spread',
  'speed',
  'motion',
  'force',
];

/** `msm:ambient_particles` fields (`BlockComponents.AmbientParticles.KEYS`). */
export const AMBIENT_KEYS = [
  'particle',
  'chance',
  'count',
  'offset',
  'spread',
  'velocity',
  'states',
];

/** An id as the runtime's `Identifier.tryParse` reads it (no namespace means `minecraft`). */
const ID = /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;

/** The shape of one options field's value. */
type FieldShape =
  | 'block_id'
  | 'float'
  | 'scale'
  | 'int_min_0'
  | 'int_min_1'
  | 'int'
  | 'rgb'
  | 'rgba'
  | 'item'
  | 'vec3'
  | 'position_source';

/** One field of a particle type's options: its shape and whether it must be written. */
interface OptionField {
  readonly shape: FieldShape;
  readonly required: boolean;
}

const req = (shape: FieldShape): OptionField => ({ shape, required: true });
const opt = (shape: FieldShape): OptionField => ({ shape, required: false });

/**
 * The options fields of each 26.3 particle type that takes options, as vanilla's codecs read
 * them (the vendored vanilla-mcdoc `minecraft:particle` dispatcher, fields current on 26.3; a
 * test ties the two). A block state is a block id only: the `{Name, Properties}` form fails at
 * server start on 26.3 (B352).
 */
export const PARTICLE_OPTIONS: Readonly<Record<string, Readonly<Record<string, OptionField>>>> = {
  'minecraft:block': { block_state: req('block_id') },
  'minecraft:block_crumble': { block_state: req('block_id') },
  'minecraft:block_marker': { block_state: req('block_id') },
  'minecraft:dragon_breath': { power: opt('float') },
  'minecraft:dust': { color: req('rgb'), scale: req('scale') },
  'minecraft:dust_color_transition': {
    from_color: req('rgb'),
    to_color: req('rgb'),
    scale: req('scale'),
  },
  'minecraft:dust_pillar': { block_state: req('block_id') },
  'minecraft:effect': { power: opt('float'), color: opt('rgb') },
  'minecraft:entity_effect': { color: req('rgba') },
  'minecraft:falling_dust': { block_state: req('block_id') },
  'minecraft:flash': { color: req('rgba') },
  'minecraft:geyser': { water_blocks: req('int_min_1') },
  'minecraft:geyser_base': { water_blocks: req('int_min_1'), burst_impulse_base: req('float') },
  'minecraft:geyser_plume': { water_blocks: req('int_min_1') },
  'minecraft:geyser_poof': { water_blocks: req('int_min_1'), burst_impulse_base: req('float') },
  'minecraft:instant_effect': { power: opt('float'), color: opt('rgb') },
  'minecraft:item': { item: req('item') },
  'minecraft:sculk_charge': { roll: req('float') },
  'minecraft:shriek': { delay: req('int_min_0') },
  'minecraft:tinted_leaves': { color: req('rgba') },
  'minecraft:trail': { target: req('vec3'), color: req('rgb'), duration: req('int_min_1') },
  'minecraft:vibration': { destination: req('position_source'), arrival_in_ticks: req('int') },
};

/** A particle named by an action or a component: a type id, and the options object if any. */
export interface ParticleSpecInfo {
  /** The namespaced particle type id. */
  readonly type: string;
  /** The options object as written, or `undefined` for a plain id. */
  readonly options: JsonObject | undefined;
}

/** The namespaced form of an id. */
function namespaced(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`;
}

/**
 * Reads the particle at `key` of `reader`: a plain id of a type without options, or an options
 * object whose fields fit its type. Fails as described in the module comment.
 */
export function readParticleSpec(reader: Reader, key: string): ParticleSpecInfo {
  if (!reader.has(key)) reader.fail(`${key} is missing`);
  const value = reader.value[key];
  if (typeof value === 'string') {
    if (!ID.test(value)) reader.fail(`${key} '${value}' is not a particle type id`);
    const type = namespaced(value);
    if ((OPTION_PARTICLES as readonly string[]).includes(type)) {
      reader.fail(
        `${key}: ${type} is not a particle type without options (write an options object with its fields)`,
      );
    }
    return { type, options: undefined };
  }
  const object = reader.object(key);
  if (object === undefined) return reader.fail(`${key} must be a particle type id or an object`);
  const rawType =
    object.optionalString('type') ??
    object.fail('type is missing (an options object names its particle type in type)');
  if (!ID.test(rawType)) object.fail(`type '${rawType}' is not a particle type id`);
  const type = namespaced(rawType);
  const fields = PARTICLE_OPTIONS[type];
  const extra = object.keys().filter((k) => k !== 'type');
  if (fields === undefined) {
    // A vanilla type without options or a project or mod particle: no other field.
    const first = extra[0];
    if (first !== undefined)
      object.fail(`${first}: unknown field (particle type ${type} takes no options)`);
    return { type, options: object.value };
  }
  for (const field of extra) {
    if (!Object.hasOwn(fields, field)) {
      object.fail(
        `${field}: unknown field (particle type ${type} takes ${Object.keys(fields).join(', ')})`,
      );
    }
  }
  for (const [field, { shape, required }] of Object.entries(fields)) {
    if (!object.has(field)) {
      if (required) object.fail(`${field} is missing (particle type ${type} needs it)`);
      continue;
    }
    checkShape(object, field, shape, object.value[field] as Json);
  }
  return { type, options: object.value };
}

function isNumber(value: Json): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isUnitList(value: Json, length: number): boolean {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((n) => isNumber(n) && n >= 0 && n <= 1)
  );
}

function checkShape(object: Reader, field: string, shape: FieldShape, value: Json): void {
  switch (shape) {
    case 'block_id':
      if (typeof value !== 'string' || !ID.test(value)) {
        object.fail(
          `${field} must be a block id such as "minecraft:stone" (the {Name, Properties} form does not decode on 26.3)`,
        );
      }
      return;
    case 'float':
      if (!isNumber(value)) object.fail(`${field} must be a number`);
      return;
    case 'scale':
      if (!isNumber(value) || value < 0.01 || value > 4) object.fail(`${field} must be 0.01 to 4`);
      return;
    case 'int':
    case 'int_min_0':
    case 'int_min_1': {
      const min = shape === 'int' ? -2147483648 : shape === 'int_min_0' ? 0 : 1;
      if (!isNumber(value) || !Number.isInteger(value) || value < min || value > 2147483647) {
        object.fail(`${field} must be an integer${shape === 'int' ? '' : ` of at least ${min}`}`);
      }
      return;
    }
    case 'rgb':
    case 'rgba': {
      const length = shape === 'rgb' ? 3 : 4;
      const int = isNumber(value) && Number.isInteger(value);
      if (!int && !isUnitList(value, length)) {
        object.fail(
          `${field} must be an integer colour or ${length} numbers from 0 to 1 [${shape === 'rgb' ? 'r, g, b' : 'r, g, b, a'}]`,
        );
      }
      return;
    }
    case 'item': {
      if (typeof value === 'string') {
        if (!ID.test(value)) object.fail(`${field} '${value}' is not an item id`);
        return;
      }
      const item = object.object(field);
      item?.onlyKeys(['id', 'count', 'components'], 'item field');
      const id = item?.requiredString('id') ?? '';
      if (!ID.test(id)) item?.fail(`id '${id}' is not an item id`);
      if (item?.has('count') === true) {
        const count = item.integer('count', 1);
        if (count < 1 || count > 99) item.fail('count must be 1 to 99');
      }
      item?.object('components');
      return;
    }
    case 'vec3':
      if (!Array.isArray(value) || value.length !== 3 || !value.every(isNumber)) {
        object.fail(`${field} must be three numbers [x, y, z]`);
      }
      return;
    case 'position_source': {
      const source = object.object(field);
      source?.onlyKeys(['type', 'pos'], 'destination field');
      const type = source?.requiredString('type');
      if (type !== 'minecraft:block' && type !== 'block')
        source?.fail("type must be 'minecraft:block'");
      const pos = source?.value.pos;
      if (
        !Array.isArray(pos) ||
        pos.length !== 3 ||
        !pos.every((n) => isNumber(n) && Number.isInteger(n))
      ) {
        source?.fail('pos must be three integers [x, y, z]');
      }
      return;
    }
  }
}

/** A Java `double` literal: `0` is `0.0`. */
export function javaDouble(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`${value} is not a finite number`);
  const text = String(value);
  return /[.e]/.test(text) ? text : `${text}.0`;
}

/** The `ParticleSpecs.Spec` expression of a particle: `Spec.of(id)` or `Spec.parse("<json>")`. */
export function specExpression(file: JavaFile, spec: ParticleSpecInfo, modPackage: string): string {
  const specs = file.use(`${modPackage}.particle.ParticleSpecs`);
  return spec.options === undefined
    ? `${specs}.Spec.of(${identifierExpression(file, spec.type)})`
    : `${specs}.Spec.parse(${javaString(JSON.stringify(spec.options))})`;
}

/**
 * Reads `[x, y, z]` at `key` of `reader` (finite numbers), or `fallback` when absent.
 */
function xyz(reader: Reader, key: string, fallback: readonly number[]): readonly number[] {
  if (!reader.has(key)) return fallback;
  const value = reader.value[key];
  if (!Array.isArray(value) || value.length !== 3 || !value.every((n) => isNumber(n as Json))) {
    reader.fail(`${key} must be three numbers [x, y, z]`);
  }
  return value as number[];
}

// spawn_particle

/**
 * Whether a `spawn_particle` needs the generated `ParticleSpecs` (an options object, `motion` or
 * `force`); a plain id without them keeps `Actions.spawnParticle`.
 */
export function needsParticleSpecs(action: Reader): boolean {
  const particle = action.value.particle;
  return (
    (typeof particle === 'object' && particle !== null) ||
    action.has('motion') ||
    action.has('force')
  );
}

/** A `spawn_particle` read with the runtime's checks (`Action.SpawnParticle.CODEC`). */
export interface SpawnParticleInfo {
  readonly particle: ParticleSpecInfo;
  readonly count: number;
  readonly spread: number;
  readonly speed: number;
  readonly motion: readonly number[] | undefined;
  readonly force: boolean;
}

/** Reads a `spawn_particle` action. */
export function readSpawnParticle(action: Reader): SpawnParticleInfo {
  action.onlyKeys(SPAWN_PARTICLE_KEYS, 'spawn_particle field');
  const particle = readParticleSpec(action, 'particle');
  const count = action.integer('count', 1);
  if (count < 1 || count > MAX_SPAWN_COUNT) action.fail(`count must be 1 to ${MAX_SPAWN_COUNT}`);
  const spread = action.number('spread', 0);
  if (spread < 0) action.fail('spread must be at least 0');
  const speed = action.number('speed', 0);
  if (speed < 0) action.fail('speed must be at least 0');
  return {
    particle,
    count,
    spread,
    speed,
    motion: action.has('motion') ? xyz(action, 'motion', []) : undefined,
    force: action.boolean('force', false),
  };
}

/**
 * The `ParticleSpecs.spawn` call of a `spawn_particle` that needs it; `field` is the class's
 * constant holding the particle.
 */
export function spawnLine(
  file: JavaFile,
  info: SpawnParticleInfo,
  field: string,
  modPackage: string,
): string {
  const specs = file.use(`${modPackage}.particle.ParticleSpecs`);
  const optional = file.use('java.util.Optional');
  const motion =
    info.motion === undefined
      ? `${optional}.empty()`
      : `${optional}.of(new ${file.use('net.minecraft.world.phys.Vec3')}(${info.motion.map(javaDouble).join(', ')}))`;
  return `${specs}.spawn(OWNER, level, origin, ${field}, ${javaInt(info.count)}, ${javaFloat(info.spread)}, ${javaFloat(info.speed)}, ${motion}, ${info.force});`;
}

// msm:ambient_particles

/** A parsed `msm:ambient_particles` with the runtime's defaults. */
export interface AmbientInfo {
  readonly particle: ParticleSpecInfo;
  readonly chance: number;
  readonly count: number;
  readonly offset: readonly number[];
  readonly spread: readonly number[];
  readonly velocity: readonly number[];
  /** Property to value, sorted by property. */
  readonly states: readonly (readonly [string, string])[];
}

/** Reads `msm:ambient_particles` with the runtime's Codec rules (`BlockComponents.AmbientParticles`). */
export function readAmbient(component: Reader): AmbientInfo {
  component.onlyKeys(AMBIENT_KEYS, 'msm:ambient_particles field');
  const particle = readParticleSpec(component, 'particle');
  const chance = component.number('chance', 1);
  if (chance < 0 || chance > 1) component.fail('chance must be 0 to 1');
  const count = component.integer('count', 1);
  if (count < 1 || count > MAX_AMBIENT_COUNT) {
    component.fail(`count must be 1 to ${MAX_AMBIENT_COUNT}`);
  }
  const states = component.object('states');
  const pairs: [string, string][] = [];
  for (const key of states?.keys() ?? []) {
    const value = states?.value[key];
    if (typeof value !== 'string') {
      states?.fail(`${key}: expected a string such as "true", not ${JSON.stringify(value)}`);
    }
    pairs.push([key, value as string]);
  }
  return {
    particle,
    chance,
    count,
    offset: xyz(component, 'offset', [0.5, 0.5, 0.5]),
    spread: xyz(component, 'spread', [0.5, 0.5, 0.5]),
    velocity: xyz(component, 'velocity', [0, 0, 0]),
    states: pairs,
  };
}

/**
 * The block class members of `msm:ambient_particles`: the owner id and the component as
 * constants, and `animateTick` (vanilla's own first, as the runtime's family classes).
 */
export function ambientMembers(
  context: GenerationContext,
  file: JavaFile,
  id: string,
  info: AmbientInfo,
): string[] {
  noteParticleSpecs(context, true);
  const modPackage = context.input.javaPackage;
  const ambient = file.use(`${modPackage}.particle.AmbientParticles`);
  const identifier = file.use('net.minecraft.resources.Identifier');
  const list = file.use('java.util.List');
  const map = file.use('java.util.Map');
  const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
  const level = file.use('net.minecraft.world.level.Level');
  const blockPos = file.use('net.minecraft.core.BlockPos');
  const random = file.use('net.minecraft.util.RandomSource');
  const vector = (v: readonly number[]) => `${list}.of(${v.map(javaDouble).join(', ')})`;
  const states =
    info.states.length === 0
      ? `${map}.of()`
      : info.states.length <= 10
        ? `${map}.of(${info.states.map(([k, v]) => `${javaString(k)}, ${javaString(v)}`).join(', ')})`
        : `${map}.ofEntries(${info.states.map(([k, v]) => `${map}.entry(${javaString(k)}, ${javaString(v)})`).join(', ')})`;
  return [
    '',
    '/** msm:ambient_particles: the particles the client shows around the block (ADR 0080 D6). */',
    `private static final ${identifier} AMBIENT_OWNER = ${identifierExpression(file, id)};`,
    `private static final ${ambient}.Spec AMBIENT = new ${ambient}.Spec(${specExpression(file, info.particle, modPackage)},`,
    `        ${javaFloat(info.chance)}, ${javaInt(info.count)}, ${vector(info.offset)}, ${vector(info.spread)}, ${vector(info.velocity)}, // chance, count, offset, spread, velocity`,
    `        ${states}); // states`,
    '',
    "/** msm:ambient_particles, after vanilla's own animation: client only (a dedicated server never calls it). */",
    '@Override',
    `public void animateTick(${blockState} state, ${level} level, ${blockPos} pos, ${random} random) {`,
    '    super.animateTick(state, level, pos, random);',
    `    ${ambient}.animate(AMBIENT_OWNER, AMBIENT, level, state, pos, random);`,
    '}',
  ];
}

// Which shared classes are needed

interface ParticleUse {
  /** `ParticleSpecs` is used (options objects, `motion` or `force`, ambient particles). */
  specs: boolean;
  /** `AmbientParticles` is used. */
  ambient: boolean;
}

const USES = new WeakMap<GenerationContext, ParticleUse>();

function useOf(context: GenerationContext): ParticleUse {
  let use = USES.get(context);
  if (use === undefined) {
    use = { specs: false, ambient: false };
    USES.set(context, use);
  }
  return use;
}

/** Records that generated code calls `ParticleSpecs` (and, with `ambient`, `AmbientParticles`). */
export function noteParticleSpecs(context: GenerationContext, ambient = false): void {
  const use = useOf(context);
  use.specs = true;
  if (ambient) use.ambient = true;
}

/** Writes `particle/ParticleSpecs.java` and `particle/AmbientParticles.java` when used. */
export function writeParticleSpecFiles(context: GenerationContext): void {
  const use = useOf(context);
  const particlePackage = packageOf(context, 'particle');
  if (use.specs) {
    context.files.push({
      path: classPath(context, 'particle', 'ParticleSpecs'),
      contents: particleSpecsJava(particlePackage, context.input.modId),
    });
  }
  if (use.ambient) {
    context.files.push({
      path: classPath(context, 'particle', 'AmbientParticles'),
      contents: ambientParticlesJava(particlePackage),
    });
  }
}

// Particle types

/** A particle definition read with the runtime's Codec rules (`ParticleDefinition.CODEC`). */
interface ParticleSpec {
  readonly input: DefinitionInput;
  /** The arguments of `ParticleLook.Spec.resolve`, as Java expressions (`null` when absent). */
  readonly resolve: {
    animation: string;
    frameTicks: string;
    lifetimeMin: string;
    lifetimeMax: string;
    size: string;
    sizeEnd: string;
    gravity: string;
    friction: string;
    collision: string;
    color: string;
    colorEnd: string;
    alpha: string;
    fade: string;
    emissive: string;
    translucent: string;
    spin: string;
    alwaysShow: string;
  };
  readonly alwaysShow: boolean;
}

function readParticle(input: DefinitionInput): ParticleSpec {
  const reader = readDefinition(input);
  reader.onlyKeys(PARTICLE_KEYS, 'top-level key');
  checkFormat(reader);
  const textures = reader.value.textures;
  if (
    !Array.isArray(textures) ||
    textures.length < 1 ||
    textures.length > MAX_TEXTURES ||
    textures.some((t) => typeof t !== 'string' || !ID.test(t))
  ) {
    reader.fail(`textures must be a list of 1 to ${MAX_TEXTURES} sprite ids`);
  }
  const float = (key: string, min: number, max: number): string => {
    if (!reader.has(key)) return 'null';
    const value = reader.number(key, 0);
    if (Math.fround(value) < Math.fround(min) || Math.fround(value) > Math.fround(max)) {
      reader.fail(`${key} must be ${min} to ${max}`);
    }
    return javaFloat(value);
  };
  const int = (key: string, min: number, max: number): string => {
    if (!reader.has(key)) return 'null';
    const value = reader.integer(key, 0);
    if (value < min || value > max) reader.fail(`${key} must be ${min} to ${max}`);
    return javaInt(value);
  };
  const bool = (key: string): string =>
    reader.has(key) ? String(reader.boolean(key, false)) : 'null';
  const named = (key: string, values: readonly string[], enumName: string): string => {
    if (!reader.has(key)) return 'null';
    const value = reader.requiredString(key);
    if (!values.includes(value)) {
      reader.fail(`unknown ${key} '${value}' (expected one of ${values.join(', ')})`);
    }
    return `ParticleLook.${enumName}.${value.toUpperCase()}`;
  };
  let lifetimeMin = 'null';
  let lifetimeMax = 'null';
  if (reader.has('lifetime')) {
    const raw = reader.value.lifetime;
    if (typeof raw === 'number') {
      const value = reader.integer('lifetime', 0);
      if (value < 1 || value > MAX_LIFETIME) reader.fail(`lifetime must be 1 to ${MAX_LIFETIME}`);
      lifetimeMin = javaInt(value);
      lifetimeMax = javaInt(value);
    } else {
      const range =
        reader.object('lifetime') ?? reader.fail('lifetime must be a number or {min, max}');
      range.onlyKeys(['min', 'max'], 'lifetime field');
      const min = range.requiredInteger('min');
      const max = range.requiredInteger('max');
      if (min < 1 || min > MAX_LIFETIME || max < 1 || max > MAX_LIFETIME) {
        range.fail(`min and max must be 1 to ${MAX_LIFETIME}`);
      }
      if (min > max) range.fail(`max: ${max} is below min ${min}`);
      lifetimeMin = javaInt(min);
      lifetimeMax = javaInt(max);
    }
  }
  const alwaysShow = reader.boolean('always_show', false);
  return {
    input,
    resolve: {
      animation: named('animation', ANIMATIONS, 'Animation'),
      frameTicks: int('frame_ticks', 1, 1200),
      lifetimeMin,
      lifetimeMax,
      size: float('size', 0.01, 16),
      sizeEnd: float('size_end', 0, 16),
      gravity: float('gravity', -16, 16),
      friction: float('friction', 0, 1),
      collision: bool('collision'),
      color: int('color', 0, 0xffffff),
      colorEnd: int('color_end', 0, 0xffffff),
      alpha: float('alpha', 0, 1),
      fade: named('fade', FADES, 'Fade'),
      emissive: bool('emissive'),
      translucent: bool('translucent'),
      spin: float('spin', -360, 360),
      alwaysShow: bool('always_show'),
    },
    alwaysShow,
  };
}

/** A registered particle type, for the client entrypoint. */
export interface ParticleEntry {
  /** The `ModParticles` field. */
  readonly field: string;
  readonly id: string;
  readonly spec: ParticleSpec;
}

/**
 * Generates `ModParticles.java`; returns nothing when the project has no particle types.
 *
 * @returns The registration class and the types in registration order, or `undefined`.
 */
export function generateParticles(
  context: GenerationContext,
): { className: string; particles: ParticleEntry[] } | undefined {
  const inputs = context.input.particles ?? [];
  if (inputs.length === 0) return undefined;
  const specs = inputs.map(readParticle);
  const ids = new Set<string>();
  for (const spec of specs) {
    if (ids.has(spec.input.id)) {
      throw new Error(`${spec.input.path}: particle type id ${spec.input.id} is defined twice`);
    }
    ids.add(spec.input.id);
  }
  const file = new JavaFile(
    context.input.javaPackage,
    'the msm/<namespace>/particle/*.json definitions',
  );
  const registry = file.use('net.minecraft.core.Registry');
  const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
  const identifier = file.use('net.minecraft.resources.Identifier');
  const simple = file.use('net.minecraft.core.particles.SimpleParticleType');
  const fabric = file.use('net.fabricmc.fabric.api.particle.v1.FabricParticleTypes');
  const fields = new NameTable();
  const particles: ParticleEntry[] = [];
  const body: string[] = [];
  for (const spec of specs) {
    const field = fields.take(constantName(splitId(spec.input.id).path));
    particles.push({ field, id: spec.input.id, spec });
    body.push(
      '',
      `/** {@code ${spec.input.id}} (${spec.input.path})${spec.alwaysShow ? ': always_show' : ''}. */`,
      `public static final ${simple} ${field} = particle(${identifierExpression(file, spec.input.id)}, ${spec.alwaysShow});`,
    );
  }
  const lines = [
    '/**',
    ' * The particle types, registered when the class loads: after the sound events, before the status effects, potions,',
    ' * blocks and items, which may name them. Each is a particle type without options; the client entrypoint gives each',
    ' * its provider.',
    ' */',
    'public final class ModParticles {',
    ...indent(body.slice(1)),
    '',
    '    private ModParticles() {}',
    '',
    '    /** Loads the class, registering every particle type. */',
    '    public static void register() {}',
    '',
    '    /**',
    '     * Registers a particle type without options; with {@code alwaysShow} the client draws it beyond 32 blocks and',
    '     * under the Minimal particles setting. An id already registered (by vanilla or another mod) stops the start-up.',
    '     */',
    `    private static ${simple} particle(${identifier} id, boolean alwaysShow) {`,
    `        if (${builtIn}.PARTICLE_TYPE.containsKey(id)) {`,
    '            throw new IllegalStateException("particle type id " + id + " is already registered");',
    '        }',
    `        return ${registry}.register(${builtIn}.PARTICLE_TYPE, id, ${fabric}.simple(alwaysShow));`,
    '    }',
    '}',
  ];
  context.files.push({
    path: classPath(context, '', 'ModParticles'),
    contents: file.render(lines),
  });
  return { className: 'ModParticles', particles };
}

/**
 * The client entrypoint lines registering one provider per particle type, and writes the client
 * particle classes (`client/particle/ModParticle`, `ModParticleProvider`, `ParticleLook`).
 */
export function particleProviderLines(
  context: GenerationContext,
  file: JavaFile,
  particles: readonly ParticleEntry[],
): string[] {
  const clientParticlePackage = packageOf(context, 'client.particle');
  context.files.push(
    {
      path: classPath(context, 'client.particle', 'ModParticle'),
      contents: modParticleJava(clientParticlePackage),
    },
    {
      path: classPath(context, 'client.particle', 'ModParticleProvider'),
      contents: modParticleProviderJava(clientParticlePackage, context.input.modId),
    },
    {
      path: classPath(context, 'client.particle', 'ParticleLook'),
      contents: particleLookJava(clientParticlePackage),
    },
  );
  const registry = file.use('net.fabricmc.fabric.api.client.particle.v1.ParticleProviderRegistry');
  const modParticles = file.use(`${context.input.javaPackage}.ModParticles`);
  const provider = file.use(`${clientParticlePackage}.ModParticleProvider`);
  const look = file.use(`${clientParticlePackage}.ParticleLook`);
  const lines = [
    "// Particles: one provider per particle type, drawing the frames of the type's description",
    "// assets/<namespace>/particles/<path>.json with the definition's look (absent fields are ParticleLook's defaults).",
    `${registry} particles = ${registry}.getInstance();`,
  ];
  for (const { field, id, spec } of particles) {
    const r = spec.resolve;
    lines.push(
      `particles.register(${modParticles}.${field}, ${provider}.pending(${identifierExpression(file, id)}, ${look}.Spec.resolve(`,
      `        ${r.animation}, ${r.frameTicks}, ${r.lifetimeMin}, ${r.lifetimeMax}, // animation, frame_ticks, lifetime min and max`,
      `        ${r.size}, ${r.sizeEnd}, ${r.gravity}, ${r.friction}, ${r.collision}, // size, size_end, gravity, friction, collision`,
      `        ${r.color}, ${r.colorEnd}, ${r.alpha}, ${r.fade}, // color, color_end, alpha, fade`,
      `        ${r.emissive}, ${r.translucent}, ${r.spin}, ${r.alwaysShow}))); // emissive, translucent, spin, always_show`,
    );
  }
  return lines;
}
