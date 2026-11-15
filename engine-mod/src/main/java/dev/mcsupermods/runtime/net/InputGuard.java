package dev.mcsupermods.runtime.net;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

/**
 * The server's guard for client-sent input (ADR 0088 D7). Pure: time is the server's tick count, passed in, so JUnit
 * runs it without a server.
 *
 * <ul>
 *   <li>Rule 2: a token bucket per player of {@link #RATE_PER_SECOND} packets a second ({@link #TOKENS_PER_TICK} per
 *       tick) with a burst of {@link #BURST}; presses and releases together. A packet without a token is dropped, never
 *       kicked: vanilla's own flood checks stay in charge of floods.</li>
 *   <li>Rule 1: a dropped packet is counted per {@link Reason} (for tests and diagnostics) and logged at most once a
 *       minute ({@link #LOG_INTERVAL_TICKS}) per player: the first drop logs at once, later ones are summed into the
 *       next line ({@link #drop}, {@link #due}).</li>
 * </ul>
 *
 * <p>Malformed payloads never get here: vanilla's decoder disconnects the sender first (B406 S11).
 */
public final class InputGuard {
    /** Packets a second a player may send (ADR 0088 D7 rule 2). */
    public static final int RATE_PER_SECOND = 20;
    /** Tokens refilled each server tick: {@link #RATE_PER_SECOND} at 20 ticks a second. */
    public static final int TOKENS_PER_TICK = RATE_PER_SECOND / 20;
    /** The bucket's size: the most packets a player may send at once after being quiet. */
    public static final int BURST = 40;
    /** One log line per player at most this often (a minute). */
    public static final int LOG_INTERVAL_TICKS = 1200;

    /** Why a packet was dropped; the label is what the log line says. */
    public enum Reason {
        UNKNOWN_KEY("unknown key"),
        DEAD("dead"),
        SLEEPING("sleeping"),
        SPECTATOR("in spectator mode"),
        RATE_LIMIT("over the rate limit");

        private final String label;

        Reason(String label) {
            this.label = label;
        }

        public String label() {
            return label;
        }
    }

    private static final class Bucket {
        long tokens = BURST;
        long lastTick;

        Bucket(long tick) {
            this.lastTick = tick;
        }
    }

    private static final class Drops {
        final String name;
        final EnumMap<Reason, Integer> pending = new EnumMap<>(Reason.class);
        long lastLogged = Long.MIN_VALUE;

        Drops(String name) {
            this.name = name;
        }
    }

    private final Map<UUID, Bucket> buckets = new HashMap<>();
    private final Map<UUID, Drops> drops = new HashMap<>();
    private final EnumMap<Reason, AtomicLong> totals = new EnumMap<>(Reason.class);

    public InputGuard() {
        for (Reason reason : Reason.values()) {
            totals.put(reason, new AtomicLong());
        }
    }

    /** Takes one token from {@code player}'s bucket at {@code tick}; false when the bucket is empty (rule 2). */
    public synchronized boolean tryAcquire(UUID player, long tick) {
        Bucket bucket = buckets.computeIfAbsent(player, p -> new Bucket(tick));
        long elapsed = Math.max(0, tick - bucket.lastTick);
        bucket.tokens = Math.min(BURST, bucket.tokens + elapsed * TOKENS_PER_TICK);
        bucket.lastTick = Math.max(bucket.lastTick, tick);
        if (bucket.tokens <= 0) {
            return false;
        }
        bucket.tokens--;
        return true;
    }

    /**
     * Counts one dropped packet of {@code player} (shown as {@code name}); returns the log line when one is due now (the
     * player's first drop, or the first a minute after the last line), else null and the drop waits for the next line.
     */
    public synchronized String drop(UUID player, String name, Reason reason, long tick) {
        totals.get(reason).incrementAndGet();
        Drops d = drops.computeIfAbsent(player, p -> new Drops(name));
        d.pending.merge(reason, 1, Integer::sum);
        if (d.lastLogged == Long.MIN_VALUE || tick - d.lastLogged >= LOG_INTERVAL_TICKS) {
            return flush(d, tick);
        }
        return null;
    }

    /** The log lines of drops that waited for a minute to pass, as of {@code tick}. */
    public synchronized List<String> due(long tick) {
        List<String> out = new ArrayList<>();
        for (Drops d : drops.values()) {
            if (!d.pending.isEmpty() && tick - d.lastLogged >= LOG_INTERVAL_TICKS) {
                out.add(flush(d, tick));
            }
        }
        return out;
    }

    private static String flush(Drops d, long tick) {
        int count = d.pending.values().stream().mapToInt(Integer::intValue).sum();
        String reasons = d.pending.size() == 1
                ? d.pending.keySet().iterator().next().label()
                : d.pending.entrySet().stream().map(e -> e.getKey().label() + " (" + e.getValue() + ")").collect(Collectors.joining(", "));
        d.pending.clear();
        d.lastLogged = tick;
        return "dropped " + count + " key packet(s) from " + d.name + ": " + reasons;
    }

    /**
     * Forgets {@code player}'s bucket and log state (they left); pending drops are returned as a last log line, or null.
     */
    public synchronized String forget(UUID player, long tick) {
        buckets.remove(player);
        Drops d = drops.remove(player);
        return d == null || d.pending.isEmpty() ? null : flush(d, tick);
    }

    /** Forgets everyone (the server stopped). */
    public synchronized void clear() {
        buckets.clear();
        drops.clear();
    }

    /** How many packets were dropped for {@code reason} since this guard was made (GameTests, diagnostics). */
    public long dropped(Reason reason) {
        return totals.get(reason).get();
    }

    /** Players with a bucket (tests). */
    synchronized int tracked() {
        return buckets.size();
    }
}
