package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.types.PlantFields;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SweetBerryBushBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.BlockHitResult;

/**
 * A berry bush ({@code type: "berry_bush"}, ADR 0094 D2, D5): vanilla {@link SweetBerryBushBlock}'s four ages, growth,
 * bone meal, shapes and (with {@code hurts}, the default) the slowing and hurting of entities inside. The harvest and the
 * pick-block item are our own, because vanilla's give sweet berries for any bush (B440): using the bush at age 2 drops
 * {@code harvest.ripe} of {@code berry}, at age 3 {@code harvest.full}, and sets it back to age 1; pick block gives one
 * {@code berry}. A berry that is not a registered item drops nothing (the validators report it).
 */
public class MsmBerryBushBlock extends SweetBerryBushBlock implements DrivenBlock {
    private final BlockBehaviourDriver driver;

    private final PlantFields.BerryBush fields;

    public MsmBerryBushBlock(Identifier id, BlockDefinition definition, Properties properties) {
        super(properties);
        this.driver = new BlockBehaviourDriver(id, definition);
        this.fields = (PlantFields.BerryBush) definition.typeFields();
    }

    @Override
    public BlockBehaviourDriver driver() {
        return driver;
    }

    @Override
    protected boolean isRandomlyTicking(BlockState state) {
        // Vanilla stops at the last age; msm:on_random_tick keeps firing there.
        return super.isRandomlyTicking(state) || driver.definition().components().onRandomTick().isPresent();
    }

    /** The berry item, air when {@code berry} is not registered. Looked up at use: the berry is often this block's own item. */
    public Item berry() {
        return BuiltInRegistries.ITEM.getValue(fields.berry());
    }

    @Override
    protected ItemStack getCloneItemStack(LevelReader level, BlockPos pos, BlockState state, boolean includeData) {
        Item berry = berry();
        return berry == Items.AIR ? ItemStack.EMPTY : new ItemStack(berry);
    }

    @Override
    protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
        InteractionResult harvested = harvest(state, level, pos, player);
        InteractionResult own = driver.useWithoutItem(level, pos, player);
        return harvested.consumesAction() ? harvested : own;
    }

    /** Vanilla's slowing and hurting only with {@code hurts}; then {@code msm:on_entity_inside}. */
    @Override
    protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects,
            boolean intersects) {
        if (fields.hurts()) {
            super.entityInside(state, level, pos, entity, effects, intersects);
        }
        driver.entityInside(level, pos, entity);
    }

    /** A harvest at age 2 or 3; {@code PASS} on a younger bush. */
    private InteractionResult harvest(BlockState state, Level level, BlockPos pos, Player player) {
        int age = state.getValue(AGE);
        if (age < 2) {
            return InteractionResult.PASS;
        }
        if (level instanceof ServerLevel server) {
            PlantFields.CountRange range = age >= MAX_AGE ? fields.harvest().full() : fields.harvest().ripe();
            int count = range.low() + server.getRandom().nextInt(range.high() - range.low() + 1);
            Item berry = berry();
            if (count > 0 && berry != Items.AIR) {
                popResource(server, pos, new ItemStack(berry, count));
            }
            server.playSound(null, pos, SoundEvents.SWEET_BERRY_BUSH_PICK_BERRIES, SoundSource.BLOCKS, 1.0f,
                    0.8f + server.getRandom().nextFloat() * 0.4f);
            BlockState picked = state.setValue(AGE, 1);
            server.setBlock(pos, picked, Block.UPDATE_CLIENTS);
            server.gameEvent(GameEvent.BLOCK_CHANGE, pos, GameEvent.Context.of(player, picked));
        }
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

    /** Client: {@code msm:ambient_particles} (ADR 0080 D6), after vanilla's own. */
    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        super.animateTick(state, level, pos, random);
        driver.animateTick(state, level, pos, random);
    }
}
