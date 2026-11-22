package dev.mcsupermods.runtime.mixin;

import dev.mcsupermods.runtime.scripting.MoreEvents;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * The script event {@code item.picked_up} (Script API 1.7, ADR 0111 D3): the head of {@code ItemEntity.playerTouch(Player)}
 * keeps a copy of the stack on the ground, and the return fires the event with the number the player took (the count before
 * minus the count left, all of it when the item entity is gone), so a partial pickup into a nearly full inventory counts.
 *
 * <p>Why a Mixin (DESIGN section 10 "Mixin policy"): Fabric API has no pickup event on either version, and B525 saw
 * {@code ServerPlayer.take} and {@code onItemPickup} skipped for a partial pickup and handed an emptied stack for a whole
 * one. {@code playerTouch(Player)} is public and has the same signature on 26.3 and 26.4, so no {@code MixinVersions}
 * entry. The injections only read: the head copies the stack only on the server and only while a script handles the event
 * ({@link MoreEvents#beforePickup}); the copy lives in one field of the item entity until the return clears it. Covered by
 * {@code MsmScriptApi17GameTest} (a whole and a partial pickup from the ground) on both versions.
 */
@Mixin(ItemEntity.class)
abstract class ItemPickupMixin {
    @Unique
    private ItemStack msm$before = ItemStack.EMPTY;

    @Inject(method = "playerTouch(Lnet/minecraft/world/entity/player/Player;)V", at = @At("HEAD"))
    private void msm$pickupHead(Player player, CallbackInfo ci) {
        msm$before = MoreEvents.beforePickup((ItemEntity) (Object) this, player);
    }

    @Inject(method = "playerTouch(Lnet/minecraft/world/entity/player/Player;)V", at = @At("RETURN"))
    private void msm$pickupReturn(Player player, CallbackInfo ci) {
        ItemStack before = msm$before;
        msm$before = ItemStack.EMPTY;
        MoreEvents.pickedUp((ItemEntity) (Object) this, player, before);
    }
}
