package dev.mcsupermods.runtime.client.vehicle;

import dev.mcsupermods.runtime.loader.VehicleDefinition;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import dev.mcsupermods.runtime.registry.vehicle.VehicleSeats;
import java.util.concurrent.atomic.AtomicInteger;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.phys.Vec3;

/**
 * Exhaust (ADR 0090 D10): {@code exhaust.particle} at {@code exhaust.offset} (x right, y up, z forwards, in blocks from
 * the vehicle's position, turned with the hull), once every {@code every_ticks} client ticks while the engine runs and
 * works ({@link VehicleClient#effort} above 0), spawned on each client itself (no packet). A particle type that takes
 * options is logged once and skipped (the format allows only types without options).
 */
public final class VehicleExhaust {
    /** Below this effort the engine idles and gives no exhaust. */
    static final float IDLE = 0.01f;
    /** How fast the smoke drifts up, blocks a tick. */
    static final double RISE = 0.03;

    private static final AtomicInteger SPAWNED = new AtomicInteger();

    private VehicleExhaust() {}

    /** How many exhaust particles this client spawned (client GameTests). */
    public static int spawned() {
        return SPAWNED.get();
    }

    /** Where the exhaust of {@code vehicle} comes out, in the world. */
    public static Vec3 position(MsmVehicle vehicle, VehicleDefinition.Exhaust exhaust) {
        Vec3 local = new Vec3(exhaust.offset().get(0), exhaust.offset().get(1), exhaust.offset().get(2));
        return vehicle.position().add(VehicleSeats.toWorld(local, vehicle.getYRot()));
    }

    /** One client tick of {@code vehicle}. */
    static void tick(ClientLevel level, MsmVehicle vehicle) {
        VehicleDefinition.Exhaust exhaust = vehicle.definition().exhaust().orElse(null);
        if (exhaust == null || vehicle.tickCount % exhaust.everyTicks() != 0 || !VehicleClient.engineRuns(vehicle)
                || VehicleClient.effort(vehicle) < IDLE) {
            return;
        }
        if (!(BuiltInRegistries.PARTICLE_TYPE.getValue(exhaust.particle()) instanceof ParticleOptions options)) {
            MsmVehicleRenderer.warn(vehicle.definitionId() + ": exhaust.particle " + exhaust.particle()
                    + " is not a particle type without options; no exhaust is drawn");
            return;
        }
        Vec3 at = position(vehicle, exhaust);
        level.addParticle(options, at.x, at.y, at.z, 0, RISE, 0);
        SPAWNED.incrementAndGet();
    }
}
