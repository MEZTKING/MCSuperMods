package dev.mcsupermods.runtime.registry.container;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.RawDefinition;
import java.util.List;
import net.minecraft.world.level.block.Block;

/**
 * The block entity seams of {@code MsmBlock} and {@code MsmRegistrar} (ADR 0074 D2, ADR 0075 D3), so containers (B314) and
 * machines (B316) add their classes here without editing the block class or the registrar body. Every decision is false
 * and every hook a no-op until the {@code msm:container} and {@code msm:machine} Codecs exist.
 */
public final class BlockEntityHooks {
    private static int blockEntityTypes;
    private static int machineRecipeTypes;

    private BlockEntityHooks() {}

    /** Whether {@code definition} is built as a {@link MsmContainerBlock}: {@code msm:container} or {@code msm:machine}. */
    public static boolean wantsBlockEntity(BlockDefinition definition) {
        return false;
    }

    /** Whether the block gets vanilla's {@code open} property (ADR 0074 D3: a container). */
    public static boolean hasOpenProperty(BlockDefinition definition) {
        return false;
    }

    /** Whether the block gets vanilla's {@code lit} property (ADR 0075 D1: a machine). */
    public static boolean hasLitProperty(BlockDefinition definition) {
        return false;
    }

    /**
     * Called by the registrar right after {@code block} is registered and before its item: registers the block entity
     * type (and, for a machine, its recipe type and serialiser) with the block's id. A problem is added to {@code errors}
     * (already prefixed with {@code raw.describe()}) and logged; the block stays registered.
     */
    public static void afterBlockRegistered(RawDefinition raw, BlockDefinition definition, Block block, List<String> errors) {
        // B314 (containers), B316 (machines)
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
