package dev.mcsupermods.runtime.registry.vehicle;

import java.util.function.BooleanSupplier;
import java.util.function.Function;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Input;
import net.minecraft.world.entity.player.Player;

/**
 * The driver's input (ADR 0090 D4). On the driver's own client it comes from the local player's movement keys through
 * {@link #clientInput}, which the client entrypoint sets ({@code client.vehicle.VehicleClient}), so this common class
 * never names a client class; the "Vehicle: descend" key (ADR 0088 D5) comes through {@link #descend}, which
 * {@code client.controls.ControlsClient} connects to the runtime key (B411). On the server the movement keys are vanilla's {@link ServerPlayer#getLastClientInput()}, used for
 * fuel and the synched steering and throttle only, never for position.
 */
public final class VehicleDriver {
    private VehicleDriver() {}

    /** The local driver's movement keys; {@link Input#EMPTY} until the client entrypoint replaces it. */
    public static volatile Function<Player, Input> clientInput = player -> Input.EMPTY;
    /** Whether the local driver holds "Vehicle: descend"; false until {@code ControlsClient} connects the runtime key. */
    public static volatile BooleanSupplier descend = () -> false;

    /** The physics input of {@code driver} on the side that moves the vehicle (the driver's client, or a test). */
    static VehiclePhysics.Input physicsInput(Player driver, MsmVehicle vehicle) {
        Input keys = vehicle.level().isClientSide() ? clientInput.apply(driver) : serverInput(driver);
        boolean down = vehicle.level().isClientSide() && descend.getAsBoolean();
        return new VehiclePhysics.Input(keys.forward(), keys.backward(), keys.left(), keys.right(), keys.jump(), down, driver.getYRot(),
                driver.getXRot());
    }

    /** The server's copy of a driver's movement keys; {@link Input#EMPTY} without a driver. */
    static Input serverInput(Player driver) {
        return driver instanceof ServerPlayer player ? player.getLastClientInput() : Input.EMPTY;
    }
}
