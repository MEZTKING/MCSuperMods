package dev.mcsupermods.runtime.mixin;

import net.minecraft.advancements.AdvancementRewards;
import net.minecraft.server.level.ServerPlayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * The script event {@code player.advancement} (Script API 1.7, ADR 0111 D3), the firing half: a stub from B526, empty until B533
 * fills it in. At the head of {@code AdvancementRewards.grant(ServerPlayer)}, which runs once per completed advancement.
 *
 * <p>Why a Mixin (DESIGN section 10 "Mixin policy"): see {@link AdvancementMixin}; {@code grant} is the one place that runs
 * once per completion, and it is the same on 26.3 and 26.4, so no {@code MixinVersions} entry. The injection will only read.
 */
@Mixin(AdvancementRewards.class)
abstract class AdvancementRewardsMixin {
    @Inject(method = "grant(Lnet/minecraft/server/level/ServerPlayer;)V", at = @At("HEAD"))
    private void msm$grant(ServerPlayer player, CallbackInfo ci) {}
}
