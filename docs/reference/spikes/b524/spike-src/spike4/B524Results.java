package dev.mcsupermods.runtime.gametest.spike4;

import com.google.gson.GsonBuilder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.TreeMap;
import net.fabricmc.loader.api.FabricLoader;

/** B524 spike (throwaway): records observations into {@code <gameDir>/msm-b524/<file>-<mc>.json}, by key. */
public final class B524Results {
    public static final B524Results SERVER = new B524Results("server");
    public static final B524Results CLIENT = new B524Results("client");

    private final Map<String, Object> results = new TreeMap<>();
    private final String file;

    public B524Results(String file) {
        this.file = file;
    }

    public static String mc() {
        return FabricLoader.getInstance().getModContainer("minecraft").orElseThrow().getMetadata().getVersion().getFriendlyString();
    }

    public synchronized void put(String key, Object value) {
        results.put(key, value);
        System.out.println("[b524] " + key + " = " + value);
        write();
    }

    public synchronized void write() {
        try {
            Path out = FabricLoader.getInstance().getGameDir().resolve("msm-b524");
            Files.createDirectories(out);
            Files.writeString(out.resolve(file + "-" + mc() + ".json"),
                    new GsonBuilder().setPrettyPrinting().serializeNulls().create().toJson(results), StandardCharsets.UTF_8);
        } catch (Throwable e) {
            System.out.println("[b524] write failed: " + e);
        }
    }

    @FunctionalInterface
    public interface Body {
        void run() throws Throwable;
    }

    /** Runs {@code body}, recording a throwable as {@code <name>.error} instead of failing the test. */
    public void section(String name, Body body) {
        try {
            body.run();
        } catch (Throwable t) {
            put(name + ".error", t.toString());
            t.printStackTrace(System.out);
        }
    }
}
