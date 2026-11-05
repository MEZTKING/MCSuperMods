package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.components.ItemComponents;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.loader.ItemDefinition;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

/**
 * Driver class for every {@code msm/<ns>/item/*.json} definition. Food, tool and durability are
 * vanilla data components set on the properties by {@link MsmRegistrar}; this class handles
 * {@code msm:on_use}.
 */
public class MsmItem extends Item {
    private final Identifier id;
    private final ItemDefinition definition;

    public MsmItem(Identifier id, ItemDefinition definition, Properties properties) {
        super(properties);
        this.id = id;
        this.definition = definition;
    }

    public Identifier id() {
        return id;
    }

    public ItemDefinition definition() {
        return definition;
    }

    /**
     * {@code msm:on_use}: fires the event, then starts the cooldown. Food still starts eating
     * afterwards (the vanilla behaviour of {@code super.use}).
     */
    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        Optional<ItemComponents.OnUse> onUse = definition.components().onUse();
        if (onUse.isEmpty()) {
            return super.use(level, player, hand);
        }
        ItemStack stack = player.getItemInHand(hand);
        if (player.getCooldowns().isOnCooldown(stack)) {
            return InteractionResult.FAIL;
        }
        if (level instanceof ServerLevel server) {
            EventRunner.fire(id, definition.events(), onUse.get().event(), EventContext.forItem(server, player));
        }
        if (onUse.get().cooldownTicks() > 0) {
            player.getCooldowns().addCooldown(stack, onUse.get().cooldownTicks());
        }
        InteractionResult vanilla = super.use(level, player, hand);
        return vanilla == InteractionResult.PASS ? InteractionResult.SUCCESS : vanilla;
    }
}
