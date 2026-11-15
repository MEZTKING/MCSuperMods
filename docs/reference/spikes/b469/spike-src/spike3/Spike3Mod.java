package dev.mcsupermods.runtime.gametest.spike3;

import com.google.common.collect.ImmutableSet;
import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.gametest.SpikePoi;
import dev.mcsupermods.runtime.loader.DefinitionParser;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmEntityRegistrar;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CopyOnWriteArrayList;
import net.fabricmc.api.ModInitializer;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.village.poi.PoiType;
import net.minecraft.world.entity.npc.villager.VillagerProfession;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.trading.TradeSet;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockBehaviour;
import org.apache.logging.log4j.Level;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.core.Logger;
import org.apache.logging.log4j.core.appender.AbstractAppender;
import org.apache.logging.log4j.core.config.Property;

/**
 * B469 spike (throwaway) main entrypoint: a trader mob ({@link Spike3Trader}, {@code Merchant}), a ridden mob with a
 * custom inventory ({@link Spike3Mule}), a shoulder pet ({@link Spike3Pet}), two job site blocks with POI types
 * (through the {@link SpikePoi} seam) and two villager professions (one job site in
 * {@code #minecraft:acquirable_job_site}, one not).
 */
public final class Spike3Mod implements ModInitializer {
    public static final String NS = "msm_spike3";
    public static final List<String> LOG = new CopyOnWriteArrayList<>();
    public static final List<String> INIT = new CopyOnWriteArrayList<>();
    public static Block jobSite;
    public static Block jobSiteUntagged;
    public static PoiType poi;
    public static PoiType poiUntagged;
    public static ResourceKey<PoiType> poiKey;
    public static ResourceKey<PoiType> poiUntaggedKey;
    public static ResourceKey<VillagerProfession> profession;
    public static ResourceKey<VillagerProfession> professionUntagged;
    public static EntityType<Spike3Trader> trader;
    public static EntityType<Spike3Mule> mule;
    public static EntityType<Spike3Pet> pet;

    public static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NS, path);
    }

    public static ResourceKey<TradeSet> tradeSet(String path) {
        return ResourceKey.create(Registries.TRADE_SET, id(path));
    }

    private static Block block(String path) {
        ResourceKey<Block> key = ResourceKey.create(Registries.BLOCK, id(path));
        Block b = Registry.register(BuiltInRegistries.BLOCK, key, new Block(BlockBehaviour.Properties.of().strength(1.0f).setId(key)));
        ResourceKey<Item> itemKey = ResourceKey.create(Registries.ITEM, id(path));
        Registry.register(BuiltInRegistries.ITEM, itemKey, new BlockItem(b, new Item.Properties().useBlockDescriptionPrefix().setId(itemKey)));
        return b;
    }

    @Override
    public void onInitialize() {
        watchLog();
        INIT.add("poi route: " + SpikePoi.route());
        jobSite = block("spike_job_site");
        jobSiteUntagged = block("spike_job_site_untagged");
        poiKey = ResourceKey.create(Registries.POINT_OF_INTEREST_TYPE, id("spike_job_site"));
        poiUntaggedKey = ResourceKey.create(Registries.POINT_OF_INTEREST_TYPE, id("spike_job_site_untagged"));
        try {
            poi = SpikePoi.register(id("spike_job_site"), 1, 1, jobSite);
            INIT.add("poi registered: " + poi + " key " + BuiltInRegistries.POINT_OF_INTEREST_TYPE.getKey(poi));
        } catch (Throwable t) {
            INIT.add("poi FAILED: " + t);
        }
        try {
            poiUntagged = SpikePoi.register(id("spike_job_site_untagged"), 1, 1, jobSiteUntagged);
            INIT.add("poi (untagged) registered: " + poiUntagged);
        } catch (Throwable t) {
            INIT.add("poi (untagged) FAILED: " + t);
        }
        // ADR 0098 D2 refuses a job site that already has a POI type: what vanilla does with a duplicate state.
        try {
            PoiType dup = SpikePoi.register(id("spike_dup_composter"), 1, 1, Blocks.COMPOSTER);
            INIT.add("poi on composter (duplicate) registered?! " + dup);
        } catch (Throwable t) {
            Throwable c = t;
            while (c.getCause() != null && c.getCause() != c) {
                c = c.getCause();
            }
            INIT.add("poi on composter (duplicate) threw: " + t.getClass().getSimpleName() + " root " + c);
        }
        profession = register("spike_job", poiKey);
        professionUntagged = register("spike_job_untagged", poiUntaggedKey);

        trader = entity("trader", """
                {"format": 1, "category": "creature",
                 "components": {"msm:animated_model": {"model": "msm_test:entity/golem", "texture": "msm_test:entity/golem", "renderer": "vanilla"},
                                "msm:movement": {"speed": 0.2}},
                 "size": {"width": 0.6, "height": 1.9}, "spawn_egg": false}""", Spike3Trader::new);
        mule = entity("mule", """
                {"format": 1, "category": "creature", "base": "animal",
                 "components": {"msm:animated_model": {"model": "msm_test:entity/golem", "texture": "msm_test:entity/golem", "renderer": "vanilla"},
                                "msm:movement": {"speed": 0.2},
                                "msm:rideable": {"saddle": false}},
                 "size": {"width": 1.2, "height": 1.4}, "spawn_egg": false}""", Spike3Mule::new);
        pet = entity("pet", """
                {"format": 1, "category": "creature", "base": "animal",
                 "components": {"msm:animated_model": {"model": "msm_test:entity/golem", "texture": "msm_test:entity/golem", "renderer": "vanilla"},
                                "msm:movement": {"speed": 0.3},
                                "msm:tameable": {"chance": 1.0, "items": ["minecraft:bone"]}},
                 "size": {"width": 0.5, "height": 0.5}, "spawn_egg": false}""", Spike3Pet::new);
        INIT.add("entities: " + trader + " " + mule + " " + pet);
    }

    private static ResourceKey<VillagerProfession> register(String path, ResourceKey<PoiType> site) {
        ResourceKey<VillagerProfession> key = ResourceKey.create(Registries.VILLAGER_PROFESSION, id(path));
        Int2ObjectOpenHashMap<ResourceKey<TradeSet>> sets = new Int2ObjectOpenHashMap<>();
        for (int level = 1; level <= 5; level++) {
            sets.put(level, tradeSet("spike_job/level_" + level));
        }
        VillagerProfession value = new VillagerProfession(Component.translatable("entity." + NS + ".villager." + path),
                holder -> holder.is(site), holder -> holder.is(site), ImmutableSet.of(Items.WHEAT), ImmutableSet.of(),
                SoundEvents.VILLAGER_WORK_LIBRARIAN, sets);
        Registry.register(BuiltInRegistries.VILLAGER_PROFESSION, key, value);
        INIT.add("profession registered: " + key.identifier());
        return key;
    }

    /** Registers an entity type through the runtime's own (private) registration, with a parsed definition. */
    @SuppressWarnings("unchecked")
    private static <T extends net.minecraft.world.entity.Mob> EntityType<T> entity(String path, String json,
            EntityType.EntityFactory<T> factory) {
        try {
            EntityDefinition def = DefinitionParser.parseEntity(JsonParser.parseString(json)).definition().orElseThrow();
            Method m = MsmEntityRegistrar.class.getDeclaredMethod("register", Identifier.class, EntityDefinition.class,
                    EntityType.EntityFactory.class);
            m.setAccessible(true);
            return (EntityType<T>) m.invoke(null, id(path), def, factory);
        } catch (Throwable t) {
            INIT.add("entity " + path + " FAILED: " + t);
            throw new IllegalStateException(t);
        }
    }

    private static void watchLog() {
        Logger root = (Logger) LogManager.getRootLogger();
        AbstractAppender watcher = new AbstractAppender("msm-spike3-watch", null, null, true, Property.EMPTY_ARRAY) {
            @Override
            public void append(LogEvent event) {
                String message = event.getMessage().getFormattedMessage();
                String lower = message.toLowerCase(Locale.ROOT);
                if (lower.contains("msm_spike3") || lower.contains("spike_job") || lower.contains("missing texture")
                        || lower.contains("failed to load") || lower.contains("trade") || lower.contains("poi")
                        || lower.contains("passenger") || lower.contains("riding") || lower.contains("moved wrongly")
                        || lower.contains("vehicle") || (event.getLevel().isMoreSpecificThan(Level.WARN) && event.getThrown() != null)) {
                    if (LOG.size() < 2000) {
                        LOG.add(event.getLevel() + " [" + event.getThreadName() + "] " + event.getLoggerName() + ": " + message
                                + (event.getThrown() != null ? " :: " + event.getThrown() : ""));
                    }
                }
            }
        };
        watcher.start();
        root.addAppender(watcher);
    }

    public static List<String> logMatching(String text) {
        List<String> out = new ArrayList<>();
        for (String l : LOG) {
            if (l.toLowerCase(Locale.ROOT).contains(text.toLowerCase(Locale.ROOT))) {
                out.add(l);
            }
        }
        return out;
    }
}
