package dev.mcsupermods.runtime.registry.vehicle;

import java.util.Optional;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.HasCustomInventoryScreen;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;

/**
 * A vehicle with {@code storage} (ADR 0090 D9). A separate class because vanilla opens a vehicle's screen with the
 * inventory key whenever the vehicle is a {@link HasCustomInventoryScreen}: a vehicle without storage must not be one, or
 * its riders could not open their own inventory.
 */
public class MsmStorageVehicle extends MsmVehicle implements HasCustomInventoryScreen {
    private final VehicleStorage storage;

    public MsmStorageVehicle(EntityType<? extends MsmVehicle> type, Level level) {
        super(type, level);
        this.storage = new VehicleStorage(this, definition().storage().orElseThrow().rows());
    }

    @Override
    public Optional<VehicleStorage> storage() {
        return Optional.ofNullable(storage);
    }

    /** The inventory key from a seat (B406 S10). */
    @Override
    public void openCustomInventoryScreen(Player player) {
        storage.open(player);
    }
}
