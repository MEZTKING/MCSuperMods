package dev.mcsupermods.runtime.registry.fluid;

import java.util.List;
import java.util.function.Supplier;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FlowingFluid;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.material.Fluids;

/**
 * Version seam (ADR 0038 D2, ADR 0099 D2 and its amendment), 26.4-snapshot-7: a liquid is one registered
 * {@code FlowingFluid} over {@code Fluid.Properties}, its source and flowing states together. It reads the
 * {@link FluidDefinition}: flow numbers, infinite sources and the entity effects by {@code behaves_like}; the properties
 * carry the bucket, the explosion resistance, the pickup sound and, copied from vanilla water or lava by
 * {@code behaves_like}, drag, the fall distance multiplier and the fog ({@code none} keeps the properties' defaults).
 * Swimming needs {@code #minecraft:water} and {@code #minecraft:swimmable} (data) and {@code EntityFluidMixin}. 26.3's
 * {@code MsmFluid} has the same static API over two classes.
 */
public final class MsmFluid extends FlowingFluid {
    /** How this version registers a liquid (the target fact {@code BlockFacts.fluidModel}). */
    public static final String MODEL = "one_fluid";

    private final FluidDefinition definition;
    private final Supplier<Block> block;

    private MsmFluid(Properties properties, FluidDefinition definition, Supplier<Block> block) {
        super(properties);
        this.definition = definition;
        this.block = block;
    }

    /** The registry ids one liquid takes on this version: only {@code <id>}. */
    public static List<Identifier> registryIds(Identifier id) {
        return List.of(id);
    }

    /**
     * Registers the fluid of {@code id}. {@code block} is read only once the game asks (after the registrar has made it);
     * the bucket is named by {@code bucketKey}, so {@code bucket} is unused on this version.
     */
    public static MsmFluids.Fluids register(Identifier id, FluidDefinition definition, ResourceKey<Item> bucketKey, Supplier<Block> block,
            Supplier<Item> bucket) {
        Properties properties = Properties.of()
                .bucketItem(bucketKey)
                .explosionResistance(definition.explosionResistance())
                .soundEvent(MsmFluids.pickupSound(definition));
        FlowingFluid vanilla = switch (definition.behavesLike()) {
            case WATER -> Fluids.WATER;
            case LAVA -> Fluids.LAVA;
            case NONE -> null;
        };
        if (vanilla != null) {
            properties.drag(vanilla.getDrag()).fallDistanceMultiplier(vanilla.getFallDistanceMultiplier()).fogType(vanilla.getFogType());
        }
        MsmFluid fluid = new MsmFluid(properties, definition, block);
        Registry.register(BuiltInRegistries.FLUID, id, fluid);
        return new MsmFluids.Fluids(fluid, fluid, fluid);
    }

    /** The source state of a liquid's fluid. */
    public static FluidState sourceState(FlowingFluid fluid) {
        return fluid.getSource();
    }

    /** A flowing state of {@code amount} (1 to 7). */
    public static FluidState flowingState(FlowingFluid fluid, int amount) {
        return fluid.getFlowing(amount);
    }

    @Override
    protected boolean canConvertToSource(ServerLevel level) {
        return definition.flow().infinite();
    }

    @Override
    protected void beforeDestroyingBlock(LevelAccessor level, BlockPos pos, BlockState state) {
        MsmFluids.beforeDestroyingBlock(level, pos, state);
    }

    /**
     * Falling into another liquid a mixing rule names (ADR 0108 D1 as amended, B525: vanilla's lava falling into water)
     * makes the rule's {@code flowing} block there ({@link FluidMixing#fallInto}); everything else is vanilla's.
     */
    @Override
    protected void spreadTo(LevelAccessor level, BlockPos pos, BlockState state, Direction direction, FluidState fluid) {
        if (!FluidMixing.fallInto(block.get(), level, pos, direction)) {
            super.spreadTo(level, pos, state, direction, fluid);
        }
    }

    @Override
    protected int getSlopeFindDistance(LevelReader level) {
        return definition.flow().slopeDistance();
    }

    @Override
    protected int getDropOff(LevelReader level) {
        return definition.flow().dropOff();
    }

    @Override
    public int getTickDelay(LevelReader level) {
        return definition.flow().tickDelay();
    }

    @Override
    protected boolean canBeReplacedWith(FluidState state, BlockGetter level, BlockPos pos, FluidState other, Direction direction) {
        return direction == Direction.DOWN && other.getType() != this;
    }

    @Override
    protected BlockState createLegacyBlock(FluidState state) {
        return block.get().defaultBlockState().setValue(LiquidBlock.LEVEL, getLegacyLevel(state));
    }

    @Override
    protected void entityInside(Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects) {
        MsmFluids.insideEffects(definition, effects);
    }
}
