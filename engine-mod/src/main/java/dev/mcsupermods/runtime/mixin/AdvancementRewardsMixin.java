package dev.mcsupermods.runtime.mixin;

import dev.mcsupermods.runtime.scripting.MoreEvents;
import net.minecraft.advancements.AdvancementRewards;
import net.minecraft.server.level.ServerPlayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * The script event {@code player.advancement} (Script API 1.7, ADR 0111 D3), the firing half: at the head of
 * {@code AdvancementRewards.grant(ServerPlayer)}, which B525 saw run exactly once when an advancement completes (also for
 * one without rewards), the event fires for the advancement {@link AdvancementMixin} is awarding
 * ({@link MoreEvents#completed}; recipe advancements are left out).
 *
 * <p>Why a Mixin (DESIGN section 10 "Mixin policy"): see {@link AdvancementMixin}; {@code grant} is the one place that runs
 * once per completion, and it is public with the same signature on 26.3 and 26.4, so no {@code MixinVersions} entry. The
 * injection only reads; the rewards are granted by vanilla as before. Covered by {@code MsmScriptApi17GameTest} on both
 * versions.
 */
@Mixin(AdvancementRewards.class)
abstract class AdvancementRewardsMixin {
    @Inject(method = "grant(Lnet/minecraft/server/level/ServerPlayer;)V", at = @At("HEAD"))
    private void msm$grant(ServerPlayer player, CallbackInfo ci) {
        MoreEvents.completed(player);
    }
}
