package dev.mcsupermods.runtime.registry.vehicle;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import dev.mcsupermods.runtime.loader.VehicleDefinition;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.junit.jupiter.api.Test;

/**
 * The cross-language vehicle physics golden (ADR 0090 D3, ADR 0091 D6): {@code fixtures/vehicle-physics/golden.json}
 * holds cases of a {@code movement} block as written in a definition, a start state and steps of input and
 * environment, with the resolved constants and the state {@link VehiclePhysics} gives after each step (each step starts
 * from the previous step's state). The Try it simulation's TypeScript twin (B428) reads the same file. The runtime is the
 * reference and this test is the writer: {@code UPDATE_GOLDENS=1 ./gradlew --no-daemon test --tests '*VehiclePhysicsGoldenTest'}
 * rewrites the expected values ({@code resolved} and every {@code state}) from the inputs.
 */
class VehiclePhysicsGoldenTest {
    /** Every number in the golden is rounded to six decimals; compare within this. */
    static final double TOLERANCE = 1e-5;

    static Path folder() {
        String property = System.getProperty("msm.vehicle.physics");
        return property != null ? Path.of(property) : Path.of("..", "fixtures", "vehicle-physics");
    }

    @Test
    void vehiclePhysicsMatchesTheGolden() throws IOException {
        Path file = folder().resolve("golden.json");
        JsonObject golden = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
        assertEquals(1, golden.get("format").getAsInt());
        JsonObject computed = compute(golden);
        if ("1".equals(System.getenv("UPDATE_GOLDENS"))) {
            Files.writeString(file, write(computed, "") + "\n");
            return;
        }
        compare("golden", golden, computed);
        int steps = 0;
        Set<VehicleDefinition.Mode> modes = EnumSet.noneOf(VehicleDefinition.Mode.class);
        for (JsonElement c : golden.getAsJsonArray("cases")) {
            steps += c.getAsJsonObject().getAsJsonArray("steps").size();
            modes.add(mode(c.getAsJsonObject().getAsJsonObject("movement")));
        }
        assertTrue(steps >= 30, "at least 30 steps: " + steps);
        assertEquals(EnumSet.allOf(VehicleDefinition.Mode.class), modes, "every mode");
    }

    /** The golden with every expected value recomputed from its inputs. */
    static JsonObject compute(JsonObject golden) {
        JsonObject out = golden.deepCopy();
        for (JsonElement element : out.getAsJsonArray("cases")) {
            JsonObject c = element.getAsJsonObject();
            VehiclePhysics.Constants constants = constants(c.getAsJsonObject("movement"));
            c.add("resolved", resolved(constants));
            VehiclePhysics.State state = state(c.getAsJsonObject("start"));
            for (JsonElement stepElement : c.getAsJsonArray("steps")) {
                JsonObject step = stepElement.getAsJsonObject();
                JsonObject in = step.getAsJsonObject("input");
                JsonObject env = step.getAsJsonObject("env");
                state = VehiclePhysics.step(constants, state,
                        new VehiclePhysics.Input(in.get("forward").getAsBoolean(), in.get("back").getAsBoolean(), in.get("left").getAsBoolean(),
                                in.get("right").getAsBoolean(), in.get("up").getAsBoolean(), in.get("down").getAsBoolean(),
                                in.get("view_yaw").getAsDouble(), in.get("view_pitch").getAsDouble()),
                        new VehiclePhysics.Env(env.get("on_ground").getAsBoolean(), env.get("water_depth").getAsDouble(),
                                env.get("engine").getAsBoolean()));
                step.add("state", json(state));
            }
        }
        return out;
    }

    static VehicleDefinition.Mode mode(JsonObject movement) {
        return VehicleDefinition.Mode.valueOf(movement.get("mode").getAsString().toUpperCase(Locale.ROOT));
    }

    /** A {@code movement} block as written in a definition; absent fields take the defaults by mode. */
    static VehiclePhysics.Constants constants(JsonObject m) {
        return VehiclePhysics.Constants.resolve(mode(m), number(m, "max_speed"), number(m, "reverse_factor"), number(m, "acceleration"),
                number(m, "braking"), number(m, "turn_rate"), m.has("turns_in_place") ? m.get("turns_in_place").getAsBoolean() : null,
                number(m, "step_height"), number(m, "grip"), number(m, "lift_speed"), number(m, "takeoff_speed"),
                m.has("floats") ? m.get("floats").getAsBoolean() : null);
    }

    private static Double number(JsonObject m, String key) {
        return m.has(key) ? m.get(key).getAsDouble() : null;
    }

    static JsonObject resolved(VehiclePhysics.Constants c) {
        JsonObject o = new JsonObject();
        o.addProperty("mode", c.mode().serialName());
        o.addProperty("max_speed", c.maxSpeed());
        o.addProperty("reverse_factor", c.reverseFactor());
        o.addProperty("acceleration", c.acceleration());
        o.addProperty("braking", c.braking());
        o.addProperty("turn_rate", c.turnRate());
        o.addProperty("turns_in_place", c.turnsInPlace());
        o.addProperty("step_height", c.stepHeight());
        o.addProperty("grip", c.grip());
        o.addProperty("lift_speed", c.liftSpeed());
        o.addProperty("takeoff_speed", c.takeoffSpeed());
        o.addProperty("floats", c.floats());
        return o;
    }

    static VehiclePhysics.State state(JsonObject s) {
        return new VehiclePhysics.State(s.get("vx").getAsDouble(), s.get("vy").getAsDouble(), s.get("vz").getAsDouble(),
                s.get("yaw").getAsDouble(), s.get("pitch").getAsDouble(), s.get("throttle").getAsDouble(), 0, 0);
    }

    static JsonObject json(VehiclePhysics.State s) {
        JsonObject o = new JsonObject();
        o.addProperty("vx", s.vx());
        o.addProperty("vy", s.vy());
        o.addProperty("vz", s.vz());
        o.addProperty("yaw", s.yaw());
        o.addProperty("pitch", s.pitch());
        o.addProperty("throttle", s.throttle());
        o.addProperty("speed", s.speed());
        o.addProperty("steering", s.steering());
        return o;
    }

    /** Numbers within {@link #TOLERANCE}, the rest exactly. */
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
