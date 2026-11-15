package dev.mcsupermods.runtime.registry.vehicle;

import dev.mcsupermods.runtime.controls.KeyBinds;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;

/**
 * The horn (ADR 0090 D2 {@code engine.horn}, ADR 0088 D5 "Vehicle: horn", H by default): when the driver presses the
 * runtime key, the server plays the vehicle's {@code engine.horn} sound at the vehicle to every player near it (the
 * driver included; there is no predicted play on the presser's client yet), at volume {@link #VOLUME}, so it carries as
 * far as any sound of volume 1 (16 blocks). Only the driver (seat 0) sounds it; a vehicle without {@code engine.horn}
 * stays silent. Holding the key sounds it once (a press fires only while the key is not held); a vehicle sounds it again
 * only {@link #COOLDOWN_TICKS} after its last sound, so tapping the key cannot spam it. The format has no horn event, so
 * nothing else runs. Registered from {@link MsmVehicles#register}.
 */
public final class VehicleHorn {
    /** Ticks between two sounds of one vehicle's horn: half a second. */
    public static final int COOLDOWN_TICKS = 10;
    /** The horn's volume (vanilla's attenuation: heard within 16 blocks per unit of volume). */
    static final float VOLUME = 1;

    /** The game time of each vehicle's last horn, held only while the vehicle is referenced. */
    private static final Map<MsmVehicle, Long> LAST = new WeakHashMap<>();
    private static boolean registered;

    private VehicleHorn() {}

    /** Adds the key listener once. */
    static void register() {
        if (registered) {
            return;
        }
        registered = true;
        KeyBinds.addListener(new KeyBinds.KeyListener() {
            @Override
            public void pressed(ServerPlayer player, Identifier key) {
                if (KeyBinds.RuntimeKey.HORN.id().equals(key) && player.getVehicle() instanceof MsmVehicle vehicle
                        && vehicle.driver() == player && vehicle.level() instanceof ServerLevel level) {
                    sound(level, vehicle);
                }
            }
        });
    }

    /**
     * Plays {@code vehicle}'s horn now unless it has none or sounded less than {@link #COOLDOWN_TICKS} ago; true when it
     * played.
     */
    public static boolean sound(ServerLevel level, MsmVehicle vehicle) {
        SoundEvent sound = vehicle.definition().engine().flatMap(e -> e.horn()).flatMap(BuiltInRegistries.SOUND_EVENT::getOptional)
                .orElse(null);
        if (sound == null) {
            return false;
        }
        long now = level.getGameTime();
        Long last = LAST.get(vehicle);
        if (last != null && now - last < COOLDOWN_TICKS && now >= last) {
            return false;
        }
        LAST.put(vehicle, now);
        level.playSound(null, vehicle.getX(), vehicle.getY(), vehicle.getZ(), sound, SoundSource.NEUTRAL, VOLUME, 1);
        return true;
    }
}
