package dev.mcsupermods.runtime.registry.machine;

import dev.mcsupermods.runtime.components.BlockComponents;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.AbstractFurnaceMenu;
import net.minecraft.world.inventory.BlastFurnaceMenu;
import net.minecraft.world.inventory.ContainerData;
import net.minecraft.world.inventory.FurnaceMenu;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.inventory.SmokerMenu;
import net.minecraft.world.item.ItemStack;

/**
 * The server side of a machine's screen (ADR 0075 D4): a subclass of vanilla's {@link FurnaceMenu} (or
 * {@link Blast}, {@link Smoker} for {@code menu}), so the client opens the vanilla screen with no code of ours. On the
 * server {@link #canSmelt} asks the machine's own recipe types (shift-click into the input slot) and {@link #isFuel} is
 * false unless {@code power} is {@code fuel}; the output slot (index 2) is replaced by an {@link MsmMachineResultSlot}
 * at the same place, keeping its index. The client predicts with vanilla's furnace rules and the server corrects it
 * (limit C10).
 */
public class MsmFurnaceMenu extends FurnaceMenu {
    private final MsmMachineBlockEntity machine;

    public MsmFurnaceMenu(int id, Inventory inventory, MsmMachineBlockEntity machine, ContainerData data) {
        super(id, inventory, machine, data);
        this.machine = machine;
        replaceResultSlot(this, inventory, machine);
    }

    /** The menu of {@code menu}'s kind for {@code machine}. */
    public static AbstractFurnaceMenu create(BlockComponents.MachineMenu menu, int id, Inventory inventory,
            MsmMachineBlockEntity machine, ContainerData data) {
        return switch (menu) {
            case FURNACE -> new MsmFurnaceMenu(id, inventory, machine, data);
            case BLAST_FURNACE -> new Blast(id, inventory, machine, data);
            case SMOKER -> new Smoker(id, inventory, machine, data);
        };
    }

    /** Puts an {@link MsmMachineResultSlot} where vanilla's result slot is, keeping its index and position. */
    private static void replaceResultSlot(AbstractContainerMenu menu, Inventory inventory, MsmMachineBlockEntity machine) {
        Slot old = menu.slots.get(AbstractFurnaceMenu.RESULT_SLOT);
        MsmMachineResultSlot slot = new MsmMachineResultSlot(inventory.player, machine, AbstractFurnaceMenu.RESULT_SLOT, old.x, old.y);
        slot.index = old.index;
        menu.slots.set(AbstractFurnaceMenu.RESULT_SLOT, slot);
    }

    @Override
    protected boolean canSmelt(ItemStack stack) {
        return machine != null ? machine.canProcess(stack) : super.canSmelt(stack);
    }

    @Override
    protected boolean isFuel(ItemStack stack) {
        return machine != null ? machine.isFuel(stack) : super.isFuel(stack);
    }

    /** The blast furnace screen ({@code menu: blast_furnace}). */
    public static class Blast extends BlastFurnaceMenu {
        private final MsmMachineBlockEntity machine;

        public Blast(int id, Inventory inventory, MsmMachineBlockEntity machine, ContainerData data) {
            super(id, inventory, machine, data);
            this.machine = machine;
            replaceResultSlot(this, inventory, machine);
        }

        @Override
        protected boolean canSmelt(ItemStack stack) {
            return machine != null ? machine.canProcess(stack) : super.canSmelt(stack);
        }

        @Override
        protected boolean isFuel(ItemStack stack) {
            return machine != null ? machine.isFuel(stack) : super.isFuel(stack);
        }
    }

    /** The smoker screen ({@code menu: smoker}). */
    public static class Smoker extends SmokerMenu {
        private final MsmMachineBlockEntity machine;

        public Smoker(int id, Inventory inventory, MsmMachineBlockEntity machine, ContainerData data) {
            super(id, inventory, machine, data);
            this.machine = machine;
            replaceResultSlot(this, inventory, machine);
        }

        @Override
        protected boolean canSmelt(ItemStack stack) {
            return machine != null ? machine.canProcess(stack) : super.canSmelt(stack);
        }

        @Override
        protected boolean isFuel(ItemStack stack) {
            return machine != null ? machine.isFuel(stack) : super.isFuel(stack);
        }
    }
}
