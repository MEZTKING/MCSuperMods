package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.LoadReport;

/**
 * Version seam (ADR 0105 D4 and its amendment after B503): the project's strip, flatten, till, wax, age and burn pairs on
 * vanilla blocks. 26.4: a stub from B505, B514 fills it in (one {@code UseBlockCallback} for strip, flatten, till and wax;
 * {@code age} through the content registries on 26.3 and the reserve brief B546's Mixin on 26.4).
 */
public final class VanillaPairs {
    private VanillaPairs() {}

    /** Registers the pairs of the loaded definitions; returns the report unchanged until B514. */
    public static LoadReport register(LoadReport report) {
        return report;
    }
}
