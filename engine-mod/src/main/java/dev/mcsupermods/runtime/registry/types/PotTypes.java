package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import java.util.function.Consumer;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * The blocks of the {@code flower_pot} type (ADR 0103 D2 and its amendment after B503): a project pot with its own plant
 * map, never a vanilla {@code FlowerPotBlock}. A stub from B505: B510 fills it in.
 */
final class PotTypes {
    private PotTypes() {}

    static Block create(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props, Consumer<String> warn) {
        throw new UnsupportedOperationException("block type '" + definition.type().id() + "' is not yet supported (" + id + ")");
    }
}
