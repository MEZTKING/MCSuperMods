package dev.mcsupermods.runtime.loader;

import java.util.List;
import net.minecraft.resources.Identifier;

/** Result of a scan or a registration pass. */
public record LoadReport(
        int filesRead,
        List<RawDefinition> definitions,
        List<Identifier> blocks,
        List<Identifier> items,
        List<String> errors) {
    public static final LoadReport EMPTY = new LoadReport(0, List.of(), List.of(), List.of(), List.of());
}
