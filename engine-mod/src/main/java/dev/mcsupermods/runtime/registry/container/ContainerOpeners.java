package dev.mcsupermods.runtime.registry.container;

import dev.mcsupermods.runtime.registry.MsmBlock;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.entity.ContainerOpenersCounter;
import net.minecraft.world.level.block.state.BlockState;

/**
 * The opener counter of a {@link MsmStorageBlockEntity} (ADR 0074 D3), following the barrel's rule: the first player to
 * open the screen sets {@code open=true} and plays {@code open_sound}, the last to close it sets {@code open=false} and
 * plays {@code close_sound}; vanilla's counter schedules a block tick to recheck the players in range, which the block's
 * {@code tick} forwards to {@link MsmStorageBlockEntity#recheckOpen}. Default sounds are the barrel's (the targets'
 * {@code BlockFacts.containerSounds}).
 */
final class ContainerOpeners extends ContainerOpenersCounter {
    private final MsmStorageBlockEntity owner;

    ContainerOpeners(MsmStorageBlockEntity owner) {
        this.owner = owner;
    }

    @Override
    protected void onOpen(Level level, BlockPos pos, BlockState state) {
        playSound(level, pos, sound(owner.spec().openSound(), SoundEvents.BARREL_OPEN));
        setOpen(level, pos, state, true);
    }

    @Override
    protected void onClose(Level level, BlockPos pos, BlockState state) {
        playSound(level, pos, sound(owner.spec().closeSound(), SoundEvents.BARREL_CLOSE));
        setOpen(level, pos, state, false);
    }

    @Override
    protected void openerCountChanged(Level level, BlockPos pos, BlockState state, int previous, int now) {}

    /** Whether {@code player}'s open menu shows this container: any of its slots belongs to the block entity. */
    @Override
    public boolean isOwnContainer(Player player) {
        for (Slot slot : player.containerMenu.slots) {
            if (slot.container == owner) {
                return true;
            }
        }
        return false;
    }

    /** The configured sound when registered (an unknown id is a load error at start-up), else {@code fallback}. */
    static SoundEvent sound(Optional<Identifier> id, SoundEvent fallback) {
        return id.flatMap(BuiltInRegistries.SOUND_EVENT::getOptional).orElse(fallback);
    }

    private static void playSound(Level level, BlockPos pos, SoundEvent sound) {
        level.playSound(null, pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, sound, SoundSource.BLOCKS, 0.5f,
                level.getRandom().nextFloat() * 0.1f + 0.9f);
    }

    private static void setOpen(Level level, BlockPos pos, BlockState state, boolean open) {
        if (state.hasProperty(MsmBlock.OPEN) && state.getValue(MsmBlock.OPEN) != open) {
            level.setBlock(pos, state.setValue(MsmBlock.OPEN, open), Block.UPDATE_ALL);
        }
    }
}
