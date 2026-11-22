package dev.mcsupermods.runtime.mixin;

import net.minecraft.advancements.AdvancementHolder;
import net.minecraft.server.PlayerAdvancements;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * The script event {@code player.advancement} (Script API 1.7, ADR 0111 D3): a stub from B526, empty until B533 fills it in. The
 * head will remember the advancement being awarded and whether it was done; {@link AdvancementRewardsMixin} fires the event
 * once it is complete, and the return clears the state.
 *
 * <p>Why a Mixin (DESIGN section 10 "Mixin policy"): Fabric API has no event for an advancement being completed (spike X31,
 * B525). {@code PlayerAdvancements.award} is the same on 26.3 and 26.4, so no {@code MixinVersions} entry. The injections
 * will only read.
 */
@Mixin(PlayerAdvancements.class)
abstract class AdvancementMixin {
    @Inject(method = "award(Lnet/minecraft/advancements/AdvancementHolder;Ljava/lang/String;)Z", at = @At("HEAD"))
    private void msm$awardHead(AdvancementHolder holder, String criterion, CallbackInfoReturnable<Boolean> cir) {}

    @Inject(method = "award(Lnet/minecraft/advancements/AdvancementHolder;Ljava/lang/String;)Z", at = @At("RETURN"))
    private void msm$awardReturn(AdvancementHolder holder, String criterion, CallbackInfoReturnable<Boolean> cir) {}
}
