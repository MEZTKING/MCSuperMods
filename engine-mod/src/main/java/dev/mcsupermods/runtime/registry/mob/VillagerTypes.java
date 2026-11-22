package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.loader.LoadReport;

/**
 * Project villager types (ADR 0107 D5 and its amendment after B524): entries of {@code BuiltInRegistries.VILLAGER_TYPE} with
 * their biomes and textures. A stub from B526: B528 fills it in.
 */
public final class VillagerTypes {
    private VillagerTypes() {}

    /** Registers the scanned {@code villager_type} definitions; returns the report unchanged (until B528). */
    public static LoadReport register(LoadReport report) {
        return report;
    }
}
