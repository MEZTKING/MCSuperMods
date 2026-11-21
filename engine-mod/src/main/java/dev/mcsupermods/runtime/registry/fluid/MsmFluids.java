package dev.mcsupermods.runtime.registry.fluid;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.FluidParser;
import dev.mcsupermods.runtime.loader.RawDefinition;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Registry;
import net.minecraft.core.dispenser.DispenseItemBehavior;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.InsideBlockEffectType;
import net.minecraft.world.item.BucketItem;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.DispenserBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FlowingFluid;
import net.minecraft.world.level.material.Fluid;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.material.PushReaction;

/**
 * Project fluids (ADR 0099 D1, D2 and the amendment after B470): per {@code fluid} definition, the fluid (two registry
 * entries on 26.3, {@code <id>} and {@code <ns>:flowing_<path>}, one on 26.4; the {@link MsmFluid} seam), its
 * {@link MsmLiquidBlock} under the definition's id and its {@link BucketItem} {@code <ns>:<path>_bucket}. Flow, sources,
 * draining and buckets are vanilla's {@code FlowingFluid}, {@code LiquidBlock} and {@code BucketItem} behaviour over
 * the definition's numbers; dispensers use vanilla's own filled-bucket behaviour object, looked up after vanilla's
 * bootstrap (this runs from {@code onInitialize}); the bucket goes into vanilla's Tools and Utilities tab. The fluid tags
 * of {@code behaves_like} are data the lowering writes, never registered here.
 *
 * <p>The registrar calls {@link #register} after the particle types and before the blocks; a fluid, liquid block or
 * bucket id that is already taken is an error and that fluid is not registered.
 */
public final class MsmFluids {
    private MsmFluids() {}

    /** The vanilla tab the buckets join (vanilla's buckets are there). */
    static final ResourceKey<CreativeModeTab> BUCKET_TAB =
            ResourceKey.create(Registries.CREATIVE_MODE_TAB, Identifier.withDefaultNamespace("tools_and_utilities"));

    /**
     * The fluids one definition registers: {@code source} is the fluid a bucket holds and the liquid block wraps;
     * {@code still} and {@code flowing} are the two registry entries on 26.3 and both the one entry on 26.4.
     */
    public record Fluids(FlowingFluid source, Fluid still, Fluid flowing) {}

    /**
     * One registered project fluid.
     *
     * @param id         the definition's id: the fluid, the liquid block
     * @param modId      the mod that shipped the definition (the client reads the fluid's pictures from it)
     * @param definition the parsed definition
     * @param fluids     the registered fluids
     * @param block      the liquid block
     * @param bucket     the bucket item
     */
    public record Entry(Identifier id, String modId, FluidDefinition definition, Fluids fluids, MsmLiquidBlock block, BucketItem bucket) {}

    private static final Map<Identifier, Entry> REGISTERED = new LinkedHashMap<>();

    /** Every project fluid registered so far, in registration order. */
    public static List<Entry> registered() {
        return List.copyOf(REGISTERED.values());
    }

    /** The project fluid registered under {@code id}, if any. */
    public static Optional<Entry> get(Identifier id) {
        return Optional.ofNullable(REGISTERED.get(id));
    }

    /** The bucket item id of a fluid: {@code <ns>:<path>_bucket} (ADR 0099 D1). */
    public static Identifier bucketId(Identifier id) {
        return id.withSuffix("_bucket");
    }

    /**
     * The flowing fluid's id on a version that registers two fluids per liquid: {@code flowing_} before the last path
     * segment, so {@code ns:a/b} gives {@code ns:a/flowing_b} (as the lowering's fluid tags name it).
     */
    public static Identifier flowingId(Identifier id) {
        String path = id.getPath();
        int slash = path.lastIndexOf('/');
        return id.withPath(path.substring(0, slash + 1) + "flowing_" + path.substring(slash + 1));
    }

    /**
     * Parses the scanned {@code fluid} definitions and registers their fluids, liquid blocks and buckets; returns the
     * ids registered. Errors and warnings are added to the lists and logged.
     */
    public static List<Identifier> register(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        List<String> newErrors = new ArrayList<>();
        List<String> newWarnings = new ArrayList<>();
        Map<Identifier, FluidDefinition> parsed = FluidParser.parseAll(definitions, newErrors, newWarnings);
        Map<Identifier, RawDefinition> raws = new LinkedHashMap<>();
        for (RawDefinition raw : definitions) {
            if (raw.kind().equals(FluidParser.KIND)) {
                raws.putIfAbsent(raw.id(), raw);
            }
        }
        DispenseItemBehavior dispense = DispenserBlock.DISPENSER_REGISTRY.get(Items.WATER_BUCKET);
        if (!parsed.isEmpty() && dispense == null) {
            newWarnings.add("fluids: vanilla's water bucket has no dispenser behaviour yet; project buckets are dropped by dispensers");
        }
        List<Identifier> ids = new ArrayList<>();
        parsed.forEach((id, def) -> {
            RawDefinition raw = raws.get(id);
            String where = raw == null ? "fluid " + id : raw.describe();
            String clash = clash(id);
            if (clash != null) {
                newErrors.add(where + ": " + clash + "; the fluid is not registered");
                return;
            }
            try {
                Entry entry = registerOne(id, raw == null ? MsmRuntime.MOD_ID : raw.modId(), def, dispense);
                REGISTERED.put(id, entry);
                ids.add(id);
            } catch (RuntimeException e) {
                newErrors.add(where + ": " + e.getMessage());
                MsmRuntime.LOGGER.error("[{}] {}: could not register the fluid", MsmRuntime.MOD_ID, where, e);
            }
        });
        newErrors.forEach(m -> MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, m));
        newWarnings.forEach(m -> MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, m));
        errors.addAll(newErrors);
        warnings.addAll(newWarnings);
        return List.copyOf(ids);
    }

    /** Why {@code id} cannot be registered as a fluid, or null when every id it needs is free. */
    private static String clash(Identifier id) {
        for (Identifier fluid : MsmFluid.registryIds(id)) {
            if (BuiltInRegistries.FLUID.containsKey(fluid)) {
                return "fluid id " + fluid + " is already registered";
            }
        }
        if (BuiltInRegistries.BLOCK.containsKey(id)) {
            return "block id " + id + " (the liquid block) is already registered";
        }
        if (BuiltInRegistries.ITEM.containsKey(bucketId(id))) {
            return "item id " + bucketId(id) + " (the bucket) is already registered";
        }
        return null;
    }

    private static Entry registerOne(Identifier id, String modId, FluidDefinition def, DispenseItemBehavior dispense) {
        ResourceKey<Block> blockKey = ResourceKey.create(Registries.BLOCK, id);
        ResourceKey<Item> bucketKey = ResourceKey.create(Registries.ITEM, bucketId(id));
        // The fluids are made first and reach their block and bucket through these holders, set right below.
        Block[] block = new Block[1];
        Item[] bucket = new Item[1];
        Fluids fluids = MsmFluid.register(id, def, bucketKey, () -> block[0], () -> bucket[0]);
        int light = def.light();
        BlockBehaviour.Properties props = BlockBehaviour.Properties.of()
                .setId(blockKey)
                .mapColor(switch (def.behavesLike()) {
                    case WATER -> MapColor.WATER;
                    case LAVA -> MapColor.FIRE;
                    case NONE -> MapColor.NONE;
                })
                .replaceable()
                .noCollision()
                .strength(100.0f, def.explosionResistance())
                .pushReaction(PushReaction.POPPED)
                .noLootTable()
                .liquid()
                .lightLevel(state -> light);
        MsmLiquidBlock liquid = Registry.register(BuiltInRegistries.BLOCK, blockKey, new MsmLiquidBlock(fluids.source(), props, id, def));
        block[0] = liquid;
        BucketItem item = Registry.register(BuiltInRegistries.ITEM, bucketKey,
                new BucketItem(fluids.source(), new Item.Properties().setId(bucketKey).craftRemainder(Items.BUCKET).stacksTo(1)));
        bucket[0] = item;
        if (dispense != null) {
            DispenserBlock.registerBehavior(item, dispense);
        }
        CreativeModeTabEvents.modifyOutputEvent(BUCKET_TAB).register(output -> output.accept(item));
        return new Entry(id, modId, def, fluids, liquid, item);
    }

    // Behaviour both versions' fluid classes share (the MsmFluid seam calls these).

    /**
     * The fluid's own effects on an entity inside it (ADR 0099 amendment): water-like puts fire out, lava-like sets on
     * fire and then hurts as lava; {@code none} does neither. The fluid tags alone do neither (B470).
     */
    public static void insideEffects(FluidDefinition def, InsideBlockEffectApplier effects) {
        switch (def.behavesLike()) {
            case WATER -> effects.apply(InsideBlockEffectType.EXTINGUISH);
            case LAVA -> {
                effects.apply(InsideBlockEffectType.LAVA_IGNITE);
                effects.runAfter(InsideBlockEffectType.LAVA_IGNITE, Entity::lavaHurt);
            }
            case NONE -> {}
        }
    }

    /** The sound a bucket makes picking the fluid up: lava's for lava-like, else water's. */
    public static SoundEvent pickupSound(FluidDefinition def) {
        return def.behavesLike() == FluidDefinition.Behaviour.LAVA ? SoundEvents.BUCKET_FILL_LAVA : SoundEvents.BUCKET_FILL;
    }

    /** What a flowing fluid does to a block it replaces: the block drops its loot, as when water washes a torch away. */
    public static void beforeDestroyingBlock(LevelAccessor level, BlockPos pos, BlockState state) {
        BlockEntity entity = state.hasBlockEntity() ? level.getBlockEntity(pos) : null;
        Block.dropResources(state, level, pos, entity);
    }
}
