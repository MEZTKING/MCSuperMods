package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.types.PlantFields;
import java.util.function.Consumer;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CandleBlock;
import net.minecraft.world.level.block.DoublePlantBlock;
import net.minecraft.world.level.block.FlowerPotBlock;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.PushReaction;

/**
 * The block classes of the plant and food types {@code cake}, {@code berry_bush}, {@code tall_plant},
 * {@code potted_plant}, {@code vine}, {@code sea_pickle}, {@code carpet}, {@code layers}, {@code cocoa} and
 * {@code candle} (ADR 0094 D1, D2, D4, D5). Each extends the vanilla class of the plan's fact table (F2–F4, F10, F13) and
 * delegates events, triggers and ambient particles to the {@code BlockBehaviourDriver}. The vanilla {@code Properties}
 * the family adds on top of the definition's strength, sound and tool (as {@code BlockTypes.properties} does for the
 * older types; observed behaviour, not copied code):
 * <ul>
 *   <li>{@code cake}: {@code forceSolidOn}, {@code pushReaction(POPPED)}</li>
 *   <li>{@code berry_bush}: {@code randomTicks}, {@code noCollision}, {@code pushReaction(POPPED)}</li>
 *   <li>{@code tall_plant}: {@code noCollision}, {@code offsetType(XZ)}, {@code pushReaction(POPPED)}</li>
 *   <li>{@code potted_plant}: {@code noOcclusion}, {@code pushReaction(POPPED)}</li>
 *   <li>{@code vine}: {@code replaceable}, {@code noCollision}, {@code randomTicks} (when it spreads),
 *       {@code pushReaction(POPPED)}</li>
 *   <li>{@code sea_pickle}: {@code noOcclusion}, {@code pushReaction(POPPED)}, light 6, 9, 12, 15 by count when
 *       waterlogged and 0 dry (B440)</li>
 *   <li>{@code carpet}: nothing of its own</li>
 *   <li>{@code layers}: {@code pushReaction(POPPED)}; no melting (see {@link MsmLayersBlock})</li>
 *   <li>{@code cocoa}: {@code randomTicks}, {@code noOcclusion}, {@code pushReaction(POPPED)}</li>
 *   <li>{@code candle}: {@code noOcclusion}, {@code pushReaction(POPPED)}, vanilla's {@link CandleBlock#LIGHT_EMISSION}
 *       (3 per lit candle)</li>
 * </ul>
 * {@code msm:light_emitter} sets the light of every type except {@code candle} and {@code sea_pickle}, whose light follows
 * their state (ADR 0094 D4; the validators warn).
 */
public final class PlantTypes {
    private PlantTypes() {}

    /**
     * The block for a definition of one of the ten types; called from {@link BlockTypes#create}.
     *
     * @param warn takes a load warning (without the file name)
     * @throws IllegalArgumentException for a {@code potted_plant} whose plant is missing, a tall plant or already potted
     *     (the registrar reports it as a load error for the file)
     */
    public static Block create(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props, Consumer<String> warn) {
        return switch (definition.type()) {
            case CAKE -> {
                PlantFields.Cake cake = (PlantFields.Cake) definition.typeFields();
                cake.onEat().filter(event -> !definition.events().contains(event)).ifPresent(event -> warn.accept("on_eat names event "
                        + event + ", which is not declared in events (or was dropped); nothing fires when a slice is eaten"));
                yield new MsmCakeBlock(id, definition, props.forceSolidOn().pushReaction(PushReaction.POPPED));
            }
            case BERRY_BUSH -> new MsmBerryBushBlock(id, definition,
                    props.randomTicks().noCollision().pushReaction(PushReaction.POPPED));
            case TALL_PLANT -> new MsmTallPlantBlock(id, definition,
                    props.noCollision().offsetType(BlockBehaviour.OffsetType.XZ).pushReaction(PushReaction.POPPED));
            case POTTED_PLANT -> new MsmPottedPlantBlock(id, definition, plant(definition),
                    props.noOcclusion().pushReaction(PushReaction.POPPED));
            case VINE -> {
                BlockBehaviour.Properties p = props.replaceable().noCollision().pushReaction(PushReaction.POPPED);
                yield new MsmVineBlock(id, definition, ((PlantFields.Vine) definition.typeFields()).spreads() ? p.randomTicks() : p);
            }
            case SEA_PICKLE -> new MsmSeaPickleBlock(id, definition,
                    props.noOcclusion().pushReaction(PushReaction.POPPED).lightLevel(MsmSeaPickleBlock::light));
            case CARPET -> new MsmCarpetBlock(id, definition, props);
            case LAYERS -> new MsmLayersBlock(id, definition, props.pushReaction(PushReaction.POPPED));
            case COCOA -> new MsmCocoaBlock(id, definition, props.randomTicks().noOcclusion().pushReaction(PushReaction.POPPED));
            case CANDLE -> new MsmCandleBlock(id, definition,
                    props.noOcclusion().pushReaction(PushReaction.POPPED).lightLevel(CandleBlock.LIGHT_EMISSION));
            default -> throw new IllegalArgumentException("block type '" + definition.type().id() + "' is not a plant or food type");
        };
    }

    /**
     * The registered plant of a {@code potted_plant}: it must exist (the registrar registers potted plants after the other
     * blocks, as stairs), must not be a two-block plant, and must not be potted already, because vanilla's pot keeps one
     * potted block per plant and a second would take over the first (vanilla's own pots included).
     */
    private static Block plant(BlockDefinition definition) {
        Identifier plantId = ((PlantFields.PottedPlant) definition.typeFields()).plant();
        if (!BuiltInRegistries.BLOCK.containsKey(plantId) || BuiltInRegistries.BLOCK.getValue(plantId) == Blocks.AIR) {
            throw new IllegalArgumentException("plant " + plantId + " is not a registered block; the potted plant is skipped");
        }
        Block plant = BuiltInRegistries.BLOCK.getValue(plantId);
        if (plant instanceof DoublePlantBlock) {
            throw new IllegalArgumentException("plant " + plantId + " is two blocks high and cannot be potted; the potted plant is skipped");
        }
        for (Block block : BuiltInRegistries.BLOCK) {
            if (block instanceof FlowerPotBlock pot && pot.getPotted() == plant) {
                throw new IllegalArgumentException("plant " + plantId + " is already potted by " + BuiltInRegistries.BLOCK.getKey(block)
                        + "; the potted plant is skipped");
            }
        }
        return plant;
    }
}
