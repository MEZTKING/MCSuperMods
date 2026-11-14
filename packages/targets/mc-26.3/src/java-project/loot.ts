/**
 * Loot additions (ADR 0060 D3, D9): `ModLoot.java`, mirroring the runtime's
 * `MsmAdditions.registerLootAdditions` and `modifyLootTable`. Each addition's pools are embedded
 * as JSON text and decoded with `LootPool.CODEC` over the registries of every
 * `LootTableEvents.MODIFY` call, so project items, enchantments and predicates resolve and a
 * `/reload` adds each pool once to the freshly loaded table. Only built-in tables
 * (`LootTableSource.isBuiltin()`) change: a table a data pack replaced wins. A pool that does not
 * decode is one logged error per load and is skipped; an unknown table is a warning after
 * start-up. Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import type { DefinitionInput } from '@msm/plugin-api';
import { classPath, type GenerationContext } from './context';
import { indent, JavaFile, javaString } from './java';
import { constantName, NameTable, splitId } from './names';
import { checkFormat, readDefinition } from './read';

/** A resource location with an optional namespace, as `Identifier.tryParse` accepts it. */
const ID = /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;

interface LootAdditionSpec {
  readonly input: DefinitionInput;
  /** Table ids with their namespace, each once, in the definition's order. */
  readonly tables: readonly string[];
  /** The `pools` list as compact JSON. */
  readonly pools: string;
}

function readLootAddition(input: DefinitionInput): LootAdditionSpec {
  const reader = readDefinition(input);
  reader.onlyKeys(['format', 'tables', 'pools'], 'top-level key');
  checkFormat(reader);
  if (!reader.has('tables')) reader.fail('tables is missing');
  const tables: string[] = [];
  for (const table of reader.strings('tables', [])) {
    if (!ID.test(table)) reader.fail(`tables: '${table}' is not a loot table id`);
    const { namespace, path } = splitId(table);
    const id = `${namespace}:${path}`;
    if (!tables.includes(id)) tables.push(id);
  }
  if (tables.length === 0) reader.fail('tables must list at least one loot table');
  if (!reader.has('pools')) reader.fail('pools is missing');
  const pools = reader.objects('pools');
  if (pools.length === 0) reader.fail('pools must list at least one pool');
  return { input, tables, pools: JSON.stringify(pools.map((pool) => pool.value)) };
}

/**
 * Generates `ModLoot.java`; returns nothing when the project has no loot additions.
 *
 * @returns The simple name of the registration class, or `undefined`.
 */
export function generateLoot(context: GenerationContext): string | undefined {
  const additions = context.input.lootAdditions ?? [];
  if (additions.length === 0) return undefined;
  const specs = additions.map(readLootAddition);
  const file = new JavaFile(
    context.input.javaPackage,
    'the msm/<namespace>/loot_addition/*.json definitions',
  );
  const logger = file.use('org.slf4j.Logger');
  const loggerFactory = file.use('org.slf4j.LoggerFactory');
  const jsonElement = file.use('com.google.gson.JsonElement');
  const jsonArray = file.use('com.google.gson.JsonArray');
  const jsonParser = file.use('com.google.gson.JsonParser');
  const dataResult = file.use('com.mojang.serialization.DataResult');
  const jsonOps = file.use('com.mojang.serialization.JsonOps');
  const lootEvents = file.use('net.fabricmc.fabric.api.loot.v3.LootTableEvents');
  const lootSource = file.use('net.fabricmc.fabric.api.loot.v3.LootTableSource');
  const lifecycle = file.use('net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents');
  const holderLookup = file.use('net.minecraft.core.HolderLookup');
  const registries = file.use('net.minecraft.core.registries.Registries');
  const identifier = file.use('net.minecraft.resources.Identifier');
  const registryOps = file.use('net.minecraft.resources.RegistryOps');
  const resourceKey = file.use('net.minecraft.resources.ResourceKey');
  const server = file.use('net.minecraft.server.MinecraftServer');
  const lootPool = file.use('net.minecraft.world.level.storage.loot.LootPool');
  const lootTable = file.use('net.minecraft.world.level.storage.loot.LootTable');
  const list = file.use('java.util.List');
  const arrayList = file.use('java.util.ArrayList');
  const map = file.use('java.util.Map');
  const linkedHashMap = file.use('java.util.LinkedHashMap');
  const set = file.use('java.util.Set');
  const hashSet = file.use('java.util.HashSet');

  const fields = new NameTable();
  fields.reserve('LOGGER', 'POOLS', 'LOAD_SEEN');
  const constants: string[] = [];
  const calls: string[] = [];
  const checks: string[] = [];
  for (const spec of specs) {
    const field = fields.take(`${constantName(splitId(spec.input.id).path)}_POOLS`);
    const path = javaString(spec.input.path);
    constants.push(
      `/** The pools of {@code ${spec.input.id}} (${spec.input.path}), as JSON. */`,
      `private static final String ${field} = ${javaString(spec.pools)};`,
      '',
    );
    calls.push(`add(${path}, ${field}, ${spec.tables.map(javaString).join(', ')});`);
    for (const table of spec.tables)
      checks.push(`warnUnknownTable(server, ${path}, ${javaString(table)});`);
  }

  const lines = [
    '/**',
    ' * Additions to vanilla loot tables: extra pools, decoded with LootPool.CODEC on every loot table load (so they survive',
    ' * /reload without doubling) and added only to built-in tables: a table that a data pack replaced wins. A pool that does',
    ' * not decode is one logged error per load and is skipped.',
    ' */',
    'public final class ModLoot {',
    `    private static final ${logger} LOGGER = ${loggerFactory}.getLogger(${javaString(context.input.modId)});`,
    '',
    ...indent(constants),
    '    /** One pool of one loot addition file. */',
    `    private record Pool(String file, int index, ${jsonElement} json) {}`,
    '',
    `    private static final ${map}<${identifier}, ${list}<Pool>> POOLS = new ${linkedHashMap}<>();`,
    '    /** Pools that failed to decode in the current load, so each is reported once. */',
    `    private static final ${set}<String> LOAD_SEEN = new ${hashSet}<>();`,
    '',
    '    private ModLoot() {}',
    '',
    '    /** Registers every loot addition, the loot table listeners and the check of the table ids after start-up. */',
    '    public static void register() {',
    ...indent(calls, 2),
    `        ${lootEvents}.MODIFY.register(ModLoot::modifyLootTable);`,
    `        ${lootEvents}.ALL_LOADED.register((resources, tables) -> {`,
    '            synchronized (LOAD_SEEN) {',
    '                LOAD_SEEN.clear();',
    '            }',
    '        });',
    `        ${lifecycle}.SERVER_STARTED.register(server -> {`,
    ...indent(checks, 3),
    '        });',
    '    }',
    '',
    '    /** Adds the pools of one file (a JSON list) to each of its tables. */',
    '    private static void add(String file, String pools, String... tables) {',
    `        ${jsonArray} array = ${jsonParser}.parseString(pools).getAsJsonArray();`,
    '        for (String table : tables) {',
    `            ${list}<Pool> list = POOLS.computeIfAbsent(${identifier}.parse(table), t -> new ${arrayList}<>());`,
    '            for (int index = 0; index < array.size(); index++) {',
    '                list.add(new Pool(file, index, array.get(index)));',
    '            }',
    '        }',
    '    }',
    '',
    '    /** The MODIFY listener: adds the pools naming {@code key} to a built-in table. */',
    `    private static void modifyLootTable(${resourceKey}<${lootTable}> key, ${lootTable}.Builder builder, ${lootSource} source,`,
    `            ${holderLookup}.Provider registries) {`,
    '        if (!source.isBuiltin()) {',
    '            return; // a data pack replaced the table: it wins',
    '        }',
    `        ${list}<Pool> pools = POOLS.get(key.identifier());`,
    '        if (pools == null) {',
    '            return;',
    '        }',
    `        ${registryOps}<${jsonElement}> ops = ${registryOps}.create(${jsonOps}.INSTANCE, registries);`,
    '        for (Pool pool : pools) {',
    `            ${dataResult}<${lootPool}> result = ${lootPool}.CODEC.parse(ops, pool.json());`,
    '            if (result.result().isPresent()) {',
    '                builder.pool(result.result().get());',
    '                continue;',
    '            }',
    '            synchronized (LOAD_SEEN) {',
    '                if (!LOAD_SEEN.add(pool.file() + "#" + pool.index())) {',
    '                    continue; // one error per pool per load, however many tables name it',
    '                }',
    '            }',
    '            LOGGER.error("{}: pools[{}]: {}; the pool is not added", pool.file(), pool.index(),',
    `                    result.error().map(${dataResult}.Error::message).orElse("invalid pool"));`,
    '        }',
    '    }',
    '',
    '    /** Warns about a loot table that does not exist once the server runs; nothing is added to it. */',
    `    private static void warnUnknownTable(${server} server, String file, String id) {`,
    `        if (server.reloadableRegistries().lookup().lookupOrThrow(${registries}.LOOT_TABLE)`,
    `                .get(${resourceKey}.create(${registries}.LOOT_TABLE, ${identifier}.parse(id))).isEmpty()) {`,
    '            LOGGER.warn("{}: unknown loot table {}; nothing is added to it", file, id);',
    '        }',
    '    }',
    '}',
  ];
  context.files.push({ path: classPath(context, '', 'ModLoot'), contents: file.render(lines) });
  return 'ModLoot';
}
