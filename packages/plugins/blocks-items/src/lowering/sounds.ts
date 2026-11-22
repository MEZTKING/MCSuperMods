/**
 * A block's own sounds (ADR 0105 D1 and its amendment after B503): `block_sounds` names a sound
 * event for each of `break`, `step`, `place`, `hit` and `fall`, with an optional `volume` and
 * `pitch`; `sound_type` gives the rest.
 *
 * How the game takes them depends on the target ({@link BlockFacts.soundModel}):
 *
 * - `sound_type`: the runtime builds the block's sound object from the definition's
 *   `block_sounds`; lowering writes nothing more.
 * - `block_sound_set`: a block names an entry of the synchronised world registry
 *   `block_sound_set`, so lowering writes the entry `data/<ns>/block_sound_set/<path>.json`
 *   under the block's own id (layer `datapack`), which the runtime names. The registry is read
 *   when a world loads, so a change shows only after the world is opened again.
 *
 * Each sound in the entry is written as `{ "sound_id": <id> }`, the form that names a sound by
 * its `sounds.json` key and needs no registered sound event. A project key is a sound event only
 * once the Fabric runtime has registered it (ADR 0057 D1), so this form keeps the entry loadable
 * in a vanilla data pack too, and the sound plays from the project's own `sounds.json` entry (the
 * validators warn when a sound is in neither vanilla's nor the project's `sounds.json`). Vanilla's
 * entry format takes a pitch of at most 2 and a volume above 0, where the MSM format allows a
 * pitch up to 4 and a volume of 0: such values are written at the nearest the entry takes (the
 * validators warn).
 *
 * The entry holds only the events the element gives: the game has no way to fill the others in
 * from the `sound_type`'s own entry, so they are silent on such a target (the validators warn).
 *
 * @see {@link BlockFacts.soundModel}
 */
import type { BlockFacts, Json, JsonObject, OutputFile, Target } from '@msm/plugin-api';
import { isRecord } from './paths';
import { nonEmptyString } from './shared';

/** The block field of a block's own sounds (ADR 0105 D1, as frozen by B506). */
export const BLOCK_SOUNDS_FIELD = 'block_sounds';
/** The events of `block_sounds`, in the order the format lists them. */
export const BLOCK_SOUND_EVENTS = Object.freeze(['break', 'step', 'place', 'hit', 'fall'] as const);
export type BlockSoundEvent = (typeof BLOCK_SOUND_EVENTS)[number];
/** The data folder of a sound set entry on a `block_sound_set` target. */
export const BLOCK_SOUND_SET_FOLDER = 'block_sound_set';
/** The output schema of a sound set entry (the vanilla resource `block_sound_set`). */
export const BLOCK_SOUND_SET_SCHEMA = 'resource:block_sound_set';
/** The largest pitch a `block_sound_set` entry takes. */
export const SOUND_SET_MAX_PITCH = 2;
/** The smallest volume a `block_sound_set` entry takes. */
export const SOUND_SET_MIN_VOLUME = 0.00001;

/**
 * The format's own `sound_type` names (the mcdoc enum `SoundType`, ADR 0025 D5): the runtime maps
 * each onto the target's own sound type or sound set (`amethyst` is `amethyst_block` where sounds
 * are data), so the validators check a target's {@link BlockFacts.soundTypes} only for names
 * outside this list.
 */
export const FORMAT_SOUND_TYPES: readonly string[] = Object.freeze([
  'stone',
  'wood',
  'gravel',
  'grass',
  'metal',
  'glass',
  'wool',
  'sand',
  'snow',
  'ladder',
  'anvil',
  'slime_block',
  'honey_block',
  'coral_block',
  'bamboo',
  'bamboo_wood',
  'cherry_wood',
  'nether_wood',
  'netherrack',
  'nether_bricks',
  'nether_ore',
  'basalt',
  'bone_block',
  'soul_sand',
  'soul_soil',
  'amethyst',
  'amethyst_cluster',
  'calcite',
  'tuff',
  'deepslate',
  'deepslate_bricks',
  'deepslate_tiles',
  'polished_deepslate',
  'copper',
  'mud',
  'mud_bricks',
  'packed_mud',
  'moss',
  'lantern',
  'sculk',
]);

/** A block's own sounds as read from its data: the events given, and the volume and pitch. */
export interface BlockSounds {
  events: Partial<Record<BlockSoundEvent, string>>;
  volume: number | undefined;
  pitch: number | undefined;
}

const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/** The `block_sounds` of block data, when it is an object; event ids are namespaced. */
export function blockSoundsOf(data: Json | undefined): BlockSounds | undefined {
  const sounds = isRecord(data) ? data[BLOCK_SOUNDS_FIELD] : undefined;
  if (!isRecord(sounds)) return undefined;
  const events: Partial<Record<BlockSoundEvent, string>> = {};
  for (const event of BLOCK_SOUND_EVENTS) {
    const id = nonEmptyString(sounds[event]);
    if (id !== undefined) events[event] = namespaced(id);
  }
  return {
    events,
    volume: typeof sounds.volume === 'number' ? sounds.volume : undefined,
    pitch: typeof sounds.pitch === 'number' ? sounds.pitch : undefined,
  };
}

/** Whether the target gives a block its sounds through `block_sound_set` entries. */
export const usesSoundSets = (blocks: BlockFacts | undefined): boolean =>
  blocks?.soundModel === 'block_sound_set';

/** The events of `sounds` the element leaves to `sound_type`. */
export const missingSoundEvents = (sounds: BlockSounds): BlockSoundEvent[] =>
  BLOCK_SOUND_EVENTS.filter((event) => sounds.events[event] === undefined);

/** `volume` as a `block_sound_set` entry takes it. */
export const soundSetVolume = (volume: number): number => Math.max(volume, SOUND_SET_MIN_VOLUME);
/** `pitch` as a `block_sound_set` entry takes it. */
export const soundSetPitch = (pitch: number): number => Math.min(pitch, SOUND_SET_MAX_PITCH);

/**
 * The `block_sound_set` entry of a block's own sounds: `<event>_sound` as `{ sound_id }` for each
 * event given, and `volume` and `pitch` when given (within the entry's ranges); keys sorted.
 */
export function blockSoundSetEntry(sounds: BlockSounds): JsonObject {
  const entry: JsonObject = {};
  for (const event of BLOCK_SOUND_EVENTS) {
    const id = sounds.events[event];
    if (id !== undefined) entry[`${event}_sound`] = { sound_id: id };
  }
  if (sounds.pitch !== undefined) entry.pitch = soundSetPitch(sounds.pitch);
  if (sounds.volume !== undefined) entry.volume = soundSetVolume(sounds.volume);
  return Object.fromEntries(Object.entries(entry).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** The path of the `block_sound_set` entry of the block `<namespace>:<path>`. */
export const blockSoundSetPath = (namespace: string, path: string): string =>
  `data/${namespace}/${BLOCK_SOUND_SET_FOLDER}/${path}.json`;

/**
 * The block's `block_sound_set` entry on a `block_sound_set` target, when the block has
 * `block_sounds`; nothing on a `sound_type` target, whose runtime builds the sounds.
 *
 * @param target - The target supplying {@link BlockFacts.soundModel}.
 * @param namespace - The block id's namespace.
 * @param path - The block id's path.
 * @param data - The block data.
 */
export function blockSoundFiles(
  target: Target,
  namespace: string,
  path: string,
  data: Json | undefined,
): OutputFile[] {
  if (!usesSoundSets(target.blocks)) return [];
  const sounds = blockSoundsOf(data);
  if (sounds === undefined) return [];
  return [
    {
      path: blockSoundSetPath(namespace, path),
      contents: blockSoundSetEntry(sounds),
      layer: 'datapack',
      schema: BLOCK_SOUND_SET_SCHEMA,
    },
  ];
}
