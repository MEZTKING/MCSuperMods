package dev.mcsupermods.runtime.events;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.player.Player;

/** Where an event fires. {@code player} may be null. */
public record EventContext(ServerLevel level, BlockPos pos, Player player) {}
