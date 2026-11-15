package dev.mcsupermods.runtime.net;

/**
 * The runtime's networking channel (ADR 0088 D1): the serverbound {@code msm_runtime:key_v1} and clientbound
 * {@code msm_runtime:hud_v1} payload types and the server's receivers, registered on both sides from the common
 * entrypoint. A stub until B411: it registers nothing yet.
 */
public final class MsmNetworking {
    private MsmNetworking() {}

    /** Registers the payload types and server receivers; called once from {@code MsmRuntime.onInitialize}. */
    public static void init() {
        // B411: PayloadTypeRegistry.serverboundPlay()/clientboundPlay() and ServerPlayNetworking receivers.
    }
}
