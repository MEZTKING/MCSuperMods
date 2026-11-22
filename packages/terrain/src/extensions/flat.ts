/**
 * The flat generator (ADR 0119 D3, D6; plan brief B581): a flat world's `settings` (inline in the
 * dimension or the world preset) as layers stacked from the bottom of the world up, each `height`
 * blocks of `block`, air above the last, and the settings' `biome` everywhere. Layers past the top
 * of the world are cut. Stacked as Try it's flat ground stacks them. Checked against the worldgen
 * parity fixture's `flat` dimension (bedrock, stone, an air layer, dirt and grass).
 *
 * `features`, `lakes` and `structure_overrides` place nothing in the preview (features are B583's,
 * structures are only in the game); a flat world that asks for them says so in the notes.
 */

import type { Unsupported } from '../api';
import type { FlatGeneratorFn, FlatWorldShape } from '../world';

type Json = Readonly<Record<string, unknown>>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withNamespace(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`;
}

const PLAINS = 'minecraft:plains';
const AIR = 'minecraft:air';

/** A block of a layer as a state string (`minecraft:dirt`, or with properties in brackets). */
function blockName(value: unknown): string {
  if (typeof value === 'string') return withNamespace(value);
  if (isObject(value)) {
    const name = value.Name ?? value.id;
    if (typeof name !== 'string') return AIR;
    const props = value.Properties ?? value.properties;
    if (isObject(props)) {
      const entries = Object.entries(props)
        .filter(([, v]) => typeof v === 'string')
        .sort(([a], [b]) => a.localeCompare(b));
      if (entries.length > 0) {
        return `${withNamespace(name)}[${entries.map(([k, v]) => `${k}=${v}`).join(',')}]`;
      }
    }
    return withNamespace(name);
  }
  return AIR;
}

function rangeOf(dimensionType: unknown): { minY: number; height: number } {
  if (!isObject(dimensionType)) return { minY: -64, height: 384 };
  return {
    minY: typeof dimensionType.min_y === 'number' ? Math.floor(dimensionType.min_y) : -64,
    height: typeof dimensionType.height === 'number' ? Math.floor(dimensionType.height) : 384,
  };
}

/** The flat generator (`extensions/index.ts` `flatGenerator`). */
export const flat: FlatGeneratorFn = ({ generator, dimensionType }) => {
  const { minY, height } = rangeOf(dimensionType);
  const settings = isObject(generator.settings) ? generator.settings : {};
  const notes: Unsupported[] = [];
  const where = 'minecraft:flat';
  const layers: string[] = [];
  for (const layer of Array.isArray(settings.layers) ? settings.layers : []) {
    if (!isObject(layer)) continue;
    const count = typeof layer.height === 'number' ? Math.max(0, Math.floor(layer.height)) : 0;
    const name = blockName(layer.block);
    for (let i = 0; i < count && layers.length < height; i += 1) layers.push(name);
  }
  if (settings.features === true || settings.lakes === true) {
    notes.push({
      kind: 'feature',
      type: 'flat.features',
      where,
      drawnInstead: 'Nothing: trees, plants and lakes of a flat world are only in the game.',
    });
  }
  if (
    Array.isArray(settings.structure_overrides) ||
    typeof settings.structure_overrides === 'string'
  ) {
    notes.push({
      kind: 'field',
      type: 'flat.structure_overrides',
      where,
      drawnInstead: 'Nothing: buildings are only in the game.',
    });
  }
  // A flat world has no sea: the preview's sea level is the bottom of the world.
  const shape: FlatWorldShape = {
    minY,
    height,
    seaLevel: minY,
    biome: typeof settings.biome === 'string' ? withNamespace(settings.biome) : PLAINS,
    layers,
    notes,
  };
  return shape;
};
