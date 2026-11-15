package dev.mcsupermods.runtime.scripting;

import dev.mcsupermods.runtime.loader.VehicleDefinition;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import java.util.List;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import org.mozilla.javascript.Context;

/**
 * {@code Vehicle extends Entity} (Script API 1.5, ADR 0089 D8 and ADR 0090 D11) over a project vehicle
 * ({@link MsmVehicle}, an {@code msm:vehicle}); {@link ScriptApi#entity} gives every such entity this type. Values are
 * read and written straight away on the server and reach the clients through the vehicle's synched data:
 * <ul>
 *   <li>{@code fuel} and {@code setFuel(ticks)}: ticks of driving left, clamped to 0 to the tank's capacity (always 0
 *       for a vehicle without {@code engine.fuel}).</li>
 *   <li>{@code damageTaken} and {@code setDamageTaken(amount)} (ADR 0089 D8's {@code damage} and {@code setDamage},
 *       renamed because {@code Entity.damage(amount)} is a method): vanilla's vehicle damage counter, which counts up to
 *       {@code health.max}; a value at or above it destroys the vehicle as damage would ({@code on_destroy},
 *       {@code vehicle.destroyed} without a player, passengers out, the explosion and the drops).</li>
 *   <li>{@code ammo(weapon)} and {@code setAmmo(weapon, rounds)}: a weapon by its {@code id} or its index from 0 (an
 *       unknown id or index is a {@code RangeError}); rounds are clamped to 0 to its capacity (0 for a weapon without
 *       {@code ammo}).</li>
 *   <li>{@code driver}: the player in the first seat, or {@code undefined}.</li>
 * </ul>
 */
final class ScriptVehicle {
    private ScriptVehicle() {}

    static final ScriptType TYPE = ScriptType.extending("Vehicle", ScriptEntity.TYPE)
            .live("fuel", MsmVehicle.class, (api, v) -> (double) v.fuel().fuel())
            .method("setFuel", 1, 1, MsmVehicle.class, (api, v, args) -> {
                v.fuel().setFuel(clampedInt(ScriptValues.number(args, 0, "ticks")));
                return null;
            })
            .live("damageTaken", MsmVehicle.class, (api, v) -> (double) v.getDamage())
            .method("setDamageTaken", 1, 1, MsmVehicle.class, (api, v, args) -> {
                float amount = (float) Math.max(0, ScriptValues.number(args, 0, "amount"));
                if (v.isRemoved()) {
                    return null;
                }
                if (amount >= v.health().max() && v.level() instanceof ServerLevel level) {
                    v.setDamage(v.health().max());
                    v.health().destroy(level, level.damageSources().generic(), true);
                } else {
                    v.setDamage(amount);
                }
                return null;
            })
            .method("ammo", 1, 1, MsmVehicle.class, (api, v, args) -> (double) v.weapons().ammo(weapon(v, args, 0)))
            .method("setAmmo", 2, 2, MsmVehicle.class, (api, v, args) -> {
                int index = weapon(v, args, 0);
                v.weapons().setAmmo(index, clampedInt(ScriptValues.number(args, 1, "rounds")));
                return null;
            })
            .live("driver", MsmVehicle.class, (api, v) -> v.driver() instanceof ServerPlayer p ? api.player(p) : null);

    /** A weapon argument: its {@code id} (a string) or its index from 0 (a number); anything else is a {@code RangeError}. */
    static int weapon(MsmVehicle vehicle, Object[] args, int i) {
        List<VehicleDefinition.Weapon> weapons = vehicle.definition().weapons();
        if (ScriptValues.present(args, i) && args[i] instanceof Number) {
            double d = ScriptValues.number(args, i, "weapon");
            if (d != Math.floor(d) || d < 0 || d >= weapons.size()) {
                throw ScriptValues.rangeError(weapons.isEmpty() ? "the vehicle has no weapons"
                        : "weapon index " + Context.toString(args[i]) + " is not 0 to " + (weapons.size() - 1));
            }
            return (int) d;
        }
        String id = ScriptValues.string(args, i, "weapon");
        for (int w = 0; w < weapons.size(); w++) {
            if (weapons.get(w).id().equals(id)) {
                return w;
            }
        }
        throw ScriptValues.rangeError("the vehicle has no weapon '" + id + "'");
    }

    /** {@code d} rounded down into the int range (the setters clamp further). */
    private static int clampedInt(double d) {
        return (int) Math.max(Integer.MIN_VALUE, Math.min(Integer.MAX_VALUE, Math.floor(d)));
    }
}
