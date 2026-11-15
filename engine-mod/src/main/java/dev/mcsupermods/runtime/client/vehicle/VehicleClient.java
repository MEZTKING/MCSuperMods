package dev.mcsupermods.runtime.client.vehicle;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.client.EntityRendererRegistration;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicles;
import dev.mcsupermods.runtime.registry.vehicle.VehicleDriver;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.NoopRenderer;
import net.minecraft.world.entity.player.Input;

/**
 * Client side of vehicles (ADR 0090 D7, D10): the renderer (through the {@code EntityRendererRegistration} seam), the
 * driver's input, engine sound and local turret. Named only from {@code MsmRuntimeClient}, so a dedicated server never
 * loads it.
 *
 * <p>B412 registers what the vehicle core needs to run in a real client: vanilla's {@link NoopRenderer} for every vehicle
 * type (the client needs a renderer per entity type; B418 replaces it with {@code MsmVehicleRenderer}), and the local
 * driver's movement keys for {@link VehicleDriver#clientInput} (B406's route: the player's {@code input.keyPresses}).
 */
public final class VehicleClient {
    private VehicleClient() {}

    /**
     * A provider of its own per type: on 26.4 providers are values of a client registry, which refuses the same value
     * twice, and a method reference without captures is one shared instance.
     */
    private static EntityRendererProvider<MsmVehicle> placeholder(MsmVehicles.Entry entry) {
        return context -> {
            assert entry != null; // captured, so every type gets its own provider instance
            return new NoopRenderer<>(context);
        };
    }

    /** Registers the vehicle renderers and client hooks; called once from {@code MsmRuntimeClient.onInitializeClient}. */
    public static void init() {
        VehicleDriver.clientInput = player -> player instanceof LocalPlayer local ? local.input.keyPresses : Input.EMPTY;
        for (MsmVehicles.Entry entry : MsmVehicles.all().values()) {
            EntityRendererRegistration.<MsmVehicle>register(entry.type(), placeholder(entry));
        }
        MsmRuntime.LOGGER.info("[{}] registered {} placeholder vehicle renderer(s)", MsmRuntime.MOD_ID, MsmVehicles.all().size());
    }
}
