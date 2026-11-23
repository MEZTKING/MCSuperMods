/**
 * The world type of a `msm:world_setup` (ADR 0114 D1): every type but `vanilla` lowers to a
 * world preset listed in `#minecraft:normal` (so the Create New World screen offers it), with
 * its dimensions inline (a `dimension` file would replace the Nether or End of every world, not
 * only of this type).
 *
 * - `void`: the overworld is a flat generator with no layers over the project's sky biome
 *   (`<ns>:msm_games/sky`, plains-like mob spawns and no features; vanilla's `the_void` has
 *   empty spawn lists, B547 Y7) or the chosen biome;
 * - `flat`: the same with the given layers;
 * - `sky_islands`: the floating-islands noise settings of `target.worlds` over the overworld's
 *   biomes, or over the chosen biome alone;
 * - `preset`: the project's own preset, only added to `#minecraft:normal` (its files and name
 *   are its own element's);
 * - `vanilla`: nothing.
 *
 * A `void` Nether or End is a flat generator with no layers over the Nether wastes or the End
 * biome (B547 Y5: the End keeps its dragon fight and exit portal). The world type's English name
 * is the lang key `generator.<ns>.<path>` (B547 Y15), made from the element id's last path
 * segment.
 */
import type { Json, JsonObject, OutputFile, TargetFacts } from '@msm/plugin-api';
import {
  type FlatLayer,
  langFile,
  vanillaTagFile,
  type WorldSetup,
  type WorldSetupNames,
  worldFacts,
  worldgenFile,
} from './world-setup-files';

/** The vanilla Nether as vanilla's own world presets write it. */
const VANILLA_NETHER: JsonObject = {
  type: 'minecraft:the_nether',
  generator: {
    type: 'minecraft:noise',
    settings: 'minecraft:nether',
    biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:nether' },
  },
};

/** The vanilla End as vanilla's own world presets write it. */
const VANILLA_END: JsonObject = {
  type: 'minecraft:the_end',
  generator: {
    type: 'minecraft:noise',
    settings: 'minecraft:end',
    biome_source: { type: 'minecraft:the_end' },
  },
};

/** The overworld's own biome source, for sky islands without a chosen biome. */
const OVERWORLD_BIOMES: JsonObject = {
  type: 'minecraft:multi_noise',
  preset: 'minecraft:overworld',
};

/** The overworld biomes a start structure may stand in, when the world has no single biome. */
export const OVERWORLD_BIOME_TAG = '#minecraft:is_overworld';

/** A flat generator of `layers` over `biome` (B547's measured form). */
function flatGenerator(
  biome: string,
  layers: readonly FlatLayer[],
  features: boolean,
  structureSets: readonly string[],
): JsonObject {
  return {
    type: 'minecraft:flat',
    settings: {
      biome,
      layers: layers.map((layer) => ({ block: layer.block, height: layer.height })),
      features,
      lakes: false,
      structure_overrides: [...structureSets],
    },
  };
}

/** An empty dimension of `type` over `biome`. */
function voidDimension(type: string, biome: string): JsonObject {
  return { type, generator: flatGenerator(biome, [], false, []) };
}

/**
 * The single biome of the overworld of a `void`, `flat` or `sky_islands` world (the chosen
 * one, else the project sky biome for `void` and `flat`), or `undefined` when it has the
 * overworld's own biomes (`sky_islands` without a choice, `vanilla`, `preset`).
 */
export function overworldBiome(setup: WorldSetup, names: WorldSetupNames): string | undefined {
  const { world } = setup;
  if (world.biome !== undefined) {
    return world.type === 'vanilla' || world.type === 'preset' ? undefined : world.biome;
  }
  return world.type === 'void' || world.type === 'flat' ? names.skyBiome : undefined;
}

/** Whether the world setup writes the project sky biome. */
export function usesSkyBiome(setup: WorldSetup): boolean {
  return (
    (setup.world.type === 'void' || setup.world.type === 'flat') && setup.world.biome === undefined
  );
}

/**
 * The project sky biome (ADR 0114 D1): no features and no carvers, plains-like weather and
 * colours, and plains-like natural mob spawns under the target's spawn attribute (on a target
 * without biome attributes, no spawns).
 */
export function skyBiome(target: TargetFacts): JsonObject {
  const count = { type: 'minecraft:uniform', min_inclusive: 4, max_inclusive: 4 };
  const spawn = (type: string, weight: number): JsonObject => ({
    type: `minecraft:${type}`,
    count: { ...count },
    weight,
  });
  const biome: JsonObject = {
    has_precipitation: true,
    temperature: 0.8,
    downfall: 0.4,
    effects: { water_color: 4159204 },
    carvers: [],
    features: [],
  };
  const attribute = target.worldgen.biomeAttributes?.naturalMobSpawns;
  if (attribute !== undefined) {
    biome.attributes = {
      [attribute]: {
        spawns_by_category: {
          creature: [spawn('sheep', 12), spawn('pig', 10), spawn('chicken', 10), spawn('cow', 8)],
          monster: [
            spawn('zombie', 95),
            spawn('skeleton', 100),
            spawn('spider', 100),
            spawn('creeper', 100),
          ],
        },
        spawn_costs: {},
      },
    };
  }
  return biome;
}

/** The overworld of the world type, with the start's structure set listed when it has one. */
function overworld(
  setup: WorldSetup,
  names: WorldSetupNames,
  target: TargetFacts,
  structureSets: readonly string[],
): JsonObject {
  const biome = overworldBiome(setup, names);
  switch (setup.world.type) {
    case 'sky_islands':
      return {
        type: 'minecraft:overworld',
        generator: {
          type: 'minecraft:noise',
          settings: worldFacts(target).floatingIslandsSettings,
          biome_source:
            biome === undefined ? { ...OVERWORLD_BIOMES } : { type: 'minecraft:fixed', biome },
        },
      };
    case 'flat':
      return {
        type: 'minecraft:overworld',
        generator: flatGenerator(
          biome ?? names.skyBiome,
          setup.world.layers ?? [],
          true,
          structureSets,
        ),
      };
    default:
      return {
        type: 'minecraft:overworld',
        generator: flatGenerator(biome ?? names.skyBiome, [], false, structureSets),
      };
  }
}

/** The world type's English name from the last segment of a path (`sky_world` "Sky World"). */
export function worldTypeName(path: string): string {
  const last = path.slice(path.lastIndexOf('/') + 1);
  return last
    .split(/[_.-]+/)
    .filter((word) => word !== '')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

/** The lang key of the world type button (B547 Y15). */
export const worldTypeLangKey = (names: WorldSetupNames): string =>
  `generator.${names.namespace}.${names.path}`;

/**
 * The world type's files: the world preset with its dimensions, the sky biome when used, the
 * `#minecraft:normal` entry and the English name; for `preset` only the tag entry; for
 * `vanilla` nothing.
 *
 * @param structureSets - Structure sets the overworld lists in `structure_overrides` (the
 *   start's `dimension_origin` set on the `world_generation` route).
 */
export function lowerWorldType(
  setup: WorldSetup,
  names: WorldSetupNames,
  target: TargetFacts,
  structureSets: readonly string[],
): OutputFile[] {
  const { world } = setup;
  if (world.type === 'vanilla') return [];
  if (world.type === 'preset') {
    return world.preset === undefined
      ? []
      : [vanillaTagFile(target, 'worldgen/world_preset', 'normal', [world.preset])];
  }
  const dimensions: Record<string, Json> = {
    'minecraft:overworld': overworld(setup, names, target, structureSets),
    'minecraft:the_nether':
      world.nether === 'void'
        ? voidDimension('minecraft:the_nether', 'minecraft:nether_wastes')
        : structuredClone(VANILLA_NETHER),
    'minecraft:the_end':
      world.end === 'void'
        ? voidDimension('minecraft:the_end', 'minecraft:the_end')
        : structuredClone(VANILLA_END),
  };
  const files: OutputFile[] = [worldgenFile(target, 'world_preset', names.preset, { dimensions })];
  if (usesSkyBiome(setup)) {
    files.push(worldgenFile(target, 'biome', names.skyBiome, skyBiome(target)));
  }
  files.push(
    vanillaTagFile(target, 'worldgen/world_preset', 'normal', [names.preset]),
    langFile(target, names.namespace, { [worldTypeLangKey(names)]: worldTypeName(names.path) }),
  );
  return files;
}
