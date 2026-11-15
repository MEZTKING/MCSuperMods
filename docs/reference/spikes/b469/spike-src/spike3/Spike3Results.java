package dev.mcsupermods.runtime.gametest.spike3;

import com.google.gson.GsonBuilder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.TreeMap;
import net.fabricmc.loader.api.FabricLoader;

/** B469 spike (throwaway): records observations into {@code <gameDir>/msm-spike3/<file>-<mc>.json}. */
public final class Spike3Results {
    private final Map<String, Object> results = new TreeMap<>();
    private final String file;

    public Spike3Results(String file) {
        this.file = file;
    }

    public static String mc() {
        return FabricLoader.getInstance().getModContainer("minecraft").orElseThrow().getMetadata().getVersion().getFriendlyString();
    }

    public synchronized void put(String key, Object value) {
        results.put(key, value);
        System.out.println("[spike3] " + key + " = " + value);
        write();
    }

    public synchronized void write() {
        try {
            Path out = FabricLoader.getInstance().getGameDir().resolve("msm-spike3");
            Files.createDirectories(out);
            Files.writeString(out.resolve(file + "-" + mc() + ".json"),
                    new GsonBuilder().setPrettyPrinting().serializeNulls().create().toJson(results), StandardCharsets.UTF_8);
        } catch (Throwable e) {
            System.out.println("[spike3] write failed: " + e);
        }
    }

    @FunctionalInterface
    public interface Body {
        void run() throws Throwable;
    }

    public void section(String name, Body body) {
        try {
            body.run();
        } catch (Throwable t) {
            put(name + ".error", t.toString());
            t.printStackTrace(System.out);
        }
    }
}
