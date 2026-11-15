package dev.mcsupermods.runtime.gametest.spike4.mixin;

import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * B470 spike (throwaway): on 26.4 a project fluid in #minecraft:water is not "in water" for isInWater. This head
 * injection (on only with -Dmsm.spike4.mixin=true) answers from the fluid tag height, to see whether that alone
 * gives project fluids water's physics.
 */
@Mixin(Entity.class)
public abstract class SpikeEntityFluidMixin {
    private static final boolean ON = Boolean.getBoolean("msm.spike4.mixin");

    @Inject(method = "isInWater", at = @At("HEAD"), cancellable = true)
    private void msmSpike4$isInWater(CallbackInfoReturnable<Boolean> cir) {
        if (ON && ((Entity) (Object) this).getFluidHeight(FluidTags.WATER) > 0) {
            cir.setReturnValue(true);
        }
    }

    @Inject(method = "isInLava", at = @At("HEAD"), cancellable = true)
    private void msmSpike4$isInLava(CallbackInfoReturnable<Boolean> cir) {
        if (ON && ((Entity) (Object) this).getFluidHeight(FluidTags.LAVA) > 0) {
            cir.setReturnValue(true);
        }
    }
}
