package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.ItemDefinition;
import net.minecraft.resources.Identifier;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.MaceItem;
import net.minecraft.world.level.Level;

/**
 * {@code msm:tool} of type {@code mace} (ADR 0044 D3): vanilla's mace (smash attack included) with the tier's
 * durability, repair items and enchantment value, set by {@link MsmRegistrar}. {@code msm:on_use} fires as on
 * {@link MsmItem}.
 */
public class MsmMaceItem extends MaceItem {
    private final Identifier id;
    private final ItemDefinition definition;

    public MsmMaceItem(Identifier id, ItemDefinition definition, Properties properties) {
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

    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        return MsmItem.useWithEvent(id, definition, level, player, hand, () -> super.use(level, player, hand));
    }
}
