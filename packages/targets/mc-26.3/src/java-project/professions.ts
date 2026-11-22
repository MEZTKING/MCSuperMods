/**
 * Villager professions (ADR 0098 D2 and its amendment; ADR 0112 D3): `ModProfessions.java`, one
 * `VillagerProfession` per `msm/<namespace>/villager_profession/*.json` definition with a point of
 * interest type of the same id for every state of its job site, registered through Fabric's
 * `PoiHelper` (one ticket, range 1, as vanilla's workstations), after the blocks and items it names.
 * As the runtime's `MsmProfessions` with the 26.3 `PoiTypes` seam: a job site that is no registered
 * block, or any of whose states already has a point of interest type, is refused (logged, nothing
 * registered); unknown secondary job blocks, requested items and work sounds are logged and left
 * out. Vanilla's villager brain does the rest (the `#minecraft:acquirable_job_site` entry and the
 * trade sets are data the eject copies).
 *
 * Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import { classPath, type GenerationContext } from './context';
import { identifierExpression, indent, JavaFile, javaString } from './java';
import { checkFormat, type Reader, readDefinition } from './read';

const ID = /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;
/** Trade levels (novice to master). */
const LEVELS = 5;

function fullId(reader: Reader, key: string, value: string): string {
  if (!ID.test(value)) reader.fail(`${key} '${value}' is not an id`);
  return value.includes(':') ? value : `minecraft:${value}`;
}

/** Generates `ModProfessions.java`; returns its simple name, or `undefined` without professions. */
export function generateProfessions(context: GenerationContext): string | undefined {
  const professions = context.input.villagerProfessions ?? [];
  if (professions.length === 0) return undefined;
  const file = new JavaFile(
    context.input.javaPackage,
    'the msm/<namespace>/villager_profession/*.json definitions',
  );
  const list = file.use('java.util.List');
  const calls: string[] = [];
  for (const profession of professions) {
    const reader = readDefinition(profession);
    reader.onlyKeys(
      ['format', 'job_site', 'trade_sets', 'work_sound', 'requested_items', 'secondary_job_blocks'],
      'top-level key',
    );
    checkFormat(reader);
    const jobSite = fullId(reader, 'job_site', reader.requiredString('job_site'));
    const ids = (key: string): string[] =>
      reader.strings(key, []).map((value) => fullId(reader, key, value));
    let tradeSets = ids('trade_sets');
    if (reader.has('trade_sets') && tradeSets.length !== LEVELS) {
      reader.fail(`trade_sets must list ${LEVELS} trade sets, one per level`);
    }
    if (!reader.has('trade_sets')) {
      tradeSets = Array.from({ length: LEVELS }, (_, i) => `${profession.id}/level_${i + 1}`);
    }
    const workSound = reader.optionalString('work_sound');
    const idList = (values: readonly string[]): string =>
      `${list}.of(${values.map((value) => identifierExpression(file, value)).join(', ')})`;
    const { namespace, path } = (() => {
      const colon = profession.id.indexOf(':');
      return { namespace: profession.id.slice(0, colon), path: profession.id.slice(colon + 1) };
    })();
    calls.push(
      `register(${identifierExpression(file, profession.id)}, ${javaString(profession.path)}, ${javaString(`entity.${namespace}.villager.${path}`)},`,
      `        ${identifierExpression(file, jobSite)},`,
      `        ${idList(tradeSets)},`,
      `        ${workSound === undefined ? 'null' : identifierExpression(file, fullId(reader, 'work_sound', workSound))},`,
      `        ${idList(ids('requested_items'))},`,
      `        ${idList(ids('secondary_job_blocks'))});`,
    );
  }
  for (const fqcn of [
    'com.google.common.collect.ImmutableSet',
    'it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap',
    'java.util.ArrayList',
    'java.util.Optional',
    'net.fabricmc.fabric.api.object.builder.v1.world.poi.PoiHelper',
    'net.minecraft.core.Holder',
    'net.minecraft.core.Registry',
    'net.minecraft.core.registries.BuiltInRegistries',
    'net.minecraft.core.registries.Registries',
    'net.minecraft.network.chat.Component',
    'net.minecraft.resources.Identifier',
    'net.minecraft.resources.ResourceKey',
    'net.minecraft.sounds.SoundEvent',
    'net.minecraft.world.entity.ai.village.poi.PoiType',
    'net.minecraft.world.entity.npc.villager.VillagerProfession',
    'net.minecraft.world.item.Item',
    'net.minecraft.world.item.trading.TradeSet',
    'net.minecraft.world.level.block.Block',
    'net.minecraft.world.level.block.state.BlockState',
    'org.slf4j.Logger',
    'org.slf4j.LoggerFactory',
  ]) {
    file.use(fqcn);
  }
  const lines = [
    '/**',
    ' * The villager professions (msm_runtime MsmProfessions, ADR 0098 D2): one profession and one point of interest type',
    ' * of the same id per definition, for every state of its job site, registered after the blocks and items.',
    ' */',
    'public final class ModProfessions {',
    `    private static final Logger LOGGER = LoggerFactory.getLogger(${javaString(context.input.modId)});`,
    '',
    '    private ModProfessions() {}',
    '',
    '    /** Registers every profession. */',
    '    public static void register() {',
    ...indent(calls, 2),
    '    }',
    '',
    '    /** Registers one profession; a refused one is logged and nothing of it is registered. */',
    '    private static void register(Identifier id, String file, String nameKey, Identifier jobSiteId, List<Identifier> tradeSets,',
    '            Identifier workSoundId, List<Identifier> requestedItems, List<Identifier> secondaryJobBlocks) {',
    '        String problem = problem(id, jobSiteId);',
    '        if (problem != null) {',
    '            LOGGER.error("{}: {}; the profession is not registered", file, problem);',
    '            return;',
    '        }',
    '        Block jobSite = BuiltInRegistries.BLOCK.getValue(jobSiteId);',
    '        List<Block> secondary = new ArrayList<>();',
    '        for (Identifier block : secondaryJobBlocks) {',
    '            BuiltInRegistries.BLOCK.getOptional(block).ifPresentOrElse(secondary::add,',
    '                    () -> LOGGER.warn("{}: secondary_job_blocks: {} is not a registered block; ignored", file, block));',
    '        }',
    '        List<Item> requested = new ArrayList<>();',
    '        for (Identifier item : requestedItems) {',
    '            BuiltInRegistries.ITEM.getOptional(item).ifPresentOrElse(requested::add,',
    '                    () -> LOGGER.warn("{}: requested_items: {} is not a registered item; ignored", file, item));',
    '        }',
    '        SoundEvent workSound = null;',
    '        if (workSoundId != null) {',
    '            workSound = BuiltInRegistries.SOUND_EVENT.getOptional(workSoundId).orElse(null);',
    '            if (workSound == null) {',
    '                LOGGER.warn("{}: work_sound: {} is not a registered sound event; no work sound", file, workSoundId);',
    '            }',
    '        }',
    '        Int2ObjectOpenHashMap<ResourceKey<TradeSet>> sets = new Int2ObjectOpenHashMap<>();',
    '        for (int level = 1; level <= tradeSets.size(); level++) {',
    '            sets.put(level, ResourceKey.create(Registries.TRADE_SET, tradeSets.get(level - 1)));',
    '        }',
    '        Holder<PoiType> poi;',
    '        try {',
    "            // One ticket and range 1, as vanilla's workstations; PoiHelper also fills vanilla's state map.",
    '            poi = BuiltInRegistries.POINT_OF_INTEREST_TYPE.wrapAsHolder(registerPoi(id, jobSite));',
    '        } catch (RuntimeException e) {',
    '            LOGGER.error("{}: point of interest {} could not be registered (PoiHelper: {}); the profession is not registered", file, id,',
    '                    e.toString());',
    '            return;',
    '        }',
    '        ResourceKey<PoiType> poiKey = poi.unwrapKey().orElse(ResourceKey.create(Registries.POINT_OF_INTEREST_TYPE, id));',
    '        ResourceKey<VillagerProfession> key = ResourceKey.create(Registries.VILLAGER_PROFESSION, id);',
    '        VillagerProfession profession = new VillagerProfession(Component.translatable(nameKey), holder -> holder.is(poiKey),',
    '                holder -> holder.is(poiKey), ImmutableSet.copyOf(requested), ImmutableSet.copyOf(secondary), workSound, sets);',
    '        Registry.register(BuiltInRegistries.VILLAGER_PROFESSION, key, profession);',
    '    }',
    '',
    '    @SuppressWarnings("removal") // PoiHelper is the only registration route on 26.3 (ADR 0098 D2)',
    '    private static PoiType registerPoi(Identifier id, Block jobSite) {',
    '        return PoiHelper.register(id, 1, 1, jobSite);',
    '    }',
    '',
    "    /** Why {@code id} cannot be registered, or null: vanilla's own duplicate check fires only after it has replaced the mapping. */",
    '    private static String problem(Identifier id, Identifier jobSiteId) {',
    '        if (BuiltInRegistries.VILLAGER_PROFESSION.containsKey(id)) {',
    '            return "villager profession id " + id + " is already registered";',
    '        }',
    '        if (BuiltInRegistries.POINT_OF_INTEREST_TYPE.containsKey(id)) {',
    '            return "point of interest type " + id + " is already registered";',
    '        }',
    '        Optional<Block> site = BuiltInRegistries.BLOCK.getOptional(jobSiteId);',
    '        if (site.isEmpty()) {',
    '            return "job_site: " + jobSiteId + " is not a registered block";',
    '        }',
    '        for (BlockState state : site.get().getStateDefinition().getPossibleStates()) {',
    '            Optional<Holder<PoiType>> taken = net.minecraft.world.entity.ai.village.poi.PoiTypes.forState(state);',
    '            if (taken.isPresent()) {',
    '                return "job_site: " + jobSiteId + " already has the point of interest type "',
    '                        + taken.get().unwrapKey().map(k -> k.identifier().toString()).orElse("(unnamed)")',
    '                        + " (a block can be the job site of one point of interest only)";',
    '            }',
    '        }',
    '        return null;',
    '    }',
    '}',
  ];
  context.files.push({
    path: classPath(context, '', 'ModProfessions'),
    contents: file.render(lines),
  });
  return 'ModProfessions';
}
