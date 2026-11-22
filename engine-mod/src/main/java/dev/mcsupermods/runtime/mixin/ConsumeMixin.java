package dev.mcsupermods.runtime.mixin;

import dev.mcsupermods.runtime.scripting.MoreEvents;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.Consumable;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * The script event {@code player.ate} (Script API 1.7, ADR 0111 D3): at the head of {@code Consumable.onConsume(Level,
 * LivingEntity, ItemStack)} the event fires once when a player finishes a meal or a drink (B525: once at the end, drinks
 * too; an interrupted meal never gets there).
 *
 * <p>Why a Mixin (DESIGN section 10 "Mixin policy"): Fabric API has no "finished eating" event on either version (only
 * {@code UseItemCallback}, which fires at the start). {@code onConsume} is public and has the same signature on 26.3 and
 * 26.4, so no {@code MixinVersions} entry. The injection only reads: {@link MoreEvents#consumed} skips the client and
 * mobs and copies one of the stack before any script sees it. Covered by {@code MsmScriptApi17GameTest} (a meal eaten to
 * the end and an interrupted one) on both versions.
 */
@Mixin(Consumable.class)
abstract class ConsumeMixin {
    @Inject(method = "onConsume(Lnet/minecraft/world/level/Level;Lnet/minecraft/world/entity/LivingEntity;Lnet/minecraft/world/item/ItemStack;)Lnet/minecraft/world/item/ItemStack;",
            at = @At("HEAD"))
    private void msm$consumed(Level level, LivingEntity entity, ItemStack stack, CallbackInfoReturnable<ItemStack> cir) {
        MoreEvents.consumed(level, entity, stack);
    }
}
