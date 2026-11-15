package dev.mcsupermods.runtime.registry.inventory;

import dev.mcsupermods.runtime.loader.ItemDefinition;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.Item;

/**
 * Item inventories (ADR 0095): an item with {@code msm:item_inventory} or {@code msm:bundle} becomes its bag class. A
 * stub until B450: no definition is a bag.
 */
public final class ItemInventories {
    private ItemInventories() {}

    /**
     * The bag item for {@code definition}, or empty when it is not one (then the registrar builds the usual item); called
     * from the registrar when it builds an item.
     */
    public static Optional<Item> itemFor(Identifier id, ItemDefinition definition, Item.Properties props) {
        return Optional.empty();
    }
}
