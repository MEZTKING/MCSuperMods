package dev.mcsupermods.runtime.gametest.spike5.mixin;

import dev.mcsupermods.runtime.gametest.spike5.B525Mod;
import net.minecraft.advancements.AdvancementHolder;
import net.minecraft.advancements.AdvancementRewards;
import net.minecraft.server.level.ServerPlayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * B525 spike (throwaway), X33 "advancement": a head injection into {@code AdvancementRewards.grant(ServerPlayer)},
 * which only records; the advancement comes from the {@code award} head injection ({@code B525AdvancementMixin}). Why a
 * Mixin: no Fabric grant event (see {@code B525AdvancementMixin}); {@code grant} is public with the same signature on
 * 26.3 and 26.4. The spike checks whether it runs exactly once when an advancement completes, also for an advancement
 * without rewards and one whose reward function revokes it.
 */
@Mixin(AdvancementRewards.class)
abstract class B525RewardsMixin {
    @Inject(method = "grant(Lnet/minecraft/server/level/ServerPlayer;)V", at = @At("HEAD"))
    private void b525$grant(ServerPlayer player, CallbackInfo ci) {
        AdvancementHolder holder = B525Mod.AWARDING.get();
        String id = holder == null ? "unknown" : holder.id().toString();
        if (holder == null || !holder.id().getPath().startsWith("recipes/")) {
            B525Mod.EVENTS.add("mixin AdvancementRewards.grant (completed) " + id + " player " + player.getName().getString());
        }
    }
}
