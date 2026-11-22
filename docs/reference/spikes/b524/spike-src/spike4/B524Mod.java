package dev.mcsupermods.runtime.gametest.spike4;

import com.google.gson.JsonParser;
import com.mojang.serialization.Codec;
import dev.mcsupermods.runtime.loader.DefinitionParser;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmEntityRegistrar;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.minecraft.core.Registry;
import net.minecraft.core.UUIDUtil;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.EntityDimensions;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.npc.villager.VillagerType;
import net.minecraft.world.entity.vehicle.boat.Boat;
import net.minecraft.world.entity.vehicle.boat.ChestBoat;
import net.minecraft.world.item.BoatItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.MobBucketItem;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.material.Fluids;
import org.apache.logging.log4j.Level;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.core.Logger;
import org.apache.logging.log4j.core.appender.AbstractAppender;
import org.apache.logging.log4j.core.config.Property;

/**
 * B524 spike (throwaway) main entrypoint, namespace {@code msm_b524}: project mobs on the runtime's bodies with the
 * spike's extra behaviour ({@link SpikeMob}, {@link SpikeFish}), a fish bucket, a boat and a chest boat with their
 * items, a villager type mapped to a biome, and a per-player reputation attachment (X15).
 */
public final class B524Mod implements ModInitializer {
    public static final String NS = "msm_b524";
    public static final List<String> INIT = new CopyOnWriteArrayList<>();
    public static final List<String> LOG = new CopyOnWriteArrayList<>();

    public static final AttachmentType<Map<UUID, Integer>> REPUTATION = AttachmentRegistry.create(id("reputation"),
            b -> b.persistent(Codec.unboundedMap(UUIDUtil.STRING_CODEC, Codec.INT)));

    public static EntityType<SpikeMob> hover;
    public static EntityType<SpikeMob> phase;
    public static EntityType<SpikeMob> roost;
    public static EntityType<SpikeMob> collector;
    public static EntityType<SpikeMob> digger;
    public static EntityType<SpikeMob> playDead;
    public static EntityType<SpikeMob> barterer;
    public static EntityType<SpikeMob> workTrader;
    public static EntityType<SpikeMob> dasher;
    public static EntityType<SpikeFish> fish;
    public static Item fishBucket;
    public static EntityType<Boat> boat;
    public static EntityType<ChestBoat> chestBoat;
    public static Item boatItem;
    public static Item chestBoatItem;
    public static ResourceKey<VillagerType> villagerType;
    /** The vanilla biome the spike maps to its villager type (X19); the GameTest fills the test area with it. */
    public static final ResourceKey<Biome> TYPE_BIOME = Biomes.CHERRY_GROVE;

    public static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NS, path);
    }

    private static final String MODEL = "\"msm:animated_model\": {\"model\": \"msm_test:entity/golem\", \"texture\": \"msm_test:entity/golem\", \"renderer\": \"vanilla\"}";

    @Override
    public void onInitialize() {
        watchLog();
        String fly = "{\"format\": 1, \"category\": \"creature\", \"components\": {" + MODEL
                + ", \"msm:movement\": {\"mode\": \"fly\", \"speed\": 0.3}}, \"size\": {\"width\": 0.6, \"height\": 0.9}, \"spawn_egg\": false}";
        String walk = "{\"format\": 1, \"category\": \"creature\", \"components\": {" + MODEL
                + ", \"msm:movement\": {\"speed\": 0.25}}, \"size\": {\"width\": 0.6, \"height\": 0.9}, \"spawn_egg\": false}";
        hover = entity("hover", fly, (t, l) -> new SpikeMob(t, l, SpikeMob.Mode.HOVER));
        phase = entity("phase", fly, (t, l) -> new SpikeMob(t, l, SpikeMob.Mode.PHASE));
        roost = entity("roost", fly, (t, l) -> new SpikeMob(t, l, SpikeMob.Mode.ROOST));
        collector = entity("collector", walk, (t, l) -> new SpikeMob(t, l, SpikeMob.Mode.COLLECT));
        digger = entity("digger", walk, (t, l) -> new SpikeMob(t, l, SpikeMob.Mode.DIG));
        playDead = entity("play_dead", walk.replace("\"msm:movement\"", "\"msm:health\": {\"max\": 20}, \"msm:movement\""),
                (t, l) -> new SpikeMob(t, l, SpikeMob.Mode.PLAY_DEAD));
        barterer = entity("barterer", walk, (t, l) -> new SpikeMob(t, l, SpikeMob.Mode.BARTER));
        workTrader = entity("work_trader", "{\"format\": 1, \"category\": \"creature\", \"components\": {" + MODEL
                + ", \"msm:movement\": {\"speed\": 0.3}, \"msm:trader\": {\"trade_sets\": [{\"trade_set\": \"msm_test:tr_stall/level_1\"}]}},"
                + " \"size\": {\"width\": 0.6, \"height\": 1.8}, \"spawn_egg\": false}", (t, l) -> new SpikeMob(t, l, SpikeMob.Mode.WORK_SITE));
        dasher = entity("dasher", "{\"format\": 1, \"category\": \"creature\", \"components\": {" + MODEL
                + ", \"msm:movement\": {\"speed\": 0.2}, \"msm:rideable\": {\"jump\": 0.7, \"speed\": 1.5, \"saddle\": false}},"
                + " \"size\": {\"width\": 1.2, \"height\": 1.4}, \"spawn_egg\": false}", (t, l) -> new SpikeMob(t, l, SpikeMob.Mode.DASH));
        fish = entity("fish", "{\"format\": 1, \"category\": \"water_creature\", \"components\": {" + MODEL
                + ", \"msm:movement\": {\"mode\": \"swim\", \"speed\": 1.0}}, \"size\": {\"width\": 0.5, \"height\": 0.4}, \"spawn_egg\": false}",
                SpikeFish::new);
        fishBucket = item("fish_bucket", key -> new MobBucketItem(fish, Fluids.WATER, SoundEvents.BUCKET_EMPTY_FISH,
                new Item.Properties().stacksTo(1).component(DataComponents.BUCKET_ENTITY_DATA, CustomData.EMPTY).setId(key)));
        boats();
        villagerType();
        INIT.add("registered: " + String.join(", ", List.of(String.valueOf(BuiltInRegistries.ENTITY_TYPE.getKey(hover)),
                String.valueOf(BuiltInRegistries.ITEM.getKey(fishBucket)), String.valueOf(BuiltInRegistries.ENTITY_TYPE.getKey(boat)),
                String.valueOf(BuiltInRegistries.ENTITY_TYPE.getKey(chestBoat)))));
    }

    private void boats() {
        EntityDimensions oak = EntityTypes.OAK_BOAT.getDimensions();
        EntityDimensions oakChest = EntityTypes.OAK_CHEST_BOAT.getDimensions();
        INIT.add("vanilla oak boat: size " + oak.width() + "x" + oak.height() + " eye " + oak.eyeHeight() + " tracking "
                + EntityTypes.OAK_BOAT.clientTrackingRange() + " update " + EntityTypes.OAK_BOAT.updateInterval()
                + " category " + EntityTypes.OAK_BOAT.getCategory() + "; chest boat " + oakChest.width() + "x" + oakChest.height());
        ResourceKey<EntityType<?>> boatKey = ResourceKey.create(Registries.ENTITY_TYPE, id("spike_boat"));
        ResourceKey<EntityType<?>> chestKey = ResourceKey.create(Registries.ENTITY_TYPE, id("spike_chest_boat"));
        boat = Registry.register(BuiltInRegistries.ENTITY_TYPE, boatKey,
                EntityType.Builder.<Boat>of((t, l) -> new Boat(t, l, () -> boatItem), MobCategory.MISC).noLootTable()
                        .sized(oak.width(), oak.height()).eyeHeight(oak.eyeHeight())
                        .clientTrackingRange(EntityTypes.OAK_BOAT.clientTrackingRange()).build(boatKey));
        chestBoat = Registry.register(BuiltInRegistries.ENTITY_TYPE, chestKey,
                EntityType.Builder.<ChestBoat>of((t, l) -> new ChestBoat(t, l, () -> chestBoatItem), MobCategory.MISC).noLootTable()
                        .sized(oakChest.width(), oakChest.height()).eyeHeight(oakChest.eyeHeight())
                        .clientTrackingRange(EntityTypes.OAK_CHEST_BOAT.clientTrackingRange()).build(chestKey));
        boatItem = item("spike_boat", key -> new BoatItem(boat, new Item.Properties().stacksTo(1).setId(key)));
        chestBoatItem = item("spike_chest_boat", key -> new BoatItem(chestBoat, new Item.Properties().stacksTo(1).setId(key)));
    }

    @SuppressWarnings("unchecked")
    private void villagerType() {
        villagerType = ResourceKey.create(Registries.VILLAGER_TYPE, id("spike"));
        try {
            VillagerType value = Registry.register(BuiltInRegistries.VILLAGER_TYPE, villagerType, new VillagerType());
            INIT.add("villager type registered: " + BuiltInRegistries.VILLAGER_TYPE.getKey(value));
        } catch (Throwable t) {
            INIT.add("villager type FAILED: " + t);
            return;
        }
        try {
            Field f = VillagerType.class.getDeclaredField("BY_BIOME");
            f.setAccessible(true);
            Map<ResourceKey<Biome>, ResourceKey<VillagerType>> map = (Map<ResourceKey<Biome>, ResourceKey<VillagerType>>) f.get(null);
            INIT.add("villager BY_BIOME: " + map.getClass().getName() + " size " + map.size() + " cherry_grove before " + map.get(TYPE_BIOME));
            map.put(TYPE_BIOME, villagerType);
            INIT.add("villager BY_BIOME put ok: cherry_grove now " + map.get(TYPE_BIOME));
        } catch (Throwable t) {
            INIT.add("villager BY_BIOME put FAILED: " + t);
        }
    }

    private static Item item(String path, java.util.function.Function<ResourceKey<Item>, Item> make) {
        ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, id(path));
        return Registry.register(BuiltInRegistries.ITEM, key, make.apply(key));
    }

    /** Registers an entity type through the runtime's own (private) registration, with a parsed definition (as B469). */
    @SuppressWarnings("unchecked")
    private static <T extends Mob> EntityType<T> entity(String path, String json, EntityType.EntityFactory<T> factory) {
        try {
            var parsed = DefinitionParser.parseEntity(JsonParser.parseString(json));
            EntityDefinition def = parsed.definition().orElseThrow(() -> new IllegalStateException(path + ": " + parsed.errors()));
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
        AbstractAppender watcher = new AbstractAppender("msm-b524-watch", null, null, true, Property.EMPTY_ARRAY) {
            @Override
            public void append(LogEvent event) {
                String message = event.getMessage().getFormattedMessage();
                String lower = message.toLowerCase(Locale.ROOT);
                if (lower.contains("msm_b524") || lower.contains("missing texture") || lower.contains("failed to load")
                        || lower.contains("unable to") || lower.contains("not found") || lower.contains("model layer")
                        || (event.getLevel().isMoreSpecificThan(Level.WARN) && event.getThrown() != null)) {
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
