package dev.mcsupermods.runtime.registry.fluid;

import dev.mcsupermods.runtime.loader.LoadReport;

/**
 * Cauldrons and bottles of project fluids (ADR 0108 D2, D3 and its amendment after B525). A stub from B526: B529 fills it in.
 */
public final class MsmCauldrons {
    private MsmCauldrons() {}

    /** Registers the cauldron blocks and bottle items of the scanned fluids; returns the report unchanged (until B529). */
    public static LoadReport register(LoadReport report) {
        return report;
    }
}
