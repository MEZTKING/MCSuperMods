package dev.mcsupermods.runtime.gametest.spike5.mixin;

import dev.mcsupermods.runtime.gametest.spike5.B525Mod;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.item.ItemEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * B525 spike (throwaway), X33 "picked up": head injections into {@code ServerPlayer.take(Entity, int)} and
 * {@code ServerPlayer.onItemPickup(ItemEntity)}, which only record. Why a Mixin: Fabric API has no item pickup event on
 * either version; both methods are public overrides with the same signatures on 26.3 and 26.4. The spike observes the
 * count handed to {@code take} against the stack left on the ground (a partial pickup into a nearly full inventory).
 */
@Mixin(ServerPlayer.class)
abstract class B525PickupMixin {
    @Inject(method = "take(Lnet/minecraft/world/entity/Entity;I)V", at = @At("HEAD"))
    private void b525$take(Entity entity, int amount, CallbackInfo ci) {
        ServerPlayer self = (ServerPlayer) (Object) this;
        String what = entity instanceof ItemEntity item ? BuiltInRegistries.ITEM.getKey(item.getItem().getItem()) + " left on ground "
                + item.getItem().getCount() : BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()).toString();
        B525Mod.EVENTS.add("mixin ServerPlayer.take " + what + " amount " + amount + " by " + self.getName().getString() + " tick "
                + self.level().getGameTime());
    }

    @Inject(method = "onItemPickup(Lnet/minecraft/world/entity/item/ItemEntity;)V", at = @At("HEAD"))
    private void b525$pickup(ItemEntity item, CallbackInfo ci) {
        ServerPlayer self = (ServerPlayer) (Object) this;
        B525Mod.EVENTS.add("mixin ServerPlayer.onItemPickup " + BuiltInRegistries.ITEM.getKey(item.getItem().getItem()) + " count "
                + item.getItem().getCount() + " by " + self.getName().getString());
    }
}
