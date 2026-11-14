package dev.mcsupermods.runtime.registry.machine;

import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.FurnaceResultSlot;
import net.minecraft.world.item.ItemStack;

/**
 * The output slot of a machine's menu (ADR 0075 D4, D6): vanilla's {@link FurnaceResultSlot} (no placing, the crafted
 * item's own triggers), which pays experience only for an {@code AbstractFurnaceBlockEntity}; this one pays the
 * machine's stored experience to the taking player. {@link MsmFurnaceMenu} puts it at index 2 in place of vanilla's.
 */
public class MsmMachineResultSlot extends FurnaceResultSlot {
    private final Player taker;
    private final MsmMachineBlockEntity machine;

    public MsmMachineResultSlot(Player player, MsmMachineBlockEntity machine, int slot, int x, int y) {
        super(player, machine, slot, x, y);
        this.taker = player;
        this.machine = machine;
    }

    @Override
    protected void checkTakeAchievements(ItemStack stack) {
        super.checkTakeAchievements(stack);
        if (taker instanceof ServerPlayer player) {
            machine.payExperience(player);
        }
    }
}
