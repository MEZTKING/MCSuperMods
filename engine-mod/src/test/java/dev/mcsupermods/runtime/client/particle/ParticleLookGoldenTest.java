package dev.mcsupermods.runtime.client.particle;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.junit.jupiter.api.Test;

/**
 * The cross-language particle look golden (ADR 0081 D6 (a)): {@code fixtures/particle-look/golden.json} holds
 * definitions in the {@code msm:particle} format with the inputs (frame count, the lifetime used, the random frame,
 * ages with a partial tick, start position and velocity, step counts, lifetime draws) and the values
 * {@link ParticleLook} gives for them. The app's {@code particle-sim.ts} test reads the same file (B353). The runtime is
 * the reference: {@code UPDATE_GOLDENS=1 ./gradlew test --tests '*ParticleLookGoldenTest'} rewrites the expected
 * values from the inputs (run with {@code --no-daemon} or a fresh daemon so the variable reaches the test).
 */
class ParticleLookGoldenTest {
    /** Every number in the golden is rounded to six decimals; compare within this. */
    static final double TOLERANCE = 1e-5;

    static Path folder() {
        String property = System.getProperty("msm.particle.look");
        return property != null ? Path.of(property) : Path.of("..", "fixtures", "particle-look");
    }

    @Test
    void particleLookMatchesTheGolden() throws IOException {
        Path file = folder().resolve("golden.json");
        JsonObject golden = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
        assertEquals(1, golden.get("format").getAsInt());
        boolean update = "1".equals(System.getenv("UPDATE_GOLDENS"));
        JsonObject computed = compute(golden);
        if (update) {
            Files.writeString(file, write(computed, "") + "\n");
            return;
        }
        compare("golden", golden, computed);
        assertTrue(golden.getAsJsonArray("cases").size() >= 12, "about twelve cases");
    }

    /** The golden with every expected value recomputed from its inputs. */
    static JsonObject compute(JsonObject golden) {
        JsonObject out = golden.deepCopy();
        for (JsonElement element : out.getAsJsonArray("cases")) {
            JsonObject c = element.getAsJsonObject();
            ParticleLook.Spec spec = spec(c.getAsJsonObject("definition"));
            int frames = c.get("frames").getAsInt();
            int lifetime = c.get("lifetime").getAsInt();
            int randomFrame = c.get("random_frame").getAsInt();
            c.addProperty("translucent", ParticleLook.translucent(spec));
            for (JsonElement lookElement : c.getAsJsonArray("looks")) {
                JsonObject look = lookElement.getAsJsonObject();
                int age = look.get("age").getAsInt();
                float partial = look.get("partial").getAsFloat();
                look.addProperty("frame", ParticleLook.frame(spec, age, lifetime, frames, randomFrame));
                look.addProperty("size", ParticleLook.size(spec, age, lifetime, partial));
                ParticleLook.Rgba rgba = ParticleLook.rgba(spec, age, lifetime);
                look.add("rgba", numbers(rgba.r(), rgba.g(), rgba.b(), rgba.a()));
                look.addProperty("roll", ParticleLook.roll(spec, age));
            }
            JsonArray start = c.getAsJsonArray("start");
            JsonArray velocity = c.getAsJsonArray("velocity");
            for (JsonElement positionElement : c.getAsJsonArray("positions")) {
                JsonObject position = positionElement.getAsJsonObject();
                ParticleLook.State state = new ParticleLook.State(
                        start.get(0).getAsDouble(), start.get(1).getAsDouble(), start.get(2).getAsDouble(),
                        velocity.get(0).getAsDouble(), velocity.get(1).getAsDouble(), velocity.get(2).getAsDouble());
                int steps = position.get("steps").getAsInt();
                for (int i = 0; i < steps; i++) {
                    state = ParticleLook.step(state, spec);
                }
                position.add("position", numbers(state.x(), state.y(), state.z()));
                position.add("velocity", numbers(state.xd(), state.yd(), state.zd()));
            }
        }
        for (JsonElement element : out.getAsJsonArray("lifetimes")) {
            JsonObject draw = element.getAsJsonObject();
            draw.addProperty("lifetime", ParticleLook.lifetime(
                    draw.get("min").getAsInt(), draw.get("max").getAsInt(), draw.get("r").getAsDouble()));
        }
        return out;
    }

    /**
     * The spec of a definition in the {@code msm:particle} format, absent fields resolved by
     * {@link ParticleLook.Spec#resolve} (B350's Codec must give the same spec).
     */
    static ParticleLook.Spec spec(JsonObject d) {
        Integer min = null;
        Integer max = null;
        JsonElement lifetime = d.get("lifetime");
        if (lifetime != null && lifetime.isJsonObject()) {
            min = lifetime.getAsJsonObject().get("min").getAsInt();
            max = lifetime.getAsJsonObject().get("max").getAsInt();
        } else if (lifetime != null) {
            min = lifetime.getAsInt();
            max = min;
        }
        return ParticleLook.Spec.resolve(
                d.has("animation") ? ParticleLook.Animation.byName(d.get("animation").getAsString()) : null,
                integer(d, "frame_ticks"),
                min,
                max,
                decimal(d, "size"),
                decimal(d, "size_end"),
                decimal(d, "gravity"),
                decimal(d, "friction"),
                bool(d, "collision"),
                integer(d, "color"),
                integer(d, "color_end"),
                decimal(d, "alpha"),
                d.has("fade") ? ParticleLook.Fade.byName(d.get("fade").getAsString()) : null,
                bool(d, "emissive"),
                bool(d, "translucent"),
                decimal(d, "spin"),
                bool(d, "always_show"));
    }

    private static Integer integer(JsonObject d, String key) {
        return d.has(key) ? d.get(key).getAsInt() : null;
    }

    private static Float decimal(JsonObject d, String key) {
        return d.has(key) ? d.get(key).getAsFloat() : null;
    }

    private static Boolean bool(JsonObject d, String key) {
        return d.has(key) ? d.get(key).getAsBoolean() : null;
    }

    private static JsonArray numbers(double... values) {
        JsonArray array = new JsonArray();
        for (double value : values) {
            array.add(value);
        }
        return array;
    }

    /** Compares the golden with the computed values: numbers within {@link #TOLERANCE}, the rest exactly. */
    static void compare(String path, JsonElement expected, JsonElement actual) {
        if (expected.isJsonObject()) {
            assertTrue(actual.isJsonObject(), path);
            assertEquals(expected.getAsJsonObject().keySet(), actual.getAsJsonObject().keySet(), path + " keys");
            for (String key : expected.getAsJsonObject().keySet()) {
                compare(path + "." + key, expected.getAsJsonObject().get(key), actual.getAsJsonObject().get(key));
            }
        } else if (expected.isJsonArray()) {
            assertTrue(actual.isJsonArray(), path);
            assertEquals(expected.getAsJsonArray().size(), actual.getAsJsonArray().size(), path + " length");
            for (int i = 0; i < expected.getAsJsonArray().size(); i++) {
                compare(path + "[" + i + "]", expected.getAsJsonArray().get(i), actual.getAsJsonArray().get(i));
            }
        } else if (expected.isJsonPrimitive() && expected.getAsJsonPrimitive().isNumber()) {
            assertEquals(expected.getAsDouble(), actual.getAsDouble(), TOLERANCE, path);
        } else {
            assertEquals(expected, actual, path);
        }
    }

    /** Two-space JSON, sorted keys, arrays of plain values on one line, numbers rounded to six decimals. */
    static String write(JsonElement element, String indent) {
        if (element.isJsonObject()) {
            Map<String, JsonElement> sorted = new TreeMap<>(element.getAsJsonObject().asMap());
            if (sorted.isEmpty()) {
                return "{}";
            }
            List<String> lines = new ArrayList<>();
            String inner = indent + "  ";
            sorted.forEach((key, value) -> lines.add(inner + new JsonPrimitive(key) + ": " + write(value, inner)));
            return "{\n" + String.join(",\n", lines) + "\n" + indent + "}";
        }
        if (element.isJsonArray()) {
            JsonArray array = element.getAsJsonArray();
            boolean flat = true;
            for (JsonElement item : array) {
                flat &= item.isJsonPrimitive();
            }
            List<String> items = new ArrayList<>();
            String inner = indent + "  ";
            for (JsonElement item : array) {
                items.add(flat ? write(item, inner) : inner + write(item, inner));
            }
            if (flat) {
                return "[" + String.join(", ", items) + "]";
            }
            return "[\n" + String.join(",\n", items) + "\n" + indent + "]";
        }
        if (element.isJsonPrimitive() && element.getAsJsonPrimitive().isNumber()) {
            BigDecimal rounded = new BigDecimal(element.getAsJsonPrimitive().getAsNumber().toString())
                    .setScale(6, RoundingMode.HALF_EVEN)
                    .stripTrailingZeros();
            if (rounded.signum() == 0) {
                return "0";
            }
            return rounded.toPlainString();
        }
        return element.toString();
    }
}
