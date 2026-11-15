package dev.mcsupermods.runtime.client.vehicle;

import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import net.minecraft.client.resources.sounds.AbstractTickableSoundInstance;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;

/**
 * A vehicle's engine loop (ADR 0090 D10): {@code engine.sound}, played on the client of each nearby player while the
 * engine runs (a driver in the seat and fuel to burn), at the vehicle, looping. Pitch and volume follow the engine's
 * effort, the larger of the throttle ({@code DATA_THROTTLE}, or the driver's own last physics step on the driver's client)
 * and the speed as a share of {@code max_speed}: pitch {@link #MIN_PITCH} at idle to {@link #MAX_PITCH} at full effort,
 * volume {@link #MIN_VOLUME} to 1. It stops itself when the engine stops or the vehicle is gone; {@link VehicleClient}
 * starts a new one when the engine runs again.
 */
public final class EngineSound extends AbstractTickableSoundInstance {
    public static final float MIN_PITCH = 0.6f;
    public static final float MAX_PITCH = 1.4f;
    public static final float MIN_VOLUME = 0.35f;

    private final MsmVehicle vehicle;

    EngineSound(MsmVehicle vehicle, SoundEvent sound) {
        super(sound, SoundSource.NEUTRAL, RandomSource.create());
        this.vehicle = vehicle;
        this.looping = true;
        this.delay = 0;
        this.attenuation = SoundInstance.Attenuation.LINEAR;
        follow();
    }

    /** The pitch at {@code effort} (0 to 1). */
    public static float pitchAt(float effort) {
        return Mth.lerp(Math.clamp(effort, 0f, 1f), MIN_PITCH, MAX_PITCH);
    }

    /** The volume at {@code effort} (0 to 1). */
    public static float volumeAt(float effort) {
        return Mth.lerp(Math.clamp(effort, 0f, 1f), MIN_VOLUME, 1f);
    }

    /** The pitch this sound asks for (before the sound file's own pitch, which the sound engine multiplies in). */
    public float enginePitch() {
        return pitch;
    }

    /** The volume this sound asks for (before the sound file's own volume). */
    public float engineVolume() {
        return volume;
    }

    public MsmVehicle vehicle() {
        return vehicle;
    }

    /** Moves the sound to the vehicle and sets pitch and volume from its effort; stops it when the engine stopped. */
    void follow() {
        if (vehicle.isRemoved() || !VehicleClient.engineRuns(vehicle)) {
            stop();
            return;
        }
        x = vehicle.getX();
        y = vehicle.getY();
        z = vehicle.getZ();
        float effort = VehicleClient.effort(vehicle);
        pitch = pitchAt(effort);
        volume = volumeAt(effort);
    }

    /** Ends the loop (the vehicle left range or its engine stopped). */
    void end() {
        stop();
    }

    @Override
    public void tick() {
        follow();
    }

    @Override
    public boolean canStartSilent() {
        return true;
    }
}
