package dev.mcsupermods.runtime.loader;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.loader.CreativeTabParser.Order;
import dev.mcsupermods.runtime.loader.CreativeTabParser.Tab;
import java.util.List;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/** {@link CreativeTabParser}: defaults, the title key and the closed fields (ADR 0096 D2, B443, B454). */
class CreativeTabParserTest {
    private static ParseResult<Tab> parse(String json) {
        return CreativeTabParser.parse(JsonParser.parseString(json));
    }

    private static void refused(String json, String part) {
        ParseResult<Tab> result = parse(json);
        assertTrue(result.definition().isEmpty(), "registered: " + json);
        assertTrue(result.errors().stream().anyMatch(e -> e.contains(part)), part + " not in " + result.errors());
    }

    @Test
    void aPlainTabTakesTheDefaults() {
        ParseResult<Tab> result = parse("{\"format\": 1, \"icon\": \"mymod:ruby\"}");
        assertEquals(List.of(), result.errors());
        assertEquals(List.of(), result.warnings());
        Tab tab = result.definition().orElseThrow();
        assertEquals(Identifier.parse("mymod:ruby"), tab.icon());
        assertEquals(Order.AS_LISTED, tab.order());
        assertEquals("itemGroup.mymod.gems.red", tab.translationKey(Identifier.parse("mymod:gems/red")), "B456's lang key, / as .");
    }

    @Test
    void titleAndOrderDecode() {
        Tab tab = parse("{\"format\": 1, \"icon\": \"minecraft:diamond\", \"order\": \"by_name\", \"title\": \"itemGroup.mymod.gems\"}")
                .definition().orElseThrow();
        assertEquals(Order.BY_NAME, tab.order());
        assertEquals("itemGroup.mymod.gems", tab.translationKey(Identifier.parse("mymod:other")));
    }

    @Test
    void closedFieldsAreErrors() {
        refused("{\"format\": 1, \"icon\": \"a:b\", \"display_name\": \"Gems\"}", "display_name");
        refused("{\"format\": 1, \"icon\": \"a:b\", \"items\": [\"a:c\"]}", "items");
        refused("{\"format\": 1}", "icon");
        refused("{\"format\": 1, \"icon\": 3}", "icon");
        refused("{\"format\": 1, \"icon\": \"a:b\", \"order\": \"random\"}", "order");
        refused("{\"icon\": \"a:b\"}", "format");
    }
}
