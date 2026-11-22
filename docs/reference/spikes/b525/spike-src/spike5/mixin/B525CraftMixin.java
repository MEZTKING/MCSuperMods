package dev.mcsupermods.runtime.gametest.spike5.mixin;

import dev.mcsupermods.runtime.gametest.spike5.B525Mod;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * B525 spike (throwaway), X33 "crafted": a head injection into {@code ItemStack.onCraftedBy(Player, int)} and
 * {@code onCraftedBySystem(Level)}, which only records. Why a Mixin: Fabric API 0.165.2 (26.3) and 0.165.4 (26.4) have
 * no crafting event in any module (checked: events-interaction, item, recipe, entity-events); both methods are public
 * with the same signatures on both versions. The spike observes which menu paths call them and with which count.
 */
@Mixin(ItemStack.class)
abstract class B525CraftMixin {
    @Inject(method = "onCraftedBy(Lnet/minecraft/world/entity/player/Player;I)V", at = @At("HEAD"))
    private void b525$crafted(Player player, int amount, CallbackInfo ci) {
        ItemStack self = (ItemStack) (Object) this;
        if (!player.level().isClientSide()) {
            B525Mod.EVENTS.add("mixin ItemStack.onCraftedBy " + BuiltInRegistries.ITEM.getKey(self.getItem()) + " amount " + amount
                    + " stack count " + self.getCount() + " by " + player.getName().getString() + " menu "
                    + player.containerMenu.getClass().getSimpleName() + " tick " + player.level().getGameTime());
        }
    }

    @Inject(method = "onCraftedBySystem(Lnet/minecraft/world/level/Level;)V", at = @At("HEAD"))
    private void b525$craftedBySystem(Level level, CallbackInfo ci) {
        ItemStack self = (ItemStack) (Object) this;
        if (!level.isClientSide()) {
            B525Mod.EVENTS.add("mixin ItemStack.onCraftedBySystem " + BuiltInRegistries.ITEM.getKey(self.getItem()) + " count " + self.getCount());
        }
    }
}
