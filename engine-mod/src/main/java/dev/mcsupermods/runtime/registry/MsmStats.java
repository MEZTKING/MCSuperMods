package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.LoadReport;

/**
 * Project statistics (ADR 0111 D6 and its amendment after B525): entries of {@code custom_stat}. A stub from B526: B533 fills it
 * in.
 */
public final class MsmStats {
    private MsmStats() {}

    /** Registers the scanned {@code stat} definitions; returns the report unchanged (until B533). */
    public static LoadReport register(LoadReport report) {
        return report;
    }
}
