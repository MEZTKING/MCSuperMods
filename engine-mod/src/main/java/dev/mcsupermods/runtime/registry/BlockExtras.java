package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.components.BlockComponents;
import java.util.IdentityHashMap;
import java.util.Map;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.component.BlockTransformer;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.BlockHitResult;

/**
 * The block components that are not block class behaviour (ADR 0067 D3, D4): {@code msm:flammable} through the
 * {@code Flammability} seam, once per block at start-up, and {@code msm:strippable} through one Fabric
 * {@link UseBlockCallback}. Vanilla stripping is the {@code block_transformer} registry entry {@code minecraft:axe}, which a
 * data pack can only replace whole, so the runtime strips its own blocks before the item's transformer runs.
 */
public final class BlockExtras {
    /** The {@code block_transformer} entry that marks an axe: vanilla axes, project axes and other mods' axes. */
    public static final Identifier AXE_TRANSFORMER = Identifier.withDefaultNamespace("axe");

    /** Block to the id of the block it strips into; resolved on use, so the target may register later. */
    private static final Map<Block, Identifier> STRIPPABLE = new IdentityHashMap<>();
    private static boolean installed;

    private BlockExtras() {}

    /** Applies the block's {@code msm:flammable} and {@code msm:strippable}; called once per registered block. */
    static void apply(Block block, BlockComponents components) {
        components.flammable().ifPresent(f -> Flammability.register(block, f.burnOdds(), f.igniteOdds()));
        components.strippable().ifPresent(s -> STRIPPABLE.put(block, s.into()));
    }

    /** Installs the stripping callback; called once from {@code onInitialize}. */
    public static void register() {
        if (!installed) {
            installed = true;
            UseBlockCallback.EVENT.register(BlockExtras::strip);
        }
    }

    /** The block this one strips into, or null. */
    public static Identifier strippedInto(Block block) {
        return STRIPPABLE.get(block);
    }

    /**
     * Vanilla's axe rule ({@code BlockTransformer.transformBlock}): a main-hand use with a blocking item (a shield) in the
     * off hand passes unless the player sneaks; otherwise the block turns into its target with every shared property
     * copied (the axis of a log), the strip sound plays, the item takes 1 damage and the hand swings (a success). The
     * client predicts the same answer; only the server changes the world.
     */
    private static InteractionResult strip(Player player, Level level, InteractionHand hand, BlockHitResult hit) {
        if (player.isSpectator()) {
            return InteractionResult.PASS;
        }
        BlockPos pos = hit.getBlockPos();
        BlockState state = level.getBlockState(pos);
        Identifier into = STRIPPABLE.get(state.getBlock());
        if (into == null) {
            return InteractionResult.PASS;
        }
        ItemStack stack = player.getItemInHand(hand);
        Holder<BlockTransformer> transformer = stack.get(DataComponents.BLOCK_TRANSFORMER);
        if (transformer == null || !transformer.is(AXE_TRANSFORMER)) {
            return InteractionResult.PASS;
        }
        if (hand == InteractionHand.MAIN_HAND && player.getOffhandItem().has(DataComponents.BLOCKS_ATTACKS)
                && !player.isSecondaryUseActive()) {
            return InteractionResult.PASS;
        }
        if (!BuiltInRegistries.BLOCK.containsKey(into)) {
            return InteractionResult.PASS; // reported once after start-up (MsmRegistrar.checkAfterStart)
        }
        BlockState stripped = copyProperties(state, BuiltInRegistries.BLOCK.getValue(into).defaultBlockState());
        if (!level.isClientSide()) {
            level.setBlock(pos, stripped, Block.UPDATE_ALL_IMMEDIATE);
            level.playSound(null, pos, SoundEvents.AXE_STRIP.value(), SoundSource.BLOCKS, 1.0f, 1.0f);
            level.gameEvent(GameEvent.BLOCK_CHANGE, pos, GameEvent.Context.of(player, stripped));
            stack.hurtAndBreak(1, player, hand.asEquipmentSlot());
        }
        return InteractionResult.SUCCESS;
    }

    /** {@code to} with every property it shares with {@code from} (the same {@code Property}, such as the axis) set to {@code from}'s value. */
    static BlockState copyProperties(BlockState from, BlockState to) {
        BlockState out = to;
        for (Property<?> property : from.getProperties()) {
            if (to.hasProperty(property)) {
                out = copy(from, out, property);
            }
        }
        return out;
    }

    private static <T extends Comparable<T>> BlockState copy(BlockState from, BlockState to, Property<T> property) {
        return to.setValue(property, from.getValue(property));
    }
}
