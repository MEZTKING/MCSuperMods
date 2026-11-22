package dev.mcsupermods.runtime.registry.fluid;

import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
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
import net.minecraft.world.level.material.Fluid;
import net.minecraft.world.level.material.FluidState;

/**
 * Version seam (ADR 0038 D2, ADR 0099 D2), 26.3: a liquid is two registered fluids. This class is the still (source)
 * fluid, registered as {@code <id>}; {@link MsmFlowingFluid} is the flowing one, registered as {@code <ns>:flowing_<path>}
 * ({@link MsmFluids#flowingId}). Both read the same {@link FluidDefinition}: flow numbers, infinite sources, explosion
 * resistance, the pickup sound and the entity effects by {@code behaves_like}; everything else is vanilla's
 * {@code FlowingFluid}. Swimming, drowning and fog come from the fluid tags (data), not from this class. 26.4's
 * {@code MsmFluid} is one class over {@code Fluid.Properties} with the same static API.
 */
public class MsmFluid extends FlowingFluid {
    /** How this version registers a liquid (the target fact {@code BlockFacts.fluidModel}). */
    public static final String MODEL = "two_fluids";

    /** The two fluids of one liquid, linked once both exist. */
    static final class Pair {
        MsmFluid source;
        MsmFlowingFluid flowing;
    }

    final FluidDefinition definition;
    final Pair pair;
    final Supplier<Block> block;
    final Supplier<Item> bucket;

    MsmFluid(FluidDefinition definition, Pair pair, Supplier<Block> block, Supplier<Item> bucket) {
        this.definition = definition;
        this.pair = pair;
        this.block = block;
        this.bucket = bucket;
    }

    /** The registry ids one liquid takes on this version: {@code <id>} and {@code <ns>:flowing_<path>}. */
    public static List<Identifier> registryIds(Identifier id) {
        return List.of(id, MsmFluids.flowingId(id));
    }

    /**
     * Registers the source and the flowing fluid of {@code id}. {@code block} and {@code bucket} are read only once the
     * game asks (after the registrar has made them); {@code bucketKey} is unused on this version.
     */
    public static MsmFluids.Fluids register(Identifier id, FluidDefinition definition, ResourceKey<Item> bucketKey, Supplier<Block> block,
            Supplier<Item> bucket) {
        Pair pair = new Pair();
        pair.source = new MsmFluid(definition, pair, block, bucket);
        pair.flowing = new MsmFlowingFluid(definition, pair, block, bucket);
        Registry.register(BuiltInRegistries.FLUID, id, pair.source);
        Registry.register(BuiltInRegistries.FLUID, MsmFluids.flowingId(id), pair.flowing);
        return new MsmFluids.Fluids(pair.source, pair.source, pair.flowing);
    }

    /** The source state of a liquid's fluid. */
    public static FluidState sourceState(FlowingFluid fluid) {
        return fluid.getSource(false);
    }

    /** A flowing state of {@code amount} (1 to 7) on level ground. */
    public static FluidState flowingState(FlowingFluid fluid, int amount) {
        return fluid.getFlowing(amount, false);
    }

    @Override
    public Fluid getFlowing() {
        return pair.flowing;
    }

    @Override
    public Fluid getSource() {
        return pair.source;
    }

    @Override
    public Item getBucket() {
        return bucket.get();
    }

    @Override
    public boolean isSame(Fluid fluid) {
        return fluid == pair.source || fluid == pair.flowing;
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
    protected boolean canBeReplacedWith(FluidState state, BlockGetter level, BlockPos pos, Fluid other, Direction direction) {
        return direction == Direction.DOWN && !isSame(other);
    }

    @Override
    protected float getExplosionResistance() {
        return definition.explosionResistance();
    }

    @Override
    protected BlockState createLegacyBlock(FluidState state) {
        return block.get().defaultBlockState().setValue(LiquidBlock.LEVEL, getLegacyLevel(state));
    }

    @Override
    protected void entityInside(Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects) {
        MsmFluids.insideEffects(definition, effects);
    }

    @Override
    public Optional<SoundEvent> getPickupSound() {
        return Optional.of(MsmFluids.pickupSound(definition));
    }

    @Override
    public boolean isSource(FluidState state) {
        return true;
    }

    @Override
    public int getAmount(FluidState state) {
        return 8;
    }
}
