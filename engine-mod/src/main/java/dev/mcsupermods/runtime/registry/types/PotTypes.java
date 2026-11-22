package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.types.PlantFields;
import java.util.function.Consumer;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DoublePlantBlock;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.PushReaction;

/**
 * The blocks of the {@code flower_pot} type and of a {@code potted_plant} whose {@code pot} is a project pot (ADR 0103 D2
 * and its amendment after B503, X4): {@link MsmFlowerPotBlock}, a project pot with its own plant map, never a vanilla
 * {@code FlowerPotBlock}. Both take the properties of {@code potted_plant} ({@code noOcclusion}, {@code pushReaction(POPPED)};
 * see {@link PlantTypes}). The pot's {@code plants} list is the lowering's: each listed plant gets a companion
 * {@code potted_plant} {@code <pot path>_<plant path>} naming the pot, and only potted blocks fill the map at run time, so
 * a plant without one is not taken.
 */
final class PotTypes {
    private PotTypes() {}

    /** The empty pot ({@code type: "flower_pot"}); its map fills as its potted blocks are made. */
    static Block create(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props, Consumer<String> warn) {
        return new MsmFlowerPotBlock(id, definition, Blocks.AIR, null, properties(props));
    }

    /**
     * A {@code potted_plant} in the project pot its {@code pot} names; called from {@link PlantTypes#create} with the
     * potted plant's properties. The registrar makes potted plants after the other blocks, so the pot is registered.
     *
     * @throws IllegalArgumentException when the plant is missing or two blocks high, when {@code pot} is not a registered
     *     project {@code flower_pot}, or when that pot already has a potted block for the plant (the registrar reports a
     *     load error for the file)
     */
    static Block potted(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props) {
        PlantFields.PottedPlant fields = (PlantFields.PottedPlant) definition.typeFields();
        Identifier plantId = fields.plant();
        if (!BuiltInRegistries.BLOCK.containsKey(plantId) || BuiltInRegistries.BLOCK.getValue(plantId) == Blocks.AIR) {
            throw new IllegalArgumentException("plant " + plantId + " is not a registered block; the potted plant is skipped");
        }
        Block plant = BuiltInRegistries.BLOCK.getValue(plantId);
        if (plant instanceof DoublePlantBlock) {
            throw new IllegalArgumentException("plant " + plantId + " is two blocks high and cannot be potted; the potted plant is skipped");
        }
        Identifier potId = fields.pot();
        Block potBlock = BuiltInRegistries.BLOCK.containsKey(potId) ? BuiltInRegistries.BLOCK.getValue(potId) : null;
        if (!(potBlock instanceof MsmFlowerPotBlock pot) || !pot.isEmptyPot()) {
            throw new IllegalArgumentException("pot " + potId + " is not a registered project flower_pot (vanilla's "
                    + PlantFields.PottedPlant.VANILLA_POT + " or a block of type flower_pot); the potted plant is skipped");
        }
        pot.pottedFor(plant).ifPresent(other -> {
            throw new IllegalArgumentException("plant " + plantId + " is already potted in " + potId + " by "
                    + BuiltInRegistries.BLOCK.getKey(other) + "; the potted plant is skipped");
        });
        MsmFlowerPotBlock block = new MsmFlowerPotBlock(id, definition, plant, pot, props);
        pot.addPotted(plant, block);
        return block;
    }

    private static BlockBehaviour.Properties properties(BlockBehaviour.Properties props) {
        return props.noOcclusion().pushReaction(PushReaction.POPPED);
    }
}
