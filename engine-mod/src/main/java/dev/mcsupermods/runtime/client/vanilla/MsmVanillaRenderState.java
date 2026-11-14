package dev.mcsupermods.runtime.client.vanilla;

import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.AnimationState;

/**
 * What {@link MsmVanillaModel} needs of one runtime mob for one frame (ADR 0072 D2), filled by
 * {@link MsmVanillaRenderer#extractRenderState}. Walk position and speed, {@code ageScale} (the baby scale) and
 * {@code isBaby} come from vanilla's {@link LivingEntityRenderState}.
 */
public class MsmVanillaRenderState extends LivingEntityRenderState {
    /** The full texture path ({@code ns:textures/....png}): the variant's texture, else {@code msm:animated_model}'s. */
    public Identifier texture;
    /** A tamed animal in its sitting pose. */
    public boolean sitting;
    /** A {@code fly} mob in the air and moving. */
    public boolean flying;
    /** In water and moving. */
    public boolean swimming;
    /** The saddle slot holds an item ({@code saddle_bone} is drawn). */
    public boolean saddled;
    /**
     * The mob's triggered animation states, one per triggerable name in {@code DATA_ANIM} index order (shared with
     * the renderer's per-entity record, read only by the model); empty when none has started.
     */
    public AnimationState[] triggered = new AnimationState[0];
}
