package dev.mcsupermods.runtime.scripting;

import java.util.stream.Stream;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.BundleContents;
import net.minecraft.world.item.component.ItemContainerContents;

/**
 * {@code ItemRef} (ADR 0032 D2, ADR 0065 D1): an item stack at the time of the event (a copy). Components read as
 * their codec's JSON ({@link ScriptItems}). Script API 1.6 (ADR 0095 D5): {@code contents}, read-only, the stacks an
 * item holds: a bag's or any other container item's {@code minecraft:container} (shulker boxes too), in slot order,
 * then a bundle's {@code minecraft:bundle_contents}, in the bundle's order; empty slots are left out.
 */
public record ItemRef(ItemStack stack) {
    static final ScriptType TYPE = ScriptType.of("ItemRef")
            .constant("id", ItemRef.class, (api, i) -> BuiltInRegistries.ITEM.getKey(i.stack.getItem()).toString())
            .constant("count", ItemRef.class, (api, i) -> i.stack.getCount())
            .constant("name", ItemRef.class, (api, i) -> i.stack.getHoverName().getString())
            .constant("maxCount", ItemRef.class, (api, i) -> i.stack.getMaxStackSize())
            .constant("damage", ItemRef.class, (api, i) -> i.stack.isDamageableItem() ? i.stack.getDamageValue() : 0)
            .constant("maxDamage", ItemRef.class, (api, i) -> i.stack.isDamageableItem() ? i.stack.getMaxDamage() : 0)
            .method("hasComponent", 1, 1, ItemRef.class, (api, i, args) -> i.stack.has(ScriptItems.componentType(args, 0)))
            .method("getComponent", 1, 1, ItemRef.class, (api, i, args) ->
                    ScriptItems.component(api, i.stack, ScriptItems.componentType(args, 0)))
            .constant("contents", ItemRef.class, (api, i) -> api.array(contents(i.stack).map(s -> api.item(new ItemRef(s))).toArray()));

    /**
     * The stacks {@code stack} holds (copies): its {@code minecraft:container} items (bags store their contents there,
     * B450), then its {@code minecraft:bundle_contents} items; nothing for an item that holds nothing.
     */
    static Stream<ItemStack> contents(ItemStack stack) {
        ItemContainerContents container = stack.getOrDefault(DataComponents.CONTAINER, ItemContainerContents.EMPTY);
        BundleContents bundle = stack.getOrDefault(DataComponents.BUNDLE_CONTENTS, BundleContents.EMPTY);
        return Stream.concat(container.nonEmptyItemCopyStream(), bundle.itemCopies().filter(s -> !s.isEmpty()));
    }

    public ItemRef {
        stack = stack.copy();
    }
}
