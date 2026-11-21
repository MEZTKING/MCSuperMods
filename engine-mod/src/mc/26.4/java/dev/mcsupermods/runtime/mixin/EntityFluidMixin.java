package dev.mcsupermods.runtime.mixin;

import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Project fluids on 26.4 (ADR 0099 amendment after B470): at the head of {@code Entity.isInWater} and
 * {@code Entity.isInLava} the entity counts as in water or lava when its fluid height for {@code #minecraft:water} or
 * {@code #minecraft:lava} is above 0, and at the head of {@code Entity.isUnderWater} it counts as under water when its
 * eyes are in {@code #minecraft:water}. So a water-like or lava-like project fluid lets entities swim, float and sink as
 * in vanilla's liquid, not only drown. Each injection only ever answers true where the tag says so, and otherwise lets
 * vanilla answer; for vanilla water and lava the answer is the same as vanilla's (B470 measured both).
 *
 * <p>{@code isUnderWater} needs its own injection: with only the first two, B470 measured the server answering false
 * for an entity whose eyes were in a project water-like fluid while the client answered true (mobs' and players' "under
 * water" rules then disagree between the sides).
 *
 * <p>Why a Mixin (DESIGN section 10 "Mixin policy"): Fabric API 0.165.4 (26.4) has no event or registry for an entity's
 * fluid state ({@code fabric-content-registries-v0}'s {@code FluidBehavior} exists for 26.3 only), and 26.4's single
 * {@code FlowingFluid} class (the {@code MsmFluid} seam) cannot change what these {@code Entity} methods answer. 26.4
 * only: the class lives in {@code src/mc/26.4/java}, and {@link MsmMixinPlugin} adds it to the config on this version
 * only (26.3 swims through the fluid tag alone). Covered by {@code MsmFluidGameTest} on both versions (swimming, floating,
 * {@code isUnderWater}, lava).
 */
@Mixin(Entity.class)
abstract class EntityFluidMixin {
    @Inject(method = "isInWater()Z", at = @At("HEAD"), cancellable = true)
    private void msm$isInWater(CallbackInfoReturnable<Boolean> cir) {
        if (((Entity) (Object) this).getFluidHeight(FluidTags.WATER) > 0) {
            cir.setReturnValue(true);
        }
    }

    @Inject(method = "isInLava()Z", at = @At("HEAD"), cancellable = true)
    private void msm$isInLava(CallbackInfoReturnable<Boolean> cir) {
        if (((Entity) (Object) this).getFluidHeight(FluidTags.LAVA) > 0) {
            cir.setReturnValue(true);
        }
    }

    @Inject(method = "isUnderWater()Z", at = @At("HEAD"), cancellable = true)
    private void msm$isUnderWater(CallbackInfoReturnable<Boolean> cir) {
        if (((Entity) (Object) this).isEyeInFluid(FluidTags.WATER)) {
            cir.setReturnValue(true);
        }
    }
}
