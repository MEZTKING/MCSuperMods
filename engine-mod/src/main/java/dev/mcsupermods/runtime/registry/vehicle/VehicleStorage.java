package dev.mcsupermods.runtime.registry.vehicle;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.world.ContainerHelper;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.SimpleMenuProvider;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.inventory.MenuType;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * Storage (ADR 0090 D9): a vanilla chest menu of {@code rows} rows, opened by a sneaking use from outside or by the
 * inventory key from a seat (vanilla's {@code HasCustomInventoryScreen}, B406 S10). Saved with the vehicle under
 * {@code Items}, dropped when it is destroyed or picked up. Hoppers do not reach it (plan limit V9).
 */
public final class VehicleStorage {
    /** How far from the hull's edge a player may keep the menu open, in blocks. */
    static final double REACH = 5;

    private final MsmVehicle vehicle;
    private final int rows;
    private final SimpleContainer container;

    VehicleStorage(MsmVehicle vehicle, int rows) {
        this.vehicle = vehicle;
        this.rows = rows;
        this.container = new SimpleContainer(rows * 9) {
            @Override
            public boolean stillValid(Player player) {
                return VehicleStorage.this.stillValid(player);
            }
        };
    }

    public SimpleContainer container() {
        return container;
    }

    public int rows() {
        return rows;
    }

    boolean stillValid(Player player) {
        if (vehicle.isRemoved()) {
            return false;
        }
        if (player.getVehicle() == vehicle) {
            return true;
        }
        double reach = vehicle.getBbWidth() / 2 + REACH;
        return player.distanceToSqr(vehicle) <= reach * reach;
    }

    /** Opens the chest menu (server) and answers SUCCESS. */
    InteractionResult open(Player player) {
        if (!vehicle.level().isClientSide()) {
            player.openMenu(new SimpleMenuProvider((id, inventory, p) -> new ChestMenu(menuType(rows), id, inventory, container, rows),
                    vehicle.getDisplayName()));
        }
        return InteractionResult.SUCCESS;
    }

    static MenuType<ChestMenu> menuType(int rows) {
        return switch (rows) {
            case 1 -> MenuType.GENERIC_9x1;
            case 2 -> MenuType.GENERIC_9x2;
            case 3 -> MenuType.GENERIC_9x3;
            case 4 -> MenuType.GENERIC_9x4;
            case 5 -> MenuType.GENERIC_9x5;
            default -> MenuType.GENERIC_9x6;
        };
    }

    /** Empties the storage and returns what it held (non-empty stacks). */
    List<ItemStack> takeAll() {
        List<ItemStack> out = new ArrayList<>();
        for (ItemStack stack : container.removeAllItems()) {
            if (!stack.isEmpty()) {
                out.add(stack);
            }
        }
        return out;
    }

    void save(ValueOutput output) {
        ContainerHelper.saveAllItems(output, container.getItems());
    }

    void load(ValueInput input) {
        container.clearContent();
        ContainerHelper.loadAllItems(input, container.getItems());
    }
}
