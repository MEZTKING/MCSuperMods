package dev.mcsupermods.runtime.registry;

/**
 * Version seam (ADR 0038 D2, ADR 0098 D2): registers the point of interest of a project job site. 26.4 calls the private {@code PoiTypes.register(ResourceKey, Set, int, int)} by reflection (no Mixin). A stub until B474.
 */
public final class PoiTypes {
    private PoiTypes() {}

    /** Prepares the version's registration route; does nothing until B474. */
    public static void init() {}
}
