package dev.mcsupermods.runtime.loader;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.resources.Identifier;

/**
 * Result of a scan or a registration pass. Messages start with the file and the mod they concern.
 * {@code items} includes block items and spawn eggs; {@code entities} the entity types; {@code effects} the mob
 * effects (ADR 0055); {@code sounds} the sound events (ADR 0057 D1): after a scan the keys found in {@code sounds.json}
 * files, after registration the ones this runtime registered (keys already registered by someone else are left out).
 */
public record LoadReport(
        int filesRead,
        List<RawDefinition> definitions,
        List<Identifier> blocks,
        List<Identifier> items,
        List<Identifier> entities,
        List<Identifier> effects,
        List<Identifier> sounds,
        List<String> errors,
        List<String> warnings) {
    public static final LoadReport EMPTY = new LoadReport(0, List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());

    /** This report plus warnings found later (after server start-up). */
    public LoadReport withWarnings(List<String> more) {
        List<String> all = new ArrayList<>(warnings);
        all.addAll(more);
        return new LoadReport(filesRead, definitions, blocks, items, entities, effects, sounds, errors, List.copyOf(all));
    }
}
