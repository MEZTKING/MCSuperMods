package dev.mcsupermods.runtime.loader;

import com.google.gson.JsonObject;
import net.minecraft.resources.Identifier;

/** Item definition v1 (ADR 0025 D3), spike subset. */
public record ItemDefinition(int maxStackSize, String rarity, Identifier creativeTab) {
    public static ItemDefinition parse(JsonObject json) throws DefinitionException {
        Json.requireFormat(json);
        return new ItemDefinition(
                Json.integer(json, "max_stack_size", 64, 1, 99),
                Json.string(json, "rarity", "common"),
                BlockDefinition.tab(Json.string(json, "creative_tab", null)));
    }
}
