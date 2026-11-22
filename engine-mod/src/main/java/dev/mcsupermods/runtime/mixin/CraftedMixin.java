package dev.mcsupermods.runtime.mixin;

import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * The script event {@code item.crafted} (Script API 1.7, ADR 0111 D3): a stub from B526, empty until B533 fills it in. At the
 * head of {@code ItemStack.onCraftedBy(Player, int)} the event will fire once per craft (the 2 by 2 grid, the crafting table
 * and furnace results all pass through it).
 *
 * <p>Why a Mixin (DESIGN section 10 "Mixin policy"): Fabric API has no event for a stack being crafted (spike X31, B525).
 * The signature is the same on 26.3 and 26.4, so no {@code MixinVersions} entry. The injection will only read.
 */
@Mixin(ItemStack.class)
abstract class CraftedMixin {
    @Inject(method = "onCraftedBy(Lnet/minecraft/world/entity/player/Player;I)V", at = @At("HEAD"))
    private void msm$crafted(Player player, int amount, CallbackInfo ci) {}
}
