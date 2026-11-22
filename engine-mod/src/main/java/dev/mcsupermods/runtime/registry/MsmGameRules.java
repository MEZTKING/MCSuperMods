package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.LoadReport;

/**
 * Project game rules (ADR 0111 D5 and its amendment after B525): Fabric's {@code GameRuleBuilder}. A stub from B526: B533 fills
 * it in.
 */
public final class MsmGameRules {
    private MsmGameRules() {}

    /** Registers the scanned {@code game_rule} definitions; returns the report unchanged (until B533). */
    public static LoadReport register(LoadReport report) {
        return report;
    }
}
