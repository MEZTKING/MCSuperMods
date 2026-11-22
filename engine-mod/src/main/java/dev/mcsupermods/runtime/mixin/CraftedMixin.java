package dev.mcsupermods.runtime.mixin;

import dev.mcsupermods.runtime.scripting.MoreEvents;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * The script event {@code item.crafted} (Script API 1.7, ADR 0111 D3): at the head of {@code ItemStack.onCraftedBy(Player,
 * int)} the event fires once per craft with the number made. B525 saw it called once per craft by the 2 by 2 grid, the
 * crafting table (a click on the result, and once per craft of a shift-click) and the furnace's result slot.
 *
 * <p>Why a Mixin (DESIGN section 10 "Mixin policy"): Fabric API 0.165.2 (26.3) and 0.165.4 (26.4) have no event for a
 * stack being crafted in any module (B525 checked events-interaction, item, recipe and entity-events).
 * {@code onCraftedBy(Player, int)} is public and has the same signature on 26.3 and 26.4, so no {@code MixinVersions}
 * entry. The injection only reads: it hands the stack, the player and the amount to {@link MoreEvents#crafted}, which
 * skips the client and copies the stack before any script sees it. Covered by {@code MsmScriptApi17GameTest} (a click on
 * a crafting table's result, a shift-click, the inventory grid) on both versions.
 */
@Mixin(ItemStack.class)
abstract class CraftedMixin {
    @Inject(method = "onCraftedBy(Lnet/minecraft/world/entity/player/Player;I)V", at = @At("HEAD"))
    private void msm$crafted(Player player, int amount, CallbackInfo ci) {
        MoreEvents.crafted((ItemStack) (Object) this, player, amount);
    }
}
