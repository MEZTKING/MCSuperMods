package dev.mcsupermods.runtime.scripting;

import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.PlayerBlockBreakEvents;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionResult;

/**
 * Fabric API events to script events (ADR 0031 D4, spike subset): the host lives from {@code SERVER_STARTING}
 * to {@code SERVER_STOPPED}; {@code block.interact} from {@code UseBlockCallback} ({@code cancel()} returns
 * {@code FAIL}), {@code block.break} from {@code PlayerBlockBreakEvents.BEFORE} ({@code cancel()} returns
 * false), {@code server.tick} from {@code END_SERVER_TICK}. Server side only.
 */
public final class ScriptBridges {
    private ScriptBridges() {}

    public static void register() {
        ServerLifecycleEvents.SERVER_STARTING.register(ScriptHost::start);
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> ScriptHost.stop());

        UseBlockCallback.EVENT.register((player, level, hand, hit) -> {
            ScriptHost host = ScriptHost.current();
            if (host == null || level.isClientSide() || !(player instanceof ServerPlayer sp)
                    || !(level instanceof ServerLevel sl) || sl.getServer() != host.server()) {
                return InteractionResult.PASS;
            }
            boolean cancelled = host.fireBlockEvent("block.interact", sl, hit.getBlockPos(),
                    sl.getBlockState(hit.getBlockPos()), sp, hand);
            return cancelled ? InteractionResult.FAIL : InteractionResult.PASS;
        });

        PlayerBlockBreakEvents.BEFORE.register((level, player, pos, state, blockEntity) -> {
            ScriptHost host = ScriptHost.current();
            if (host == null || level.isClientSide() || !(player instanceof ServerPlayer sp)
                    || !(level instanceof ServerLevel sl) || sl.getServer() != host.server()) {
                return true;
            }
            return !host.fireBlockEvent("block.break", sl, pos, state, sp, null);
        });

        ServerTickEvents.END_SERVER_TICK.register(server -> {
            ScriptHost host = ScriptHost.current();
            if (host != null && host.server() == server) {
                host.tick();
            }
        });
    }
}
