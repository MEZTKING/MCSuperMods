package dev.mcsupermods.runtime.mixin;

import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.Consumable;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * The script event {@code player.ate} (Script API 1.7, ADR 0111 D3): a stub from B526, empty until B533 fills it in. At the
 * head of {@code Consumable.onConsume} the event will fire once, when a meal or a drink is finished.
 *
 * <p>Why a Mixin (DESIGN section 10 "Mixin policy"): Fabric API has no event for a finished meal (spike X31, B525). The
 * signature is the same on 26.3 and 26.4, so no {@code MixinVersions} entry. The injection will only read.
 */
@Mixin(Consumable.class)
abstract class ConsumeMixin {
    @Inject(method = "onConsume(Lnet/minecraft/world/level/Level;Lnet/minecraft/world/entity/LivingEntity;Lnet/minecraft/world/item/ItemStack;)Lnet/minecraft/world/item/ItemStack;",
            at = @At("HEAD"))
    private void msm$consumed(Level level, LivingEntity entity, ItemStack stack, CallbackInfoReturnable<ItemStack> cir) {}
}
