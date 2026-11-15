package dev.mcsupermods.runtime.client.controls;

import com.mojang.blaze3d.platform.InputConstants;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.controls.KeyBinds;
import dev.mcsupermods.runtime.loader.KeyBindDefinition;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.minecraft.client.KeyMapping;
import net.minecraft.resources.Identifier;

/**
 * One vanilla {@link KeyMapping} per {@code key_bind} definition (ADR 0088 D3), registered through Fabric's
 * {@link KeyMappingHelper} in the client entrypoint, so each key appears in vanilla's Controls screen, can be rebound and
 * is saved in {@code options.txt} by vanilla (B406 S6). The name is the definition's {@code name} or
 * {@code key.<ns>.<path>}; the category is {@code <ns>:<category>}, whose translation key vanilla makes
 * {@code key.category.<ns>.<category>}. A default key vanilla does not know registers unbound with one warning; a second
 * definition with the same name is skipped with a warning (vanilla keeps one mapping per name).
 */
public final class ProjectKeyMappings {
    private static final Map<Identifier, KeyMapping.Category> CATEGORIES = new HashMap<>();
    private static Map<Identifier, KeyMapping> mappings = Map.of();

    private ProjectKeyMappings() {}

    /** Registers the mappings of every key bind definition once; returns them by key bind id. */
    static Map<Identifier, KeyMapping> register() {
        if (!mappings.isEmpty()) {
            return mappings;
        }
        Map<Identifier, KeyMapping> out = new LinkedHashMap<>();
        for (Map.Entry<Identifier, KeyBindDefinition> entry : KeyBinds.definitions().entrySet()) {
            Identifier id = entry.getKey();
            KeyBindDefinition def = entry.getValue();
            String name = def.translationKey(id);
            if (KeyMapping.get(name) != null) {
                MsmRuntime.LOGGER.warn("[{}] key bind {}: another key already uses the name {}; this key is not registered",
                        MsmRuntime.MOD_ID, id, name);
                continue;
            }
            InputConstants.Key key = key(id.toString(), def.defaultKey());
            out.put(id, KeyMappingHelper.registerKeyMapping(new KeyMapping(name, key.getType(), key.getValue(), category(def.categoryId(id)))));
        }
        mappings = Map.copyOf(out);
        MsmRuntime.LOGGER.info("[{}] registered {} key mapping(s)", MsmRuntime.MOD_ID, mappings.size());
        return mappings;
    }

    /** The mapping of key bind {@code id}, or null (client GameTests). */
    public static KeyMapping get(Identifier id) {
        return mappings.get(id);
    }

    /** Every project mapping by key bind id. */
    public static Map<Identifier, KeyMapping> all() {
        return mappings;
    }

    /** The category {@code id}, registered with vanilla once. */
    static KeyMapping.Category category(Identifier id) {
        return CATEGORIES.computeIfAbsent(id, KeyMapping.Category::register);
    }

    /** Vanilla's key of {@code name}; {@link InputConstants#UNKNOWN} (unbound) with a warning when vanilla does not know it. */
    static InputConstants.Key key(String owner, String name) {
        if (name.equals(KeyBindDefinition.UNBOUND)) {
            return InputConstants.UNKNOWN;
        }
        try {
            InputConstants.Key key = InputConstants.getKey(name);
            if (key != null && key != InputConstants.UNKNOWN) {
                return key;
            }
        } catch (RuntimeException e) {
            // Unknown name: falls through to the warning.
        }
        MsmRuntime.LOGGER.warn("[{}] key bind {}: default_key {} is not a key name this game knows; the key starts unbound",
                MsmRuntime.MOD_ID, owner, name);
        return InputConstants.UNKNOWN;
    }
}
