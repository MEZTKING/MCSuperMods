package dev.mcsupermods.runtime.scripting;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponentPatch;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.RegistryOps;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.ScriptRuntime;
import org.mozilla.javascript.Scriptable;

/**
 * Items for the script API 1.1 (ADR 0065 D1, D2, D9): {@code ItemSpec} arguments, equipment slot names and data
 * component values as JSON. Component JSON goes through {@link ScriptJson} (JSON values only, depth 128) and is at
 * most {@value #MAX_COMPONENT_JSON_BYTES} bytes of UTF-8 per call, in and out; over that is a {@code RangeError}. A
 * value that does not decode with the component's codec, or a stack that then fails vanilla's strict validation
 * ({@code ItemStack.validateStrict}), is a {@code TypeError}, and nothing changes.
 */
final class ScriptItems {
    private ScriptItems() {}

    /** Component JSON per call, in and out (ADR 0065 D9). */
    static final int MAX_COMPONENT_JSON_BYTES = 64 * 1024;

    /** The equipment slot names of the API, in the order of the {@code EquipmentSlot} alias. */
    static final Map<String, EquipmentSlot> EQUIPMENT = Map.of(
            "mainhand", EquipmentSlot.MAINHAND, "offhand", EquipmentSlot.OFFHAND, "head", EquipmentSlot.HEAD,
            "chest", EquipmentSlot.CHEST, "legs", EquipmentSlot.LEGS, "feet", EquipmentSlot.FEET);

    /** An equipment slot name; any other value is a {@code RangeError}. */
    static EquipmentSlot equipmentSlot(Object[] args, int i) {
        Object v = i < args.length ? args[i] : null;
        EquipmentSlot slot = v instanceof CharSequence s ? EQUIPMENT.get(s.toString()) : null;
        if (slot == null) {
            throw ScriptValues.rangeError("slot " + describe(v) + " is not one of mainhand, offhand, head, chest, legs, feet");
        }
        return slot;
    }

    static String describe(Object v) {
        if (v instanceof CharSequence s) {
            return "'" + s + "'";
        }
        return v == null ? "undefined" : Context.toString(v);
    }

    /** An item by id; an unknown or invalid id is a {@code TypeError}. */
    static Item item(Object[] args, int i) {
        return ScriptValues.entry(BuiltInRegistries.ITEM, ScriptValues.string(args, i, "item"), "item");
    }

    /**
     * The {@code ItemSpec} argument {@code i}: an item id, or {@code { id, count?, components? }}. The count is the
     * spec's own (1 by default, at least 1, possibly over the maximum stack size); components are a
     * {@code DataComponentPatch} in its JSON form.
     */
    static ItemStack spec(ScriptApi api, Object[] args, int i) {
        if (!ScriptValues.present(args, i)) {
            throw ScriptRuntime.typeError("item is missing");
        }
        Object v = args[i];
        if (v instanceof CharSequence) {
            return new ItemStack(ScriptValues.entry(BuiltInRegistries.ITEM, v.toString(), "item"));
        }
        if (!(v instanceof Scriptable spec) || v instanceof HostObject) {
            throw ScriptRuntime.typeError("item must be an item id or { id, count?, components? }");
        }
        Object idValue = ScriptValues.member(spec, "id");
        if (idValue == null) {
            throw ScriptRuntime.typeError("item.id is missing");
        }
        Item item = ScriptValues.entry(BuiltInRegistries.ITEM, Context.toString(idValue), "item");
        int count = (int) Math.max(1, Math.floor(ScriptValues.numberMember(spec, "count", 1)));
        Object components = ScriptValues.member(spec, "components");
        DataComponentPatch patch = DataComponentPatch.EMPTY;
        if (components != null) {
            JsonElement json = limited(ScriptJson.fromScript(components), "item.components");
            if (!(json instanceof JsonObject)) {
                throw ScriptRuntime.typeError("item.components must be an object of component ids to values");
            }
            patch = decode(DataComponentPatch.CODEC, api.jsonOps(), json, "item.components");
        }
        Holder<Item> holder = BuiltInRegistries.ITEM.wrapAsHolder(item);
        // Validated as one item: the count is the caller's to split (give) or cap (set) by the maximum stack size.
        ItemStack stack = validated(new ItemStack(holder, 1, patch), "item.components");
        stack.setCount(count);
        return stack;
    }

    /** A data component type by id; an unknown id is a {@code TypeError}. */
    static DataComponentType<?> componentType(Object[] args, int i) {
        return ScriptValues.entry(BuiltInRegistries.DATA_COMPONENT_TYPE, ScriptValues.string(args, i, "component id"),
                "data component");
    }

    /**
     * The value of a component of a stack as JSON in a fresh script value, or null for {@code undefined} (the stack
     * does not have it, or the component is never saved); over the size limit is a {@code RangeError}.
     */
    static Object component(ScriptApi api, ItemStack stack, DataComponentType<?> type) {
        JsonElement json = componentJson(api, stack, type);
        if (json == null) {
            return null;
        }
        limited(json, "component " + BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(type));
        Object value = ScriptJson.toScript(Context.getCurrentContext(), api.scope(), json);
        return value == null ? ScriptValues.NULL : value;
    }

    private static <T> JsonElement componentJson(ScriptApi api, ItemStack stack, DataComponentType<T> type) {
        T value = stack.get(type);
        Codec<T> codec = type.codec();
        if (value == null || codec == null) {
            return null;
        }
        DataResult<JsonElement> result = codec.encodeStart(api.jsonOps(), value);
        return result.result().orElseThrow(() -> ScriptRuntime.typeError("component "
                + BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(type) + " cannot be written as JSON: "
                + result.error().map(DataResult.Error::message).orElse("")));
    }

    /**
     * A copy of {@code stack} with component {@code type} set to the script value {@code value} (decoded from its JSON
     * with the component's codec), or removed when {@code value} is null; validated strictly.
     */
    static ItemStack withComponent(ScriptApi api, ItemStack stack, DataComponentType<?> type, Object value) {
        ItemStack copy = stack.copy();
        String what = "component " + BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(type);
        if (value == null) {
            copy.remove(type);
        } else {
            set(api, copy, type, limited(ScriptJson.fromScript(value), what), what);
        }
        return validated(copy, what);
    }

    private static <T> void set(ScriptApi api, ItemStack stack, DataComponentType<T> type, JsonElement json, String what) {
        Codec<T> codec = type.codec();
        if (codec == null) {
            throw ScriptRuntime.typeError(what + " is never saved and cannot be set from a script");
        }
        stack.set(type, decode(codec, api.jsonOps(), json, what));
    }

    private static <T> T decode(Codec<T> codec, RegistryOps<JsonElement> ops, JsonElement json, String what) {
        DataResult<T> result = codec.parse(ops, json);
        return result.result().orElseThrow(() -> ScriptRuntime.typeError(what + " is not valid: "
                + result.error().map(DataResult.Error::message).orElse("")));
    }

    private static ItemStack validated(ItemStack stack, String what) {
        DataResult<ItemStack> result = ItemStack.validateStrict(stack);
        if (result.error().isPresent()) {
            throw ScriptRuntime.typeError(what + " is not valid: " + result.error().get().message());
        }
        return stack;
    }

    /** {@code json} when its text is at most {@value #MAX_COMPONENT_JSON_BYTES} bytes, else a {@code RangeError}. */
    static JsonElement limited(JsonElement json, String what) {
        int bytes = json.toString().getBytes(StandardCharsets.UTF_8).length;
        if (bytes > MAX_COMPONENT_JSON_BYTES) {
            throw ScriptValues.rangeError(what + " is " + bytes + " bytes of JSON, over the limit of " + MAX_COMPONENT_JSON_BYTES);
        }
        return json;
    }
}
