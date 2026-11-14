package dev.mcsupermods.runtime.events;

import dev.mcsupermods.runtime.MsmRuntime;
import net.minecraft.server.level.ServerLevel;

/**
 * The shared cost ceiling of tick triggers (ADR 0061 D4): {@code msm:while_held}, {@code msm:while_worn},
 * {@code msm:on_tick}, {@code msm:on_entity_inside} and {@code msm:on_random_tick} together fire at most
 * {@link #DEFAULT_CAP} times per server tick; further firings in that tick are skipped, and a skip is logged at most
 * once a minute with the number skipped since the last line. Server thread only.
 */
public final class TickLimiter {
    /** Firings per server tick (ADR 0061 D4 default). */
    public static final int DEFAULT_CAP = 2000;
    /** Ticks between two log lines about skipped firings (one minute). */
    public static final int LOG_INTERVAL_TICKS = 1200;

    /** The limiter every tick trigger shares. */
    public static final TickLimiter SHARED = new TickLimiter(DEFAULT_CAP);

    private final int cap;
    private long tick = Long.MIN_VALUE;
    private int fired;
    private long skipped;
    private long lastLog = Long.MIN_VALUE;
    private int logLines;

    /** A limiter with its own counter; GameTests use one so that a small cap does not starve other tests. */
    public TickLimiter(int cap) {
        this.cap = cap;
    }

    /** Whether a tick trigger may fire now; counts the firing when it may. */
    public static boolean tryFire(ServerLevel level) {
        return SHARED.tryFire(level.getServer().getTickCount());
    }

    /** Whether a firing in server tick {@code now} is within the cap; counts it when it is. */
    public synchronized boolean tryFire(long now) {
        if (now != tick) {
            tick = now;
            fired = 0;
        }
        if (fired < cap) {
            fired++;
            return true;
        }
        skipped++;
        if (lastLog == Long.MIN_VALUE || now - lastLog >= LOG_INTERVAL_TICKS || now < lastLog) {
            MsmRuntime.LOGGER.warn("[{}] tick triggers: skipped {} firing(s) over the cap of {} per server tick (ADR 0061 D4)",
                    MsmRuntime.MOD_ID, skipped, cap);
            lastLog = now;
            skipped = 0;
            logLines++;
        }
        return false;
    }

    /** How many lines about skipped firings this limiter has logged. */
    public synchronized int logLines() {
        return logLines;
    }
}
