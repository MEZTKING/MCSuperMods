package dev.mcsupermods.runtime.registry.inventory;

import dev.mcsupermods.runtime.loader.ItemDefinition;
import dev.mcsupermods.runtime.loader.ItemInventoryParser;
import dev.mcsupermods.runtime.registry.MsmItem;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;

/**
 * A bag ({@code msm:item_inventory}, ADR 0095 D1): a use (or, with {@code open: sneak_use}, a sneaking use) opens its
 * menu on the server through {@link BagGuard#open}; {@code msm:on_use} still fires after the menu opens. The bag never
 * fits inside container items (D3), so shulker boxes, bundles, other bags and its own menu refuse it. The other item
 * triggers are {@link MsmItem}'s.
 */
public class MsmInventoryItem extends MsmItem {
    private final ItemInventoryParser.Bag bag;

    public MsmInventoryItem(Identifier id, ItemDefinition definition, ItemInventoryParser.Bag bag, Properties properties) {
        super(id, definition, properties);
        this.bag = bag;
    }

    /** The bag's {@code msm:item_inventory} settings. */
    public ItemInventoryParser.Bag bag() {
        return bag;
    }

    /** Whether a use by {@code player} opens the bag. */
    public boolean opensFor(Player player) {
        return bag.open() == ItemInventoryParser.OpenMode.USE || player.isSecondaryUseActive();
    }

    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        if (!opensFor(player)) {
            return super.use(level, player, hand);
        }
        if (player instanceof ServerPlayer server) {
            BagGuard.open(server, hand, player.getItemInHand(hand), this);
        }
        return useWithEvent(id(), definition(), level, player, hand, () -> InteractionResult.SUCCESS);
    }

    @Override
    public boolean canFitInsideContainerItems() {
        return false;
    }
}
