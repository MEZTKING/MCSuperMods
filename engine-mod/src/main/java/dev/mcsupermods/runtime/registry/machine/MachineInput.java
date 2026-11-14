package dev.mcsupermods.runtime.registry.machine;

import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.crafting.RecipeInput;

/** The input of a machine recipe (ADR 0075 D2): the input slot's stack, with its count. */
public record MachineInput(ItemStack item) implements RecipeInput {
    @Override
    public ItemStack getItem(int index) {
        if (index != 0) {
            throw new IllegalArgumentException("a machine input has one slot, not " + index);
        }
        return item;
    }

    @Override
    public int size() {
        return 1;
    }
}
