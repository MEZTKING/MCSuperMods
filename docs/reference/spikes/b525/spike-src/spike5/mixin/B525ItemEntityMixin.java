package dev.mcsupermods.runtime.gametest.spike5.mixin;

import dev.mcsupermods.runtime.gametest.spike5.B525Mod;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * B525 spike (throwaway), X33 "picked up": a head and a return injection into {@code ItemEntity.playerTouch(Player)},
 * which only record: the stack's item and count at the head, and how many the player took (head count minus return
 * count, or all of it when the entity is gone). Why a Mixin: Fabric API has no pickup event on either version, and the
 * first run showed {@code ServerPlayer.take} and {@code onItemPickup} are not called for a partial pickup (a nearly full
 * inventory) and see an emptied stack for a whole one. {@code playerTouch} is public with the same signature on 26.3 and
 * 26.4.
 */
@Mixin(ItemEntity.class)
abstract class B525ItemEntityMixin {
    @Unique
    private ItemStack b525$before = ItemStack.EMPTY;

    @Inject(method = "playerTouch(Lnet/minecraft/world/entity/player/Player;)V", at = @At("HEAD"))
    private void b525$head(Player player, CallbackInfo ci) {
        b525$before = ((ItemEntity) (Object) this).getItem().copy();
    }

    @Inject(method = "playerTouch(Lnet/minecraft/world/entity/player/Player;)V", at = @At("RETURN"))
    private void b525$return(Player player, CallbackInfo ci) {
        ItemEntity self = (ItemEntity) (Object) this;
        if (player.level().isClientSide() || b525$before.isEmpty()) {
            return;
        }
        int after = self.isRemoved() ? 0 : self.getItem().getCount();
        int taken = b525$before.getCount() - after;
        if (taken > 0) {
            B525Mod.EVENTS.add("mixin ItemEntity.playerTouch took " + taken + " " + BuiltInRegistries.ITEM.getKey(b525$before.getItem()) + " of "
                    + b525$before.getCount() + ", left " + after + ", removed " + self.isRemoved() + " by " + player.getName().getString()
                    + " tick " + player.level().getGameTime());
        }
    }
}
