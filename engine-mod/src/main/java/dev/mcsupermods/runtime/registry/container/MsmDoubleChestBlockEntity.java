package dev.mcsupermods.runtime.registry.container;

import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.ContainerUser;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.entity.ChestBlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.ChestType;

/**
 * The block entity of an {@link MsmDoubleChestBlock} (ADR 0104 D4): vanilla's {@link ChestBlockEntity} (27 slots, loot
 * tables, custom names, {@code lock}, the opener counter and vanilla's saved shape) with its own type. Its default name
 * is the block's; {@code on_open} and {@code on_close} fire with the player as self and other, once per opening of a
 * joined pair (from the half that is not {@code right}: vanilla opens both halves of the six-row menu).
 */
public class MsmDoubleChestBlockEntity extends ChestBlockEntity {
    public MsmDoubleChestBlockEntity(BlockEntityType<?> type, BlockPos pos, BlockState state) {
        super(type, pos, state);
    }

    @Override
    protected Component getDefaultName() {
        return Component.translatable(getBlockState().getBlock().getDescriptionId());
    }

    @Override
    public void startOpen(ContainerUser user) {
        boolean fires = firesFor(user);
        super.startOpen(user);
        if (fires && getBlockState().getBlock() instanceof MsmDoubleChestBlock block) {
            fire(block, block.spec().onOpen(), (Player) user.getLivingEntity());
        }
    }

    @Override
    public void stopOpen(ContainerUser user) {
        boolean fires = firesFor(user);
        super.stopOpen(user);
        if (fires && getBlockState().getBlock() instanceof MsmDoubleChestBlock block) {
            fire(block, block.spec().onClose(), (Player) user.getLivingEntity());
        }
    }

    private boolean firesFor(ContainerUser user) {
        LivingEntity entity = user.getLivingEntity();
        BlockState state = getBlockState();
        return !isRemoved() && entity instanceof Player && !entity.isSpectator()
                && !(state.hasProperty(ChestBlock.TYPE) && state.getValue(ChestBlock.TYPE) == ChestType.RIGHT);
    }

    private void fire(MsmDoubleChestBlock block, Optional<Identifier> event, Player player) {
        if (event.isPresent() && getLevel() instanceof ServerLevel server) {
            EventRunner.fire(block.id(), block.driver().definition().events(), event.get(), EventContext.forBlock(server, getBlockPos(), player));
        }
    }
}
