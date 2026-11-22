package dev.mcsupermods.runtime.gametest.spike5.mixin;

import dev.mcsupermods.runtime.gametest.spike5.B525Mod;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.Consumable;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * B525 spike (throwaway), X33 "ate": a head injection into {@code Consumable.onConsume(Level, LivingEntity, ItemStack)},
 * which only records (the item, whether it is food, the eater). Why a Mixin: Fabric API has no "finished eating" event
 * on either version (only {@code UseItemCallback}, which fires at the start); {@code onConsume} is public with the same
 * signature on 26.3 and 26.4 and runs once per item eaten or drunk, for players and mobs.
 */
@Mixin(Consumable.class)
abstract class B525ConsumeMixin {
    @Inject(method = "onConsume(Lnet/minecraft/world/level/Level;Lnet/minecraft/world/entity/LivingEntity;Lnet/minecraft/world/item/ItemStack;)Lnet/minecraft/world/item/ItemStack;",
            at = @At("HEAD"))
    private void b525$consume(Level level, LivingEntity entity, ItemStack stack, CallbackInfoReturnable<ItemStack> cir) {
        if (!level.isClientSide()) {
            B525Mod.EVENTS.add("mixin Consumable.onConsume " + BuiltInRegistries.ITEM.getKey(stack.getItem()) + " count " + stack.getCount()
                    + " food " + stack.has(DataComponents.FOOD) + " by " + entity.getName().getString() + " tick " + level.getGameTime());
        }
    }
}
