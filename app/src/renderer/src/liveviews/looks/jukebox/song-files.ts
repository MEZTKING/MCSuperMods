/**
 * What the song and horn views share (ADR 0121; B630): the sound a `minecraft:jukebox_song` or
 * `minecraft:instrument` names (an event id, or `{ sound_id, range }`), the length of each file
 * that event can play, read from the Ogg container itself (`oggInfo`: the Vorbis header's sample
 * rate and the last page's granule position, nothing decoded), and the words of a length.
 *
 * A file is the project's own first (`assets/<ns>/sounds/<path>.ogg`), else Minecraft's from the
 * user's folder through the vanilla sound reader; nothing is copied or kept.
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/plugin-api';
import { useEffect, useState } from 'react';
import { fileChances, resolveSoundEvent, splitSoundId } from '../../../audio/resolve';
import { projectSoundsOf } from '../../../audio/SoundPlayButton';
import { type VanillaSoundReader, vanillaSoundKey } from '../../../audio/vanilla-sounds';
import { oggInfo } from '../../../components/wizard/wizard-model';

type JsonObject = { [key: string]: Json };
const asObject = (value: Json | undefined): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;

/** The sound a song or a horn names. */
export interface NamedSound {
  /** The sound event id (`minecraft:music_disc.cat`, `demo:music_disc.ruby_waltz`). */
  readonly event: string;
  /** The fixed range in blocks the `{ sound_id, range }` form gives, else `null`. */
  readonly range: number | null;
}

/** The sound of a `sound_event` field: a string id or `{ sound_id, range? }`; `null` for none. */
export function namedSound(value: Json | undefined): NamedSound | null {
  if (typeof value === 'string') {
    return value.trim() === '' ? null : { event: value.trim(), range: null };
  }
  const object = asObject(value);
  if (object === undefined || typeof object.sound_id !== 'string') return null;
  const event = object.sound_id.trim();
  if (event === '') return null;
  return { event, range: typeof object.range === 'number' ? object.range : null };
}

/**
 * A length in plain words: `3 min 5 s` from a minute up, else `7.5 s` (no `3:05`, which reads as
 * an id to Very easy's check).
 */
export function lengthWords(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '?';
  if (seconds < 60) return `${Math.round(seconds * 10) / 10} s`;
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/** How a stated length compares with a file's. */
export type LengthVerdict = 'matches' | 'shorter' | 'longer';

/**
 * The stated length against the file's: within one second they match (the game counts whole
 * ticks and the Creator rounds a picked file up to a whole second); `shorter` when the data says
 * less than the file lasts, `longer` when it says more.
 */
export function lengthVerdict(stated: number, file: number): LengthVerdict {
  const difference = stated - file;
  if (Math.abs(difference) < 1) return 'matches';
  return difference < 0 ? 'shorter' : 'longer';
}

/** The plain line under a verdict. */
export function verdictWords(stated: number, file: number): string {
  const verdict = lengthVerdict(stated, file);
  const gap = lengthWords(Math.abs(stated - file));
  if (verdict === 'matches') return 'The length the data states matches the file.';
  if (verdict === 'shorter') {
    return `The data states ${gap} less than the file lasts: the game goes by the data, so the jukebox stops counting the song as playing before the music ends.`;
  }
  return `The data states ${gap} more than the file lasts: the game goes by the data, so the jukebox counts the song as playing after the music has ended.`;
}

/** One file an event can play, with its length once read. */
export interface FileLength {
  /** The file as `sounds.json` names it (`records/cat`, `demo:music/waltz`). */
  readonly name: string;
  readonly namespace: string;
  readonly path: string;
  /** The chance a press picks it (0 to 1). */
  readonly chance: number;
  /** Its length in seconds, `null` while unread or when it could not be read. */
  readonly seconds: number | null;
  /** Why there is no length: `reading`, `not_found` (no file), `not_ogg`, `needs_minecraft`. */
  readonly status: 'ready' | 'reading' | 'not_found' | 'not_ogg' | 'needs_minecraft';
}

/** What {@link useFileLengths} answers. */
export interface FileLengths {
  /** Where the event's entries come from (`missing`: no event of that name was found). */
  readonly origin: 'project' | 'vanilla' | 'missing' | 'reading';
  readonly files: readonly FileLength[];
}

/** Reads a project file by its path in the project (`assets/<ns>/sounds/<path>.ogg`). */
export type ReadProjectPath = (path: string) => Promise<Uint8Array | null>;

/** At most this many files of one event are read for their lengths. */
export const MAX_FILES_READ = 8;

/** The files of an event with their lengths, read once per event and project. */
export async function readFileLengths(
  event: string,
  project: Project,
  readProject: ReadProjectPath | null,
  sounds: VanillaSoundReader | null,
): Promise<FileLengths> {
  const { namespace } = splitSoundId(event);
  const vanillaJson =
    namespace === 'minecraft' && sounds !== null
      ? await sounds.soundsJson().catch(() => null)
      : null;
  const resolved = resolveSoundEvent(event, projectSoundsOf(project), vanillaJson);
  if (resolved.origin === 'missing') {
    // A Minecraft event whose list cannot be read yet: say so rather than "not found".
    if (namespace === 'minecraft' && vanillaJson === null) {
      return {
        origin: 'vanilla',
        files: [
          {
            name: event,
            namespace,
            path: '',
            chance: 1,
            seconds: null,
            status: 'needs_minecraft',
          },
        ],
      };
    }
    return { origin: 'missing', files: [] };
  }
  const chances = fileChances(resolved).slice(0, MAX_FILES_READ);
  const files = await Promise.all(
    chances.map(async ({ name, chance }): Promise<FileLength> => {
      const file = splitSoundId(name);
      const base = { name, namespace: file.namespace, path: file.path, chance };
      const assetPath = `assets/${file.namespace}/sounds/${file.path}.ogg`;
      let bytes: Uint8Array | null = null;
      if (readProject !== null) bytes = await readProject(assetPath).catch(() => null);
      if (bytes === null && file.namespace === 'minecraft') {
        const key = vanillaSoundKey(name);
        if (sounds === null || key === null) {
          return { ...base, seconds: null, status: 'needs_minecraft' };
        }
        bytes = await sounds.file(key).catch(() => null);
        if (bytes === null && !(await sounds.available().catch(() => false))) {
          return { ...base, seconds: null, status: 'needs_minecraft' };
        }
      }
      if (bytes === null) return { ...base, seconds: null, status: 'not_found' };
      const info = oggInfo(bytes);
      return info === null
        ? { ...base, seconds: null, status: 'not_ogg' }
        : { ...base, seconds: info.seconds, status: 'ready' };
    }),
  );
  return { origin: resolved.origin, files };
}

/**
 * The files of `event` with their lengths, read again when the event, the project's sound
 * definitions or its files change (the caller passes a settled event, so typing does not read
 * on every key).
 */
export function useFileLengths(
  event: string | null,
  project: Project,
  readProject: ReadProjectPath | null,
  sounds: VanillaSoundReader | null,
): FileLengths | null {
  const [answer, setAnswer] = useState<FileLengths | null>(null);
  useEffect(() => {
    if (event === null) {
      setAnswer(null);
      return;
    }
    let live = true;
    setAnswer({ origin: 'reading', files: [] });
    void readFileLengths(event, project, readProject, sounds).then((read) => {
      if (live) setAnswer(read);
    });
    return () => {
      live = false;
    };
  }, [event, project, readProject, sounds]);
  return answer;
}

/** A `readProject` over a sound reader by namespace and path (the shell's `readProjectAsset`). */
export function projectPathReader(
  read: ((namespace: string, path: string) => Promise<Uint8Array | null>) | null,
): ReadProjectPath | null {
  if (read === null) return null;
  return async (path) => {
    const match = /^assets\/([^/]+)\/(.+)$/.exec(path);
    if (match === null) return null;
    return await read(match[1] as string, match[2] as string).catch(() => null);
  };
}

/** A sound event or file in words, for Very easy (`music_disc.ruby_waltz` reads "Music disc ruby waltz"). */
export function soundWords(id: string): string {
  const words = splitSoundId(id)
    .path.split(/[._/]+/)
    .filter(Boolean)
    .join(' ');
  return words === '' ? 'A sound' : `${words[0]?.toUpperCase()}${words.slice(1)}`;
}
