package dev.mcsupermods.runtime.mixin;

import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * The script event {@code item.picked_up} (Script API 1.7, ADR 0111 D3): a stub from B526, empty until B533 fills it in. The
 * head will keep the stack's count and the return will report the difference, so partial pickups count.
 *
 * <p>Why a Mixin (DESIGN section 10 "Mixin policy"): Fabric API has no event for a player taking an item entity (spike X31,
 * B525). {@code ItemEntity.playerTouch(Player)} is the same on 26.3 and 26.4, so no {@code MixinVersions} entry. The
 * injections will only read.
 */
@Mixin(ItemEntity.class)
abstract class ItemPickupMixin {
    @Inject(method = "playerTouch(Lnet/minecraft/world/entity/player/Player;)V", at = @At("HEAD"))
    private void msm$pickupHead(Player player, CallbackInfo ci) {}

    @Inject(method = "playerTouch(Lnet/minecraft/world/entity/player/Player;)V", at = @At("RETURN"))
    private void msm$pickupReturn(Player player, CallbackInfo ci) {}
}
