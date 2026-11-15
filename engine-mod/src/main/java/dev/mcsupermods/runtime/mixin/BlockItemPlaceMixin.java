package dev.mcsupermods.runtime.mixin;

import dev.mcsupermods.runtime.scripting.ScriptBridges;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.context.BlockPlaceContext;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * The script event {@code block.place} (Script API 1.6, ADR 0096 D3): at the head of {@code BlockItem.place}, before
 * the block is put down, a player's placement fires the event and a cancel returns {@code FAIL}.
 *
 * <p>Why a Mixin (DESIGN section 10 "Mixin policy"): Fabric API 0.165.2 (26.3) and 0.165.4 (26.4) have no block
 * placement event in any module; {@code UseBlockCallback} fires for every right-click on a block, before vanilla knows
 * whether an item will place anything, where it would go or which block it is. {@code BlockItem.place(BlockPlaceContext)}
 * is public and has the same signature on both versions (plan F15). The injection only reads the context and may
 * cancel; it never changes vanilla's own placement. It skips the client (prediction runs there too) and any placer that
 * is not a {@code ServerPlayer} (dispensers, endermen, commands; limit Q17) inside {@link ScriptBridges#placing}.
 * Covered by {@code MsmMixinEventGameTest} and {@code MsmScriptApi16GameTest} on both versions.
 */
@Mixin(BlockItem.class)
abstract class BlockItemPlaceMixin {
    @Inject(method = "place(Lnet/minecraft/world/item/context/BlockPlaceContext;)Lnet/minecraft/world/InteractionResult;",
            at = @At("HEAD"), cancellable = true)
    private void msm$firePlace(BlockPlaceContext context, CallbackInfoReturnable<InteractionResult> cir) {
        if (ScriptBridges.placing((BlockItem) (Object) this, context)) {
            cir.setReturnValue(InteractionResult.FAIL);
        }
    }
}
