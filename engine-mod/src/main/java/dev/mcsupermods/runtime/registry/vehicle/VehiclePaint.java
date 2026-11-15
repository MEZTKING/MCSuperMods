package dev.mcsupermods.runtime.registry.vehicle;

import dev.mcsupermods.runtime.loader.VehicleDefinition;
import java.util.List;
import java.util.Optional;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * Paint (ADR 0090 D12): {@link MsmVehicle#DATA_PAINT} is 0 for {@code model.texture} and {@code n} for
 * {@code model.paints[n - 1]}. Using a paint's {@code dye} item on the vehicle switches to that paint and uses one dye up
 * outside creative; the dye of the paint already on passes the click on. Saved by paint id ({@code Paint}) and kept in
 * the item when picked up.
 */
public final class VehiclePaint {
    private final MsmVehicle vehicle;

    VehiclePaint(MsmVehicle vehicle) {
        this.vehicle = vehicle;
    }

    private List<VehicleDefinition.Paint> paints() {
        return vehicle.definition().model().paints();
    }

    /** The synched index: 0 the base texture, {@code n} the paint {@code n - 1}. */
    public int index() {
        return vehicle.data().get(MsmVehicle.DATA_PAINT);
    }

    /** The paint on the vehicle; empty for the base texture. */
    public Optional<VehicleDefinition.Paint> current() {
        int index = index();
        return index > 0 && index <= paints().size() ? Optional.of(paints().get(index - 1)) : Optional.empty();
    }

    /** The texture to draw: the paint's, else {@code model.texture}. */
    public Identifier texture() {
        return current().map(VehicleDefinition.Paint::texture).orElse(vehicle.definition().model().texture());
    }

    /** Puts on the paint {@code id}; an unknown id or null puts the base texture back. */
    public void set(String id) {
        int index = id == null ? -1 : vehicle.definition().paintIndex(id);
        vehicle.data().set(MsmVehicle.DATA_PAINT, (byte) (index + 1));
    }

    /** A paint's dye in the hand: switches to it (server) and answers SUCCESS; null otherwise. */
    InteractionResult use(Player player, ItemStack stack) {
        Identifier item = BuiltInRegistries.ITEM.getKey(stack.getItem());
        for (int i = 0; i < paints().size(); i++) {
            VehicleDefinition.Paint paint = paints().get(i);
            if (paint.dye().isPresent() && paint.dye().get().equals(item)) {
                if (index() == i + 1) {
                    return null;
                }
                if (!vehicle.level().isClientSide()) {
                    vehicle.data().set(MsmVehicle.DATA_PAINT, (byte) (i + 1));
                    stack.consume(1, player);
                    vehicle.level().playSound(null, vehicle.getX(), vehicle.getY(), vehicle.getZ(), SoundEvents.DYE_USE, SoundSource.PLAYERS, 1, 1);
                }
                return InteractionResult.SUCCESS;
            }
        }
        return null;
    }

    void save(ValueOutput output) {
        current().ifPresent(p -> output.putString("Paint", p.id()));
    }

    void load(ValueInput input) {
        set(input.getString("Paint").orElse(null));
    }
}
