package dev.mcsupermods.runtime.loader.types;

import com.mojang.serialization.MapCodec;
import dev.mcsupermods.runtime.loader.BlockType;
import java.util.List;

/**
 * The own fields of the furniture, light and sign block types {@code bed}, {@code ladder}, {@code torch}, {@code lantern},
 * {@code chain}, {@code rod}, {@code sign}, {@code hanging_sign}, {@code stem} and
 * {@code scaffolding} (ADR 0094 D1 to D6). A stub until B446: no type has fields of its own yet, and each parses to
 * {@link Pending}.
 */
public final class FurnitureFields {
    private FurnitureFields() {}

    /** The fields of no type yet; B446 replaces this with one record per type that has fields. */
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
