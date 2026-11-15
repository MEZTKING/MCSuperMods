package dev.mcsupermods.runtime.client.hud;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.client.HudRegistration;
import dev.mcsupermods.runtime.hud.HudServer;
import dev.mcsupermods.runtime.hud.HudState;
import dev.mcsupermods.runtime.net.HudPayload;
import java.util.List;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.resources.Identifier;

/**
 * Client side of HUD elements (ADR 0089 D3 to D5): the {@code hud_v1} receiver, which keeps the server's values in a
 * {@link HudState} (ignoring payloads from a server whose HUD list differs, with one warning), and the runtime's HUD
 * layer {@code msm_runtime:hud} ({@link MsmHudLayer}), attached before vanilla's chat through the
 * {@link HudRegistration} seam (plan V10). The layer is registered only when the game has HUD elements or vehicle types
 * (the dashboard, {@link VehicleDashboard}). Named only from {@code MsmRuntimeClient}, so a dedicated server never loads
 * it. The values are forgotten when the client joins or leaves a server.
 */
public final class HudClient {
    /** The runtime's HUD layer. */
    public static final Identifier LAYER = Identifier.fromNamespaceAndPath(MsmRuntime.MOD_ID, "hud");

    private static HudState state = new HudState(0, HudServer.hashOf(List.of()));
    private static boolean initialised;
    private static boolean layer;

    private HudClient() {}

    /** Registers the HUD layer and the payload receiver; called once from {@code MsmRuntimeClient.onInitializeClient}. */
    public static void init() {
        if (initialised) {
            return;
        }
        initialised = true;
        state = new HudState(HudServer.ids().size(), HudServer.hash());
        // Fabric hands the payload over on the render thread (B406 S7), where the layer also reads it.
        ClientPlayNetworking.registerGlobalReceiver(HudPayload.TYPE, (payload, context) -> state.apply(payload));
        ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> state.clear());
        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> state.clear());
        if (!HudServer.ids().isEmpty() || !MsmRuntime.report().vehicles().isEmpty()) {
            HudRegistration.register(LAYER, MsmHudLayer::draw);
            layer = true;
        }
    }

    /** The values this client was sent. */
    public static HudState state() {
        return state;
    }

    /** Whether the HUD layer is registered. */
    public static boolean layerRegistered() {
        return layer;
    }
}
