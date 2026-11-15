package dev.mcsupermods.runtime.client.hud;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import dev.mcsupermods.runtime.loader.HudDefinition.Anchor;
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
 * The cross-language HUD layout golden (ADR 0089 D4, D9; ADR 0091 D6): {@code fixtures/hud-layout/golden.json} holds
 * the anchor table, the layout constants, a set of elements, and for a set of window sizes and GUI scales the GUI's
 * scaled size and every element's place; also bar fills, icon rows and number texts. The app's HUD Studio (B420) and
 * Try it (B429) read the same file. The runtime ({@link HudLayout}) is the reference and this test is the writer:
 * {@code UPDATE_GOLDENS=1 ./gradlew --no-daemon test --tests '*HudLayoutGoldenTest'} rewrites every computed value
 * ({@code constants}, {@code anchors}, each screen's {@code gui} and {@code positions}, and the outputs of the
 * {@code bar_fill}, {@code icons} and {@code numbers} cases) from the inputs.
 */
class HudLayoutGoldenTest {
    static Path folder() {
        String property = System.getProperty("msm.hud.layout");
        return property != null ? Path.of(property) : Path.of("..", "fixtures", "hud-layout");
    }

    @Test
    void hudLayoutMatchesTheGolden() throws IOException {
        Path file = folder().resolve("golden.json");
        JsonObject golden = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
        assertEquals(1, golden.get("format").getAsInt());
        JsonObject computed = compute(golden);
        if ("1".equals(System.getenv("UPDATE_GOLDENS"))) {
            Files.writeString(file, write(computed, "") + "\n");
            return;
        }
        assertEquals(computed, golden, "golden.json differs from HudLayout; run with UPDATE_GOLDENS=1 if the change is meant");
        Set<Anchor> anchors = EnumSet.noneOf(Anchor.class);
        for (JsonElement e : golden.getAsJsonArray("elements")) {
            anchors.add(anchor(e.getAsJsonObject().get("anchor").getAsString()));
        }
        assertEquals(EnumSet.allOf(Anchor.class), anchors, "every anchor has an element");
        assertTrue(golden.getAsJsonArray("screens").size() >= 8, "at least eight screens");
    }

    static Anchor anchor(String name) {
        return Anchor.valueOf(name.toUpperCase(Locale.ROOT));
    }

    /** The golden with every computed value recomputed from its inputs. */
    static JsonObject compute(JsonObject golden) {
        JsonObject out = golden.deepCopy();
        JsonObject constants = new JsonObject();
        constants.addProperty("margin", HudLayout.MARGIN);
        constants.addProperty("gap", HudLayout.GAP);
        constants.addProperty("above_hotbar", HudLayout.ABOVE_HOTBAR);
        constants.addProperty("text_height", HudLayout.TEXT_HEIGHT);
        constants.addProperty("icon_size", HudLayout.ICON_SIZE);
        constants.addProperty("icon_step", HudLayout.ICON_STEP);
        constants.addProperty("max_icons", HudLayout.MAX_ICONS);
        constants.addProperty("decimals", HudLayout.DECIMALS);
        out.add("constants", constants);
        JsonObject anchors = new JsonObject();
        for (Anchor a : Anchor.values()) {
            JsonObject row = new JsonObject();
            row.addProperty("horizontal", HudLayout.horizontal(a).name().toLowerCase(Locale.ROOT));
            row.addProperty("vertical", HudLayout.vertical(a).name().toLowerCase(Locale.ROOT));
            anchors.add(a.serialName(), row);
        }
        out.add("anchors", anchors);

        List<HudLayout.Box> boxes = new ArrayList<>();
        for (JsonElement e : out.getAsJsonArray("elements")) {
            JsonObject o = e.getAsJsonObject();
            JsonArray offset = o.has("offset") ? o.getAsJsonArray("offset") : null;
            JsonArray size = o.getAsJsonArray("size");
            boxes.add(new HudLayout.Box(o.get("id").getAsString(), anchor(o.get("anchor").getAsString()),
                    offset == null ? 0 : offset.get(0).getAsInt(), offset == null ? 0 : offset.get(1).getAsInt(),
                    o.has("order") ? o.get("order").getAsInt() : 0, size.get(0).getAsInt(), size.get(1).getAsInt()));
        }
        for (JsonElement e : out.getAsJsonArray("screens")) {
            JsonObject screen = e.getAsJsonObject();
            JsonArray window = screen.getAsJsonArray("window");
            int scale = screen.get("scale").getAsInt();
            int w = HudLayout.guiSize(window.get(0).getAsInt(), scale);
            int h = HudLayout.guiSize(window.get(1).getAsInt(), scale);
            JsonArray gui = new JsonArray();
            gui.add(w);
            gui.add(h);
            screen.add("gui", gui);
            JsonObject positions = new JsonObject();
            for (HudLayout.Placed p : HudLayout.place(w, h, boxes)) {
                JsonArray xy = new JsonArray();
                xy.add(p.x());
                xy.add(p.y());
                positions.add(p.box().id(), xy);
            }
            screen.add("positions", positions);
        }
        for (JsonElement e : out.getAsJsonArray("bar_fill")) {
            JsonObject c = e.getAsJsonObject();
            c.addProperty("filled", HudLayout.barFill(c.get("value").getAsDouble(), c.get("max").getAsDouble(), c.get("width").getAsInt()));
        }
        for (JsonElement e : out.getAsJsonArray("icons")) {
            JsonObject c = e.getAsJsonObject();
            int count = HudLayout.iconCount(c.get("max").getAsDouble(), c.get("per_icon").getAsDouble());
            HudLayout.IconFill fill = HudLayout.icons(c.get("value").getAsDouble(), c.get("per_icon").getAsDouble(), count,
                    c.get("has_half").getAsBoolean(), c.get("has_empty").getAsBoolean());
            c.addProperty("count", count);
            c.addProperty("width", HudLayout.iconsWidth(count));
            c.addProperty("full", fill.full());
            c.addProperty("half", fill.half());
            c.addProperty("empty", fill.empty());
        }
        for (JsonElement e : out.getAsJsonArray("numbers")) {
            JsonObject c = e.getAsJsonObject();
            c.addProperty("text", HudLayout.formatNumber(c.get("value").getAsDouble()));
        }
        // Normalise numbers as the writer does, so the comparison is between equal representations.
        return JsonParser.parseString(write(out, "")).getAsJsonObject();
    }

    /** Two-space JSON, sorted keys, arrays of plain values on one line, numbers as plain decimals. */
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
            BigDecimal value = new BigDecimal(element.getAsJsonPrimitive().getAsNumber().toString()).stripTrailingZeros();
            if (value.signum() == 0) {
                return "0";
            }
            return value.scale() < 0 ? value.setScale(0, RoundingMode.UNNECESSARY).toPlainString() : value.toPlainString();
        }
        return element.toString();
    }
}
