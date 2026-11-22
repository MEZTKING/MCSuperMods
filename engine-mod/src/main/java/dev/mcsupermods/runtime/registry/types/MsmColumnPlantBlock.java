package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.types.GrowingPlantFields;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.CactusBlock;
import net.minecraft.world.level.block.SugarCaneBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.IntegerProperty;
import net.minecraft.world.phys.BlockHitResult;

/**
 * The cane-like and cactus-like column plants ({@code type: "column_plant"}, {@code style} {@code cane} or {@code cactus};
 * ADR 0103 D1, D3 and its amendment): {@link Cane} is vanilla's {@link SugarCaneBlock}, {@link Cactus} vanilla's
 * {@link CactusBlock} (both with {@code randomTicks}, B503). Vanilla's rules are used as they are when the definition
 * keeps vanilla's numbers; otherwise our own rules, written from what B503 observed, take their place:
 * <ul>
 *   <li>Height: vanilla's columns stop at 3, fixed in its random tick. Another {@code max_height} or {@code min_height}
 *       uses our own random tick: the top of a column below its stop height ages 0 to 15 on random ticks and at 15 grows
 *       one block up into air (16 random ticks a block, as vanilla); each column stops at its own height from
 *       {@code min_height} to {@code max_height} ({@link GrowingPlantTypes#stopHeight}). The cactus flower is vanilla's
 *       only with vanilla's height.</li>
 *   <li>Soil: a {@code soil} list (or a cane with {@code needs_water_nearby: false}) uses our own survival rule: the block
 *       below is this plant, or soil (the list, else vanilla's {@code #minecraft:supports_sugar_cane} or
 *       {@code #minecraft:supports_cactus}); a cane also needs water beside its soil when {@code needs_water_nearby}; a
 *       cactus needs no solid block or lava beside it and no liquid above it.</li>
 *   <li>Touch damage: vanilla's cactus hurts by 1; another {@code touch_damage} (or one on a cane) is our own: that much
 *       cactus damage to an entity inside the block.</li>
 * </ul>
 */
public final class MsmColumnPlantBlock {
    private MsmColumnPlantBlock() {}

    /** Vanilla's height of sugar cane and cactus (B503 X1). */
    static final int VANILLA_HEIGHT = 3;

    /** The highest age before a column grows one block (vanilla's {@code AGE} 0 to 15). */
    static final int MAX_AGE = 15;

    /** Our own random tick for a column whose height is not vanilla's. */
    static void grow(Block block, IntegerProperty age, GrowingPlantFields.ColumnPlant fields, BlockState state, ServerLevel level,
            BlockPos pos) {
        if (!level.isEmptyBlock(pos.above())) {
            return;
        }
        BlockPos base = GrowingPlantTypes.base(level, pos, block);
        int height = pos.getY() - base.getY() + 1;
        if (height >= GrowingPlantTypes.stopHeight(base, fields.minHeight(), fields.maxHeight())) {
            return;
        }
        int now = state.getValue(age);
        if (now >= MAX_AGE) {
            BlockPos above = pos.above();
            level.setBlockAndUpdate(above, block.defaultBlockState());
            level.setBlock(pos, state.setValue(age, 0), Block.UPDATE_CLIENTS);
            if (!block.defaultBlockState().canSurvive(level, above)) {
                level.destroyBlock(above, true);
            }
        } else {
            level.setBlock(pos, state.setValue(age, now + 1), Block.UPDATE_CLIENTS);
        }
    }

    static boolean vanillaHeight(GrowingPlantFields.ColumnPlant fields) {
        return fields.maxHeight() == VANILLA_HEIGHT && fields.minHeight() == VANILLA_HEIGHT;
    }

    /** A sugar-cane-like column plant. */
    public static class Cane extends SugarCaneBlock implements DrivenBlock {
        private final BlockBehaviourDriver driver;
        private final GrowingPlantFields.ColumnPlant fields;

        Cane(Identifier id, BlockDefinition definition, Properties props) {
            super(props);
            this.driver = new BlockBehaviourDriver(id, definition);
            this.fields = (GrowingPlantFields.ColumnPlant) definition.typeFields();
        }

        @Override
        public BlockBehaviourDriver driver() {
            return driver;
        }

        /** The definition's fields. */
        public GrowingPlantFields.ColumnPlant fields() {
            return fields;
        }

        @Override
        protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
            if (fields.soil().isEmpty() && fields.needsWaterNearby()) {
                return super.canSurvive(state, level, pos);
            }
            BlockState below = level.getBlockState(pos.below());
            if (below.is(this)) {
                return true;
            }
            return GrowingPlantTypes.isSoil(below, fields.soil(), GrowingPlantTypes.SUPPORTS_SUGAR_CANE)
                    && (!fields.needsWaterNearby() || GrowingPlantTypes.waterBeside(level, pos.below()));
        }

        @Override
        protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
            if (vanillaHeight(fields)) {
                super.randomTick(state, level, pos, random);
            } else {
                grow(this, AGE, fields, state, level, pos);
            }
            if (level.getBlockState(pos).is(this)) {
                driver.randomTick(level, pos, random);
            }
        }

        @Override
        protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects,
                boolean intersects) {
            super.entityInside(state, level, pos, entity, effects, intersects);
            GrowingPlantTypes.hurt(level, entity, fields.touchDamage());
            driver.entityInside(level, pos, entity);
        }

        // Events and triggers: delegated to the driver after vanilla's own behaviour (ADR 0067 D3, D4).

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
            InteractionResult vanilla = super.useWithoutItem(state, level, pos, player, hit);
            InteractionResult own = driver.useWithoutItem(level, pos, player);
            return vanilla.consumesAction() ? vanilla : own;
        }

        @Override
        public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
            driver.stepOn(level, pos, entity);
            super.stepOn(level, pos, state, entity);
        }

        @Override
        public BlockState playerWillDestroy(Level level, BlockPos pos, BlockState state, Player player) {
            driver.playerWillDestroy(level, pos, player);
            return super.playerWillDestroy(level, pos, state, player);
        }

        @Override
        public void setPlacedBy(Level level, BlockPos pos, BlockState state, LivingEntity placer, ItemStack stack) {
            super.setPlacedBy(level, pos, state, placer, stack);
            driver.setPlacedBy(level, pos, placer);
        }

        /** Client: {@code msm:ambient_particles} (ADR 0080 D6), after vanilla's own. */
        @Override
        public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
            super.animateTick(state, level, pos, random);
            driver.animateTick(state, level, pos, random);
        }
    }

    /** A cactus-like column plant. */
    public static class Cactus extends CactusBlock implements DrivenBlock {
        private final BlockBehaviourDriver driver;
        private final GrowingPlantFields.ColumnPlant fields;

        Cactus(Identifier id, BlockDefinition definition, Properties props) {
            super(props);
            this.driver = new BlockBehaviourDriver(id, definition);
            this.fields = (GrowingPlantFields.ColumnPlant) definition.typeFields();
        }

        @Override
        public BlockBehaviourDriver driver() {
            return driver;
        }

        /** The definition's fields. */
        public GrowingPlantFields.ColumnPlant fields() {
            return fields;
        }

        @Override
        protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
            if (fields.soil().isEmpty() && !fields.needsWaterNearby()) {
                return super.canSurvive(state, level, pos);
            }
            for (Direction side : Direction.Plane.HORIZONTAL) {
                BlockPos at = pos.relative(side);
                if (level.getBlockState(at).isSolid() || level.getFluidState(at).is(FluidTags.LAVA)) {
                    return false;
                }
            }
            if (level.getBlockState(pos.above()).liquid()) {
                return false;
            }
            BlockState below = level.getBlockState(pos.below());
            if (below.is(this)) {
                return true;
            }
            return GrowingPlantTypes.isSoil(below, fields.soil(), GrowingPlantTypes.SUPPORTS_CACTUS)
                    && (!fields.needsWaterNearby() || GrowingPlantTypes.waterBeside(level, pos.below()));
        }

        @Override
        protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
            if (vanillaHeight(fields)) {
                super.randomTick(state, level, pos, random);
            } else {
                grow(this, AGE, fields, state, level, pos);
            }
            if (level.getBlockState(pos).is(this)) {
                driver.randomTick(level, pos, random);
            }
        }

        /** Vanilla's damage of 1, or our own {@code touch_damage}; then {@code msm:on_entity_inside}. */
        @Override
        protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects,
                boolean intersects) {
            if (fields.touchDamage() == 1f) {
                super.entityInside(state, level, pos, entity, effects, intersects);
            } else {
                GrowingPlantTypes.hurt(level, entity, fields.touchDamage());
            }
            driver.entityInside(level, pos, entity);
        }

        // Events and triggers: delegated to the driver after vanilla's own behaviour (ADR 0067 D3, D4).

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
            InteractionResult vanilla = super.useWithoutItem(state, level, pos, player, hit);
            InteractionResult own = driver.useWithoutItem(level, pos, player);
            return vanilla.consumesAction() ? vanilla : own;
        }

        @Override
        public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
            driver.stepOn(level, pos, entity);
            super.stepOn(level, pos, state, entity);
        }

        @Override
        public BlockState playerWillDestroy(Level level, BlockPos pos, BlockState state, Player player) {
            driver.playerWillDestroy(level, pos, player);
            return super.playerWillDestroy(level, pos, state, player);
        }

        @Override
        public void setPlacedBy(Level level, BlockPos pos, BlockState state, LivingEntity placer, ItemStack stack) {
            super.setPlacedBy(level, pos, state, placer, stack);
            driver.setPlacedBy(level, pos, placer);
        }

        /** Client: {@code msm:ambient_particles} (ADR 0080 D6), after vanilla's own. */
        @Override
        public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
            super.animateTick(state, level, pos, random);
            driver.animateTick(state, level, pos, random);
        }
    }
}
