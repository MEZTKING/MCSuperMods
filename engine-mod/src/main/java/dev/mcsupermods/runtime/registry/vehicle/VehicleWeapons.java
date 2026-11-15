package dev.mcsupermods.runtime.registry.vehicle;

import dev.mcsupermods.runtime.loader.VehicleDefinition;
import java.util.List;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * Weapons (ADR 0090 D6). B412 holds the ammunition: {@link MsmVehicle#DATA_AMMO} per weapon index, saved by weapon id
 * ({@code Ammo}) and kept in the item when picked up; and the reload in {@link MsmVehicle#DATA_READY_AT}. Firing, the
 * cooldown, loading ammunition by using its item and the projectile are B417's: {@link #load}, {@link #tick} and
 * {@link #fire} are empty hooks until then.
 */
public final class VehicleWeapons {
    private final MsmVehicle vehicle;

    VehicleWeapons(MsmVehicle vehicle) {
        this.vehicle = vehicle;
    }

    private List<VehicleDefinition.Weapon> weapons() {
        return vehicle.definition().weapons();
    }

    /** Rounds loaded in weapon {@code index}. */
    public int ammo(int index) {
        return vehicle.ammo(index);
    }

    /** Sets the rounds of weapon {@code index}, clamped to 0..its capacity (0 for a weapon without {@code ammo}). */
    public void setAmmo(int index, int rounds) {
        if (index < 0 || index >= weapons().size()) {
            return;
        }
        int capacity = weapons().get(index).ammo().map(VehicleDefinition.Ammo::capacity).orElse(0);
        vehicle.setAmmo(index, Math.max(0, Math.min(rounds, capacity)));
    }

    /** B417: an ammunition item in the hand loads its weapon and answers SUCCESS; null (pass on) until then. */
    InteractionResult load(Player player, ItemStack stack) {
        return null;
    }

    /** B417: cooldowns and automatic fire, on the server each tick. Nothing until then. */
    void tick(ServerLevel level) {}

    /** B417: a press of a runtime fire key by {@code shooter}. Nothing until then. */
    public void fire(ServerLevel level, Player shooter, VehicleDefinition.WeaponKey key) {}

    void save(ValueOutput output) {
        ValueOutput ammo = output.child("Ammo");
        for (int i = 0; i < weapons().size(); i++) {
            if (weapons().get(i).ammo().isPresent()) {
                ammo.putInt(weapons().get(i).id(), ammo(i));
            }
        }
    }

    void load(ValueInput input) {
        ValueInput ammo = input.childOrEmpty("Ammo");
        for (int i = 0; i < weapons().size(); i++) {
            setAmmo(i, ammo.getIntOr(weapons().get(i).id(), 0));
        }
    }
}
