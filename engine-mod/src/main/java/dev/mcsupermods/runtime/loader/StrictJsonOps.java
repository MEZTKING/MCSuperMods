package dev.mcsupermods.runtime.loader;

import com.google.gson.JsonElement;
import com.google.gson.JsonPrimitive;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.JsonOps;

/**
 * {@link JsonOps} without its lenient conversions: Mojang's ops read {@code true} as the number 1
 * and numbers as booleans. MSM mcdoc types are strict, so the runtime Codecs are too: a number
 * must be a JSON number and a boolean a JSON boolean.
 */
public final class StrictJsonOps extends JsonOps {
    public static final StrictJsonOps INSTANCE = new StrictJsonOps();

    private StrictJsonOps() {
        super(false);
    }

    @Override
    public DataResult<Number> getNumberValue(JsonElement input) {
        if (input instanceof JsonPrimitive p && p.isNumber()) {
            return DataResult.success(p.getAsNumber());
        }
        return DataResult.error(() -> "not a number: " + input);
    }

    @Override
    public DataResult<Boolean> getBooleanValue(JsonElement input) {
        if (input instanceof JsonPrimitive p && p.isBoolean()) {
            return DataResult.success(p.getAsBoolean());
        }
        return DataResult.error(() -> "not a boolean: " + input);
    }

    @Override
    public String toString() {
        return "StrictJSON";
    }
}
