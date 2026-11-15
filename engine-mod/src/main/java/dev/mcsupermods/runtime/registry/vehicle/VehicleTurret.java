package dev.mcsupermods.runtime.registry.vehicle;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * The turret (ADR 0090 D7): its yaw relative to the hull and its pitch live in {@link MsmVehicle#DATA_TURRET_YAW} and
 * {@link MsmVehicle#DATA_TURRET_PITCH} and are saved here. Following the gunner's look within the limits at
 * {@code turn_rate} is B417's: {@link #tick} is an empty hook until then.
 */
public final class VehicleTurret {
    private final MsmVehicle vehicle;

    VehicleTurret(MsmVehicle vehicle) {
        this.vehicle = vehicle;
    }

    /** B417: turns the turret towards the gunner's look, on the server each tick. Nothing until then. */
    void tick(ServerLevel level) {}

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
