package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.gametest.spike4.Spike4Spec;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;
import net.minecraft.client.Camera;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.material.FlowingFluid;
import net.minecraft.world.level.material.Fluid;
import net.minecraft.world.level.material.FluidState;

/** B470 spike (throwaway) seam, 26.3: a liquid is two registered fluids, a source and a flowing one. */
public final class SpikeFluid {
    public static final String MODEL = "two_fluids";

    public record Made(Fluid still, Fluid flowing, FlowingFluid main) {
    }

    private SpikeFluid() {
    }

    private static final class Pair {
        Source source;
        Flowing flowing;
    }

    public static Made register(Spike4Spec spec, Identifier id, ResourceKey<Item> bucketKey, Supplier<Block> block, Supplier<Item> bucket) {
        Pair pair = new Pair();
        pair.source = new Source(spec, pair, block, bucket);
        pair.flowing = new Flowing(spec, pair, block, bucket);
        Registry.register(BuiltInRegistries.FLUID, id, pair.source);
        Registry.register(BuiltInRegistries.FLUID, id.withPrefix("flowing_"), pair.flowing);
        return new Made(pair.source, pair.flowing, pair.source);
    }

    public static FluidState source(Made made) {
        return made.main().getSource(false);
    }

    public static FluidState flowing(Made made, int amount, boolean falling) {
        return made.main().getFlowing(amount, falling);
    }

    public static boolean isOf(FluidState state, Made made) {
        return state.getType() == made.still() || state.getType() == made.flowing();
    }

    public static String fogType(Camera camera) {
        return String.valueOf(camera.getFluidInCamera());
    }

    /** Facts readable through public getters on this version. */
    public static Map<String, Object> facts(Fluid fluid) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("bucket", String.valueOf(BuiltInRegistries.ITEM.getKey(fluid.getBucket())));
        out.put("pickupSound", fluid.getPickupSound().map(s -> s.location().toString()).orElse("none"));
        out.put("explosionResistance", fluid.defaultFluidState().getExplosionResistance());
        out.put("stateProperties", fluid.getStateDefinition().getProperties().toString());
        out.put("states", fluid.getStateDefinition().getPossibleStates().size());
        return out;
    }

    private abstract static class Base extends FlowingFluid {
        final Spike4Spec spec;
        final Pair pair;
        final Supplier<Block> block;
        final Supplier<Item> bucket;

        Base(Spike4Spec spec, Pair pair, Supplier<Block> block, Supplier<Item> bucket) {
            this.spec = spec;
            this.pair = pair;
            this.block = block;
            this.bucket = bucket;
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
            return spec.infinite();
        }

        @Override
        protected void beforeDestroyingBlock(LevelAccessor level, BlockPos pos, BlockState state) {
            BlockEntity be = state.hasBlockEntity() ? level.getBlockEntity(pos) : null;
            Block.dropResources(state, level, pos, be);
        }

        @Override
        protected int getSlopeFindDistance(LevelReader level) {
            return spec.slope();
        }

        @Override
        protected int getDropOff(LevelReader level) {
            return spec.dropOff();
        }

        @Override
        public int getTickDelay(LevelReader level) {
            return spec.tickDelay();
        }

        @Override
        protected boolean canBeReplacedWith(FluidState state, BlockGetter level, BlockPos pos, Fluid other, Direction direction) {
            return direction == Direction.DOWN && !isSame(other);
        }

        @Override
        protected float getExplosionResistance() {
            return spec.resistance();
        }

        @Override
        protected BlockState createLegacyBlock(FluidState state) {
            return block.get().defaultBlockState().setValue(LiquidBlock.LEVEL, getLegacyLevel(state));
        }

        @Override
        protected void entityInside(net.minecraft.world.level.Level level, BlockPos pos, net.minecraft.world.entity.Entity entity,
                net.minecraft.world.entity.InsideBlockEffectApplier effects) {
            if (!spec.effects()) {
                return;
            }
            if ("lava".equals(spec.behaves())) {
                effects.apply(net.minecraft.world.entity.InsideBlockEffectType.LAVA_IGNITE);
                effects.runAfter(net.minecraft.world.entity.InsideBlockEffectType.LAVA_IGNITE, net.minecraft.world.entity.Entity::lavaHurt);
            } else if ("water".equals(spec.behaves())) {
                effects.apply(net.minecraft.world.entity.InsideBlockEffectType.EXTINGUISH);
            }
        }

        @Override
        public Optional<SoundEvent> getPickupSound() {
            return Optional.of("lava".equals(spec.behaves()) ? SoundEvents.BUCKET_FILL_LAVA : SoundEvents.BUCKET_FILL);
        }
    }

    private static final class Source extends Base {
        Source(Spike4Spec spec, Pair pair, Supplier<Block> block, Supplier<Item> bucket) {
            super(spec, pair, block, bucket);
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

    private static final class Flowing extends Base {
        Flowing(Spike4Spec spec, Pair pair, Supplier<Block> block, Supplier<Item> bucket) {
            super(spec, pair, block, bucket);
        }

        @Override
        protected void createFluidStateDefinition(StateDefinition.Builder<Fluid, FluidState> builder) {
            super.createFluidStateDefinition(builder);
            builder.add(LEVEL);
        }

        @Override
        public boolean isSource(FluidState state) {
            return false;
        }

        @Override
        public int getAmount(FluidState state) {
            return state.getValue(LEVEL);
        }
    }
}
