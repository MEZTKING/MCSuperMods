package dev.mcsupermods.runtime.registry.container;

import net.minecraft.world.item.BlockItem;
import net.minecraft.world.level.block.Block;

/**
 * The block item of a keep-contents container (ADR 0074 D6): it carries the contents in its {@code container} component,
 * so, like a shulker box, it cannot go inside another container item ({@code canFitInsideContainerItems} false). The
 * shulker box menu's slots, hoppers ({@link MsmStorageBlockEntity#canPlaceItem}) and bundles refuse it.
 */
public class MsmContainerBlockItem extends BlockItem {
    public MsmContainerBlockItem(Block block, Properties properties) {
        super(block, properties);
    }

    @Override
    public boolean canFitInsideContainerItems() {
        return false;
    }
}
