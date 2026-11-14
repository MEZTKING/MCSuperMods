package dev.mcsupermods.runtime.scripting;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.item.ItemStack;

/**
 * {@code ItemRef} (ADR 0032 D2, ADR 0065 D1): an item stack at the time of the event (a copy). Components read as
 * their codec's JSON ({@link ScriptItems}).
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
                    ScriptItems.component(api, i.stack, ScriptItems.componentType(args, 0)));

    public ItemRef {
        stack = stack.copy();
    }
}
