package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import java.util.function.Consumer;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * The blocks of the {@code growing_plant}, {@code column_plant}, {@code multiface} and {@code dripleaf} types (ADR 0103 D1,
 * D3 and its amendment after B503). A stub from B505: B509 fills it in.
 */
final class GrowingPlantTypes {
    private GrowingPlantTypes() {}

    static Block create(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props, Consumer<String> warn) {
        throw new UnsupportedOperationException("block type '" + definition.type().id() + "' is not yet supported (" + id + ")");
    }
}
