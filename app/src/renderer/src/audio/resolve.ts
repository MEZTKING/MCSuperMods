/**
 * Resolves a sound event id to its entries through the project's `sounds.json`, then vanilla's
 * (ADR 0121 D1; B620 interface, B622 builds it). The project's merges over vanilla's per event,
 * and `replace` drops vanilla's entries; an `event` entry is followed once.
 */

import type { Json } from '@msm/plugin-api';

/** One entry of a sound event. */
export interface SoundEntry {
  name: string;
  type: 'file' | 'event';
  volume: number;
  pitch: number;
  weight: number;
  stream: boolean;
}

/** A resolved event. */
export interface ResolvedSound {
  event: string;
  origin: 'project' | 'vanilla' | 'missing';
  subtitle?: string;
  entries: SoundEntry[];
}

/** A picked file. */
export interface PickedSound {
  entry: SoundEntry;
  file: { namespace: string; path: string; origin: 'project' | 'vanilla' };
}

/** Resolves an event. Until B622 every event is `missing`. */
export function resolveSoundEvent(
  id: string,
  _projectSounds: Record<string, Json>,
  _vanillaSounds: Json | null,
): ResolvedSound {
  return { event: id, origin: 'missing', entries: [] };
}

/** Picks an entry by weight. Until B622 it picks nothing. */
export function pickEntry(_resolved: ResolvedSound, _random: () => number): PickedSound | null {
  return null;
}
