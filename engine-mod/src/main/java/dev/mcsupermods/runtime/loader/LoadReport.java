package dev.mcsupermods.runtime.loader;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.resources.Identifier;

/** Result of a scan or a registration pass. Messages start with the file and the mod they concern. */
public record LoadReport(
        int filesRead,
        List<RawDefinition> definitions,
        List<Identifier> blocks,
        List<Identifier> items,
        List<String> errors,
        List<String> warnings) {
    public static final LoadReport EMPTY = new LoadReport(0, List.of(), List.of(), List.of(), List.of(), List.of());

    /** This report plus warnings found later (after server start-up). */
    public LoadReport withWarnings(List<String> more) {
        List<String> all = new ArrayList<>(warnings);
        all.addAll(more);
        return new LoadReport(filesRead, definitions, blocks, items, errors, List.copyOf(all));
    }
}
