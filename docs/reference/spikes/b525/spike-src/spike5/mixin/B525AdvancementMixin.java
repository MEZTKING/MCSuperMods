package dev.mcsupermods.runtime.gametest.spike5.mixin;

import dev.mcsupermods.runtime.gametest.spike5.B525Mod;
import net.minecraft.advancements.AdvancementHolder;
import net.minecraft.server.PlayerAdvancements;
import net.minecraft.server.level.ServerPlayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * B525 spike (throwaway), X33 "advancement": a head and a return injection into {@code PlayerAdvancements.award
 * (AdvancementHolder, String)}, which only record: the head remembers the advancement being awarded (read by
 * {@code B525RewardsMixin}, so it knows which advancement completed) and whether it was done; the return records the
 * criterion, the return value and whether the advancement is done now. Why a Mixin: Fabric's advancement API
 * (fabric-advancement-api-v1) only has loading events (Loaded, Modify, Replace), no grant event; {@code award} is public
 * with the same signature on 26.3 and 26.4 and is where every criterion is granted (triggers and {@code /advancement}).
 */
@Mixin(PlayerAdvancements.class)
abstract class B525AdvancementMixin {
    @Shadow
    private ServerPlayer player;

    @Inject(method = "award(Lnet/minecraft/advancements/AdvancementHolder;Ljava/lang/String;)Z", at = @At("HEAD"))
    private void b525$head(AdvancementHolder holder, String criterion, CallbackInfoReturnable<Boolean> cir) {
        B525Mod.AWARDING.set(holder);
        B525Mod.AWARDING_WAS_DONE.set(((PlayerAdvancements) (Object) this).getOrStartProgress(holder).isDone());
    }

    @Inject(method = "award(Lnet/minecraft/advancements/AdvancementHolder;Ljava/lang/String;)Z", at = @At("RETURN"))
    private void b525$award(AdvancementHolder holder, String criterion, CallbackInfoReturnable<Boolean> cir) {
        PlayerAdvancements self = (PlayerAdvancements) (Object) this;
        B525Mod.AWARDING.remove();
        boolean wasDone = Boolean.TRUE.equals(B525Mod.AWARDING_WAS_DONE.get());
        B525Mod.AWARDING_WAS_DONE.remove();
        if (holder.id().getNamespace().equals(B525Mod.NS) || (cir.getReturnValueZ() && !holder.id().getPath().startsWith("recipes/"))) {
            B525Mod.EVENTS.add("mixin PlayerAdvancements.award " + holder.id() + " criterion " + criterion + " returned " + cir.getReturnValueZ()
                    + " wasDone " + wasDone + " done " + self.getOrStartProgress(holder).isDone() + " player "
                    + (player == null ? "null" : player.getName().getString()));
        }
    }
}
