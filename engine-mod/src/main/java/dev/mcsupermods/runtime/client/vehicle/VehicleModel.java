package dev.mcsupermods.runtime.client.vehicle;

import dev.mcsupermods.runtime.client.vanilla.GeoAnimationBaker;
import java.util.List;
import java.util.Map;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.util.Mth;

/**
 * The model of one vehicle type (ADR 0090 D10): ADR 0072's {@code GeoModelBaker} tree, its {@code idle} and
 * {@code moving} loops (the vanilla renderer's keyframe subset), and the bones the renderer turns.
 *
 * <p>Each frame, after the reset to the rest pose: {@code moving} plays while the vehicle moves, else {@code idle}; then,
 * added to whatever the loop set, wheels roll about their side axis by {@link VehicleRenderState#wheelAngle}, steering
 * bones turn about their upright axis by up to {@link #MAX_STEER} degrees, rotors spin about their upright axis and
 * propellers about their forward axis, the turret's {@code bone} turns by the turret's yaw and its {@code pitch_bone} by
 * its pitch. Model space is vanilla's (y down, the front towards -z, as mobs are made); in it a positive yaw turn and
 * the game's yaw agree, and so do a positive pitch turn and the game's pitch (negative up).
 */
public class VehicleModel extends EntityModel<VehicleRenderState> {
    /** How far steering bones turn at full lock, degrees. */
    public static final float MAX_STEER = 30;

    /**
     * The bones a vehicle turns; lists may be empty and the turret parts {@code null}.
     *
     * @param wheels     {@code parts.wheels}
     * @param steering   {@code parts.steering}
     * @param rotors     {@code parts.rotors}
     * @param propellers {@code parts.propellers}
     * @param turret     {@code turret.bone}
     * @param barrel     {@code turret.pitch_bone}
     */
    public record Bones(List<ModelPart> wheels, List<ModelPart> steering, List<ModelPart> rotors, List<ModelPart> propellers,
            ModelPart turret, ModelPart barrel) {
        public static final Bones NONE = new Bones(List.of(), List.of(), List.of(), List.of(), null, null);
    }

    private final Bones bones;
    private final GeoAnimationBaker.Baked idle;
    private final GeoAnimationBaker.Baked moving;

    /**
     * @param root   the baked root ({@code GeoModelBaker.Baked#root()})
     * @param bones  the bones the renderer turns
     * @param idle   the {@code idle} loop, or {@code null}
     * @param moving the {@code moving} loop, or {@code null}
     */
    public VehicleModel(ModelPart root, Bones bones, GeoAnimationBaker.Baked idle, GeoAnimationBaker.Baked moving) {
        super(root, RenderTypes::entityCutout);
        this.bones = bones;
        this.idle = idle;
        this.moving = moving;
    }

    /** A model that draws nothing, for missing or broken files. */
    public static VehicleModel empty() {
        return new VehicleModel(new ModelPart(List.of(), Map.of()), Bones.NONE, null, null);
    }

    public Bones bones() {
        return bones;
    }

    /** True when the model has cubes to draw (false for {@link #empty()}). */
    public boolean drawsSomething() {
        return !allParts().stream().allMatch(ModelPart::isEmpty);
    }

    @Override
    public void setupAnim(VehicleRenderState state) {
        resetPose();
        super.setupAnim(state);
        GeoAnimationBaker.Baked loop = state.moving && moving != null ? moving : idle;
        if (loop != null) {
            loop.animation().apply((long) (state.ageInTicks * 50f), 1f);
        }
        for (ModelPart wheel : bones.wheels()) {
            wheel.xRot += state.wheelAngle;
        }
        float steer = state.steering * MAX_STEER * Mth.DEG_TO_RAD;
        for (ModelPart part : bones.steering()) {
            part.yRot += steer;
        }
        for (ModelPart rotor : bones.rotors()) {
            rotor.yRot += state.rotorAngle;
        }
        for (ModelPart propeller : bones.propellers()) {
            propeller.zRot += state.propellerAngle;
        }
        if (bones.turret() != null) {
            bones.turret().yRot += state.turretYaw * Mth.DEG_TO_RAD;
        }
        if (bones.barrel() != null) {
            bones.barrel().xRot += state.turretPitch * Mth.DEG_TO_RAD;
        }
    }
}
