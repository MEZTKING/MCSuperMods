package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.ItemDefinition;
import net.minecraft.world.item.Item;

/** Driver class for every {@code msm/<ns>/item/*.json} definition. */
public class MsmItem extends Item {
    private final ItemDefinition definition;

    public MsmItem(ItemDefinition definition, Properties properties) {
        super(properties);
        this.definition = definition;
    }

    public ItemDefinition definition() {
        return definition;
    }
}
