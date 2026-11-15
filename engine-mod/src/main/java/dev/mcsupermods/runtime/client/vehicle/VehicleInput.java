package dev.mcsupermods.runtime.client.vehicle;

import dev.mcsupermods.runtime.client.controls.RuntimeKeys;
import dev.mcsupermods.runtime.controls.KeyBinds.RuntimeKey;
import dev.mcsupermods.runtime.loader.VehicleDefinition;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import dev.mcsupermods.runtime.registry.vehicle.VehicleDriver;
import dev.mcsupermods.runtime.registry.vehicle.VehicleWeapons;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.WeakHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.player.Input;
import net.minecraft.world.phys.Vec3;

/**
 * The local rider's input (ADR 0088 D5, ADR 0090 D4, D6, D10). The movement keys reach the physics through
 * {@link VehicleDriver#clientInput} (the local player's {@code input.keyPresses}, B406's route) and "Vehicle: descend"
 * through {@link VehicleDriver#descend} (wired by {@code ControlsClient}); the runtime keys themselves go to the server
 * through B411's {@code ControlsClient}, which decides every shot.
 *
 * <p>What this class adds is the shooter's own feedback at once (vanilla's pattern for predicted sounds; the server plays
 * the weapon sound to everyone else): when the local player in a seat presses "Vehicle: fire" or "Vehicle: second weapon"
 * (or holds it, for an {@code automatic} weapon), every weapon on that key the seat fires that looks ready from the synched
 * cooldown and ammunition plays its {@code sound} and shows the muzzle flash locally, at the muzzle of the local aim
 * ({@link LocalTurret} for the gunner). The server's answer (the weapon's synched {@code DATA_READY_AT} moving on) shows the
 * flash on every other client, and on the shooter's own client plays the sound and flash of a shot it did not predict
 * (a press shorter than a tick, which {@code isDown} never sees).
 */
public final class VehicleInput {
    /** A predicted shot counts as the server's answer for this many ticks. */
    static final int PREDICTION_TICKS = 20;

    private static final AtomicInteger PREDICTED = new AtomicInteger();
    private static final AtomicInteger FLASHES = new AtomicInteger();
    private static final AtomicInteger SOUNDS = new AtomicInteger();

    /** Per vehicle on this client: what each weapon's cooldown last was, and when this client last predicted its shot. */
    private static final Map<MsmVehicle, Shots> SHOTS = new WeakHashMap<>();
    private static boolean fireWasDown;
    private static boolean secondWasDown;

    private static final class Shots {
        final long[] readyAt = new long[VehicleDefinition.MAX_WEAPONS];
        final long[] predictedAt = new long[VehicleDefinition.MAX_WEAPONS];
        final long[] localReadyAt = new long[VehicleDefinition.MAX_WEAPONS];

        Shots(MsmVehicle vehicle) {
            for (int i = 0; i < readyAt.length; i++) {
                readyAt[i] = vehicle.readyAt(i);
                predictedAt[i] = Long.MIN_VALUE / 2;
            }
        }
    }

    private VehicleInput() {}

    /** Connects the local player's movement keys to the vehicle physics. */
    static void init() {
        VehicleDriver.clientInput = player -> player instanceof LocalPlayer local ? local.input.keyPresses : Input.EMPTY;
    }

    /** Shots this client predicted (client GameTests). */
    public static int predicted() {
        return PREDICTED.get();
    }

    /** Muzzle flashes this client showed (client GameTests). */
    public static int flashes() {
        return FLASHES.get();
    }

    /** Weapon sounds this client played itself (client GameTests). */
    public static int sounds() {
        return SOUNDS.get();
    }

    /** One client tick: the local shooter's predictions, then every vehicle's server answers. */
    static void tick(Minecraft client, ClientLevel level, Iterable<MsmVehicle> vehicles) {
        LocalPlayer player = client.player;
        boolean active = client.gui.screen() == null && client.isWindowActive();
        boolean fire = active && RuntimeKeys.isDown(RuntimeKey.FIRE);
        boolean second = active && RuntimeKeys.isDown(RuntimeKey.SECOND);
        if (player != null && player.getVehicle() instanceof MsmVehicle vehicle) {
            predict(level, player, vehicle, VehicleDefinition.WeaponKey.FIRE, fire, !fireWasDown);
            predict(level, player, vehicle, VehicleDefinition.WeaponKey.SECOND, second, !secondWasDown);
        }
        fireWasDown = fire;
        secondWasDown = second;
        for (MsmVehicle vehicle : vehicles) {
            answers(level, player, vehicle);
        }
    }

    private static Shots shots(MsmVehicle vehicle) {
        return SHOTS.computeIfAbsent(vehicle, Shots::new);
    }

    private static void predict(ClientLevel level, LocalPlayer player, MsmVehicle vehicle, VehicleDefinition.WeaponKey key, boolean down,
            boolean edge) {
        if (!down) {
            return;
        }
        int seat = vehicle.seats().seatOf(player);
        List<VehicleDefinition.Weapon> weapons = vehicle.definition().weapons();
        long now = level.getGameTime();
        Shots shots = shots(vehicle);
        for (int i = 0; i < weapons.size(); i++) {
            VehicleDefinition.Weapon weapon = weapons.get(i);
            if (weapon.key() != key || !(edge || weapon.automatic()) || !vehicle.weapons().seatFires(seat, i)) {
                continue;
            }
            if (!vehicle.weapons().ready(i, now) || now < shots.localReadyAt[i]) {
                continue;
            }
            shots.predictedAt[i] = now;
            shots.localReadyAt[i] = now + weapon.cooldownTicks();
            PREDICTED.incrementAndGet();
            shot(level, vehicle, weapon, true);
        }
    }

    /** A weapon whose cooldown moved on fired on the server: the flash for others, the late sound for an unpredicted shot. */
    private static void answers(ClientLevel level, LocalPlayer player, MsmVehicle vehicle) {
        List<VehicleDefinition.Weapon> weapons = vehicle.definition().weapons();
        if (weapons.isEmpty()) {
            return;
        }
        Shots shots = shots(vehicle);
        long now = level.getGameTime();
        int seat = player != null && player.getVehicle() == vehicle ? vehicle.seats().seatOf(player) : -1;
        for (int i = 0; i < weapons.size(); i++) {
            long readyAt = vehicle.readyAt(i);
            if (readyAt == shots.readyAt[i]) {
                continue;
            }
            boolean fired = readyAt > shots.readyAt[i];
            shots.readyAt[i] = readyAt;
            if (!fired) {
                continue;
            }
            boolean mine = seat >= 0 && vehicle.weapons().seatFires(seat, i);
            boolean predicted = mine && now - shots.predictedAt[i] <= PREDICTION_TICKS;
            if (mine && predicted) {
                shots.predictedAt[i] = Long.MIN_VALUE / 2; // this answer is used up
                continue;
            }
            shot(level, vehicle, weapons.get(i), mine);
        }
    }

    /** The muzzle flash and, for the shooter, the weapon's sound. */
    private static void shot(ClientLevel level, MsmVehicle vehicle, VehicleDefinition.Weapon weapon, boolean sound) {
        VehicleWeapons.Aim aim = aim(vehicle, weapon);
        Vec3 muzzle = vehicle.weapons().muzzle(weapon, aim);
        Vec3 dir = Vec3.directionFromRotation(aim.pitch(), aim.yaw());
        for (int n = 0; n < 3; n++) {
            double s = 0.05 + 0.05 * n;
            level.addParticle(ParticleTypes.FLAME, muzzle.x, muzzle.y, muzzle.z, dir.x * s, dir.y * s, dir.z * s);
            level.addParticle(ParticleTypes.SMOKE, muzzle.x, muzzle.y, muzzle.z, dir.x * s, dir.y * s + 0.02, dir.z * s);
        }
        FLASHES.incrementAndGet();
        if (sound) {
            weapon.sound().flatMap(BuiltInRegistries.SOUND_EVENT::getOptional).ifPresent(event -> {
                level.playLocalSound(muzzle.x, muzzle.y, muzzle.z, event, SoundSource.NEUTRAL, 1, 1, false);
                SOUNDS.incrementAndGet();
            });
        }
    }

    /**
     * The aim of {@code weapon} as this client sees it: {@link VehicleWeapons#aim}'s rule (a muzzle on the turret's
     * {@code pitch_bone} along its yaw and pitch, on its {@code bone} along its yaw, any other along the hull) with the
     * turret's angles from {@link LocalTurret} for the gunner.
     */
    static VehicleWeapons.Aim aim(MsmVehicle vehicle, VehicleDefinition.Weapon weapon) {
        if (!LocalTurret.isLocal(vehicle)) {
            return vehicle.weapons().aim(weapon);
        }
        Optional<String> bone = weapon.muzzle().flatMap(VehicleDefinition.Muzzle::bone);
        Optional<VehicleDefinition.Turret> turret = vehicle.definition().turret();
        float[] local = LocalTurret.current();
        if (bone.isPresent() && turret.isPresent()) {
            if (turret.get().pitchBone().equals(bone)) {
                return new VehicleWeapons.Aim(vehicle.getYRot() + local[0], local[1]);
            }
            if (turret.get().bone().equals(bone.get())) {
                return new VehicleWeapons.Aim(vehicle.getYRot() + local[0], 0);
            }
        }
        return vehicle.weapons().aim(weapon);
    }
}
