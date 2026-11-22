/**
 * Own block sounds, own set types and the tool pairs (ADR 0105 D1 to D3; ADR 0112 D3) in the 26.3
 * generator, as the runtime's 26.3 `OwnSounds` and `BlockSetTypes` and `BlockExtras` do (B514 and
 * the set type follow-up):
 *
 * - `block_sounds`: the block's `SoundType` is built from its events (each one not given, and the
 *   volume and pitch, from `sound_type`); an event that is not a registered sound event (vanilla's
 *   or the mod's `ModSounds`) logs a warning and the sound type's is used (`ModBlocks.ownSounds`);
 * - `set_type` as an object, or a vanilla `set_type` on a block with `block_sounds`: an own
 *   `BlockSetType`, named by the block's id and never registered, with every setting not given
 *   taken from its `base` (`ModBlocks.ownSetType`);
 * - `msm:flattenable` and `msm:tillable`: the shovel and hoe halves of the generated
 *   `BlockStripping` callback.
 *
 * On 26.4 sounds are `block_sound_set` data and that target has no Java generator. Minecraft 26.3,
 * Mojang names.
 *
 * @packageDocumentation
 */

import type { JavaFile } from './java';
import { identifierExpression, javaFloat, javaString } from './java';
import type { Reader } from './read';

/** The events of `block_sounds` in `SoundType`'s constructor order. */
const SOUND_EVENTS = ['break', 'step', 'place', 'hit', 'fall'] as const;

/** A parsed `block_sounds`. */
export interface BlockSoundsSpec {
  readonly volume: number | undefined;
  readonly pitch: number | undefined;
  /** Each event's sound id, or `undefined` for the sound type's. */
  readonly events: Readonly<Record<(typeof SOUND_EVENTS)[number], string | undefined>>;
}

const ID = /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;

function fullId(reader: Reader, key: string, value: string): string {
  if (!ID.test(value)) reader.fail(`${key} '${value}' is not an id`);
  return value.includes(':') ? value : `minecraft:${value}`;
}

function optionalId(reader: Reader, key: string): string | undefined {
  const value = reader.optionalString(key);
  return value === undefined ? undefined : fullId(reader, key, value);
}

/** Reads `block_sounds` with the format's ranges (volume 0 to 10, pitch 0.25 to 4). */
export function readBlockSounds(reader: Reader): BlockSoundsSpec | undefined {
  const sounds = reader.object('block_sounds');
  if (sounds === undefined) return undefined;
  sounds.onlyKeys([...SOUND_EVENTS, 'volume', 'pitch'], 'block_sounds field');
  const volume = sounds.has('volume') ? sounds.number('volume', 1) : undefined;
  const pitch = sounds.has('pitch') ? sounds.number('pitch', 1) : undefined;
  if (volume !== undefined && (volume < 0 || volume > 10)) sounds.fail('volume must be 0 to 10');
  if (pitch !== undefined && (pitch < 0.25 || pitch > 4)) sounds.fail('pitch must be 0.25 to 4');
  return {
    volume,
    pitch,
    events: {
      break: optionalId(sounds, 'break'),
      step: optionalId(sounds, 'step'),
      place: optionalId(sounds, 'place'),
      hit: optionalId(sounds, 'hit'),
      fall: optionalId(sounds, 'fall'),
    },
  };
}

/** A parsed own set type (`::msm::definition::OwnSetType`); `undefined` settings are the base's. */
export interface OwnSetSpec {
  /** The base's MSM name (`wood`, `iron`, ...). */
  readonly baseName: string;
  readonly open: string | undefined;
  readonly close: string | undefined;
  readonly press: string | undefined;
  readonly release: string | undefined;
  readonly canOpenByHand: boolean | undefined;
  readonly canOpenByWindCharge: boolean | undefined;
  readonly arrowsPress: boolean | undefined;
  /** `MOBS` or `EVERYTHING`. */
  readonly plateSensitivity: string | undefined;
}

/** Reads an own set type object; `names` are the vanilla set type names. */
export function readOwnSetType(reader: Reader, names: readonly string[]): OwnSetSpec {
  reader.onlyKeys(
    [
      'base',
      'sounds',
      'can_open_by_hand',
      'can_open_by_wind_charge',
      'arrows_press',
      'plate_sensitivity',
    ],
    'set_type field',
  );
  const base = reader.string('base', 'wood');
  if (!names.includes(base)) reader.fail(`base '${base}' is not one of ${names.join(', ')}`);
  const sounds = reader.object('sounds');
  sounds?.onlyKeys(['open', 'close', 'press', 'release'], 'set_type sounds field');
  const flag = (key: string): boolean | undefined =>
    reader.has(key) ? reader.boolean(key, false) : undefined;
  const plate = reader.optionalString('plate_sensitivity');
  if (plate !== undefined && plate !== 'mobs' && plate !== 'everything') {
    reader.fail(`plate_sensitivity '${plate}' is not mobs or everything`);
  }
  return {
    baseName: base,
    open: sounds === undefined ? undefined : optionalId(sounds, 'open'),
    close: sounds === undefined ? undefined : optionalId(sounds, 'close'),
    press: sounds === undefined ? undefined : optionalId(sounds, 'press'),
    release: sounds === undefined ? undefined : optionalId(sounds, 'release'),
    canOpenByHand: flag('can_open_by_hand'),
    canOpenByWindCharge: flag('can_open_by_wind_charge'),
    arrowsPress: flag('arrows_press'),
    plateSensitivity: plate?.toUpperCase(),
  };
}

const nullable = (file: JavaFile, id: string | undefined): string =>
  id === undefined ? 'null' : identifierExpression(file, id);

/**
 * `ModBlocks.ownSounds(...)` of a block with `block_sounds`.
 *
 * @param soundType - The `SoundType` constant of the block's `sound_type`.
 */
export function ownSoundsExpression(
  file: JavaFile,
  modBlocks: string,
  blockId: string,
  soundType: string,
  spec: BlockSoundsSpec,
): string {
  const type = file.use('net.minecraft.world.level.block.SoundType');
  const number = (value: number | undefined): string =>
    value === undefined ? 'Float.NaN' : javaFloat(value);
  return `${modBlocks}.ownSounds(${identifierExpression(file, blockId)}, ${type}.${soundType}, ${number(spec.volume)}, ${number(spec.pitch)}, ${SOUND_EVENTS.map((event) => nullable(file, spec.events[event])).join(', ')})`;
}

/**
 * `ModBlocks.ownSetType(...)`: the own set type of a door, trapdoor, button or plate.
 *
 * @param base - The vanilla `BlockSetType` constant of the base.
 * @param sounds - The block's own sounds expression, or `undefined` for the base's.
 */
export function ownSetTypeExpression(
  file: JavaFile,
  modBlocks: string,
  blockId: string,
  base: string,
  own: OwnSetSpec | undefined,
  sounds: string | undefined,
): string {
  const setType = file.use('net.minecraft.world.level.block.state.properties.BlockSetType');
  const v = `${setType}.${base}`;
  const byHand =
    own?.canOpenByHand === undefined ? `${v}.canOpenByHand()` : String(own.canOpenByHand);
  // can_open_by_wind_charge defaults to can_open_by_hand for an own set type (the format), else vanilla's.
  const byWind =
    own === undefined
      ? `${v}.canOpenByWindCharge()`
      : own.canOpenByWindCharge === undefined
        ? byHand
        : String(own.canOpenByWindCharge);
  const arrows =
    own?.arrowsPress === undefined
      ? `${v}.canButtonBeActivatedByArrows()`
      : String(own.arrowsPress);
  const plate =
    own?.plateSensitivity === undefined
      ? `${v}.pressurePlateSensitivity()`
      : `${setType}.PressurePlateSensitivity.${own.plateSensitivity}`;
  return `${modBlocks}.ownSetType(${identifierExpression(file, blockId)}, ${v}, ${sounds ?? 'null'}, ${byHand}, ${byWind}, ${arrows}, ${plate}, ${nullable(file, own?.open)}, ${nullable(file, own?.close)}, ${nullable(file, own?.press)}, ${nullable(file, own?.release)})`;
}

/**
 * The `ModBlocks` helpers `ownSounds`, `ownSetType` and `soundEvent` (the runtime's 26.3 `OwnSounds.build`,
 * `OwnSounds.event` and `BlockSetTypes.of`), as lines at indentation level 0.
 */
export function ownSoundsHelpers(file: JavaFile, modId: string): string[] {
  const identifier = file.use('net.minecraft.resources.Identifier');
  const soundType = file.use('net.minecraft.world.level.block.SoundType');
  const soundEvent = file.use('net.minecraft.sounds.SoundEvent');
  const setType = file.use('net.minecraft.world.level.block.state.properties.BlockSetType');
  const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
  const optional = file.use('java.util.Optional');
  const logger = file.use('org.slf4j.LoggerFactory');
  return [
    '',
    '/**',
    " * A block's own sounds (block_sounds, ADR 0105 D1): each event not given (null), and the volume and pitch (NaN), are",
    " * {@code base}'s, the block's sound_type.",
    ' */',
    `public static ${soundType} ownSounds(${identifier} block, ${soundType} base, float volume, float pitch, ${identifier} breakSound,`,
    `        ${identifier} step, ${identifier} place, ${identifier} hit, ${identifier} fall) {`,
    `    return new ${soundType}(Float.isNaN(volume) ? base.getVolume() : volume, Float.isNaN(pitch) ? base.getPitch() : pitch,`,
    '            soundEvent(block, "block_sounds: break", breakSound, base.getBreakSound()),',
    '            soundEvent(block, "block_sounds: step", step, base.getStepSound()),',
    '            soundEvent(block, "block_sounds: place", place, base.getPlaceSound()),',
    '            soundEvent(block, "block_sounds: hit", hit, base.getHitSound()),',
    '            soundEvent(block, "block_sounds: fall", fall, base.getFallSound()));',
    '}',
    '',
    '/**',
    " * A set type of the block's own (ADR 0105 D2), named by its id and not registered: every setting not given is",
    " * {@code base}'s; {@code sounds} (null: base's) are the block sounds of a block with block_sounds.",
    ' */',
    `public static ${setType} ownSetType(${identifier} block, ${setType} base, ${soundType} sounds, boolean byHand, boolean byWind,`,
    `        boolean arrows, ${setType}.PressurePlateSensitivity plate, ${identifier} open, ${identifier} close, ${identifier} press,`,
    `        ${identifier} release) {`,
    `    ${soundEvent} o = soundEvent(block, "set_type: sounds: open", open, null);`,
    `    ${soundEvent} c = soundEvent(block, "set_type: sounds: close", close, null);`,
    `    ${soundEvent} p = soundEvent(block, "set_type: sounds: press", press, null);`,
    `    ${soundEvent} r = soundEvent(block, "set_type: sounds: release", release, null);`,
    `    return new ${setType}(block.toString(), byHand, byWind, arrows, plate, sounds != null ? sounds : base.soundType(),`,
    '            c != null ? c : base.doorClose(), o != null ? o : base.doorOpen(), c != null ? c : base.trapdoorClose(),',
    '            o != null ? o : base.trapdoorOpen(), r != null ? r : base.pressurePlateClickOff(),',
    '            p != null ? p : base.pressurePlateClickOn(), r != null ? r : base.buttonClickOff(), p != null ? p : base.buttonClickOn());',
    '}',
    '',
    '/** The registered sound event {@code sound}, else {@code fallback} (with a warning when {@code sound} was given). */',
    `private static ${soundEvent} soundEvent(${identifier} block, String field, ${identifier} sound, ${soundEvent} fallback) {`,
    '    if (sound == null) {',
    '        return fallback;',
    '    }',
    `    ${optional}<${soundEvent}> found = ${builtIn}.SOUND_EVENT.getOptional(sound);`,
    '    if (found.isEmpty()) {',
    `        ${logger}.getLogger(${javaString(modId)}).warn("block {}: {}: unknown sound event {}; {} is used", block, field, sound,`,
    '                fallback == null ? "the base set type\'s" : "the sound type\'s");',
    '    }',
    '    return found.orElse(fallback);',
    '}',
  ];
}

/** A parsed `msm:flattenable` or `msm:tillable`. */
export interface ToolPair {
  readonly into: string;
  /** `msm:tillable` `drops`. */
  readonly drops?: string;
}

/** Reads `msm:flattenable` (`{into}`). */
export function readFlattenable(component: Reader): ToolPair {
  component.onlyKeys(['into'], 'msm:flattenable field');
  return { into: fullId(component, 'into', component.requiredString('into')) };
}

/** Reads `msm:tillable` (`{into, drops?}`). */
export function readTillable(component: Reader): ToolPair {
  component.onlyKeys(['into', 'drops'], 'msm:tillable field');
  const drops = optionalId(component, 'drops');
  return {
    into: fullId(component, 'into', component.requiredString('into')),
    ...(drops === undefined ? {} : { drops }),
  };
}

/** The `ModBlocks.register` lines of a block's shovel and hoe pairs. */
export function toolPairLines(
  file: JavaFile,
  field: string,
  flatten: ToolPair | undefined,
  till: ToolPair | undefined,
): string[] {
  const out: string[] = [];
  if (flatten !== undefined) {
    out.push(
      `BlockStripping.flatten(${field}, ${identifierExpression(file, flatten.into)}); // msm:flattenable`,
    );
  }
  if (till !== undefined) {
    out.push(
      `BlockStripping.till(${field}, ${identifierExpression(file, till.into)}, ${nullable(file, till.drops)}); // msm:tillable`,
    );
  }
  return out;
}
