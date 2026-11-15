package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.RawDefinition;
import java.util.List;
import net.minecraft.world.level.block.Block;

/**
 * Companion blocks registered right after their element (ADR 0094 D4): the wall sign and wall hanging sign of a sign,
 * the wall torch of a torch, the attached stem of a stem. A stub until B446: it registers nothing.
 */
public final class Companions {
    private Companions() {}

    /**
     * Registers the companions of {@code block}, the just registered block of {@code definition}; called from the
     * registrar right after the block and before its item. A problem is added to {@code errors}.
     */
    public static void registerAfter(RawDefinition raw, BlockDefinition definition, Block block, List<String> errors) {
        // Nothing to register until B446.
    }
}
