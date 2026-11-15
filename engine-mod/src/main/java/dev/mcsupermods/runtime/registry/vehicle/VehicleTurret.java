package dev.mcsupermods.runtime.registry.vehicle;

import dev.mcsupermods.runtime.loader.VehicleDefinition;
import java.util.List;
import java.util.Optional;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * The turret (ADR 0090 D7): its yaw relative to the hull and its pitch live in {@link MsmVehicle#DATA_TURRET_YAW} and
 * {@link MsmVehicle#DATA_TURRET_PITCH} and are saved here.
 *
 * <p>Each server tick the turret turns towards the look of the player in {@code turret.seat} (default the driver) as the
 * server knows it: the yaw towards the look's yaw relative to the hull, within {@code yaw_limit} (absent: all the way
 * round, by the shorter way); the pitch towards the look's pitch within {@code pitch_limit} (negative up; absent: the
 * look's own, -90 to 90), or 0 without {@code pitch_bone}; each by at most {@code turn_rate} degrees a tick (default 6).
 * Because the target is the look in the world, turning the hull does not turn the turret's aim, within the limits; with
 * nobody in the seat the turret stays where it is relative to the hull. The steps are pure ({@link #stepYaw},
 * {@link #stepPitch}) so the gunner's client can make the same turn every frame (B418).
 */
public final class VehicleTurret {
    private final MsmVehicle vehicle;

    VehicleTurret(MsmVehicle vehicle) {
        this.vehicle = vehicle;
    }

    /** The player who aims the turret: the passenger in {@code turret.seat}, or null (also without a turret). */
    public Player gunner() {
        Optional<VehicleDefinition.Turret> spec = vehicle.definition().turret();
        if (spec.isEmpty()) {
            return null;
        }
        List<Entity> passengers = vehicle.getPassengers();
        int seat = spec.get().seat();
        return seat < passengers.size() && passengers.get(seat) instanceof Player player ? player : null;
    }

    /** Turns the turret towards the gunner's look, on the server each tick. */
    void tick(ServerLevel level) {
        Optional<VehicleDefinition.Turret> spec = vehicle.definition().turret();
        if (spec.isEmpty()) {
            return;
        }
        VehicleDefinition.Turret turret = spec.get();
        Player gunner = gunner();
        float yaw = vehicle.turretYaw();
        float pitch = vehicle.turretPitch();
        // Nobody aims: the turret stays, within the limits (a loaded or edited angle may lie outside them).
        float targetYaw = gunner == null ? yaw : Mth.wrapDegrees(gunner.getYRot() - vehicle.getYRot());
        boolean pitches = turret.pitchBone().isPresent();
        float targetPitch = !pitches ? 0 : gunner == null ? pitch : gunner.getXRot();
        float nextYaw = stepYaw(yaw, targetYaw, turret.yawLimit(), turret.turnRate());
        float nextPitch = stepPitch(pitch, targetPitch, pitches ? turret.pitchLimit() : Optional.empty(), turret.turnRate());
        if (nextYaw != yaw || nextPitch != pitch) {
            vehicle.setTurret(nextYaw, nextPitch);
        }
    }

    /**
     * One tick of yaw, degrees relative to the hull: from {@code current} towards {@code target} by at most {@code rate}.
     * With {@code limit} ({@code [min, max]}, either order) the target and the result are clamped to it and the turret
     * turns the straight way between them (never through the part outside the limits); without, it turns the shorter way
     * round and the result is wrapped to -180..180.
     */
    public static float stepYaw(float current, float target, Optional<List<Float>> limit, float rate) {
        if (limit.isPresent()) {
            float min = Math.min(limit.get().get(0), limit.get().get(1));
            float max = Math.max(limit.get().get(0), limit.get().get(1));
            float from = Math.clamp(Mth.wrapDegrees(current), min, max);
            float to = Math.clamp(Mth.wrapDegrees(target), min, max);
            return from + Math.clamp(to - from, -rate, rate);
        }
        float delta = Mth.wrapDegrees(target - current);
        return Mth.wrapDegrees(current + Math.clamp(delta, -rate, rate));
    }

    /**
     * One tick of pitch, degrees (negative up): from {@code current} towards {@code target} by at most {@code rate},
     * both clamped to {@code limit} ({@code [min, max]}, either order) or, without it, to -90..90.
     */
    public static float stepPitch(float current, float target, Optional<List<Float>> limit, float rate) {
        float min = limit.map(l -> Math.min(l.get(0), l.get(1))).orElse(-90f);
        float max = limit.map(l -> Math.max(l.get(0), l.get(1))).orElse(90f);
        float from = Math.clamp(current, min, max);
        float to = Math.clamp(target, min, max);
        return from + Math.clamp(to - from, -rate, rate);
    }

    void save(ValueOutput output) {
        if (vehicle.definition().turret().isPresent()) {
            output.putFloat("TurretYaw", vehicle.turretYaw());
            output.putFloat("TurretPitch", vehicle.turretPitch());
        }
    }

    void load(ValueInput input) {
        if (vehicle.definition().turret().isPresent()) {
            vehicle.setTurret(input.getFloatOr("TurretYaw", 0), input.getFloatOr("TurretPitch", 0));
        }
    }
}
