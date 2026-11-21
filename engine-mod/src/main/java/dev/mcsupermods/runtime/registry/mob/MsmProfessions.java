package dev.mcsupermods.runtime.registry.mob;

import com.google.common.collect.ImmutableSet;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.ProfessionParser;
import dev.mcsupermods.runtime.loader.RawDefinition;
import dev.mcsupermods.runtime.registry.PoiTypes;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.entity.ai.village.poi.PoiType;
import net.minecraft.world.entity.npc.villager.VillagerProfession;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.trading.TradeSet;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Villager professions (ADR 0098 D2 and its amendment): one {@code VillagerProfession} per {@code villager_profession}
 * definition, with a point of interest type of the same id for every state of its job site, registered through the
 * {@link PoiTypes} seam (Fabric's {@code PoiHelper} on 26.3, reflection on 26.4). Vanilla's villager brain does the rest:
 * a villager without a job takes the profession at a job site whose point of interest is in
 * {@code #minecraft:acquirable_job_site} (lowering writes that tag entry with the profession's id; without it no
 * villager takes the job), trades from the five level trade sets and loses the job, while it has no trading XP, when the
 * block goes.
 *
 * <p>A job site is refused (an error, nothing registered) when it is not a registered block, or when any of its states
 * already has a point of interest type (a vanilla workstation, a bed, a bell, another profession's job site): vanilla's
 * own duplicate check throws only after it has replaced the mapping, so the runtime checks every state first. The
 * registrar calls this after the blocks and items, which a job site, secondary job blocks and requested items name.
 */
public final class MsmProfessions {
    private static final Map<Identifier, Registered> REGISTERED = new LinkedHashMap<>();

    private MsmProfessions() {}

    /** A registered profession and its point of interest type, for the GameTests. */
    public record Registered(ResourceKey<VillagerProfession> profession, Holder<PoiType> poi, Block jobSite) {}

    /** The professions registered at start-up, by id in scan order. */
    public static Map<Identifier, Registered> registered() {
        return Map.copyOf(REGISTERED);
    }

    /**
     * Parses the scanned {@code villager_profession} definitions and registers their professions; returns the ids
     * registered. Errors and warnings are added to the lists.
     */
    public static List<Identifier> register(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        Map<Identifier, ProfessionParser.Profession> parsed = ProfessionParser.parseAll(definitions, errors, warnings);
        if (parsed.isEmpty()) {
            return List.of();
        }
        PoiTypes.init();
        Map<Identifier, String> files = new LinkedHashMap<>();
        for (RawDefinition raw : definitions) {
            if (raw.kind().equals(ProfessionParser.KIND)) {
                files.put(raw.id(), raw.describe());
            }
        }
        List<Identifier> out = new ArrayList<>();
        for (Map.Entry<Identifier, ProfessionParser.Profession> e : parsed.entrySet()) {
            String file = files.getOrDefault(e.getKey(), "villager_profession " + e.getKey());
            String problem = register(e.getKey(), e.getValue(), file, warnings);
            if (problem != null) {
                errors.add(file + ": " + problem + "; the profession is not registered");
            } else {
                out.add(e.getKey());
            }
        }
        MsmRuntime.LOGGER.info("[{}] villager professions use {}", MsmRuntime.MOD_ID, PoiTypes.route());
        return List.copyOf(out);
    }

    /** Registers one profession; returns the reason it was refused, or null. */
    private static String register(Identifier id, ProfessionParser.Profession def, String file, List<String> warnings) {
        if (BuiltInRegistries.VILLAGER_PROFESSION.containsKey(id)) {
            return "villager profession id " + id + " is already registered";
        }
        if (BuiltInRegistries.POINT_OF_INTEREST_TYPE.containsKey(id)) {
            return "point of interest type " + id + " is already registered";
        }
        Optional<Block> site = BuiltInRegistries.BLOCK.getOptional(def.jobSite());
        if (site.isEmpty()) {
            return "job_site: " + def.jobSite() + " is not a registered block";
        }
        Block jobSite = site.get();
        for (BlockState state : jobSite.getStateDefinition().getPossibleStates()) {
            Optional<Holder<PoiType>> taken = net.minecraft.world.entity.ai.village.poi.PoiTypes.forState(state);
            if (taken.isPresent()) {
                return "job_site: " + def.jobSite() + " already has the point of interest type "
                        + taken.get().unwrapKey().map(k -> k.identifier().toString()).orElse("(unnamed)")
                        + " (a block can be the job site of one point of interest only)";
            }
        }
        List<Block> secondary = new ArrayList<>();
        for (Identifier block : def.secondaryJobBlocks()) {
            BuiltInRegistries.BLOCK.getOptional(block).ifPresentOrElse(secondary::add,
                    () -> warnings.add(file + ": secondary_job_blocks: " + block + " is not a registered block; ignored"));
        }
        List<Item> requested = new ArrayList<>();
        for (Identifier item : def.requestedItems()) {
            BuiltInRegistries.ITEM.getOptional(item).ifPresentOrElse(requested::add,
                    () -> warnings.add(file + ": requested_items: " + item + " is not a registered item; ignored"));
        }
        SoundEvent workSound = def.workSound().flatMap(sound -> {
            Optional<SoundEvent> found = BuiltInRegistries.SOUND_EVENT.getOptional(sound);
            if (found.isEmpty()) {
                warnings.add(file + ": work_sound: " + sound + " is not a registered sound event; no work sound");
            }
            return found;
        }).orElse(null);
        Int2ObjectOpenHashMap<ResourceKey<TradeSet>> sets = new Int2ObjectOpenHashMap<>();
        List<Identifier> tradeSets = def.tradeSetsOf(id);
        for (int level = 1; level <= tradeSets.size(); level++) {
            sets.put(level, ResourceKey.create(Registries.TRADE_SET, tradeSets.get(level - 1)));
        }
        Holder<PoiType> poi;
        try {
            poi = PoiTypes.register(id, jobSite);
        } catch (IllegalStateException e) {
            return e.getMessage();
        }
        ResourceKey<PoiType> poiKey = poi.unwrapKey().orElse(ResourceKey.create(Registries.POINT_OF_INTEREST_TYPE, id));
        ResourceKey<VillagerProfession> key = ResourceKey.create(Registries.VILLAGER_PROFESSION, id);
        VillagerProfession profession = new VillagerProfession(Component.translatable(ProfessionParser.nameKey(id)),
                holder -> holder.is(poiKey), holder -> holder.is(poiKey), ImmutableSet.copyOf(requested),
                ImmutableSet.copyOf(secondary), workSound, sets);
        Registry.register(BuiltInRegistries.VILLAGER_PROFESSION, key, profession);
        REGISTERED.put(id, new Registered(key, poi, jobSite));
        return null;
    }
}
