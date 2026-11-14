package dev.mcsupermods.runtime.registry.container;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.RawDefinition;
import dev.mcsupermods.runtime.registry.machine.MachineRecipes;
import dev.mcsupermods.runtime.registry.machine.MsmMachineBlockEntity;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.entity.BlockEntityType;

/**
 * The block entity seams of {@code MsmBlock} and {@code MsmRegistrar} (ADR 0074 D2, ADR 0075 D3), so containers (B314) and
 * machines (B316) add their classes here without editing the block class or the registrar body. Containers (B314): a
 * definition with {@code msm:container} is an {@link MsmContainerBlock} with vanilla's {@code open} property and one
 * {@link BlockEntityType} registered with the block's own id; a keep-contents block's item is an
 * {@link MsmContainerBlockItem}. Machines (B316): a definition with {@code msm:machine} is an {@link MsmContainerBlock}
 * with vanilla's {@code lit} property, one {@link BlockEntityType} of {@link MsmMachineBlockEntity} and one recipe type
 * and serialiser ({@link MachineRecipes}), all with the block's own id.
 */
public final class BlockEntityHooks {
    private static int blockEntityTypes;
    private static int machineRecipeTypes;

    private BlockEntityHooks() {}

    /** Whether {@code definition} is built as a {@link MsmContainerBlock}: {@code msm:container} or {@code msm:machine}. */
    public static boolean wantsBlockEntity(BlockDefinition definition) {
        return definition.components().container().isPresent() || definition.components().machine().isPresent();
    }

    /** Whether the block gets vanilla's {@code open} property (ADR 0074 D3: every container, whatever its layout). */
    public static boolean hasOpenProperty(BlockDefinition definition) {
        return definition.components().container().isPresent();
    }

    /** Whether the block gets vanilla's {@code lit} property (ADR 0075 D1: a machine). */
    public static boolean hasLitProperty(BlockDefinition definition) {
        return definition.components().machine().isPresent();
    }

    /**
     * Called by the registrar right after {@code block} is registered and before its item: registers the block entity
     * type (and, for a machine, its recipe type and serialiser) with the block's id. A problem is added to {@code errors}
     * (already prefixed with {@code raw.describe()}) and logged; the block stays registered.
     */
    public static void afterBlockRegistered(RawDefinition raw, BlockDefinition definition, Block block, List<String> errors) {
        if (block instanceof MsmContainerBlock containerBlock && definition.components().container().isPresent()) {
            registerContainer(raw, containerBlock, definition.components().container().get(), errors);
        }
        if (block instanceof MsmContainerBlock machineBlock && definition.components().machine().isPresent()) {
            registerMachine(raw, machineBlock, definition.components().machine().get(), errors);
        }
    }

    /**
     * One {@link BlockEntityType} of {@link MsmMachineBlockEntity} and one recipe type and serialiser, all with the
     * block's id (ADR 0075 D2, D3). An id already in any of the three registries is a load error: the block stays
     * registered without its machine (no block entity, no {@code lit} changes).
     */
    private static void registerMachine(RawDefinition raw, MsmContainerBlock block, BlockComponents.Machine spec, List<String> errors) {
        Identifier id = raw.id();
        if (BuiltInRegistries.BLOCK_ENTITY_TYPE.containsKey(id) || !MachineRecipes.isFree(id)) {
            error(errors, raw.describe() + ": components: msm:machine: block entity type, recipe type or recipe serializer " + id
                    + " is already registered; the block registers without its machine");
            return;
        }
        MachineRecipes.register(id);
        countMachineRecipeType();
        BlockEntityType<MsmMachineBlockEntity> type = new BlockEntityType<>(
                (pos, state) -> new MsmMachineBlockEntity(block.machineType(), pos, state, id, spec), Set.of(block));
        Registry.register(BuiltInRegistries.BLOCK_ENTITY_TYPE, id, type);
        block.attachMachine(type);
        countBlockEntityType();
    }

    /**
     * One {@link BlockEntityType} for the container block, with the block's id (ADR 0074 D2, limit C8). An id already in
     * the block entity type registry is a load error: the block stays registered without its container. An unknown
     * {@code open_sound} or {@code close_sound} is a load error and the barrel's sound plays instead.
     */
    private static void registerContainer(RawDefinition raw, MsmContainerBlock block, BlockComponents.Container spec, List<String> errors) {
        checkSound(raw, "open_sound", spec.openSound(), errors);
        checkSound(raw, "close_sound", spec.closeSound(), errors);
        Identifier id = raw.id();
        if (BuiltInRegistries.BLOCK_ENTITY_TYPE.containsKey(id)) {
            error(errors, raw.describe() + ": components: msm:container: block entity type " + id
                    + " is already registered; the block registers without its container");
            return;
        }
        BlockEntityType<MsmStorageBlockEntity> type = new BlockEntityType<>(
                (pos, state) -> new MsmStorageBlockEntity(block.storageType(), pos, state, spec), Set.of(block));
        Registry.register(BuiltInRegistries.BLOCK_ENTITY_TYPE, id, type);
        block.attachStorage(type);
        countBlockEntityType();
    }

    private static void checkSound(RawDefinition raw, String field, Optional<Identifier> sound, List<String> errors) {
        if (sound.isPresent() && !BuiltInRegistries.SOUND_EVENT.containsKey(sound.get())) {
            error(errors, raw.describe() + ": components: msm:container: " + field + ": unknown sound " + sound.get()
                    + "; the barrel's sound plays instead");
        }
    }

    private static void error(List<String> errors, String message) {
        errors.add(message);
        MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message);
    }

    /**
     * The block item of {@code block} (ADR 0074 D6): an {@link MsmContainerBlockItem} for a keep-contents container with
     * its block entity, else a plain {@link BlockItem}. The registrar calls this for every type but doors.
     */
    public static BlockItem blockItem(Block block, Item.Properties properties) {
        return block instanceof MsmContainerBlock c && c.keepsContents()
                ? new MsmContainerBlockItem(block, properties)
                : new BlockItem(block, properties);
    }

    /** Counts one registered block entity type for the registrar's log line. */
    public static void countBlockEntityType() {
        blockEntityTypes++;
    }

    /** Counts one registered machine recipe type for the registrar's log line. */
    public static void countMachineRecipeType() {
        machineRecipeTypes++;
    }

    /** Block entity types registered so far. */
    public static int blockEntityTypes() {
        return blockEntityTypes;
    }

    /** Machine recipe types registered so far. */
    public static int machineRecipeTypes() {
        return machineRecipeTypes;
    }
}
