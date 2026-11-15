package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.gametest.spike4.Spike4Spec;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;
import net.minecraft.client.Camera;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FlowingFluid;
import net.minecraft.world.level.material.Fluid;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.material.Fluids;

/** B470 spike (throwaway) seam, 26.4-snapshot-7: a liquid is one registered fluid over {@code Fluid.Properties}. */
public final class SpikeFluid {
    public static final String MODEL = "one_fluid";

    public record Made(Fluid still, Fluid flowing, FlowingFluid main) {
    }

    private SpikeFluid() {
    }

    public static Made register(Spike4Spec spec, Identifier id, ResourceKey<Item> bucketKey, Supplier<Block> block, Supplier<Item> bucket) {
        Fluid.Properties props = Fluid.Properties.of().bucketItem(bucketKey).explosionResistance(spec.resistance())
                .soundEvent("lava".equals(spec.behaves()) ? SoundEvents.BUCKET_FILL_LAVA : SoundEvents.BUCKET_FILL);
        if (spec.copyVanilla()) {
            FlowingFluid vanilla = "lava".equals(spec.behaves()) ? Fluids.LAVA : Fluids.WATER;
            props.drag(vanilla.getDrag()).fallDistanceMultiplier(vanilla.getFallDistanceMultiplier()).fogType(vanilla.getFogType());
        }
        One fluid = new One(props, spec, block);
        Registry.register(BuiltInRegistries.FLUID, id, fluid);
        return new Made(fluid, fluid, fluid);
    }

    public static FluidState source(Made made) {
        return made.main().getSource();
    }

    public static FluidState flowing(Made made, int amount, boolean falling) {
        // 26.4 has no FALLING property; a falling state is not asked for here (isFalling is derived).
        return made.main().getFlowing(amount);
    }

    public static boolean isOf(FluidState state, Made made) {
        return state.getType() == made.main();
    }

    public static String fogType(Camera camera) {
        return String.valueOf(camera.getFogType());
    }

    /** Facts readable through public getters on this version (Fluid.Properties values included). */
    public static Map<String, Object> facts(Fluid fluid) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("bucket", String.valueOf(fluid.getBucket()));
        out.put("pickupSound", fluid.getPickupSound().map(s -> s.location().toString()).orElse("none"));
        out.put("explosionResistance", fluid.defaultFluidState().getExplosionResistance());
        out.put("drag", fluid.getDrag());
        out.put("fallDistanceMultiplier", fluid.getFallDistanceMultiplier());
        out.put("fogType", String.valueOf(fluid.getFogType()));
        out.put("stateProperties", fluid.getStateDefinition().getProperties().toString());
        out.put("states", fluid.getStateDefinition().getPossibleStates().size());
        out.put("defaultState", fluid.defaultFluidState().toString());
        return out;
    }

    private static final class One extends FlowingFluid {
        final Spike4Spec spec;
        final Supplier<Block> block;

        One(Fluid.Properties props, Spike4Spec spec, Supplier<Block> block) {
            super(props);
            this.spec = spec;
            this.block = block;
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
        protected boolean canBeReplacedWith(FluidState state, BlockGetter level, BlockPos pos, FluidState other, Direction direction) {
            return direction == Direction.DOWN && other.getType() != this;
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
        protected BlockState createLegacyBlock(FluidState state) {
            return block.get().defaultBlockState().setValue(LiquidBlock.LEVEL, getLegacyLevel(state));
        }
    }
}
