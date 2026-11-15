package dev.mcsupermods.runtime.client.controls;

import dev.mcsupermods.runtime.net.KeyPayload;
import dev.mcsupermods.runtime.registry.vehicle.VehicleDriver;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;

/**
 * Client side of project key binds (ADR 0088 D3, D4): one key mapping per {@code key_bind} definition
 * ({@link ProjectKeyMappings}) and the runtime's vehicle keys ({@link RuntimeKeys}, D5), sent to the server on the
 * {@code key_v1} payload. Named only from {@code MsmRuntimeClient}, so a dedicated server never loads it.
 *
 * <p>At the end of every client tick each mapping is compared with what was last sent: a key that went down sends
 * {@code pressed: true}, one that came up {@code false}; a click shorter than a tick ({@code consumeClick} without
 * {@code isDown}, B406) sends a press and a release together. While a screen is open, the window has no focus or there
 * is no player, every key counts as up, so each held key sends its release then (V6: keys do nothing inside screens).
 * Nothing is sent to a server without the runtime's receiver ({@code canSend}); leaving forgets what was sent (the
 * server clears its own set).
 */
public final class ControlsClient {
    private static final Map<KeyMapping, Identifier> KEYS = new LinkedHashMap<>();
    private static final Set<Identifier> SENT_DOWN = new HashSet<>();
    private static final AtomicInteger SENT = new AtomicInteger();
    private static boolean initialised;

    private ControlsClient() {}

    /** Registers the key mappings and client tick hooks; called once from {@code MsmRuntimeClient.onInitializeClient}. */
    public static void init() {
        if (initialised) {
            return;
        }
        initialised = true;
        ProjectKeyMappings.register().forEach((id, mapping) -> KEYS.put(mapping, id));
        RuntimeKeys.register().forEach((key, mapping) -> KEYS.put(mapping, key.id()));
        // The vehicle physics' "descend" input on the driver's client (ADR 0088 D5, B412's seam).
        VehicleDriver.descend = RuntimeKeys::isDescendDown;
        ClientTickEvents.END_CLIENT_TICK.register(ControlsClient::tick);
        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> SENT_DOWN.clear());
    }

    /** How many key payloads this client sent (client GameTests). */
    public static int sent() {
        return SENT.get();
    }

    /** Whether the server was last told that {@code key} is down (client GameTests). */
    public static boolean sentDown(Identifier key) {
        return SENT_DOWN.contains(key);
    }

    private static void tick(Minecraft client) {
        if (KEYS.isEmpty()) {
            return;
        }
        boolean connected = client.player != null && client.getConnection() != null && ClientPlayNetworking.canSend(KeyPayload.TYPE);
        if (!connected) {
            SENT_DOWN.clear();
            KEYS.keySet().forEach(ControlsClient::drainClicks);
            return;
        }
        boolean active = client.gui.screen() == null && client.isWindowActive();
        for (Map.Entry<KeyMapping, Identifier> entry : KEYS.entrySet()) {
            KeyMapping mapping = entry.getKey();
            Identifier id = entry.getValue();
            boolean clicked = drainClicks(mapping);
            boolean down = active && mapping.isDown();
            boolean was = SENT_DOWN.contains(id);
            if (down && !was) {
                send(id, true);
            } else if (!down && was) {
                send(id, false);
            } else if (!down && clicked && active) {
                send(id, true);
                send(id, false);
            }
        }
    }

    /** Consumes the mapping's queued clicks; true when there was at least one. */
    private static boolean drainClicks(KeyMapping mapping) {
        boolean clicked = false;
        while (mapping.consumeClick()) {
            clicked = true;
        }
        return clicked;
    }

    private static void send(Identifier id, boolean pressed) {
        if (pressed) {
            SENT_DOWN.add(id);
        } else {
            SENT_DOWN.remove(id);
        }
        ClientPlayNetworking.send(new KeyPayload(id, pressed));
        SENT.incrementAndGet();
    }
}
