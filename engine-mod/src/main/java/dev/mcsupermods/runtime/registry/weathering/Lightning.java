package dev.mcsupermods.runtime.registry.weathering;

/**
 * Lightning on project weathering blocks (ADR 0104 D2 and its amendment after B503): a Fabric
 * {@code ServerEntityEvents.ENTITY_LOAD} listener scrapes them when a bolt spawns. A stub from B505: B510 fills it in.
 */
public final class Lightning {
    private Lightning() {}

    /** Registers the listener; nothing yet. */
    public static void init() {}
}
