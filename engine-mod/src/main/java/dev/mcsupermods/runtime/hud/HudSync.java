package dev.mcsupermods.runtime.hud;

import dev.mcsupermods.runtime.loader.HudDefinition;
import dev.mcsupermods.runtime.net.HudPayload;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import net.fabricmc.fabric.api.entity.event.v1.ServerEntityLevelChangeEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerPlayerEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;

/**
 * Sends each player the changes of their HUD values (ADR 0089 D3) on the {@code hud_v1} payload. Server thread only.
 *
 * <ul>
 *   <li>Every {@link #UPDATE_TICKS} server ticks ({@code tickCount % 5 == 0}) the values of every element whose source
 *       the server computes ({@code data}, {@code score}, {@code vehicle}; {@link HudValues}) are computed for every
 *       player, and so is each server-computed {@code max} (its own slot, {@link HudState}).</li>
 *   <li>{@link HudServer#set}, {@link HudServer#show} and {@link HudServer#hide} (the three actions, scripts and Rules)
 *       change the player's state at once; it is sent at the end of that server tick.</li>
 *   <li>Only what differs from what was last sent goes out, at most {@link HudPayload#MAX_VALUES} entries a payload
 *       (more payloads when needed). A value that is no longer known (a vehicle stat on foot) is sent as an entry with
 *       neither number, text nor visibility, which clears it.</li>
 *   <li>A respawn or dimension change resends the whole state (every slot, cleared or not, and every visibility set by
 *       an action); leaving forgets it.</li>
 *   <li>Nothing is sent to a client without the runtime's receiver ({@code canSend}); the state is kept all the same,
 *       and {@link Observer}s (GameTests) see every payload built.</li>
 * </ul>
 */
public final class HudSync {
    /** Ticks between two computations of the synced values (ADR 0089 D3: a quarter second). */
    public static final int UPDATE_TICKS = 5;

    /** Told about every payload built for a player, sent or not (GameTests, diagnostics). */
    public interface Observer {
        void built(ServerPlayer player, HudPayload payload, long serverTick);
    }

    private static final Map<UUID, PlayerState> STATES = new HashMap<>();
    private static final List<Observer> OBSERVERS = new CopyOnWriteArrayList<>();
    private static boolean registered;

    private HudSync() {}

    /** One player's state: what should show and what was last sent, by slot. */
    static final class PlayerState {
        final Object[] current;
        final Object[] sent;
        /** False for a slot that must be sent whatever was sent before (after a resend request). */
        final boolean[] known;
        final Boolean[] visible;
        final Boolean[] sentVisible;
        boolean dirty;
        /** The vehicle and where it was at the last computation, for {@code speed}. */
        UUID vehicle;
        Vec3 vehicleAt;
        long vehicleTick;

        PlayerState(int count) {
            current = new Object[count * 2];
            sent = new Object[count * 2];
            known = new boolean[count * 2];
            Arrays.fill(known, true);
            visible = new Boolean[count];
            sentVisible = new Boolean[count];
        }
    }

    public static void addObserver(Observer observer) {
        OBSERVERS.add(observer);
    }

    public static void removeObserver(Observer observer) {
        OBSERVERS.remove(observer);
    }

    static void register() {
        if (registered) {
            return;
        }
        registered = true;
        ServerTickEvents.END_SERVER_TICK.register(HudSync::tick);
        ServerPlayerEvents.AFTER_RESPAWN.register((oldPlayer, newPlayer, alive) -> resendAll(newPlayer));
        ServerEntityLevelChangeEvents.AFTER_PLAYER_CHANGE_LEVEL.register((player, origin, destination) -> resendAll(player));
        ServerPlayerEvents.LEAVE.register(HudSync::forget);
        ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> forget(handler.player));
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> STATES.clear());
    }

    private static PlayerState state(ServerPlayer player) {
        return STATES.computeIfAbsent(player.getUUID(), u -> new PlayerState(HudServer.ids().size()));
    }

    /** Forgets {@code player}'s values (they left). */
    public static void forget(ServerPlayer player) {
        STATES.remove(player.getUUID());
    }

    /** Sends {@code player}'s whole state again at the end of this tick (respawn, dimension change). */
    public static void resendAll(ServerPlayer player) {
        PlayerState state = STATES.get(player.getUUID());
        if (state == null) {
            return;
        }
        Arrays.fill(state.known, false);
        Arrays.fill(state.sentVisible, null);
        state.dirty = true;
    }

    /** Sets element {@code index}'s value for {@code player} ({@link HudServer#set}); null clears it. */
    static void set(ServerPlayer player, int index, Object value) {
        PlayerState state = state(player);
        state.current[index] = value;
        state.dirty = true;
    }

    /** Shows or hides element {@code index} for {@code player} ({@link HudServer#show}, {@link HudServer#hide}). */
    static void setVisible(ServerPlayer player, int index, boolean visible) {
        PlayerState state = state(player);
        state.visible[index] = visible;
        state.dirty = true;
    }

    /** What {@code player} was last sent for slot {@code slot} (a Double, a String or null); GameTests and scripts. */
    public static Object sent(ServerPlayer player, int slot) {
        PlayerState state = STATES.get(player.getUUID());
        return state == null || slot < 0 || slot >= state.sent.length ? null : state.sent[slot];
    }

    /** The visibility a show or hide action gave element {@code index} for {@code player}, or null. */
    public static Boolean visible(ServerPlayer player, int index) {
        PlayerState state = STATES.get(player.getUUID());
        return state == null || index < 0 || index >= state.visible.length ? null : state.visible[index];
    }

    private static void tick(MinecraftServer server) {
        List<HudDefinition> definitions = HudServer.ordered();
        if (definitions.isEmpty()) {
            return;
        }
        long now = server.getTickCount();
        boolean compute = now % UPDATE_TICKS == 0;
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            if (compute) {
                compute(player, definitions, now);
            }
            PlayerState state = STATES.get(player.getUUID());
            if (state != null && state.dirty) {
                flush(player, state, now);
            }
        }
    }

    /** Computes {@code player}'s server-side values now (also called by GameTests through the tick). */
    private static void compute(ServerPlayer player, List<HudDefinition> definitions, long now) {
        PlayerState state = state(player);
        double speed = speed(player, state, now);
        int count = definitions.size();
        for (int i = 0; i < count; i++) {
            HudDefinition def = definitions.get(i);
            if (def.value().source().computedOnServer()) {
                update(state, i, HudValues.compute(def.value(), player, speed));
            }
            if (def.max() instanceof HudDefinition.From from && from.value().source().computedOnServer()) {
                update(state, count + i, HudValues.compute(from.value(), player, speed));
            }
        }
    }

    private static void update(PlayerState state, int slot, Object value) {
        state.current[slot] = value;
        if (!state.known[slot] || !Objects.equals(state.sent[slot], value)) {
            state.dirty = true;
        }
    }

    /** The speed of the player's vehicle in blocks a second since the last computation, or NaN (on foot, first time). */
    private static double speed(ServerPlayer player, PlayerState state, long now) {
        Entity vehicle = player.getVehicle();
        if (vehicle == null) {
            state.vehicle = null;
            state.vehicleAt = null;
            return Double.NaN;
        }
        Vec3 at = vehicle.position();
        double speed = Double.NaN;
        if (vehicle.getUUID().equals(state.vehicle) && state.vehicleAt != null && now > state.vehicleTick) {
            speed = at.distanceTo(state.vehicleAt) / (now - state.vehicleTick) * 20;
        } else if (!vehicle.getUUID().equals(state.vehicle)) {
            speed = 0;
        }
        state.vehicle = vehicle.getUUID();
        state.vehicleAt = at;
        state.vehicleTick = now;
        return speed;
    }

    private static boolean canSend(ServerPlayer player) {
        try {
            return ServerPlayNetworking.canSend(player, HudPayload.TYPE);
        } catch (RuntimeException e) {
            return false; // a GameTest's mock player has no real connection
        }
    }

    private static void flush(ServerPlayer player, PlayerState state, long now) {
        state.dirty = false;
        List<HudPayload.Value> entries = new ArrayList<>();
        int count = state.visible.length;
        for (int slot = 0; slot < state.current.length; slot++) {
            Object value = state.current[slot];
            boolean valueChanged = !state.known[slot] || !Objects.equals(value, state.sent[slot]);
            Boolean visible = slot < count ? state.visible[slot] : null;
            boolean visibleChanged = slot < count && visible != null && !visible.equals(state.sentVisible[slot]);
            if (valueChanged && value == null) {
                // A clear has neither number nor text nor visibility, so a visibility change goes in its own entry.
                entries.add(new HudPayload.Value(slot, Optional.empty(), Optional.empty(), Optional.empty()));
                if (visibleChanged) {
                    entries.add(new HudPayload.Value(slot, Optional.empty(), Optional.empty(), Optional.of(visible)));
                }
            } else if (valueChanged || visibleChanged) {
                entries.add(new HudPayload.Value(slot,
                        valueChanged && value instanceof Double d ? Optional.of(d) : Optional.empty(),
                        valueChanged && value instanceof String s ? Optional.of(s) : Optional.empty(),
                        visibleChanged ? Optional.of(visible) : Optional.empty()));
            }
            state.sent[slot] = value;
            state.known[slot] = true;
            if (visibleChanged) {
                state.sentVisible[slot] = visible;
            }
        }
        if (entries.isEmpty()) {
            return;
        }
        boolean canSend = canSend(player);
        for (int from = 0; from < entries.size(); from += HudPayload.MAX_VALUES) {
            HudPayload payload = new HudPayload(HudServer.hash(), entries.subList(from, Math.min(entries.size(), from + HudPayload.MAX_VALUES)));
            for (Observer observer : OBSERVERS) {
                observer.built(player, payload, now);
            }
            if (canSend) {
                ServerPlayNetworking.send(player, payload);
            }
        }
    }
}
