package dev.mcsupermods.runtime.client.controls;

import com.mojang.blaze3d.platform.InputConstants;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.controls.KeyBinds;
import dev.mcsupermods.runtime.controls.KeyBinds.RuntimeKey;
import java.util.EnumMap;
import java.util.Map;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.minecraft.client.KeyMapping;

/**
 * The runtime's own keys (ADR 0088 D5): "Vehicle: fire" (R), "Vehicle: second weapon" (V), "Vehicle: horn" (H) and
 * "Vehicle: descend" (Left Alt) in the Controls category "MSM Vehicles", registered only when at least one vehicle type
 * is loaded ({@link KeyBinds#runtimeKeysActive()}), so a pack without vehicles shows none. They are sent on
 * {@code key_v1} with the ids of {@link RuntimeKey} like project keys; the server keeps them held for the vehicle
 * weapons and horn (B417). The readers below are for the vehicle client (B418): false when the keys are not registered.
 */
public final class RuntimeKeys {
    private static final Map<RuntimeKey, KeyMapping> MAPPINGS = new EnumMap<>(RuntimeKey.class);

    private RuntimeKeys() {}

    /** Registers the four mappings when a vehicle type is loaded; returns them (empty otherwise). */
    static Map<RuntimeKey, KeyMapping> register() {
        if (!MAPPINGS.isEmpty() || !KeyBinds.runtimeKeysActive()) {
            return MAPPINGS;
        }
        KeyMapping.Category category = ProjectKeyMappings.category(KeyBinds.RUNTIME_CATEGORY);
        for (RuntimeKey key : RuntimeKey.values()) {
            InputConstants.Key input = ProjectKeyMappings.key(key.id().toString(), key.defaultKey());
            MAPPINGS.put(key, KeyMappingHelper.registerKeyMapping(new KeyMapping(key.translationKey(), input.getType(), input.getValue(), category)));
        }
        MsmRuntime.LOGGER.info("[{}] registered {} vehicle key mapping(s)", MsmRuntime.MOD_ID, MAPPINGS.size());
        return MAPPINGS;
    }

    /** The mapping of {@code key}, or null when the runtime keys are not registered. */
    public static KeyMapping mapping(RuntimeKey key) {
        return MAPPINGS.get(key);
    }

    /** Whether {@code key} is registered and held down on this client now. */
    public static boolean isDown(RuntimeKey key) {
        KeyMapping mapping = MAPPINGS.get(key);
        return mapping != null && mapping.isDown();
    }

    public static boolean isFireDown() {
        return isDown(RuntimeKey.FIRE);
    }

    public static boolean isSecondDown() {
        return isDown(RuntimeKey.SECOND);
    }

    public static boolean isHornDown() {
        return isDown(RuntimeKey.HORN);
    }

    public static boolean isDescendDown() {
        return isDown(RuntimeKey.DESCEND);
    }
}
