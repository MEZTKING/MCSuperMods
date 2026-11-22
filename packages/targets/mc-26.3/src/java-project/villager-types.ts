/**
 * Villager types (ADR 0107 D5 as amended after B524; ADR 0112 D3): `ModVillagerTypes.java`, one
 * entry of `BuiltInRegistries.VILLAGER_TYPE` per `msm/<namespace>/villager_type/*.json` definition,
 * registered at start with its biome ids added to vanilla's biome map (`VillagerType.BY_BIOME`,
 * reached by reflection; when it cannot be reached the types stay registered without biomes, with
 * one warning) and its biome tags resolved when a server starts and after each data pack reload.
 * The body is the runtime's `VillagerTypes`, line for line, with the parsed definitions written in
 * as constants. Vanilla draws `<ns>:textures/entity/villager/type/<path>.png` and
 * `zombie_villager/type/<path>.png` (copied with the resources) with no client code.
 *
 * Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import { classPath, type GenerationContext } from './context';
import { identifierExpression, indent, JavaFile, javaString } from './java';
import { checkFormat, readDefinition } from './read';

const ID_OR_TAG = /^#?([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;

/** Generates `ModVillagerTypes.java`; returns its simple name, or `undefined` without villager types. */
export function generateVillagerTypes(context: GenerationContext): string | undefined {
  const types = context.input.villagerTypes ?? [];
  if (types.length === 0) return undefined;
  const file = new JavaFile(
    context.input.javaPackage,
    'the msm/<namespace>/villager_type/*.json definitions',
  );
  const list = file.use('java.util.List');
  const adds: string[] = [];
  for (const type of types) {
    const reader = readDefinition(type);
    reader.onlyKeys(['format', 'biomes'], 'top-level key');
    checkFormat(reader);
    const biomes = reader.strings('biomes', []);
    if (biomes.length < 1 || biomes.length > 64)
      reader.fail('biomes must list 1 to 64 biomes or tags');
    const full = biomes.map((biome) => {
      if (!ID_OR_TAG.test(biome)) reader.fail(`biomes: '${biome}' is not a biome id or #tag`);
      const tag = biome.startsWith('#');
      const bare = tag ? biome.slice(1) : biome;
      return `${tag ? '#' : ''}${bare.includes(':') ? bare : `minecraft:${bare}`}`;
    });
    adds.push(
      `add(${identifierExpression(file, type.id)}, ${javaString(type.path)}, ${list}.of(${full.map(javaString).join(', ')}));`,
    );
  }
  context.files.push({
    path: classPath(context, '', 'ModVillagerTypes'),
    contents: villagerTypesJava(file, context.input.modId, adds),
  });
  return 'ModVillagerTypes';
}

function villagerTypesJava(file: JavaFile, modId: string, adds: readonly string[]): string {
  for (const fqcn of [
    'java.lang.reflect.Field',
    'java.util.ArrayList',
    'java.util.HashMap',
    'java.util.LinkedHashMap',
    'java.util.Map',
    'java.util.Optional',
    'net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents',
    'net.minecraft.core.Holder',
    'net.minecraft.core.HolderSet',
    'net.minecraft.core.Registry',
    'net.minecraft.core.RegistryAccess',
    'net.minecraft.core.registries.BuiltInRegistries',
    'net.minecraft.core.registries.Registries',
    'net.minecraft.resources.Identifier',
    'net.minecraft.resources.ResourceKey',
    'net.minecraft.tags.TagKey',
    'net.minecraft.world.entity.npc.villager.VillagerType',
    'net.minecraft.world.level.biome.Biome',
    'org.slf4j.Logger',
    'org.slf4j.LoggerFactory',
  ]) {
    file.use(fqcn);
  }
  const lines = [
    '/**',
    " * The villager types (msm_runtime VillagerTypes, ADR 0107 D5): registered at start, their biome ids added to vanilla's",
    " * biome map and kept (a type takes a biome from vanilla's own type; when two types name the same biome id the first",
    ' * keeps it), their biome tags resolved when a server starts and after each data pack reload (tag entries never',
    " * replace an id entry or an earlier type's tag entry; a reload first puts back what the last resolution replaced).",
    ' */',
    'public final class ModVillagerTypes {',
    `    private static final Logger LOGGER = LoggerFactory.getLogger(${javaString(modId)});`,
    '    /** The registered types and their biomes (ids and #tags), in order. */',
    '    private static final Map<Identifier, Registered> REGISTERED = new LinkedHashMap<>();',
    '    /** The biomes the types took by id, and the type each now has. */',
    '    private static final Map<ResourceKey<Biome>, ResourceKey<VillagerType>> BY_ID = new LinkedHashMap<>();',
    '    /** What the last tag resolution replaced: the biome and its earlier type, empty when it had none. */',
    '    private static final Map<ResourceKey<Biome>, Optional<ResourceKey<VillagerType>>> REPLACED_BY_TAGS = new HashMap<>();',
    '    private static Map<ResourceKey<Biome>, ResourceKey<VillagerType>> byBiome;',
    '    private static boolean reachable = true;',
    '',
    '    private ModVillagerTypes() {}',
    '',
    '    private record Registered(ResourceKey<VillagerType> key, List<String> biomes) {}',
    '',
    '    /** Registers every villager type and maps its biome ids. */',
    '    public static void register() {',
    ...indent(adds, 2),
    '        if (byBiome != null && !REGISTERED.isEmpty()) {',
    '            ServerLifecycleEvents.SERVER_STARTING.register(server -> resolve(server.registryAccess()));',
    '            ServerLifecycleEvents.END_DATA_PACK_RELOAD.register((server, resources, success) -> {',
    '                if (success) {',
    '                    resolve(server.registryAccess());',
    '                }',
    '            });',
    '        }',
    '    }',
    '',
    '    private static void add(Identifier id, String file, List<String> biomes) {',
    '        if (BuiltInRegistries.VILLAGER_TYPE.containsKey(id)) {',
    '            LOGGER.error("{}: villager type {} is already registered; the type is not registered", file, id);',
    '            return;',
    '        }',
    '        Map<ResourceKey<Biome>, ResourceKey<VillagerType>> map = biomeMap();',
    '        ResourceKey<VillagerType> key = ResourceKey.create(Registries.VILLAGER_TYPE, id);',
    '        Registry.register(BuiltInRegistries.VILLAGER_TYPE, key, new VillagerType());',
    '        REGISTERED.put(id, new Registered(key, biomes));',
    '        if (map == null) {',
    '            return;',
    '        }',
    '        for (String biome : biomes) {',
    '            if (biome.startsWith("#")) {',
    '                continue; // resolved when a server starts',
    '            }',
    '            ResourceKey<Biome> biomeKey = ResourceKey.create(Registries.BIOME, Identifier.parse(biome));',
    '            ResourceKey<VillagerType> taken = BY_ID.get(biomeKey);',
    '            if (taken != null) {',
    '                LOGGER.warn("{}: biomes: {} already belongs to villager type {}; the first type keeps it", file, biome, taken.identifier());',
    '                continue;',
    '            }',
    '            BY_ID.put(biomeKey, key);',
    '            map.put(biomeKey, key);',
    '        }',
    '    }',
    '',
    "    /** Vanilla's biome map, or null (with one warning) when it cannot be reached. */",
    '    @SuppressWarnings("unchecked")',
    '    private static Map<ResourceKey<Biome>, ResourceKey<VillagerType>> biomeMap() {',
    '        if (byBiome != null || !reachable) {',
    '            return byBiome;',
    '        }',
    '        try {',
    '            Field field = VillagerType.class.getDeclaredField("BY_BIOME");',
    '            field.setAccessible(true);',
    '            Map<ResourceKey<Biome>, ResourceKey<VillagerType>> map = (Map<ResourceKey<Biome>, ResourceKey<VillagerType>>) field.get(null);',
    '            map.putAll(Map.of()); // throws now, not per biome, when the map cannot change',
    '            byBiome = map;',
    '        } catch (ReflectiveOperationException | RuntimeException e) {',
    '            reachable = false;',
    '            LOGGER.warn("villager types: vanilla\'s biome map (VillagerType.BY_BIOME) cannot be changed ({}); the villager types are registered without biomes", e.toString());',
    '        }',
    '        return byBiome;',
    '    }',
    '',
    '    /**',
    "     * Maps the biomes of the types' tags in {@code access} (and checks their biome ids): puts back what the last",
    "     * resolution replaced, then adds each tag's biomes that no id entry and no earlier tag entry has.",
    '     */',
    '    private static synchronized void resolve(RegistryAccess access) {',
    '        REPLACED_BY_TAGS.forEach((biome, before) -> before.ifPresentOrElse(type -> byBiome.put(biome, type), () -> byBiome.remove(biome)));',
    '        REPLACED_BY_TAGS.clear();',
    '        Optional<Registry<Biome>> biomes = access.lookup(Registries.BIOME);',
    '        if (biomes.isEmpty()) {',
    '            return;',
    '        }',
    '        for (Map.Entry<Identifier, Registered> e : REGISTERED.entrySet()) {',
    '            for (String biome : e.getValue().biomes()) {',
    '                if (!biome.startsWith("#")) {',
    '                    if (!biomes.get().containsKey(Identifier.parse(biome))) {',
    '                        LOGGER.warn("villager_type {}: biomes: {} is not a biome of this world", e.getKey(), biome);',
    '                    }',
    '                    continue;',
    '                }',
    '                TagKey<Biome> tag = TagKey.create(Registries.BIOME, Identifier.parse(biome.substring(1)));',
    '                Optional<HolderSet.Named<Biome>> members = biomes.get().get(tag);',
    '                if (members.isEmpty()) {',
    '                    LOGGER.warn("villager_type {}: biomes: {} is not a biome tag of this world", e.getKey(), biome);',
    '                    continue;',
    '                }',
    '                for (Holder<Biome> member : members.get()) {',
    '                    Optional<ResourceKey<Biome>> key = member.unwrapKey();',
    '                    if (key.isEmpty() || BY_ID.containsKey(key.get()) || REPLACED_BY_TAGS.containsKey(key.get())) {',
    '                        continue;',
    '                    }',
    '                    REPLACED_BY_TAGS.put(key.get(), Optional.ofNullable(byBiome.get(key.get())));',
    '                    byBiome.put(key.get(), e.getValue().key());',
    '                }',
    '            }',
    '        }',
    '    }',
    '}',
  ];
  return file.render(lines);
}
