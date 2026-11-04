/**
 * Dimension and world preset templates. A custom biome reaches a world through a dimension or a
 * world preset (ADR 0022 D5); a world preset becomes selectable under World Type once the
 * `minecraft:normal` world preset tag lists it.
 */
import type { ElementTemplate, Json } from '@msm/plugin-api';
import { VANILLA_END, VANILLA_NETHER, VANILLA_OVERWORLD } from '../kinds/defaults';
import { DIMENSIONS, fixed, ownId } from './shared';

/** A climate point: one value per parameter, `offset` 0. */
function point(
  temperature: number,
  humidity: number,
  continentalness: number,
  erosion: number,
  weirdness: number,
): Json {
  return { temperature, humidity, continentalness, erosion, weirdness, depth: 0, offset: 0 };
}

/**
 * Vanilla biomes that cover the overworld climate space around the new biome: the nearest
 * entry wins, so any finite list covers the whole space.
 */
const SURROUNDINGS: readonly [string, Json][] = [
  ['minecraft:ocean', point(0, 0, -0.6, 0, 0)],
  ['minecraft:plains', point(0, -0.3, 0.3, 0.3, 0)],
  ['minecraft:forest', point(0, 0.3, 0.3, 0.3, 0)],
  ['minecraft:desert', point(0.8, -0.6, 0.3, 0.3, 0)],
  ['minecraft:snowy_plains', point(-0.8, 0, 0.3, 0.3, 0)],
  ['minecraft:jungle', point(0.6, 0.6, 0.3, 0.3, 0)],
  ['minecraft:windswept_hills', point(-0.3, 0, 0.6, -0.6, 0.6)],
];

export const dimensionTemplates: readonly ElementTemplate[] = [
  ownId(
    {
      id: 'dimension_multi_noise',
      kind: 'minecraft:dimension',
      category: DIMENSIONS,
      title: 'Multi-noise overworld',
      description:
        'Overworld terrain with the biome of the same id at a mild, humid climate point and vanilla biomes around it.',
    },
    (id) => ({
      type: 'minecraft:overworld',
      generator: {
        type: 'minecraft:noise',
        settings: 'minecraft:overworld',
        biome_source: {
          type: 'minecraft:multi_noise',
          biomes: [
            { biome: id, parameters: point(0.2, 0.2, 0.3, 0.3, 0) },
            ...SURROUNDINGS.map(([biome, parameters]) => ({
              biome,
              parameters: structuredClone(parameters),
            })),
          ],
        },
      },
    }),
  ),
  ownId(
    {
      id: 'dimension_single_biome',
      kind: 'minecraft:dimension',
      category: DIMENSIONS,
      title: 'Single-biome dimension',
      description: 'Overworld terrain where every column is the biome of the same id.',
    },
    (id) => ({
      type: 'minecraft:overworld',
      generator: {
        type: 'minecraft:noise',
        settings: 'minecraft:overworld',
        biome_source: { type: 'minecraft:fixed', biome: id },
      },
    }),
  ),
  fixed(
    {
      id: 'world_preset',
      kind: 'minecraft:worldgen/world_preset',
      category: DIMENSIONS,
      title: 'World preset',
      description:
        'A World Type with the vanilla overworld, nether and end; change the overworld biome source to add your biomes.',
    },
    {
      dimensions: {
        'minecraft:overworld': VANILLA_OVERWORLD,
        'minecraft:the_nether': VANILLA_NETHER,
        'minecraft:the_end': VANILLA_END,
      },
    },
  ),
];
