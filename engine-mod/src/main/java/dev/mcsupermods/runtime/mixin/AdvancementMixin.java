package dev.mcsupermods.runtime.mixin;

import dev.mcsupermods.runtime.scripting.MoreEvents;
import net.minecraft.advancements.AdvancementHolder;
import net.minecraft.server.PlayerAdvancements;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * The script event {@code player.advancement} (Script API 1.7, ADR 0111 D3), the remembering half: the head of
 * {@code PlayerAdvancements.award(AdvancementHolder, String)} pushes the advancement being awarded and the return pops it
 * ({@link MoreEvents#awarding}, {@link MoreEvents#awarded}; a stack per thread, since a reward function may award another
 * advancement inside the first). {@link AdvancementRewardsMixin} fires the event when the advancement completes.
 *
 * <p>Why a Mixin (DESIGN section 10 "Mixin policy"): Fabric's advancement API has only loading events, no grant event
 * (B525). {@code award} is public with the same signature on 26.3 and 26.4 and is where every criterion is granted, by
 * triggers and by {@code /advancement}, so no {@code MixinVersions} entry. The injections only read. Covered by
 * {@code MsmScriptApi17GameTest} (an advancement by its own trigger and by command) on both versions.
 */
@Mixin(PlayerAdvancements.class)
abstract class AdvancementMixin {
    @Inject(method = "award(Lnet/minecraft/advancements/AdvancementHolder;Ljava/lang/String;)Z", at = @At("HEAD"))
    private void msm$awardHead(AdvancementHolder holder, String criterion, CallbackInfoReturnable<Boolean> cir) {
        MoreEvents.awarding(holder);
    }

    @Inject(method = "award(Lnet/minecraft/advancements/AdvancementHolder;Ljava/lang/String;)Z", at = @At("RETURN"))
    private void msm$awardReturn(AdvancementHolder holder, String criterion, CallbackInfoReturnable<Boolean> cir) {
        MoreEvents.awarded();
    }
}
