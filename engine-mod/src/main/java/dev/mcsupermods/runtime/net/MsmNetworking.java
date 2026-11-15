package dev.mcsupermods.runtime.net;

import dev.mcsupermods.runtime.controls.KeyBinds;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;

/**
 * The runtime's networking channel (ADR 0088 D1): the serverbound {@code msm_runtime:key_v1} ({@link KeyPayload}) and
 * clientbound {@code msm_runtime:hud_v1} ({@link HudPayload}) payload types, registered on both sides from the common
 * entrypoint, and the server's key receiver. The version is in the payload id: an incompatible change adds {@code _v2}
 * beside {@code _v1}. Each side checks {@code canSend} before sending, so a peer with an older runtime receives nothing.
 * No configuration-phase handshake.
 */
public final class MsmNetworking {
    private static boolean initialised;

    private MsmNetworking() {}

    /** Registers the payload types and server receivers; called once from {@code MsmRuntime.onInitialize}. */
    public static void init() {
        if (initialised) {
            return;
        }
        initialised = true;
        PayloadTypeRegistry.serverboundPlay().register(KeyPayload.TYPE, KeyPayload.CODEC);
        PayloadTypeRegistry.clientboundPlay().register(HudPayload.TYPE, HudPayload.CODEC);
        // Fabric hands the payload over on the server thread (B406 S7).
        ServerPlayNetworking.registerGlobalReceiver(KeyPayload.TYPE, (payload, context) -> KeyBinds.receive(context.player(), payload));
    }
}
