package dev.mcsupermods.runtime.client.vehicle;

import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.resources.Identifier;

/**
 * What {@link VehicleModel} and {@link MsmVehicleRenderer} need of one vehicle for one frame (ADR 0090 D10), filled by
 * {@link MsmVehicleRenderer#extractRenderState}. Angles of the hull and turret are degrees in the game's sense (yaw turns
 * right as it grows, pitch is negative up); angles of the turning parts are radians, already interpolated.
 */
public class VehicleRenderState extends EntityRenderState {
    /** The hull's yaw, degrees. */
    public float yRot;
    /** The hull's pitch, degrees, negative nose up (planes and hovering vehicles). */
    public float xRot;
    /** The hurt wobble's angle this frame, degrees about the hull's length (0 when not hurt). */
    public float wobble;
    /** The texture to draw ({@code ns:textures/....png}): the paint's, else the model's. */
    public Identifier texture;
    /** True while the vehicle moves (the {@code moving} loop instead of {@code idle}). */
    public boolean moving;
    /** The wheels' roll, radians: the distance travelled over {@code parts.wheel_radius}. */
    public float wheelAngle;
    /** The steering, -1 (left) to 1 (right), smoothed. */
    public float steering;
    /** The rotors' turn about their upright axis, radians. */
    public float rotorAngle;
    /** The propellers' turn about their forward axis, radians. */
    public float propellerAngle;
    /** The turret's yaw relative to the hull, degrees: the local turret for the gunner, else the synched value. */
    public float turretYaw;
    /** The turret's pitch, degrees, negative up. */
    public float turretPitch;
}
