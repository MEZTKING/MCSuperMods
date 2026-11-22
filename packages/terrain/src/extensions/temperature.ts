/**
 * The surface condition `temperature` (ADR 0119 D3; plan brief B581): true where the block's
 * biome is cold enough for snow, its `temperature` field below 0.15 (the temperature below which
 * snow falls, as the biome format describes it). The type has no fields; no vanilla file uses it
 * (B574 WS1).
 *
 * Learned by observation on the worldgen parity fixture's `condition_temperature` dimension
 * (B581; biomes at -0.5, 0.2, 0.3 and 0.8 on land from y 37 to 92): snow lies in every column of
 * the -0.5 biome and in none of the others, except within a few blocks of a biome border, where
 * the game reads the biome of a nearby cell (as for every biome condition; see the notes of
 * `rules.ts`). The fixture allows any threshold above -0.5 and at most 0.2.
 *
 * Not learned, and approximate: biomes get colder high up in the game, but the fixture's land
 * stays below where that shows, so the preview reads the biome's own temperature at every height;
 * a `temperature_modifier` of `frozen` is not read either.
 */

import { MaterialCondition, type MaterialRuleContext } from 'deepslate/worldgen';
import type { ConditionType, RuleParser } from '../rules';

/** Below this a biome is cold enough for snow. */
export const SNOW_TEMPERATURE = 0.15;

/** `temperature`. */
export class ColdEnoughToSnow extends MaterialCondition {
  private readonly temperatures = new Map<string, number>();
  private readonly front: RuleParser;

  constructor(front: RuleParser) {
    super();
    this.front = front;
  }

  /** A biome's `temperature` (0.5 when its file or the field is missing). */
  temperatureOf(id: string): number {
    let t = this.temperatures.get(id);
    if (t === undefined) {
      const file = this.front.biome?.(id) as { temperature?: unknown } | undefined;
      t = typeof file?.temperature === 'number' ? file.temperature : 0.5;
      this.temperatures.set(id, t);
    }
    return t;
  }

  compile(context: MaterialRuleContext): () => boolean {
    let lastUpdate = Number.NaN;
    let result = false;
    return () => {
      if (context.lastUpdateY !== lastUpdate) {
        lastUpdate = context.lastUpdateY;
        result = this.temperatureOf(context.getBiome().toString()) < SNOW_TEMPERATURE;
      }
      return result;
    };
  }
}

export const temperature: ConditionType = {
  type: 'temperature',
  approximate:
    "About right: a biome's own temperature decides it at every height; the game's cooling high up is not drawn.",
  parse: (_json, front) => new ColdEnoughToSnow(front),
};
