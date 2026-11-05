package dev.mcsupermods.runtime.events;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

/**
 * Where an event fires.
 *
 * @param level  the server level
 * @param base   the block that {@code set_block_state} offsets are relative to
 * @param origin where sounds, particles and functions run
 * @param player the player involved, or null
 */
public record EventContext(ServerLevel level, BlockPos base, Vec3 origin, Player player) {
    /** A block event: offsets from the block, effects at its centre. */
    public static EventContext forBlock(ServerLevel level, BlockPos pos, Player player) {
        return new EventContext(level, pos.immutable(), Vec3.atCenterOf(pos), player);
    }

    /** An item event: offsets from the block below the player, effects at the player. */
    public static EventContext forItem(ServerLevel level, Player player) {
        return new EventContext(level, player.blockPosition().below(), player.position(), player);
    }
}
