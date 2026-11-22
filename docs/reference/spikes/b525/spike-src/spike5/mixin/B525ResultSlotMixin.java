package dev.mcsupermods.runtime.gametest.spike5.mixin;

import dev.mcsupermods.runtime.gametest.spike5.B525Mod;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.ResultSlot;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * B525 spike (throwaway), X33 "crafted": a head injection into {@code ResultSlot.onTake(Player, ItemStack)} (the
 * crafting grid's result slot only, inventory and crafting table), which only records. Why a Mixin: no Fabric crafting
 * event (see {@code B525CraftMixin}); compared with the {@code ItemStack.onCraftedBy} route to see which one sees a
 * shift-click and with which count. Same public signature on both versions.
 */
@Mixin(ResultSlot.class)
abstract class B525ResultSlotMixin {
    @Inject(method = "onTake(Lnet/minecraft/world/entity/player/Player;Lnet/minecraft/world/item/ItemStack;)V", at = @At("HEAD"))
    private void b525$take(Player player, ItemStack carried, CallbackInfo ci) {
        if (!player.level().isClientSide()) {
            B525Mod.EVENTS.add("mixin ResultSlot.onTake " + BuiltInRegistries.ITEM.getKey(carried.getItem()) + " count " + carried.getCount()
                    + " by " + player.getName().getString() + " tick " + player.level().getGameTime());
        }
    }
}
