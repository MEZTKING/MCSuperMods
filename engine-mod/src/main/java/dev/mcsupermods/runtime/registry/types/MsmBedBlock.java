package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import dev.mcsupermods.runtime.registry.PoiTypes;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.attribute.BedRule;
import net.minecraft.world.attribute.EnvironmentAttribute;
import net.minecraft.world.attribute.EnvironmentAttributes;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BedBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/**
 * A bed ({@code type: "bed"}, ADR 0094 D1, D2): vanilla {@link BedBlock}'s two halves (the plain block item places the foot
 * and the block places the head beyond it), sleeping, spawn setting, Sweet Dreams and exploding where the rule says, with
 * the definition's {@code colour}. The rule is the environment attribute {@code gameplay/bed_rule} or, with
 * {@code rule: "straw_bed"}, {@code gameplay/straw_bed_rule}; the bed keeps vanilla's bed shape and destroy behaviour
 * either way. Villagers claim and sleep in project beds (ADR 0107 D4 as amended after the B524 spike): the constructor
 * makes every head state a {@code minecraft:home} point of interest through the {@link PoiTypes} seam, which runs during
 * registration, before any world loads. If that fails the bed still works for players and one warning says villagers
 * will not use it.
 */
public class MsmBedBlock extends BedBlock implements DrivenBlock {
    private static boolean homesWarned;

    private final BlockBehaviourDriver driver;
    private final boolean strawRule;

    public MsmBedBlock(Identifier id, BlockDefinition definition, DyeColor colour, boolean strawRule, Properties properties) {
        super(colour, properties);
        this.driver = new BlockBehaviourDriver(id, definition);
        this.strawRule = strawRule;
        becomeHome(id);
    }

    /** Joins vanilla's home point of interest (ADR 0107 D4); warns once when the seam cannot. */
    private void becomeHome(Identifier id) {
        try {
            PoiTypes.addHome(this);
        } catch (IllegalStateException e) {
            if (!homesWarned) {
                homesWarned = true;
                MsmRuntime.LOGGER.warn("[{}] {}: villagers will not claim or sleep in project beds: {}", MsmRuntime.MOD_ID, id,
                        e.getMessage());
            }
        }
    }

    @Override
    public BlockBehaviourDriver driver() {
        return driver;
    }

    /** {@code gameplay/straw_bed_rule} for {@code rule: "straw_bed"}, else vanilla's bed rule. */
    @Override
    protected EnvironmentAttribute<BedRule> getBedEnvironmentAttribute() {
        return strawRule ? EnvironmentAttributes.STRAW_BED_RULE : super.getBedEnvironmentAttribute();
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
        if (level.getBlockState(pos).is(this)) {
            driver.randomTick(level, pos, random);
        }
    }

    @Override
    protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects,
            boolean intersects) {
        super.entityInside(state, level, pos, entity, effects, intersects);
        driver.entityInside(level, pos, entity);
    }

    /** Client: {@code msm:ambient_particles} (ADR 0080 D6), after vanilla's own. */
    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        super.animateTick(state, level, pos, random);
        driver.animateTick(state, level, pos, random);
    }
}
