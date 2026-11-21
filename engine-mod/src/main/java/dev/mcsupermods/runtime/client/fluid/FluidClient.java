package dev.mcsupermods.runtime.client.fluid;

/**
 * Client side of project fluids (ADR 0099 D2): the still and flowing pictures, the plain RGB tint and the optional
 * overlay, registered with Fabric's fluid rendering API. A stub until B475; a dedicated server never loads this class.
 */
public final class FluidClient {
    private FluidClient() {}

    /** Registers the renderers of the project fluids; called from the client entrypoint. Does nothing until B475. */
    public static void init() {}
}
