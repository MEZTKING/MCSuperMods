/**
 * Reads Minecraft's own sounds from the user's own folder, on demand (ADR 0121 D2, D3; B620
 * interface, B621 reader) through `platform.minecraft.readAssetObject`, the
 * `msm:v1:minecraft:assetObject` channel over the launcher's asset store. Sound files are read
 * each time they are asked for and handed back: nothing here keeps their bytes, writes them
 * anywhere or puts them into a project, an export or the AI helper's context. Only the parsed
 * `sounds.json` is kept in memory, once it was read, so each press does not parse it again.
 *
 * Without the Minecraft folder set up every call answers `false` or `null`, and the next call
 * asks again, so a folder set up meanwhile is seen.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';
import type { AssetObjectAnswer } from '../../../shared/platform';

/** Reads vanilla's `sounds.json` and sound files, or answers that the folder is not set up. */
export interface VanillaSoundReader {
  /** Whether the asset store can be read. */
  available(): Promise<boolean>;
  /** Vanilla's `sounds.json`, or `null`. */
  soundsJson(): Promise<Json | null>;
  /** The bytes of an index key such as `minecraft/sounds/mob/wolf/bark1.ogg`, or `null`. */
  file(key: string): Promise<Uint8Array | null>;
}

/** Reads one object of a version's asset store: `platform.minecraft.readAssetObject`. */
export type ReadAssetObject = (mcVersion: string, key: string) => Promise<AssetObjectAnswer>;

/** The index key of vanilla's `sounds.json`. */
export const VANILLA_SOUNDS_JSON_KEY = 'minecraft/sounds.json';

/**
 * The index key of a sound file named the way `sounds.json` names it (`mob/wolf/bark1`, with
 * an optional `minecraft:` namespace): `minecraft/sounds/mob/wolf/bark1.ogg`. Returns `null` for
 * another namespace, which the asset store does not hold.
 */
export function vanillaSoundKey(name: string): string | null {
  const colon = name.indexOf(':');
  const namespace = colon === -1 ? 'minecraft' : name.slice(0, colon);
  const path = colon === -1 ? name : name.slice(colon + 1);
  if (namespace !== 'minecraft' || path === '') return null;
  return `minecraft/sounds/${path}.ogg`;
}

/** Options of {@link createVanillaSoundReader}. */
export interface VanillaSoundReaderOptions {
  /** The project's Minecraft version (the target's `mcVersion`). */
  readonly mcVersion: string;
  /** The read; without it (an older platform or a test double) nothing is ever available. */
  readonly readAssetObject?: ReadAssetObject | undefined;
}

/** A reader that is never set up: every call answers `false` or `null`. */
export const NO_VANILLA_SOUNDS: VanillaSoundReader = Object.freeze({
  available: async () => false,
  soundsJson: async () => null,
  file: async () => null,
});

/** Creates the reader of one version; see the module comment. */
export function createVanillaSoundReader(options: VanillaSoundReaderOptions): VanillaSoundReader {
  const read = options.readAssetObject;
  if (read === undefined) return NO_VANILLA_SOUNDS;
  const { mcVersion } = options;
  let soundsJson: Promise<Json | null> | null = null;

  const readSoundsJson = async (): Promise<Json | null> => {
    let answer: AssetObjectAnswer;
    try {
      answer = await read(mcVersion, VANILLA_SOUNDS_JSON_KEY);
    } catch {
      return null;
    }
    if (!answer.ok) return null;
    try {
      const parsed = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(answer.bytes),
      ) as unknown;
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Json)
        : null;
    } catch {
      return null;
    }
  };

  const reader: VanillaSoundReader = {
    async available() {
      return (await reader.soundsJson()) !== null;
    },
    soundsJson() {
      if (soundsJson === null) {
        const pending = readSoundsJson();
        soundsJson = pending;
        // Not set up (or unreadable): ask again next time.
        void pending.then((json) => {
          if (json === null && soundsJson === pending) soundsJson = null;
        });
      }
      return soundsJson;
    },
    async file(key) {
      try {
        const answer = await read(mcVersion, key);
        return answer.ok ? answer.bytes : null;
      } catch {
        return null;
      }
    },
  };
  return reader;
}
