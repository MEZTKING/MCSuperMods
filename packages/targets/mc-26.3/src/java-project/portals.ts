/**
 * Portals (ADR 0077 D9): the fields of a `type: "portal"` block read with the runtime's rules
 * (`dev.mcsupermods.runtime.loader.BlockType.Portal` and `MsmRegistrar.checkPortal`, stricter
 * where the runtime only reports a load error), the generated block class's portal members, the
 * shared classes copied from the runtime into `<package>/portal/` (`PortalFrame`, `ExitPortals`,
 * `PortalIndex`, `PortalIndexAttachment`, `PortalLighting`, `PortalTravel` and `PortalBlock`, the
 * runtime's `MsmPortalBlock`, plus `PortalSpec`, the fields as data), the check of every
 * `light_portal` action and the lines of the mod initialiser.
 *
 * Each portal block is a generated `block/<Name>Block` extending the shared `portal/PortalBlock`
 * (`extends Block implements Portal`) with its `PortalSpec` and its own events: the ADR 0061
 * triggers a portal may carry and `on_travel`, fired from `PortalTravel` after arrival with the
 * arrived entity as the actor (the runtime's `EventContext.forBlockActor`).
 *
 * Generation fails where the runtime keeps going with a load error: a component a portal may not
 * carry, a `particles.type` that takes options (without `color`), a `color` with a type other
 * than `minecraft:dust`, a tag `frame` without `frame_block`, an `on_travel` that names no
 * declared event, and a `light_portal` that names no portal block of the project.
 *
 * Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import type { DefinitionInput, JavaProjectInput } from '@msm/plugin-api';
import { classPath, type GenerationContext, packageOf } from './context';
import { identifierExpression, type JavaFile, javaInt } from './java';
import { type Reader, readDefinition } from './read';
import { portalBlockJava, portalSpecJava } from './templates/portal-block-java';
import { exitPortalsJava, portalFrameJava } from './templates/portal-frame-java';
import { portalIndexAttachmentJava, portalIndexJava } from './templates/portal-index-java';
import { portalLightingJava } from './templates/portal-lighting-java';
import { portalTravelJava } from './templates/portal-travel-java';

/** A portal's own top-level fields (`BlockType.PORTAL.fields()`). */
export const PORTAL_FIELDS = [
  'frame',
  'frame_block',
  'igniter',
  'destination',
  'return_to',
  'travel',
  'sounds',
  'particles',
  'on_travel',
] as const;

/** The only components a portal may carry (`BlockType.PORTAL_COMPONENTS`, ADR 0077 D1). */
export const PORTAL_COMPONENTS = [
  'msm:breakable',
  'msm:light_emitter',
  'msm:on_break',
  'msm:on_place',
  'msm:on_random_tick',
  'msm:on_entity_inside',
] as const;

/** The light of a portal without `msm:light_emitter` (`MsmPortalBlock.DEFAULT_LIGHT`, the Nether portal's). */
export const PORTAL_DEFAULT_LIGHT = 11;

/** Hardness and resistance of a portal without `msm:breakable` (`MsmRegistrar.PORTAL_BREAKABLE`): unbreakable. */
export const PORTAL_BREAKABLE = { hardness: -1, resistance: 0 } as const;

/** `particles.count` when absent (`BlockType.PortalParticles.DEFAULT_COUNT`). */
export const PORTAL_PARTICLE_COUNT = 4;

/**
 * The 26.3 particle types that take options (every `ParticleTypes` field that is not a
 * `SimpleParticleType`, read with `javap` on the 26.3 jar on 2026-11-14; ids from the
 * registration strings). A portal cannot use one without `color` (the runtime's load error).
 */
export const OPTION_PARTICLES = [
  'minecraft:block',
  'minecraft:block_crumble',
  'minecraft:block_marker',
  'minecraft:dragon_breath',
  'minecraft:dust',
  'minecraft:dust_color_transition',
  'minecraft:dust_pillar',
  'minecraft:effect',
  'minecraft:entity_effect',
  'minecraft:falling_dust',
  'minecraft:flash',
  'minecraft:geyser',
  'minecraft:geyser_base',
  'minecraft:geyser_plume',
  'minecraft:geyser_poof',
  'minecraft:instant_effect',
  'minecraft:item',
  'minecraft:sculk_charge',
  'minecraft:shriek',
  'minecraft:tinted_leaves',
  'minecraft:trail',
  'minecraft:vibration',
] as const;

/** The only particle type a `color` applies to. */
const DUST = 'minecraft:dust';

const TRAVEL_KEYS = [
  'scale',
  'arrival',
  'delay_ticks',
  'cooldown_ticks',
  'players_only',
  'overlay',
];
const MIN_SCALE = 0.00001;
const MAX_SCALE = 30000000;

/** An id or a tag (`BlockType.IdOrTag`). */
export interface IdOrTag {
  /** The namespaced id, or the tag id without `#`. */
  readonly id: string;
  readonly tag: boolean;
}

/** A portal sound setting (`BlockType.PortalSound`): `off` for `false`; no `sound` means the default. */
export interface PortalSound {
  readonly off: boolean;
  readonly sound: string | undefined;
}

/** A portal's fields (`BlockType.Portal`) with the runtime's defaults applied. */
export interface PortalInfo {
  readonly frame: IdOrTag;
  readonly frameBlock: string | undefined;
  /** `undefined` for `igniter: false`. */
  readonly igniter: IdOrTag | undefined;
  readonly destination: string;
  readonly returnTo: string;
  readonly scale: number | undefined;
  readonly arrival: 'portal' | 'surface';
  readonly delayTicks: number | undefined;
  readonly cooldownTicks: number | undefined;
  readonly playersOnly: boolean;
  readonly overlay: boolean;
  readonly ambient: PortalSound;
  readonly travelSound: PortalSound;
  readonly particleType: string | undefined;
  readonly particleColor: number | undefined;
  readonly particleCount: number;
  /** The `on_travel` event id. */
  readonly onTravel: string | undefined;
  /** Whether the definition has a `loot_table` (else the portal drops nothing: `noLootTable`). */
  readonly lootTable: boolean;
}

/** Whether a block definition is a portal. */
export function isPortal(input: DefinitionInput): boolean {
  return input.definition.type === 'portal';
}

/** An id as the runtime's `MsmCodecs.ID` (`Identifier.tryParse`; no namespace means `minecraft`). */
const ID = /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;

function id(reader: Reader, key: string, value: string): string {
  if (!ID.test(value)) reader.fail(`${key} '${value}' is not an id`);
  return value.includes(':') ? value : `minecraft:${value}`;
}

/** An id or a `#tag` (`MsmCodecs.ID_OR_TAG`). */
function idOrTag(reader: Reader, key: string, value: string): IdOrTag {
  return value.startsWith('#')
    ? { id: id(reader, key, value.slice(1)), tag: true }
    : { id: id(reader, key, value), tag: false };
}

function ticks(reader: Reader, key: string): number | undefined {
  if (!reader.has(key)) return undefined;
  const value = reader.integer(key, 0);
  if (value < 0 || value > 32767) reader.fail(`${key} must be 0 to 32767`);
  return value;
}

/** A sound event id or `false` (`BlockType.PortalSound`); `true` is an error. */
function sound(reader: Reader | undefined, key: string): PortalSound {
  if (reader === undefined || !reader.has(key)) return { off: false, sound: undefined };
  const raw = reader.value[key];
  if (raw === false) return { off: true, sound: undefined };
  if (typeof raw !== 'string') return reader.fail(`${key} must be a sound event id or false`);
  return { off: false, sound: id(reader, key, raw) };
}

/**
 * Reads a portal's fields with the runtime's Codec rules (`BlockType.Portal.CODEC`, nested
 * objects closed) and the stricter generation rules of this module.
 *
 * @param reader - The definition's top level.
 * @param components - Its `components`, if any.
 */
export function readPortal(reader: Reader, components: Reader | undefined): PortalInfo {
  for (const key of components?.keys() ?? []) {
    if (!(PORTAL_COMPONENTS as readonly string[]).includes(key)) {
      components?.fail(
        `${key} is not allowed on type 'portal' (only ${PORTAL_COMPONENTS.join(', ')})`,
      );
    }
  }
  const frame = idOrTag(reader, 'frame', reader.requiredString('frame'));
  const frameBlockSetting = reader.optionalString('frame_block');
  const frameBlock =
    frameBlockSetting !== undefined
      ? id(reader, 'frame_block', frameBlockSetting)
      : frame.tag
        ? undefined
        : frame.id;
  if (frameBlock === undefined) {
    reader.fail(
      `frame_block is needed when frame is a tag (#${frame.id}): exit portals are built of it`,
    );
  }
  let igniter: IdOrTag | undefined = { id: 'minecraft:flint_and_steel', tag: false };
  if (reader.has('igniter')) {
    const raw = reader.value.igniter;
    if (raw === false) igniter = undefined;
    else if (typeof raw === 'string') igniter = idOrTag(reader, 'igniter', raw);
    else reader.fail('igniter must be an item id, an item #tag or false');
  }
  const travel = reader.object('travel');
  travel?.onlyKeys(TRAVEL_KEYS, 'travel field');
  let scale: number | undefined;
  if (travel?.has('scale') === true) {
    scale = travel.number('scale', 1);
    if (!Number.isFinite(scale) || scale < MIN_SCALE || scale > MAX_SCALE) {
      travel.fail(`scale must be ${MIN_SCALE} to ${MAX_SCALE}`);
    }
  }
  const arrival = travel?.string('arrival', 'portal') ?? 'portal';
  if (arrival !== 'portal' && arrival !== 'surface') {
    travel?.fail(`arrival '${arrival}' is not one of portal, surface`);
  }
  const sounds = reader.object('sounds');
  sounds?.onlyKeys(['ambient', 'travel'], 'sounds field');
  const particles = reader.object('particles');
  particles?.onlyKeys(['type', 'color', 'count'], 'particles field');
  const rawType = particles?.optionalString('type');
  const particleType = rawType === undefined ? undefined : id(particles as Reader, 'type', rawType);
  let particleColor: number | undefined;
  if (particles?.has('color') === true) {
    particleColor = particles.integer('color', 0);
    if (particleColor < 0 || particleColor > 0xffffff)
      particles.fail('color must be 0 to 16777215');
  }
  const particleCount = particles?.integer('count', PORTAL_PARTICLE_COUNT) ?? PORTAL_PARTICLE_COUNT;
  if (particleCount < 0 || particleCount > 16) particles?.fail('count must be 0 to 16');
  if (particleType !== undefined && particleColor !== undefined && particleType !== DUST) {
    particles?.fail(`color applies only to ${DUST}, not ${particleType}`);
  }
  if (
    particleType !== undefined &&
    particleColor === undefined &&
    (OPTION_PARTICLES as readonly string[]).includes(particleType)
  ) {
    particles?.fail(
      `type ${particleType} is not a particle type without options${particleType === DUST ? ' (give dust a color)' : ''}`,
    );
  }
  const onTravel = reader.optionalString('on_travel');
  return {
    frame,
    frameBlock,
    igniter,
    destination: id(reader, 'destination', reader.requiredString('destination')),
    returnTo: id(reader, 'return_to', reader.string('return_to', 'minecraft:overworld')),
    scale,
    arrival: arrival as 'portal' | 'surface',
    delayTicks: travel === undefined ? undefined : ticks(travel, 'delay_ticks'),
    cooldownTicks: travel === undefined ? undefined : ticks(travel, 'cooldown_ticks'),
    playersOnly: travel?.boolean('players_only', false) ?? false,
    overlay: travel?.boolean('overlay', true) ?? true,
    ambient: sound(sounds, 'ambient'),
    travelSound: sound(sounds, 'travel'),
    particleType,
    particleColor,
    particleCount,
    onTravel: onTravel === undefined ? undefined : id(reader, 'on_travel', onTravel),
    lootTable: reader.has('loot_table'),
  };
}

/** A Java `double` literal. */
function javaDouble(value: number): string {
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}

function optional(file: JavaFile, value: string | undefined): string {
  const optionalType = file.use('java.util.Optional');
  return value === undefined ? `${optionalType}.empty()` : `${optionalType}.of(${value})`;
}

/**
 * The generated block class's `SPEC` field: the portal's fields with the defaults applied, as
 * the runtime's `BlockType.Portal` holds them.
 */
export function portalSpecField(
  file: JavaFile,
  portal: PortalInfo,
  portalPackage: string,
): string[] {
  const spec = file.use(`${portalPackage}.PortalSpec`);
  const ident = (value: string): string => identifierExpression(file, value);
  const ref = (value: IdOrTag): string => `new ${spec}.IdOrTag(${ident(value.id)}, ${value.tag})`;
  const sound = (value: PortalSound): string =>
    `new ${spec}.Sound(${value.off}, ${optional(file, value.sound === undefined ? undefined : ident(value.sound))})`;
  const maybeInt = (value: number | undefined): string =>
    optional(file, value === undefined ? undefined : javaInt(value));
  return [
    `/** The portal fields (ADR 0077 D1) with the defaults applied: frame, igniter, the two dimensions, travel and looks. */`,
    `private static final ${spec} SPEC = new ${spec}(${ref(portal.frame)}, // frame`,
    `        ${optional(file, portal.frameBlock === undefined ? undefined : ident(portal.frameBlock))}, // frame_block (the frame block unless written)`,
    `        ${optional(file, portal.igniter === undefined ? undefined : ref(portal.igniter))}, // igniter`,
    `        ${ident(portal.destination)}, ${ident(portal.returnTo)}, // destination, return_to`,
    `        new ${spec}.Travel(${optional(file, portal.scale === undefined ? undefined : javaDouble(portal.scale))}, ${spec}.Arrival.${portal.arrival.toUpperCase()}, ${maybeInt(portal.delayTicks)}, ${maybeInt(portal.cooldownTicks)},`,
    `                ${portal.playersOnly}, ${portal.overlay}), // scale, arrival, delay_ticks, cooldown_ticks, players_only, overlay`,
    `        new ${spec}.Sounds(${sound(portal.ambient)}, ${sound(portal.travelSound)}), // ambient, travel`,
    `        new ${spec}.Particles(${optional(file, portal.particleType === undefined ? undefined : ident(portal.particleType))}, ${maybeInt(portal.particleColor)}, ${javaInt(portal.particleCount)}), // type, color, count`,
    `        ${optional(file, portal.onTravel === undefined ? undefined : ident(portal.onTravel))}); // on_travel`,
  ];
}

/**
 * The generated block class's `onTravel` override: the `on_travel` event with the arrived entity
 * as the actor, as the runtime's `EventContext.forBlockActor` at the arrived entity's block.
 *
 * @param method - The event method.
 */
export function portalTravelMembers(file: JavaFile, eventId: string, method: string): string[] {
  const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
  const entity = file.use('net.minecraft.world.entity.Entity');
  const player = file.use('net.minecraft.world.entity.player.Player');
  const blockPos = file.use('net.minecraft.core.BlockPos');
  const vec3 = file.use('net.minecraft.world.phys.Vec3');
  return [
    '',
    `/** on_travel: {@code ${eventId}} after arrival; the arrived entity is the actor (the player when it is one). */`,
    '@Override',
    `protected void onTravel(${serverLevel} level, ${entity} arrived) {`,
    `    ${blockPos} pos = arrived.blockPosition();`,
    `    ${player} player = arrived instanceof ${player} p ? p : null;`,
    `    ${method}(level, pos, ${vec3}.atCenterOf(pos), player, player == null ? arrived : null, 1);`,
    '}',
  ];
}

/** The `ModBlocks.register()` line that hands a portal block to the igniter callback. */
export function portalRegisterLine(
  file: JavaFile,
  context: GenerationContext,
  field: string,
): string {
  const lighting = file.use(`${packageOf(context, 'portal')}.PortalLighting`);
  return `${lighting}.add(${field}); // portal: tried by the igniter callback in sorted id order (ADR 0077 D3)`;
}

/** Writes the shared classes of `<package>/portal/`. */
export function writePortalFiles(context: GenerationContext): void {
  const portalPackage = packageOf(context, 'portal');
  const { modId } = context.input;
  const add = (name: string, contents: string): void => {
    context.files.push({ path: classPath(context, 'portal', name), contents });
  };
  add('PortalSpec', portalSpecJava(portalPackage));
  add('PortalBlock', portalBlockJava(portalPackage));
  add('PortalFrame', portalFrameJava(portalPackage));
  add('ExitPortals', exitPortalsJava(portalPackage));
  add('PortalIndex', portalIndexJava(portalPackage));
  add('PortalIndexAttachment', portalIndexAttachmentJava(portalPackage, modId));
  add('PortalLighting', portalLightingJava(portalPackage));
  add('PortalTravel', portalTravelJava(portalPackage, modId));
}

/**
 * The mod initialiser's portal lines, after every registration (as `MsmRuntime.onInitialize`):
 * the level attachment, the igniter callback and, after start-up, one warning per portal and
 * missing level (`MsmRegistrar.checkAfterStart`).
 */
export function portalInitLines(file: JavaFile, context: GenerationContext): string[] {
  const portalPackage = packageOf(context, 'portal');
  const attachment = file.use(`${portalPackage}.PortalIndexAttachment`);
  const lighting = file.use(`${portalPackage}.PortalLighting`);
  const travel = file.use(`${portalPackage}.PortalTravel`);
  const lifecycle = file.use('net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents');
  const loggerFactory = file.use('org.slf4j.LoggerFactory');
  return [
    `// Portals (ADR 0077): the level attachment ${context.input.modId}:portals (links), the igniter callback, and`,
    '// after start-up one warning per portal and dimension that is not a level of the world.',
    `${attachment}.register();`,
    `${lighting}.register();`,
    `${lifecycle}.SERVER_STARTED.register(server -> ${travel}.checkLevels(server)`,
    `        .forEach(warning -> ${loggerFactory}.getLogger(MOD_ID).warn("[{}] {}", MOD_ID, warning)));`,
  ];
}

/** The definitions whose events may hold actions. */
function eventOwners(input: JavaProjectInput): DefinitionInput[] {
  return [...input.blocks, ...input.items, ...input.entities, ...(input.effects ?? [])];
}

/**
 * Fails when a `light_portal` action names no portal block of the project (the runtime's load
 * error, after which the action does nothing; ADR 0077 D3 (b)). Only project portals are
 * `PortalBlock`s in an ejected mod.
 */
export function checkLightPortals(input: JavaProjectInput): void {
  const portals = new Set(input.blocks.filter(isPortal).map((block) => block.id));
  for (const owner of eventOwners(input)) {
    const events = readDefinition(owner).object('events');
    for (const event of events?.keys() ?? []) {
      const body = events?.object(event);
      for (const action of body?.has('actions') === true ? body.objects('actions') : []) {
        if (action.optionalString('type') !== 'light_portal') continue;
        const raw = action.requiredString('portal');
        const portal = id(action, 'portal', raw);
        if (!portals.has(portal)) {
          action.fail(`light_portal names ${portal}, which is not a portal block of the project`);
        }
      }
    }
  }
}
