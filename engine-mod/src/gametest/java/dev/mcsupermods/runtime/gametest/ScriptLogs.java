package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.scripting.ScriptHost;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import net.fabricmc.api.ModInitializer;

/**
 * Every {@code msm.log} line of every {@link ScriptHost}, from the server's start, for the GameTests to read instead of
 * {@link ScriptHost#recentLogs()}. That ring keeps only the last 1024 lines, and the {@code events} test script's
 * {@code server.tick} and {@code player.join} lines (and a test that skips the night on 26.4) evicted lines logged once at
 * load or server start before the tests that look for them ran, depending on test order and timing (CI, 2026-11-22).
 * Installed at mod initialisation ({@code main} entrypoint of the GameTest mod), before {@code SERVER_STARTING} loads
 * the scripts, through the runtime's test hook {@link ScriptHost#observeLogs}. Lines are kept per host, as
 * {@code recentLogs()} keeps them (across reloads of that host; a detached host has its own), and never dropped.
 */
public final class ScriptLogs implements ModInitializer {
    private static final Map<ScriptHost, List<String>> LINES = new WeakHashMap<>();

    @Override
    public void onInitialize() {
        ScriptHost.observeLogs(ScriptLogs::record);
    }

    private static synchronized void record(ScriptHost host, String line) {
        LINES.computeIfAbsent(host, h -> new ArrayList<>()).add(line);
    }

    /** Every line {@code host} logged, oldest first, as {@code <script id>: <text>}. */
    static synchronized List<String> of(ScriptHost host) {
        List<String> lines = LINES.get(host);
        return lines == null ? List.of() : List.copyOf(lines);
    }
}
