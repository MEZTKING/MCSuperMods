package dev.mcsupermods.runtime.mixin;

import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;

/**
 * Project fluids on 26.4 (ADR 0099 amendment after B470): at the head of {@code Entity.isInWater} and
 * {@code Entity.isInLava} the entity counts as in water or lava when its fluid height for that tag is above 0, so a
 * water-like or lava-like project fluid lets entities swim and float, not only drown. A stub until B475: no injector
 * yet, so nothing changes.
 *
 * <p>Why a Mixin (DESIGN section 10 "Mixin policy"): Fabric API has no event for an entity's fluid state, and 26.4's
 * single {@code FlowingFluid} class (the {@code MsmFluid} seam) cannot change what {@code isInWater} answers. 26.4
 * only: the class lives in {@code src/mc/26.4/java}, and {@link MsmMixinPlugin} adds it to the config on this
 * version only (26.3 swims through the fluid tag alone).
 */
@Mixin(Entity.class)
abstract class EntityFluidMixin {}
