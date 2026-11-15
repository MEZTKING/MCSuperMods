package dev.mcsupermods.runtime.registry.vehicle;

import dev.mcsupermods.runtime.loader.VehicleDefinition;
import java.util.Optional;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Input;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * Fuel (ADR 0090 D9): ticks of driving in {@link MsmVehicle#DATA_FUEL}. Using a fuel item on the vehicle adds its
 * {@code ticks} up to the capacity (default 10 times the largest item) and uses the item up outside creative; a full tank
 * passes the click on (the player gets in). The engine burns one tick per tick while the driver gives throttle: forwards
 * or back on surfaces, a lever above 0 in a plane, always while a hovering vehicle has a driver. Without fuel there is no
 * thrust: it coasts, floats or sinks. A vehicle without {@code engine.fuel} always runs.
 */
public final class VehicleFuel {
    private final MsmVehicle vehicle;

    VehicleFuel(MsmVehicle vehicle) {
        this.vehicle = vehicle;
    }

    private Optional<VehicleDefinition.Fuel> spec() {
        return vehicle.definition().fuel();
    }

    /** Ticks of fuel left (synched). */
    public int fuel() {
        return vehicle.data().get(MsmVehicle.DATA_FUEL);
    }

    /** The tank's size in ticks; 0 without {@code engine.fuel}. */
    public int capacity() {
        return spec().map(VehicleDefinition.Fuel::capacityOrDefault).orElse(0);
    }

    /** Sets the fuel, clamped to 0..capacity. */
    public void setFuel(int ticks) {
        vehicle.data().set(MsmVehicle.DATA_FUEL, Math.max(0, Math.min(ticks, capacity())));
    }

    /** Whether the engine can give thrust: no fuel needed, or some left. */
    public boolean canRun() {
        return spec().isEmpty() || fuel() > 0;
    }

    /** The ticks one {@code stack} item gives, or 0 when it is no fuel of this vehicle. */
    public int ticksOf(ItemStack stack) {
        for (VehicleDefinition.FuelItem item : spec().map(VehicleDefinition.Fuel::items).orElse(java.util.List.of())) {
            if (MsmVehicles.matches(stack, item.item())) {
                return item.ticks();
            }
        }
        return 0;
    }

    /** A fuel item in the hand: refuels (server) and answers SUCCESS; null when it is no fuel or the tank is full. */
    InteractionResult use(Player player, ItemStack stack) {
        int ticks = ticksOf(stack);
        if (ticks <= 0 || fuel() >= capacity()) {
            return null;
        }
        if (!vehicle.level().isClientSide()) {
            setFuel(fuel() + ticks);
            stack.consume(1, player);
            vehicle.level().playSound(null, vehicle.getX(), vehicle.getY(), vehicle.getZ(), SoundEvents.BUCKET_FILL, SoundSource.NEUTRAL, 0.6f, 1.2f);
        }
        return InteractionResult.SUCCESS;
    }

    /** On the server each tick: burns one tick while the driver gives throttle ({@link #burns}). */
    void tick(Player driver, Input keys) {
        if (spec().isEmpty() || driver == null || fuel() <= 0) {
            return;
        }
        if (burns(vehicle.definition().movement().mode(), keys, vehicle.movement().lever())) {
            setFuel(fuel() - 1);
        }
    }

    /** Whether a driven engine burns fuel this tick. */
    static boolean burns(VehicleDefinition.Mode mode, Input keys, double lever) {
        return switch (mode) {
            case AIR -> lever > 0;
            case HOVER -> true;
            case GROUND, WATER, AMPHIBIOUS -> keys.forward() != keys.backward();
        };
    }

    void save(ValueOutput output) {
        output.putInt("Fuel", fuel());
    }

    void load(ValueInput input) {
        setFuel(input.getIntOr("Fuel", 0));
    }
}
