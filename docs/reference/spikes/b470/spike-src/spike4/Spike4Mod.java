package dev.mcsupermods.runtime.gametest.spike4;

import dev.mcsupermods.runtime.gametest.SpikeFluid;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.CopyOnWriteArrayList;
import net.fabricmc.api.ModInitializer;
import net.minecraft.core.Registry;
import net.minecraft.core.dispenser.DispenseItemBehavior;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.BucketItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.DispenserBlock;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.PushReaction;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.core.Logger;
import org.apache.logging.log4j.core.appender.AbstractAppender;
import org.apache.logging.log4j.core.config.Property;

/** B470 spike (throwaway) main entrypoint: four test fluids, each with its LiquidBlock and BucketItem. */
public final class Spike4Mod implements ModInitializer {
    public static final String NS = "msm_spike4";
    public static final List<Spike4Spec> SPECS = List.of(
            new Spike4Spec("spike_water", "water", 5, 4, 1, true, 0, 0x22CC44, 100f, true, true),
            new Spike4Spec("spike_water_bare", "water", 10, 4, 2, true, 0, 0xFFCC2222, 100f, false, false),
            new Spike4Spec("spike_lava", "lava", 30, 2, 2, false, 15, null, 100f, true, true),
            new Spike4Spec("spike_lava_bare", "lava", 30, 2, 2, false, 15, null, 100f, true, false),
            new Spike4Spec("spike_plain", "none", 5, 4, 1, false, 0, 0xFFFF00, 100f, false, false));
    public static final Map<String, SpikeFluid.Made> FLUIDS = new LinkedHashMap<>();
    public static final Map<String, Block> BLOCKS = new LinkedHashMap<>();
    public static final Map<String, Item> BUCKETS = new LinkedHashMap<>();
    public static final Map<String, Spike4Spec> BY_PATH = new LinkedHashMap<>();
    public static final Map<String, Object> STARTUP = new TreeMap<>();
    public static final List<String> LOG = new CopyOnWriteArrayList<>();

    public static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NS, path);
    }

    @Override
    public void onInitialize() {
        captureLog();
        for (Spike4Spec spec : SPECS) {
            try {
                String path = spec.path();
                BY_PATH.put(path, spec);
                ResourceKey<Item> bucketKey = ResourceKey.create(Registries.ITEM, id(path + "_bucket"));
                ResourceKey<Block> blockKey = ResourceKey.create(Registries.BLOCK, id(path));
                SpikeFluid.Made made = SpikeFluid.register(spec, id(path), bucketKey, () -> BLOCKS.get(path), () -> BUCKETS.get(path));
                FLUIDS.put(path, made);
                BlockBehaviour.Properties props = BlockBehaviour.Properties.of().setId(blockKey).replaceable().noCollision()
                        .strength(100f).pushReaction(PushReaction.POPPED).noLootTable().liquid().lightLevel(s -> spec.light());
                Block block = Registry.register(BuiltInRegistries.BLOCK, blockKey, new Spike4LiquidBlock(made.main(), props));
                BLOCKS.put(path, block);
                Item bucket = Registry.register(BuiltInRegistries.ITEM, bucketKey,
                        new BucketItem(made.still(), new Item.Properties().setId(bucketKey).craftRemainder(Items.BUCKET).stacksTo(1)));
                BUCKETS.put(path, bucket);
                STARTUP.put("register." + path, "ok still=" + BuiltInRegistries.FLUID.getKey(made.still()) + " flowing="
                        + BuiltInRegistries.FLUID.getKey(made.flowing()));
            } catch (Throwable t) {
                STARTUP.put("register." + spec.path() + ".error", t.toString());
                t.printStackTrace(System.out);
            }
        }
        // Dispensers: vanilla's behaviour object for its filled buckets, shared with ours (not for spike_plain, the control).
        DispenseItemBehavior water = DispenserBlock.DISPENSER_REGISTRY.get(Items.WATER_BUCKET);
        DispenseItemBehavior lava = DispenserBlock.DISPENSER_REGISTRY.get(Items.LAVA_BUCKET);
        DispenseItemBehavior empty = DispenserBlock.DISPENSER_REGISTRY.get(Items.BUCKET);
        STARTUP.put("dispenser.waterBucket.class", water == null ? "null" : water.getClass().getName());
        STARTUP.put("dispenser.lavaBucket.class", lava == null ? "null" : lava.getClass().getName());
        STARTUP.put("dispenser.sameObjectWaterLava", water == lava);
        STARTUP.put("dispenser.emptyBucket.class", empty == null ? "null" : empty.getClass().getName());
        for (String path : List.of("spike_water", "spike_water_bare", "spike_lava", "spike_lava_bare")) {
            if (BUCKETS.containsKey(path) && water != null) {
                DispenserBlock.registerBehavior(BUCKETS.get(path), water);
            }
        }
        STARTUP.put("fluidModel", SpikeFluid.MODEL);
        System.out.println("[spike4] startup " + STARTUP);
    }

    private static void captureLog() {
        Logger root = (Logger) LogManager.getRootLogger();
        AbstractAppender appender = new AbstractAppender("spike4", null, null, true, Property.EMPTY_ARRAY) {
            @Override
            public void append(LogEvent event) {
                String text = event.getLevel() + " " + event.getLoggerName() + " " + event.getMessage().getFormattedMessage();
                if (text.contains(NS) || text.contains("spike4") || text.toLowerCase().contains("fluid")) {
                    if (LOG.size() < 400) {
                        LOG.add(text.length() > 600 ? text.substring(0, 600) : text);
                    }
                }
            }
        };
        appender.start();
        root.addAppender(appender);
    }
}
