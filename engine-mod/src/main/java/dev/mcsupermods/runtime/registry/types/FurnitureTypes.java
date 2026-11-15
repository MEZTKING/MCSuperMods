package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import java.util.function.Consumer;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * The block classes of the furniture, light and sign types {@code bed}, {@code ladder}, {@code torch}, {@code lantern},
 * {@code chain}, {@code rod}, {@code sign}, {@code hanging_sign}, {@code stem} and {@code scaffolding} (ADR 0094 D1 to
 * D6). A stub until B446: every type is refused with "not yet implemented".
 */
public final class FurnitureTypes {
    private FurnitureTypes() {}

    /**
     * The block for a definition of one of the ten types; called from {@link BlockTypes#create}.
     *
     * @param warn takes a load warning (without the file name)
     * @throws UnsupportedOperationException until B446 (the registrar reports it as a load error for the file)
     */
    public static Block create(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props, Consumer<String> warn) {
        throw new UnsupportedOperationException("block type '" + definition.type().id() + "' is not yet implemented");
    }
}
