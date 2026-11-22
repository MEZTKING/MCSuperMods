package dev.mcsupermods.runtime.registry.boat;

import dev.mcsupermods.runtime.loader.LoadReport;

/**
 * Boats and chest boats of project woods (ADR 0110 D1 and its amendment after B524): the entity types and the items that place
 * them. A stub from B526: B536 fills it in.
 */
public final class MsmBoats {
    private MsmBoats() {}

    /** Registers the boats of the scanned items' {@code msm:boat} components; returns the report unchanged (until B536). */
    public static LoadReport register(LoadReport report) {
        return report;
    }
}
