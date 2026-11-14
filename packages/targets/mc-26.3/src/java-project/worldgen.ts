/**
 * Biome additions (ADR 0060 D2, D9): `ModWorldgen.java`, mirroring the runtime's
 * `MsmAdditions.registerBiomeAddition` and `BiomeSelection`. Each addition becomes one
 * `add<Name>()` method whose selector is the union of its biome ids and `#` tags; every feature
 * entry is one `BiomeModifications.create(<ns>:biome_addition/<path>/feature/<n>)` modification
 * that adds the placed feature only when its key is in the registry (Fabric's `addFeature`
 * throws for a missing key and would stop the server), and every spawn entry one
 * `.../spawn/<n>` modification that resolves the entity type when the server starts. Unknown
 * biomes, tags, placed features and entity types are warnings after start-up, as in the
 * runtime. A `min_group` above `max_group`, which the runtime reports and skips, cannot be
 * ejected. Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import type { DefinitionInput } from '@msm/plugin-api';
import { classPath, type GenerationContext } from './context';
import { CATEGORIES } from './entities';
import { identifierExpression, indent, JavaFile, javaInt, javaString } from './java';
import { className, NameTable, splitId } from './names';
import { checkFormat, type Reader, readDefinition } from './read';

/** `GenerationStep.Decoration` in lower case (`::msm::definition::GenerationStep`). */
export const GENERATION_STEPS = [
  'raw_generation',
  'lakes',
  'local_modifications',
  'underground_structures',
  'surface_structures',
  'strongholds',
  'underground_ores',
  'underground_decoration',
  'fluid_springs',
  'vegetal_decoration',
  'top_layer_modification',
] as const;

/** A resource location with an optional namespace, as `Identifier.tryParse` accepts it. */
const ID = /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;

interface FeatureSpec {
  readonly feature: string;
  /** A `GenerationStep.Decoration` constant. */
  readonly step: string;
}

interface SpawnSpec {
  readonly entity: string;
  /** A `MobCategory` constant. */
  readonly category: string;
  readonly weight: number;
  readonly minGroup: number;
  readonly maxGroup: number;
}

interface BiomeAdditionSpec {
  readonly input: DefinitionInput;
  readonly biomes: readonly string[];
  readonly features: readonly FeatureSpec[];
  readonly spawns: readonly SpawnSpec[];
}

/** An id field, checked as the runtime's `MsmCodecs.ID`. */
function idOf(reader: Reader, key: string): string {
  const value = reader.requiredString(key);
  if (!ID.test(value)) reader.fail(`${key} '${value}' is not a resource location`);
  return value;
}

/** An integer field of at least 1. */
function positive(reader: Reader, key: string): number {
  const value = reader.requiredInteger(key);
  if (value < 1) reader.fail(`${key} must be at least 1`);
  return value;
}

function readBiomeAddition(input: DefinitionInput): BiomeAdditionSpec {
  const reader = readDefinition(input);
  reader.onlyKeys(['format', 'biomes', 'features', 'spawns'], 'top-level key');
  checkFormat(reader);
  if (!reader.has('biomes')) reader.fail('biomes is missing');
  const biomes = reader.strings('biomes', []);
  if (biomes.length === 0) reader.fail('biomes must list at least one biome or tag');
  for (const biome of biomes) {
    if (!ID.test(biome.startsWith('#') ? biome.slice(1) : biome)) {
      reader.fail(`biomes: '${biome}' is not a biome id or #tag`);
    }
  }
  for (const key of ['features', 'spawns']) {
    if (reader.has(key) && reader.objects(key).length === 0) {
      reader.fail(`${key} must not be empty`);
    }
  }
  const features = reader.objects('features').map((feature) => {
    feature.onlyKeys(['feature', 'step'], 'feature field');
    return {
      feature: idOf(feature, 'feature'),
      step: feature.enumConstant('step', GENERATION_STEPS, ''),
    };
  });
  const spawns = reader.objects('spawns').map((spawn) => {
    spawn.onlyKeys(['entity', 'category', 'weight', 'min_group', 'max_group'], 'spawn field');
    const minGroup = positive(spawn, 'min_group');
    const maxGroup = positive(spawn, 'max_group');
    if (minGroup > maxGroup) {
      spawn.fail(
        `min_group ${minGroup} is above max_group ${maxGroup}, which cannot be ejected (the runtime does not add the spawn)`,
      );
    }
    return {
      entity: idOf(spawn, 'entity'),
      category: spawn.enumConstant('category', CATEGORIES, ''),
      weight: positive(spawn, 'weight'),
      minGroup,
      maxGroup,
    };
  });
  if (features.length === 0 && spawns.length === 0) {
    reader.fail('features is missing (at least one of features and spawns is required)');
  }
  return { input, biomes, features, spawns };
}

/**
 * Generates `ModWorldgen.java`; returns nothing when the project has no biome additions.
 *
 * @returns The simple name of the registration class, or `undefined`.
 */
export function generateWorldgen(context: GenerationContext): string | undefined {
  const additions = context.input.biomeAdditions ?? [];
  if (additions.length === 0) return undefined;
  const specs = additions.map(readBiomeAddition);
  const file = new JavaFile(
    context.input.javaPackage,
    'the msm/<namespace>/biome_addition/*.json definitions',
  );
  const predicate = file.use('java.util.function.Predicate');
  const selectionContext = file.use('net.fabricmc.fabric.api.biome.v1.BiomeSelectionContext');
  const identifier = file.use('net.minecraft.resources.Identifier');
  const lifecycle = file.use('net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents');
  const logger = file.use('org.slf4j.Logger');
  const loggerFactory = file.use('org.slf4j.LoggerFactory');
  const methods = new NameTable();
  const calls: string[] = [];
  const bodies: string[] = [];
  const checks: string[] = [];
  let anyFeature = false;
  let anySpawn = false;
  for (const spec of specs) {
    const { namespace, path } = splitId(spec.input.id);
    const method = methods.take(`add${className(path, '')}`, (name) => [name], '');
    const file_ = javaString(spec.input.path);
    calls.push(`${method}();`);
    const lines = [
      `${predicate}<${selectionContext}> selector = biomes(${spec.biomes.map(javaString).join(', ')});`,
    ];
    spec.features.forEach((feature, index) => {
      anyFeature = true;
      const step = file.use('net.minecraft.world.level.levelgen.GenerationStep', 'Decoration');
      lines.push(
        `feature(${identifierExpression(file, `${namespace}:biome_addition/${path}/feature/${index}`)}, selector, ${step}.${feature.step},`,
        `        ${identifierExpression(file, feature.feature)});`,
      );
    });
    spec.spawns.forEach((spawn, index) => {
      anySpawn = true;
      const category = file.use('net.minecraft.world.entity.MobCategory');
      lines.push(
        `spawn(${identifierExpression(file, `${namespace}:biome_addition/${path}/spawn/${index}`)}, selector, ${category}.${spawn.category},`,
        `        ${identifierExpression(file, spawn.entity)}, ${javaInt(spawn.weight)}, ${javaInt(spawn.minGroup)}, ${javaInt(spawn.maxGroup)}); // weight, min_group, max_group`,
      );
    });
    bodies.push(
      '',
      `/** {@code ${spec.input.id}} (${spec.input.path}). */`,
      `private static void ${method}() {`,
      ...indent(lines),
      '}',
    );
    for (const biome of spec.biomes)
      checks.push(`warnUnknownBiome(server, ${file_}, ${javaString(biome)});`);
    for (const feature of spec.features) {
      checks.push(`warnUnknownFeature(server, ${file_}, ${javaString(feature.feature)});`);
    }
    for (const spawn of spec.spawns) {
      checks.push(`warnUnknownEntity(${file_}, ${javaString(spawn.entity)});`);
    }
  }

  const registries = file.use('net.minecraft.core.registries.Registries');
  const resourceKey = file.use('net.minecraft.resources.ResourceKey');
  const server = file.use('net.minecraft.server.MinecraftServer');
  const biomeType = file.use('net.minecraft.world.level.biome.Biome');
  const holderLookup = file.use('net.minecraft.core.HolderLookup');
  const tagKey = file.use('net.minecraft.tags.TagKey');
  const selectors = file.use('net.fabricmc.fabric.api.biome.v1.BiomeSelectors');
  const list = file.use('java.util.List');
  const arrayList = file.use('java.util.ArrayList');
  const helpers: string[] = [
    '',
    "/** The union of biome ids and {@code #}-prefixed biome tags (the runtime's BiomeSelection). */",
    `private static ${predicate}<${selectionContext}> biomes(String... entries) {`,
    `    ${predicate}<${selectionContext}> selector = context -> false;`,
    `    ${list}<${resourceKey}<${biomeType}>> keys = new ${arrayList}<>();`,
    '    for (String entry : entries) {',
    '        if (entry.startsWith("#")) {',
    `            selector = selector.or(${selectors}.tag(${tagKey}.create(${registries}.BIOME, ${identifier}.parse(entry.substring(1)))));`,
    '        } else {',
    `            keys.add(${resourceKey}.create(${registries}.BIOME, ${identifier}.parse(entry)));`,
    '        }',
    '    }',
    '    if (!keys.isEmpty()) {',
    `        selector = selector.or(${selectors}.includeByKey(keys));`,
    '    }',
    '    return selector;',
    '}',
  ];
  if (anyFeature) {
    const modifications = file.use('net.fabricmc.fabric.api.biome.v1.BiomeModifications');
    const phase = file.use('net.fabricmc.fabric.api.biome.v1.ModificationPhase');
    const step = file.use('net.minecraft.world.level.levelgen.GenerationStep', 'Decoration');
    const placed = file.use('net.minecraft.world.level.levelgen.placement.PlacedFeature');
    helpers.push(
      '',
      '/**',
      " * Adds a placed feature to the selected biomes when a server starts. Fabric's addFeature throws for a key that is not",
      ' * in the registry, which would stop the server, so the key is looked up first and a missing one is skipped.',
      ' */',
      `private static void feature(${identifier} modification, ${predicate}<${selectionContext}> selector, ${step} step, ${identifier} feature) {`,
      `    ${resourceKey}<${placed}> key = ${resourceKey}.create(${registries}.PLACED_FEATURE, feature);`,
      `    ${modifications}.create(modification).add(${phase}.ADDITIONS, selector, (selection, context) -> {`,
      `        if (selection.getRegistryAccess().lookupOrThrow(${registries}.PLACED_FEATURE).get(key).isPresent()) {`,
      '            context.getGenerationSettings().addFeature(step, key);',
      '        }',
      '    });',
      '}',
    );
  }
  if (anySpawn) {
    const modifications = file.use('net.fabricmc.fabric.api.biome.v1.BiomeModifications');
    const phase = file.use('net.fabricmc.fabric.api.biome.v1.ModificationPhase');
    const category = file.use('net.minecraft.world.entity.MobCategory');
    const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
    const intProvider = file.use('net.minecraft.util.valueproviders.IntProvider');
    const constantInt = file.use('net.minecraft.util.valueproviders.ConstantInt');
    const uniformInt = file.use('net.minecraft.util.valueproviders.UniformInt');
    const spawnSettings = file.use('net.minecraft.world.level.biome.MobSpawnSettings');
    helpers.push(
      '',
      '/**',
      ' * Adds a natural spawn to the selected biomes when a server starts; the entity type is resolved then, once every mod',
      ' * has registered its types, and a missing one is skipped. addSpawn(MobCategory, SpawnerData, int) is deprecated by',
      ' * Fabric in favour of overloads that take the category from the type; the definition names its category.',
      ' */',
      '@SuppressWarnings("deprecation")',
      `private static void spawn(${identifier} modification, ${predicate}<${selectionContext}> selector, ${category} category, ${identifier} entity,`,
      '        int weight, int minGroup, int maxGroup) {',
      `    ${intProvider} count = minGroup == maxGroup ? ${constantInt}.of(minGroup) : ${uniformInt}.of(minGroup, maxGroup);`,
      `    ${modifications}.create(modification).add(${phase}.ADDITIONS, selector, context -> ${builtIn}.ENTITY_TYPE.getOptional(entity)`,
      `            .ifPresent(type -> context.getMobSpawnSettings().addSpawn(category, new ${spawnSettings}.SpawnerData(type, count), weight)));`,
      '}',
    );
  }
  helpers.push(
    '',
    '/** Warns about a biome or {@code #}-prefixed biome tag that does not exist on the running server. */',
    `private static void warnUnknownBiome(${server} server, String file, String entry) {`,
    `    ${holderLookup}.RegistryLookup<${biomeType}> biomes = server.registryAccess().lookupOrThrow(${registries}.BIOME);`,
    '    boolean known = entry.startsWith("#")',
    `            ? biomes.get(${tagKey}.create(${registries}.BIOME, ${identifier}.parse(entry.substring(1)))).isPresent()`,
    `            : biomes.get(${resourceKey}.create(${registries}.BIOME, ${identifier}.parse(entry))).isPresent();`,
    '    if (!known) {',
    '        LOGGER.warn("{}: unknown biome in biomes {}", file, entry);',
    '    }',
    '}',
  );
  if (anyFeature) {
    helpers.push(
      '',
      '/** Warns about a placed feature that does not exist on the running server; it is not added. */',
      `private static void warnUnknownFeature(${server} server, String file, String id) {`,
      `    if (server.registryAccess().lookupOrThrow(${registries}.PLACED_FEATURE).get(${resourceKey}.create(${registries}.PLACED_FEATURE, ${identifier}.parse(id))).isEmpty()) {`,
      '        LOGGER.warn("{}: unknown placed feature {}; the feature is not added", file, id);',
      '    }',
      '}',
    );
  }
  if (anySpawn) {
    const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
    helpers.push(
      '',
      '/** Warns about an entity type that no mod registered; the spawn is not added. */',
      'private static void warnUnknownEntity(String file, String id) {',
      `    if (!${builtIn}.ENTITY_TYPE.containsKey(${identifier}.parse(id))) {`,
      '        LOGGER.warn("{}: unknown entity type {}; the spawn is not added", file, id);',
      '    }',
      '}',
    );
  }
  const lines = [
    '/**',
    ' * Additions to vanilla biomes: placed features and natural spawns, added by Fabric when a server starts, so they are',
    ' * fixed per world load and only new chunks get the features. A placed feature, biome, tag or entity type that does',
    ' * not exist is a warning after start-up and is not added.',
    ' */',
    'public final class ModWorldgen {',
    `    private static final ${logger} LOGGER = ${loggerFactory}.getLogger(${javaString(context.input.modId)});`,
    '',
    '    private ModWorldgen() {}',
    '',
    '    /** Registers every biome addition and the check of their ids after start-up. */',
    '    public static void register() {',
    ...indent(calls, 2),
    `        ${lifecycle}.SERVER_STARTED.register(server -> {`,
    ...indent(checks, 3),
    '        });',
    '    }',
    ...indent([...bodies, ...helpers]),
    '}',
  ];
  context.files.push({ path: classPath(context, '', 'ModWorldgen'), contents: file.render(lines) });
  return 'ModWorldgen';
}
