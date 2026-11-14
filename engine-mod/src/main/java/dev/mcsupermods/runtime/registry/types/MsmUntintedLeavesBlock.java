package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import dev.mcsupermods.runtime.registry.Leaves;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.UntintedParticleLeavesBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/**
 * Untinted leaves with a falling leaf particle ({@code type: "leaves"} with {@code falling_particle}, ADR 0068 D6), as
 * vanilla's cherry leaves: {@link UntintedParticleLeavesBlock}, no ambient sound (version seam {@link Leaves}).
 */
public class MsmUntintedLeavesBlock extends UntintedParticleLeavesBlock implements DrivenBlock {
    private final BlockBehaviourDriver driver;

    public MsmUntintedLeavesBlock(Identifier id, BlockDefinition definition, float particleChance, ParticleOptions particle,
            Properties properties) {
        super(particleChance, particle, Leaves.NO_AMBIENT_SOUND, properties);
        this.driver = new BlockBehaviourDriver(id, definition);
    }

    @Override
    public BlockBehaviourDriver driver() {
        return driver;
    }

    @Override
    protected boolean isRandomlyTicking(BlockState state) {
        // Vanilla ticks only decaying leaves; msm:on_random_tick fires on every leaves block of this definition.
        return super.isRandomlyTicking(state) || driver.definition().components().onRandomTick().isPresent();
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

    @Override
    protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        super.randomTick(state, level, pos, random);
        if (level.getBlockState(pos).is(this)) { // decaying leaves are gone after super
            driver.randomTick(level, pos, random);
        }
    }

    @Override
    protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects,
            boolean intersects) {
        super.entityInside(state, level, pos, entity, effects, intersects);
        driver.entityInside(level, pos, entity);
    }
}
