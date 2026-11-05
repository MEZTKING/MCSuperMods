package dev.mcsupermods.runtime.loader;

import com.google.gson.JsonObject;
import net.minecraft.resources.Identifier;

/**
 * One {@code msm/<namespace>/<kind>/<path>.json} file as read from a mod container.
 *
 * @param modId the mod that shipped the file
 * @param kind  {@code block} or {@code item}
 * @param id    registry id: namespace and path from the file location
 * @param json  parsed file contents
 */
public record RawDefinition(String modId, String kind, Identifier id, JsonObject json) {
    public String describe() {
        return "msm/" + id.getNamespace() + "/" + kind + "/" + id.getPath() + ".json (mod " + modId + ")";
    }
}
