package dev.mcsupermods.runtime.registry.inventory;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.ItemDefinition;
import dev.mcsupermods.runtime.loader.ItemInventoryParser;
import java.util.Optional;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.component.BundleContents;
import net.minecraft.world.item.component.ItemContainerContents;

/**
 * Item inventories (ADR 0095): an item with {@code msm:item_inventory} becomes an {@link MsmInventoryItem} (a bag that
 * opens a menu, guarded by {@link BagGuard}), one with {@code msm:bundle} an {@link MsmBundleItem}. Both stack to 1 and
 * start with an empty {@code minecraft:container} or {@code minecraft:bundle_contents}, so vanilla's tooltips and
 * saving apply. The parser has already dropped a bag or bundle that conflicts with a tool, weapon, armour, shield,
 * throwable, food or consumable ({@link ItemInventoryParser#check}), so the registrar's earlier item classes never see
 * one and the order of the calls in {@code MsmRegistrar.registerItem} needs no change.
 */
public final class ItemInventories {
    private ItemInventories() {}

    /**
     * The bag item for {@code definition}, or empty when it is not one (then the registrar builds the usual item); called
     * from the registrar when it builds an item. An unknown {@code open_sound} or {@code close_sound} is logged as a
     * warning (the barrel's sound is played instead).
     */
    public static Optional<Item> itemFor(Identifier id, ItemDefinition definition, Item.Properties props) {
        ItemInventoryParser.Inventory inventory = definition.components().inventory();
        if (inventory.bag().isPresent()) {
            registerHooks();
            ItemInventoryParser.Bag bag = inventory.bag().get();
            warnUnknownSound(id, "open_sound", bag.openSound());
            warnUnknownSound(id, "close_sound", bag.closeSound());
            return Optional.of(new MsmInventoryItem(id, definition, bag,
                    props.stacksTo(1).component(DataComponents.CONTAINER, ItemContainerContents.EMPTY)));
        }
        if (inventory.bundle().isPresent()) {
            return Optional.of(new MsmBundleItem(id, definition,
                    props.stacksTo(1).component(DataComponents.BUNDLE_CONTENTS, BundleContents.EMPTY)));
        }
        return Optional.empty();
    }

    private static boolean hooksRegistered;

    /**
     * Once, with the first bag (during start-up): a player who dies with a bag menu open has it closed at once, so the
     * last write, the close sound and {@code on_close} happen before the respawn replaces the player (vanilla keeps a dead
     * player's menu open, and the bag's {@code stillValid} only refuses its clicks).
     */
    private static synchronized void registerHooks() {
        if (hooksRegistered) {
            return;
        }
        hooksRegistered = true;
        ServerLivingEntityEvents.AFTER_DEATH.register((entity, source) -> {
            if (entity instanceof ServerPlayer player && player.containerMenu instanceof BagGuard.Menu) {
                player.closeContainer();
            }
        });
    }

    private static void warnUnknownSound(Identifier id, String field, Optional<Identifier> sound) {
        sound.filter(s -> !BuiltInRegistries.SOUND_EVENT.containsKey(s)).ifPresent(s -> MsmRuntime.LOGGER.warn(
                "[{}] item {}: msm:item_inventory {}: unknown sound {}; the barrel's sound is played", MsmRuntime.MOD_ID, id, field, s));
    }
}
