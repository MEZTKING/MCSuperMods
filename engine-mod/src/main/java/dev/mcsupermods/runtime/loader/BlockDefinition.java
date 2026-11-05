package dev.mcsupermods.runtime.loader;

import com.google.gson.JsonObject;
import dev.mcsupermods.runtime.events.EventDefinition;
import java.util.Map;
import net.minecraft.resources.Identifier;

/** Block definition v1 (ADR 0025 D2), spike subset. */
public record BlockDefinition(
        String soundType,
        float hardness,
        float resistance,
        boolean requiresTool,
        int lightLevel,
        Identifier onInteract,
        ItemSettings item,
        Map<Identifier, EventDefinition> events) {

    /** The block item; null in {@link BlockDefinition#item} means no block item. */
    public record ItemSettings(int maxStackSize, String rarity, Identifier creativeTab) {}

    public static BlockDefinition parse(JsonObject json) throws DefinitionException {
        Json.requireFormat(json);
        String sound = Json.string(json, "sound_type", "stone");
        ItemSettings item = new ItemSettings(64, "common", null);
        if (json.has("item")) {
            JsonObject i = Json.object(json, "item");
            item = i == null ? null : new ItemSettings(
                    Json.integer(i, "max_stack_size", 64, 1, 99),
                    Json.string(i, "rarity", "common"),
                    tab(Json.string(i, "creative_tab", null)));
        }
        JsonObject components = Json.object(json, "components");
        if (components == null) {
            components = new JsonObject();
        }
        float hardness = 1.5f;
        float resistance = 6.0f;
        boolean requiresTool = false;
        JsonObject breakable = Json.object(components, "msm:breakable");
        if (breakable != null) {
            hardness = (float) Json.number(breakable, "hardness", 1.5);
            resistance = (float) Json.number(breakable, "resistance", 6.0);
            requiresTool = Json.bool(breakable, "requires_tool", false);
        }
        int light = 0;
        JsonObject emitter = Json.object(components, "msm:light_emitter");
        if (emitter != null) {
            light = Json.integer(emitter, "level", 15, 0, 15);
        }
        Map<Identifier, EventDefinition> events = EventParser.parse(json);
        Identifier onInteract = null;
        JsonObject interact = Json.object(components, "msm:on_interact");
        if (interact != null) {
            onInteract = EventParser.id(Json.requireString(interact, "event"), "event");
            if (!events.containsKey(onInteract)) {
                throw new DefinitionException("msm:on_interact names unknown event " + onInteract);
            }
        }
        return new BlockDefinition(sound, hardness, resistance, requiresTool, light, onInteract, item, events);
    }

    static Identifier tab(String s) throws DefinitionException {
        return s == null ? null : EventParser.id(s, "creative_tab");
    }
}
