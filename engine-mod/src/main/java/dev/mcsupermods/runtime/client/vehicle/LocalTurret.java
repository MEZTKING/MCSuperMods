package dev.mcsupermods.runtime.client.vehicle;

import dev.mcsupermods.runtime.loader.VehicleDefinition;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import dev.mcsupermods.runtime.registry.vehicle.VehicleTurret;
import java.util.Optional;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.util.Mth;

/**
 * The gunner's own turret (ADR 0090 D7): on the client of the player in {@code turret.seat}, the turret turns towards
 * that player's local look each client tick with the server's own steps ({@link VehicleTurret#stepYaw},
 * {@link VehicleTurret#stepPitch}, the same limits and {@code turn_rate}), so the gunner sees the turret follow the view
 * at once instead of a round trip later; the frame interpolates between two ticks. It starts from the synched angles when
 * the player becomes the gunner. Every other client draws the synched angles, interpolated ({@link VehicleClient.Motion}).
 * Only the look is local: the server still aims and fires with its own angles.
 */
public final class LocalTurret {
    private static MsmVehicle vehicle;
    private static float yaw;
    private static float yawO;
    private static float pitch;
    private static float pitchO;

    private LocalTurret() {}

    /** Each client tick: follows the local gunner's look, or forgets the turret when the player is no gunner. */
    static void tick(LocalPlayer player) {
        MsmVehicle seated = player != null && player.getVehicle() instanceof MsmVehicle v && v.definition().turret().isPresent()
                && v.turret().gunner() == player ? v : null;
        if (seated == null) {
            vehicle = null;
            return;
        }
        VehicleDefinition.Turret turret = seated.definition().turret().get();
        if (seated != vehicle) {
            vehicle = seated;
            yaw = yawO = seated.turretYaw();
            pitch = pitchO = seated.turretPitch();
        }
        yawO = yaw;
        pitchO = pitch;
        boolean pitches = turret.pitchBone().isPresent();
        yaw = VehicleTurret.stepYaw(yaw, Mth.wrapDegrees(player.getYRot() - seated.getYRot()), turret.yawLimit(), turret.turnRate());
        pitch = VehicleTurret.stepPitch(pitch, pitches ? player.getXRot() : 0, pitches ? turret.pitchLimit() : Optional.empty(),
                turret.turnRate());
    }

    /** True when this client turns {@code vehicle}'s turret itself. */
    public static boolean isLocal(MsmVehicle vehicle) {
        return vehicle != null && vehicle == LocalTurret.vehicle;
    }

    /** The local yaw relative to the hull and pitch of this tick (client GameTests); zeros when not local. */
    public static float[] current() {
        return vehicle == null ? new float[] {0, 0} : new float[] {yaw, pitch};
    }

    /** The turret's yaw and pitch to draw this frame: local for the gunner, else the synched values interpolated. */
    static float[] angles(MsmVehicle target, float partialTick) {
        if (isLocal(target)) {
            return new float[] {Mth.rotLerp(partialTick, yawO, yaw), Mth.lerp(partialTick, pitchO, pitch)};
        }
        VehicleClient.Motion motion = VehicleClient.motion(target);
        return new float[] {Mth.rotLerp(partialTick, motion.turretYawO, motion.turretYaw), Mth.lerp(partialTick, motion.turretPitchO, motion.turretPitch)};
    }
}
