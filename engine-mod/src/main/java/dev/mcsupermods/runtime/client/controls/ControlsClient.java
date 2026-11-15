package dev.mcsupermods.runtime.client.controls;

/**
 * Client side of project key binds (ADR 0088 D3, D4): one key mapping per {@code key_bind} definition and the runtime's
 * vehicle keys (D5), sent to the server on the {@code key_v1} payload. Named only from {@code MsmRuntimeClient}, so a
 * dedicated server never loads it. A stub until B411: it registers nothing yet.
 */
public final class ControlsClient {
    private ControlsClient() {}

    /** Registers the key mappings and client tick hooks; called once from {@code MsmRuntimeClient.onInitializeClient}. */
    public static void init() {}
}
