/**
 * Reads Minecraft's own sounds from the user's own folder, on demand (ADR 0121 D2; B620
 * interface, B621 builds it through the `msm:v1:minecraft:assetObject` channel). Never cached,
 * copied or exported.
 */

import type { Json } from '@msm/plugin-api';

/** Reads vanilla's `sounds.json` and sound files, or answers that the folder is not set up. */
export interface VanillaSoundReader {
  /** Whether the asset store can be read. */
  available(): Promise<boolean>;
  /** Vanilla's `sounds.json`, or `null`. */
  soundsJson(): Promise<Json | null>;
  /** The bytes of an index key such as `minecraft/sounds/mob/wolf/bark1.ogg`, or `null`. */
  file(key: string): Promise<Uint8Array | null>;
}
