/**
 * Pure helpers of the Block Studio's Sounds section (B516, ADR 0105 D1, D2, ADR 0112 D1): a
 * block's own sounds (`block_sounds`: break, step, place, hit and fall, each a vanilla or project
 * sound event, plus volume and pitch) and the own set type of a door, trapdoor, button or pressure
 * plate (`set_type` as an object: its sounds and rules, every unset one its `base`'s). No React,
 * no session.
 *
 * The field names are the format's as frozen at B506 (`definition.mcdoc`).
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { isJsonObject } from '../../forms/pointer';
import type { BlockTypeName } from './block-type-model';
import { asObject } from './blocks-items-model';

type JsonObject = { [key: string]: Json };

/** The block's own sound events (`block_sounds`), in the order the section shows them. */
export const BLOCK_SOUND_EVENTS = Object.freeze(['break', 'step', 'place', 'hit', 'fall'] as const);
/** One of {@link BLOCK_SOUND_EVENTS}. */
export type BlockSoundEvent = (typeof BLOCK_SOUND_EVENTS)[number];

/** Each sound event in words (the plan's Very easy wording for the first three). */
export const BLOCK_SOUND_LABELS: Readonly<Record<BlockSoundEvent, string>> = Object.freeze({
  break: 'When it breaks',
  step: 'When you walk on it',
  place: 'When you place it',
  hit: 'While you mine it',
  fall: 'When something lands on it',
});

/** The `block_sounds` range limits (`volume` 0 to 10, `pitch` 0.25 to 4). */
export const BLOCK_SOUND_LIMITS = Object.freeze({
  volume: Object.freeze({ min: 0, max: 10 }),
  pitch: Object.freeze({ min: 0.25, max: 4 }),
});

/** The block's `block_sounds` object, or `{}`. */
export function blockSoundsOf(data: Json | undefined): JsonObject {
  return { ...asObject(asObject(data).block_sounds) };
}

/**
 * The `block_sounds` after setting one key (`undefined` or `''` clears it); `undefined` when
 * nothing is left, so the field goes and `sound_type` gives every sound again.
 */
export function withBlockSound(
  data: Json | undefined,
  key: BlockSoundEvent | 'volume' | 'pitch',
  value: Json | undefined,
): JsonObject | undefined {
  const out = blockSoundsOf(data);
  if (value === undefined || value === '') delete out[key];
  else out[key] = value;
  return Object.keys(out).length === 0 ? undefined : out;
}

/** The types with a set type (`set_type`, ADR 0067 D2). */
export const SET_TYPE_BLOCK_TYPES: readonly BlockTypeName[] = Object.freeze([
  'door',
  'trapdoor',
  'button',
  'pressure_plate',
]);

/** Whether `type` has a set type. */
export function takesSetType(type: BlockTypeName | undefined): boolean {
  return type !== undefined && SET_TYPE_BLOCK_TYPES.includes(type);
}

/** The own set type's sounds (`set_type.sounds`). */
export type SetTypeSound = 'open' | 'close' | 'press' | 'release';

/** The own set type sounds each type plays: doors open and close, buttons and plates press. */
export function setTypeSoundsOf(type: BlockTypeName): readonly SetTypeSound[] {
  return type === 'door' || type === 'trapdoor' ? ['open', 'close'] : ['press', 'release'];
}

/** Each own set type sound in words. */
export const SET_TYPE_SOUND_LABELS: Readonly<Record<SetTypeSound, string>> = Object.freeze({
  open: 'When it opens',
  close: 'When it closes',
  press: 'When it is pressed',
  release: 'When it is let go',
});

/** What the own set type part of the section is called for each type. */
export function ownSetTypeLabel(type: BlockTypeName): string {
  if (type === 'door') return 'Own door sounds';
  if (type === 'trapdoor') return 'Own trapdoor sounds';
  if (type === 'button') return 'Own button sounds';
  return 'Own plate sounds';
}

/** Whether `set_type` is an own set type (an object, ADR 0105 D2). */
export function isOwnSetType(setType: Json | undefined): setType is JsonObject {
  return isJsonObject(setType);
}

/** The vanilla set type a `set_type` stands on: the name, or an own set type's `base` (`wood`). */
export function setTypeBase(setType: Json | undefined): string | undefined {
  if (typeof setType === 'string') return setType;
  if (isOwnSetType(setType)) return typeof setType.base === 'string' ? setType.base : 'wood';
  return undefined;
}

/**
 * `set_type` after turning the own set type on or off: on, the vanilla name becomes the object's
 * `base`; off, the object goes back to its `base` name (its sounds and rules go).
 */
export function withOwnSetType(setType: Json | undefined, on: boolean): Json {
  const base = setTypeBase(setType) ?? 'wood';
  if (!on) return base;
  if (isOwnSetType(setType)) return { ...setType };
  return { base };
}

/** `set_type` with its vanilla set type (the name, or an own set type's `base`) changed. */
export function withSetTypeBase(setType: Json | undefined, base: string): Json {
  if (!isOwnSetType(setType)) return base;
  return { ...setType, base };
}

/** An own set type with one sound set (`''` or `undefined` clears it, and an empty `sounds`). */
export function withSetTypeSound(
  setType: Json | undefined,
  key: SetTypeSound,
  value: string | undefined,
): JsonObject {
  const out: JsonObject = { ...asObject(setType) };
  const sounds: JsonObject = { ...asObject(out.sounds) };
  if (value === undefined || value === '') delete sounds[key];
  else sounds[key] = value;
  if (Object.keys(sounds).length === 0) delete out.sounds;
  else out.sounds = sounds;
  return out;
}

/** The own set type's rules (ADR 0105 D2, as frozen at B506). */
export type SetTypeRule =
  | 'can_open_by_hand'
  | 'can_open_by_wind_charge'
  | 'arrows_press'
  | 'plate_sensitivity';

/** An own set type with one rule set (`undefined` clears it: the `base`'s then). */
export function withSetTypeRule(
  setType: Json | undefined,
  key: SetTypeRule,
  value: Json | undefined,
): JsonObject {
  const out: JsonObject = { ...asObject(setType) };
  if (value === undefined) delete out[key];
  else out[key] = value;
  return out;
}

/** The plate sensitivities in words. */
export const PLATE_SENSITIVITY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  everything: 'Anything presses it, items too (like wooden plates)',
  mobs: 'Only mobs and players press it (like stone plates)',
});
