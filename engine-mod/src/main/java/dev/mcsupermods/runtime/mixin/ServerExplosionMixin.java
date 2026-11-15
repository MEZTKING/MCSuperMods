package dev.mcsupermods.runtime.mixin;

import dev.mcsupermods.runtime.scripting.ScriptBridges;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.ServerExplosion;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * The script event {@code world.explosion} (Script API 1.6, ADR 0096 D3): at the head of {@code ServerExplosion.explode}
 * the event fires; {@code cancel()} returns at once (no block breaks, no entity is hurt or pushed), {@code keepBlocks()}
 * lets the explosion run but cancels the heads of {@code interactWithBlocks} and {@code createFire}, so entities still
 * take damage and knockback while no block breaks, drops or catches fire.
 *
 * <p>Why a Mixin (DESIGN section 10 "Mixin policy"): Fabric API 0.165.2 (26.3) and 0.165.4 (26.4) have no explosion
 * event in any module. {@code ServerExplosion.explode()} is public and {@code interactWithBlocks(List)} and
 * {@code createFire(List)} private, all with the same signatures on both versions (plan F16). The injections only read
 * the explosion and may cancel; nothing of vanilla's is changed. {@code ServerExplosion} exists only on the server
 * side. Covered by {@code MsmMixinEventGameTest} on both versions.
 */
@Mixin(ServerExplosion.class)
abstract class ServerExplosionMixin {
    /** Set by {@code keepBlocks()} for this explosion; one explosion object explodes once. */
    @Unique
    private boolean msm$keepBlocks;

    @Inject(method = "explode()I", at = @At("HEAD"), cancellable = true)
    private void msm$fireExplosion(CallbackInfoReturnable<Integer> cir) {
        ServerExplosion self = (ServerExplosion) (Object) this;
        ServerLevel level = self.level();
        switch (ScriptBridges.exploding(level, self.center(), self.radius(), self.getDirectSourceEntity())) {
            case CANCEL -> cir.setReturnValue(0);
            case KEEP_BLOCKS -> msm$keepBlocks = true;
            case EXPLODE -> { }
        }
    }

    @Inject(method = "interactWithBlocks(Ljava/util/List;)V", at = @At("HEAD"), cancellable = true)
    private void msm$keepBlocks(List<BlockPos> blocks, CallbackInfo ci) {
        if (msm$keepBlocks) {
            ci.cancel();
        }
    }

    @Inject(method = "createFire(Ljava/util/List;)V", at = @At("HEAD"), cancellable = true)
    private void msm$keepBlocksFromFire(List<BlockPos> blocks, CallbackInfo ci) {
        if (msm$keepBlocks) {
            ci.cancel();
        }
    }
}
