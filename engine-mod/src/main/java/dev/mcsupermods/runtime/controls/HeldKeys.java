package dev.mcsupermods.runtime.controls;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.Player;

/**
 * The keys each player holds, as the server knows them (ADR 0088 D4): a key is held from a press that fired (passed
 * {@code when} and the cooldown; runtime keys always do) until its release, or until the set is cleared by leaving,
 * death, respawn or a dimension change (no release events then). The set is bounded by the number of known keys (D7
 * rule 6); a second press of a held key and a release of a key not held are ignored.
 *
 * <p>Read on the server thread only. The static readers ({@link #isHeld}, {@link #heldTicks}, {@link #held}) are the API
 * for the vehicle weapons (B417), the HUD (B416) and scripts (B421).
 */
public final class HeldKeys {
    /**
     * One held key.
     *
     * @param since    the server tick of the press
     * @param nextHold the server tick of the next {@code msm:while_held} firing
     */
    record Held(long since, long nextHold) {}

    private static final Map<UUID, Map<Identifier, Held>> BY_PLAYER = new HashMap<>();

    private HeldKeys() {}

    /** Whether {@code player} holds {@code key} (a key bind id or a runtime key id such as {@code msm_runtime:vehicle_fire}). */
    public static boolean isHeld(Player player, Identifier key) {
        Map<Identifier, Held> held = BY_PLAYER.get(player.getUUID());
        return held != null && held.containsKey(key);
    }

    /** How many ticks {@code player} has held {@code key} at server tick {@code now}, or -1 when not held. */
    public static long heldTicks(Player player, Identifier key, long now) {
        Map<Identifier, Held> held = BY_PLAYER.get(player.getUUID());
        Held h = held == null ? null : held.get(key);
        return h == null ? -1 : now - h.since();
    }

    /** The keys {@code player} holds, in press order. */
    public static Set<Identifier> held(Player player) {
        Map<Identifier, Held> held = BY_PLAYER.get(player.getUUID());
        return held == null ? Set.of() : Set.copyOf(held.keySet());
    }

    /** Players holding at least one key (tests, diagnostics). */
    public static int playersHolding() {
        return BY_PLAYER.size();
    }

    /** Marks {@code key} held from {@code tick}; false when it already was. */
    static boolean press(UUID player, Identifier key, long tick, int holdInterval) {
        Map<Identifier, Held> held = BY_PLAYER.computeIfAbsent(player, p -> new LinkedHashMap<>());
        return held.putIfAbsent(key, new Held(tick, tick + holdInterval)) == null;
    }

    /** Whether {@code key} is held, without a player object (the receiver checks a repeat press). */
    static boolean isHeld(UUID player, Identifier key) {
        Map<Identifier, Held> held = BY_PLAYER.get(player);
        return held != null && held.containsKey(key);
    }

    /** Releases {@code key}; false when it was not held. */
    static boolean release(UUID player, Identifier key) {
        Map<Identifier, Held> held = BY_PLAYER.get(player);
        if (held == null || held.remove(key) == null) {
            return false;
        }
        if (held.isEmpty()) {
            BY_PLAYER.remove(player);
        }
        return true;
    }

    /**
     * The keys of {@code player} whose {@code msm:while_held} is due at {@code tick}; each one's next firing moves on by
     * its interval ({@code intervalOf} returns 0 for keys without a hold event, which are skipped).
     */
    static List<Identifier> due(UUID player, long tick, java.util.function.ToIntFunction<Identifier> intervalOf) {
        Map<Identifier, Held> held = BY_PLAYER.get(player);
        if (held == null) {
            return List.of();
        }
        List<Identifier> out = new java.util.ArrayList<>();
        for (Map.Entry<Identifier, Held> e : held.entrySet()) {
            int interval = intervalOf.applyAsInt(e.getKey());
            if (interval > 0 && tick >= e.getValue().nextHold()) {
                out.add(e.getKey());
                e.setValue(new Held(e.getValue().since(), tick + interval));
            }
        }
        return out;
    }

    /** The players with held keys. */
    static Set<UUID> players() {
        return Set.copyOf(BY_PLAYER.keySet());
    }

    /** Forgets every held key of {@code player}, firing nothing; true when there were any. */
    static boolean clear(UUID player) {
        return BY_PLAYER.remove(player) != null;
    }

    /** Forgets everyone (the server stopped). */
    static void clearAll() {
        BY_PLAYER.clear();
    }
}
