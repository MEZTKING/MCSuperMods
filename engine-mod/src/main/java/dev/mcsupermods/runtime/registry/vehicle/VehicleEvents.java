package dev.mcsupermods.runtime.registry.vehicle;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.player.Player;

/**
 * Listeners told about what happens to vehicles on the server (ADR 0090 D11, Script API 1.5 of ADR 0089 D8): a player
 * got in or out, a weapon fired, the vehicle was destroyed. Each call comes after the definition's own event
 * ({@code on_mount}, {@code on_dismount}, the weapon's {@code on_fire}, {@code on_destroy}), so a script handler runs
 * after the definition's actions, as for key binds (ADR 0088 D6). {@code scripting.ScriptBridges} is the only listener
 * today; listeners are kept for the whole run (registration happens once at initialisation).
 */
public final class VehicleEvents {
    /** What a listener hears; every method has an empty default. Server thread only. */
    public interface Listener {
        /** {@code player} got into {@code vehicle} (seat {@code vehicle.seats().seatOf(player)}; 0 drives). */
        default void mounted(ServerLevel level, MsmVehicle vehicle, Player player) {}

        /** {@code player} got out of {@code vehicle} (also when ejected because the vehicle is destroyed). */
        default void dismounted(ServerLevel level, MsmVehicle vehicle, Player player) {}

        /** Weapon {@code index} of {@code vehicle} fired one shot for {@code shooter}. */
        default void fired(ServerLevel level, MsmVehicle vehicle, int index, Player shooter) {}

        /**
         * {@code vehicle} is being destroyed, by {@code player} or null; the vehicle is still in the world with its
         * passengers, who get out (and are reported as dismounted) right after.
         */
        default void destroyed(ServerLevel level, MsmVehicle vehicle, Player player) {}
    }

    private static final List<Listener> LISTENERS = new CopyOnWriteArrayList<>();

    private VehicleEvents() {}

    public static void addListener(Listener listener) {
        LISTENERS.add(listener);
    }

    public static void removeListener(Listener listener) {
        LISTENERS.remove(listener);
    }

    static void mounted(ServerLevel level, MsmVehicle vehicle, Player player) {
        LISTENERS.forEach(l -> l.mounted(level, vehicle, player));
    }

    static void dismounted(ServerLevel level, MsmVehicle vehicle, Player player) {
        LISTENERS.forEach(l -> l.dismounted(level, vehicle, player));
    }

    static void fired(ServerLevel level, MsmVehicle vehicle, int index, Player shooter) {
        LISTENERS.forEach(l -> l.fired(level, vehicle, index, shooter));
    }

    static void destroyed(ServerLevel level, MsmVehicle vehicle, Player player) {
        LISTENERS.forEach(l -> l.destroyed(level, vehicle, player));
    }
}
