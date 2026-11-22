package dev.mcsupermods.runtime.registry.fluid;

import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

/**
 * The bottle of a project fluid, {@code <ns>:<path>_bottle} (ADR 0108 D3 and its amendment after B525): a drink built
 * by {@link MsmCauldrons} from vanilla's {@code Consumable} (the drink animation and sound, {@link
 * FluidDefinition#BOTTLE_DRINK_SECONDS}, the definition's effects, the food when given) that leaves a glass bottle
 * ({@code usingConvertsTo}). Drinking it to the end fires the fluid's {@code bottle.on_drink} event on the server, after
 * vanilla has applied the food and effects, with the drinker as self ({@link EventContext#forHolder}); an interrupted
 * drink fires nothing.
 */
public final class MsmBottleItem extends Item {
    private final Identifier fluidId;
    private final FluidDefinition definition;

    MsmBottleItem(Properties properties, Identifier fluidId, FluidDefinition definition) {
        super(properties);
        this.fluidId = fluidId;
        this.definition = definition;
    }

    /** The fluid this bottle holds. */
    public Identifier fluidId() {
        return fluidId;
    }

    @Override
    public ItemStack finishUsingItem(ItemStack stack, Level level, LivingEntity entity) {
        ItemStack result = super.finishUsingItem(stack, level, entity);
        var event = definition.bottle().flatMap(FluidDefinition.Bottle::onDrink);
        if (event.isPresent() && level instanceof ServerLevel server) {
            EventRunner.fire(fluidId, definition.events(), event.get(), EventContext.forHolder(server, entity));
        }
        return result;
    }
}
