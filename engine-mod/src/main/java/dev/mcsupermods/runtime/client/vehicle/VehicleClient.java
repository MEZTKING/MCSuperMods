package dev.mcsupermods.runtime.client.vehicle;

/**
 * Client side of vehicles (ADR 0090 D7, D10): the renderer (through the {@code EntityRendererRegistration} seam), the
 * driver's input, engine sound and local turret. Named only from {@code MsmRuntimeClient}, so a dedicated server never
 * loads it. A stub until B418: it registers nothing yet.
 */
public final class VehicleClient {
    private VehicleClient() {}

    /** Registers the vehicle renderers and client hooks; called once from {@code MsmRuntimeClient.onInitializeClient}. */
    public static void init() {}
}
