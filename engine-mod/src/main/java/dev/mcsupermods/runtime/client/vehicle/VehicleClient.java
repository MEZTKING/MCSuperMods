package dev.mcsupermods.runtime.client.vehicle;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.client.EntityRendererRegistration;
import dev.mcsupermods.runtime.loader.VehicleDefinition;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicles;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;

/**
 * Client side of vehicles (ADR 0090 D7, D8, D10): {@link MsmVehicleRenderer} for every vehicle type (through the
 * {@code EntityRendererRegistration} seam, one provider instance per type), the local rider's input and predicted shots
 * ({@link VehicleInput}), the gunner's turret ({@link LocalTurret}), and for every vehicle in the client's world each
 * tick: the turning parts ({@link Motion}), the engine loop ({@link EngineSound}) and the exhaust
 * ({@link VehicleExhaust}). The third-person camera distance needs nothing here: the server's transient modifier of the
 * seated player's {@code camera_distance} attribute reaches the client with the player's attributes (B406 S5). Named
 * only from {@code MsmRuntimeClient}, so a dedicated server never loads it.
 *
 * <p>The throttle and steering come from the synched {@code DATA_THROTTLE} and {@code DATA_STEERING}, except on the
 * driver's own client, which moves the vehicle and reads its own last physics step ({@code movement().last()}), a round
 * trip sooner.
 */
public final class VehicleClient {
    /** Engine sounds are played for vehicles closer than this, blocks. */
    static final double SOUND_RANGE = 48;
    /** A rotor or propeller at full throttle turns this far a tick, radians. */
    static final float ROTOR_RATE = 1.1f;
    /** How much of the way to the synched steering the drawn steering goes each tick. */
    static final float STEER_FOLLOW = 0.35f;
    /** Below this squared distance a tick the vehicle counts as standing (the {@code idle} loop). */
    static final double MOVING_SQUARED = 1.0E-5;

    /** Per vehicle on this client: the drawn angles of its turning parts, this tick's and the last. */
    public static final class Motion {
        public float wheel;
        public float wheelO;
        public float steer;
        public float steerO;
        public float rotor;
        public float rotorO;
        public float propeller;
        public float propellerO;
        public float turretYaw;
        public float turretYawO;
        public float turretPitch;
        public float turretPitchO;
        public boolean moving;

        Motion(MsmVehicle vehicle) {
            turretYaw = turretYawO = vehicle.turretYaw();
            turretPitch = turretPitchO = vehicle.turretPitch();
        }
    }

    private static final Map<MsmVehicle, Motion> MOTION = new WeakHashMap<>();
    private static final Map<MsmVehicle, EngineSound> SOUNDS = new WeakHashMap<>();
    private static boolean initialised;

    private VehicleClient() {}

    /** Registers the vehicle renderers and client hooks; called once from {@code MsmRuntimeClient.onInitializeClient}. */
    public static void init() {
        if (initialised) {
            return;
        }
        initialised = true;
        VehicleInput.init();
        for (MsmVehicles.Entry entry : MsmVehicles.all().values()) {
            EntityRendererRegistration.<MsmVehicle>register(entry.type(), MsmVehicleRenderer.provider(entry));
        }
        if (!MsmVehicles.all().isEmpty()) {
            ClientTickEvents.END_CLIENT_TICK.register(VehicleClient::tick);
            ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> client.execute(VehicleClient::forget));
        }
        MsmRuntime.LOGGER.info("[{}] registered {} vehicle renderer(s)", MsmRuntime.MOD_ID, MsmVehicles.all().size());
    }

    /** The drawn state of {@code vehicle}'s turning parts (made on first use). */
    public static Motion motion(MsmVehicle vehicle) {
        return MOTION.computeIfAbsent(vehicle, Motion::new);
    }

    /** The engine loop playing for {@code vehicle}, or null (client GameTests). */
    public static EngineSound engineSound(MsmVehicle vehicle) {
        EngineSound sound = SOUNDS.get(vehicle);
        return sound == null || sound.isStopped() ? null : sound;
    }

    /** Whether the engine runs: a driver in the seat and no fuel needed or some left (synched {@code DATA_FUEL}). */
    public static boolean engineRuns(MsmVehicle vehicle) {
        return vehicle.driver() != null && vehicle.fuel().canRun();
    }

    /** The throttle as this client knows it: the driver's own last step on the driver's client, else the synched value. */
    public static float throttle(MsmVehicle vehicle) {
        return drivenHere(vehicle) ? (float) vehicle.movement().last().throttle() : vehicle.throttle();
    }

    /** The steering, -1 to 1, as this client knows it (see {@link #throttle}). */
    public static float steering(MsmVehicle vehicle) {
        return drivenHere(vehicle) ? (float) vehicle.movement().last().steering() : vehicle.steering();
    }

    /** The engine's effort, 0 to 1: the larger of the throttle's size and the speed over {@code max_speed}. */
    public static float effort(MsmVehicle vehicle) {
        double speed = vehicle.getDeltaMovement().horizontalDistance();
        if (!drivenHere(vehicle)) {
            speed = Math.hypot(vehicle.getX() - vehicle.xo, vehicle.getZ() - vehicle.zo);
        }
        double max = Math.max(0.01, vehicle.constants().maxSpeed());
        return (float) Math.clamp(Math.max(Math.abs(throttle(vehicle)), speed / max), 0.0, 1.0);
    }

    private static boolean drivenHere(MsmVehicle vehicle) {
        return vehicle.level().isClientSide() && vehicle.isLocalInstanceAuthoritative() && vehicle.driver() != null;
    }

    private static void forget() {
        SOUNDS.values().forEach(EngineSound::end);
        SOUNDS.clear();
        MOTION.clear();
    }

    private static void tick(Minecraft client) {
        ClientLevel level = client.level;
        if (level == null || client.isPaused()) {
            return;
        }
        List<MsmVehicle> vehicles = new ArrayList<>();
        for (Entity entity : level.entitiesForRendering()) {
            if (entity instanceof MsmVehicle vehicle && !vehicle.isRemoved()) {
                vehicles.add(vehicle);
            }
        }
        LocalTurret.tick(client.player);
        VehicleInput.tick(client, level, vehicles);
        for (MsmVehicle vehicle : vehicles) {
            move(vehicle);
            engine(client, vehicle);
            VehicleExhaust.tick(level, vehicle);
        }
    }

    /** One tick of the turning parts. */
    private static void move(MsmVehicle vehicle) {
        Motion m = motion(vehicle);
        m.wheelO = m.wheel;
        m.steerO = m.steer;
        m.rotorO = m.rotor;
        m.propellerO = m.propeller;
        m.turretYawO = m.turretYaw;
        m.turretPitchO = m.turretPitch;

        double dx = vehicle.getX() - vehicle.xo;
        double dy = vehicle.getY() - vehicle.yo;
        double dz = vehicle.getZ() - vehicle.zo;
        m.moving = dx * dx + dy * dy + dz * dz > MOVING_SQUARED;
        float yaw = vehicle.getYRot() * Mth.DEG_TO_RAD;
        double along = -dx * Mth.sin(yaw) + dz * Mth.cos(yaw);
        float radius = vehicle.definition().parts().map(VehicleDefinition.Parts::wheelRadius).orElse(0.5f);
        m.wheel += (float) (along / radius);
        m.steer += (Math.clamp(steering(vehicle), -1f, 1f) - m.steer) * STEER_FOLLOW;
        float throttle = Math.clamp(throttle(vehicle), -1f, 1f);
        m.rotor += Math.abs(throttle) * ROTOR_RATE;
        m.propeller += throttle * ROTOR_RATE;
        // Whole turns change nothing drawn; dropping them keeps the floats precise (both ends of the interpolation move).
        float wheelTurns = whole(m.wheel);
        m.wheel -= wheelTurns;
        m.wheelO -= wheelTurns;
        float rotorTurns = whole(m.rotor);
        m.rotor -= rotorTurns;
        m.rotorO -= rotorTurns;
        float propellerTurns = whole(m.propeller);
        m.propeller -= propellerTurns;
        m.propellerO -= propellerTurns;
        m.turretYaw = vehicle.turretYaw();
        m.turretPitch = vehicle.turretPitch();
    }

    /** The whole turns in {@code radians}, in radians, once there are more than a few; else 0. */
    static float whole(float radians) {
        return Math.abs(radians) < 8 * Mth.TWO_PI ? 0 : (float) (Math.floor(radians / Mth.TWO_PI) * Mth.TWO_PI);
    }

    /** Starts, follows or ends the engine loop of {@code vehicle}. */
    private static void engine(Minecraft client, MsmVehicle vehicle) {
        SoundEvent event = vehicle.definition().engine().flatMap(VehicleDefinition.Engine::sound)
                .flatMap(BuiltInRegistries.SOUND_EVENT::getOptional).orElse(null);
        if (event == null) {
            return;
        }
        EngineSound playing = SOUNDS.get(vehicle);
        boolean near = client.player != null && client.player.distanceToSqr(vehicle) < SOUND_RANGE * SOUND_RANGE;
        if (!near || !engineRuns(vehicle)) {
            if (playing != null) {
                playing.end();
                SOUNDS.remove(vehicle);
            }
            return;
        }
        if (playing == null || playing.isStopped()) {
            EngineSound sound = new EngineSound(vehicle, event);
            SOUNDS.put(vehicle, sound);
            client.getSoundManager().play(sound);
        } else {
            playing.follow();
        }
    }
}
