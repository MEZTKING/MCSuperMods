package dev.mcsupermods.runtime.loader.types;

import com.mojang.serialization.MapCodec;
import dev.mcsupermods.runtime.loader.BlockType;
import java.util.List;

/**
 * The own fields of the plant and food block types {@code cake}, {@code berry_bush}, {@code tall_plant},
 * {@code potted_plant}, {@code vine}, {@code sea_pickle}, {@code carpet}, {@code layers}, {@code cocoa} and
 * {@code candle} (ADR 0094 D1, D2, D4, D5). A stub until B445: no type has fields of its own yet, and each parses to
 * {@link Pending}.
 */
public final class PlantFields {
    private PlantFields() {}

    /** The fields of no type yet; B445 replaces this with one record per type. */
    public record Pending() implements BlockType.Extension {
        public static final Pending INSTANCE = new Pending();
    }

    /** The own top-level field names of the type {@code typeId}, in a stable order. */
    public static List<String> fields(String typeId) {
        return List.of();
    }

    /** The codec of the type's own fields, reading them from the definition's top level. */
    public static MapCodec<? extends BlockType.Fields> codec(String typeId) {
        return MapCodec.unit(Pending.INSTANCE);
    }
}
