package dev.mcsupermods.runtime.scripting;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.item.ItemStack;

/** {@code ItemRef} (ADR 0032 D2): an item stack at the time of the event (a copy). */
public record ItemRef(ItemStack stack) {
    static final ScriptType TYPE = ScriptType.of("ItemRef")
            .constant("id", ItemRef.class, (api, i) -> BuiltInRegistries.ITEM.getKey(i.stack.getItem()).toString())
            .constant("count", ItemRef.class, (api, i) -> i.stack.getCount());

    public ItemRef {
        stack = stack.copy();
    }
}
