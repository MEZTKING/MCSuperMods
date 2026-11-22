/** What every placement modifier, predicate and feature type reads while placing. */

import type { WorldgenContext } from 'deepslate/worldgen';
import type { Unsupported } from '../api';
import type { WorldFiles } from '../registries';
import type { BlockTags } from './blocks';
import type { FeatureLevel } from './level';
import type { Reach } from './placement';
import type { FeatureRandom } from './random';

/** Notes gathered while placing, one per kind, type and file. */
export class NoteSink {
  private readonly seen = new Set<string>();
  readonly list: Unsupported[] = [];

  add(note: Unsupported): void {
    const key = `${note.kind}|${note.type}|${note.where}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.list.push(note);
  }
}

export interface FeatureContext {
  readonly level: FeatureLevel;
  readonly files: WorldFiles;
  readonly tags: BlockTags;
  readonly worldgen: WorldgenContext;
  readonly notes: NoteSink;
  readonly random: FeatureRandom;
  /** The chunk being decorated. */
  readonly chunkX: number;
  readonly chunkZ: number;
  /** The placed feature a biome lists (the `biome` modifier asks whether a biome has it). */
  readonly topFeature: string;
  /** How far each configured feature reaches, kept for the whole window. */
  readonly reaches: Map<unknown, Reach>;
  /** Whether a biome lists a placed feature (its own steps and the biome additions). */
  biomeHas(biome: string, placed: string): boolean;
}
