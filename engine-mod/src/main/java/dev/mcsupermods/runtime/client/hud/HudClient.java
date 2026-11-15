package dev.mcsupermods.runtime.client.hud;

/**
 * Client side of HUD elements (ADR 0089 D3 to D5): the layer that draws the values of the {@code hud_v1} payload and the
 * vehicle dashboard. Its registration differs between versions and goes behind a seam in {@code src/mc/<mc>/} (plan V10).
 * Named only from {@code MsmRuntimeClient}, so a dedicated server never loads it. A stub until B416: it registers
 * nothing yet.
 */
public final class HudClient {
    private HudClient() {}

    /** Registers the HUD layer and the payload receiver; called once from {@code MsmRuntimeClient.onInitializeClient}. */
    public static void init() {}
}
