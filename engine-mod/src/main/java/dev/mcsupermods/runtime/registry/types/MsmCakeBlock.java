package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.types.PlantFields;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.stats.Stats;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.CakeBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.BlockHitResult;

/**
 * A cake ({@code type: "cake"}, ADR 0094 D2, D5): vanilla {@link CakeBlock}'s seven slices ({@code bites}), shape, survival
 * and comparator output (14 for a whole cake, two less per slice eaten). Eating is our own: a slice gives the definition's
 * {@code food} (default 2 and 0.1, as vanilla's), counts the {@code eat_cake_slice} statistic, sends the eat game event,
 * takes the last slice away with the block and then fires {@code on_eat} with the player as self and other. A project cake
 * takes no candles (limit Q4): any held item goes on to the empty-hand use, so a {@code #minecraft:candles} item never
 * makes vanilla's candle cake (B440 measured that vanilla's cake code would).
 */
public class MsmCakeBlock extends CakeBlock implements DrivenBlock {
    private final BlockBehaviourDriver driver;

    private final PlantFields.Cake fields;

    public MsmCakeBlock(Identifier id, BlockDefinition definition, Properties properties) {
        super(properties);
        this.driver = new BlockBehaviourDriver(id, definition);
        this.fields = (PlantFields.Cake) definition.typeFields();
    }

    @Override
    public BlockBehaviourDriver driver() {
        return driver;
    }

    /** No candle cakes (ADR 0094 D5): every held item is handed on to {@link #useWithoutItem}. */
    @Override
    protected InteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player, InteractionHand hand,
            BlockHitResult hit) {
        return InteractionResult.TRY_WITH_EMPTY_HAND;
    }

    @Override
    protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
        InteractionResult eaten = eatSlice(state, level, pos, player);
        InteractionResult own = driver.useWithoutItem(level, pos, player);
        return eaten.consumesAction() ? eaten : own;
    }

    /** One slice for a player who can eat (hungry, or in creative); {@code PASS} otherwise. */
    private InteractionResult eatSlice(BlockState state, Level level, BlockPos pos, Player player) {
        if (!player.canEat(false)) {
            return InteractionResult.PASS;
        }
        if (!(level instanceof ServerLevel server)) {
            return InteractionResult.SUCCESS;
        }
        player.awardStat(Stats.EAT_CAKE_SLICE);
        player.getFoodData().eat(fields.food().nutrition(), fields.food().saturation());
        server.gameEvent(player, GameEvent.EAT, pos);
        int bites = state.getValue(BITES);
        if (bites < MAX_BITES) {
            server.setBlock(pos, state.setValue(BITES, bites + 1), Block.UPDATE_ALL);
        } else {
            server.removeBlock(pos, false);
            server.gameEvent(player, GameEvent.BLOCK_DESTROY, pos);
        }
        fields.onEat().ifPresent(event -> EventRunner.fire(driver.id(), driver.definition().events(), event,
                EventContext.forBlock(server, pos, player)));
        return InteractionResult.SUCCESS;
    }

    // Events and triggers: delegated to the driver after vanilla's own behaviour (ADR 0067 D3, D4).

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
