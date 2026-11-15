package dev.mcsupermods.runtime.loader;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonParser;
import java.util.List;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/** {@code msm:item_inventory} and {@code msm:bundle} (ADR 0095 D1, D4): defaults and the load rules beyond the corpus. */
class ItemInventoryParserTest {
    private static ParseResult<ItemDefinition> item(String components, String extra) {
        return DefinitionParser.parseItem(JsonParser.parseString("{\"format\": 1, " + extra + "\"components\": {" + components + "}}"));
    }

    private static ItemInventoryParser.Inventory inventory(ParseResult<ItemDefinition> result) {
        return result.definition().orElseThrow().components().inventory();
    }

    @Test
    void bagDefaults() {
        ParseResult<ItemDefinition> result = item("\"msm:item_inventory\": {}", "");
        assertEquals(List.of(), result.errors());
        assertEquals(List.of(), result.warnings());
        ItemInventoryParser.Bag bag = inventory(result).bag().orElseThrow();
        assertEquals(ItemInventoryParser.Layout.CHEST, bag.layout());
        assertEquals(ItemInventoryParser.OpenMode.USE, bag.open());
        assertEquals(3, bag.chestRows());
        assertEquals(27, bag.slots());
        assertTrue(bag.shulkerMenu());
        assertEquals(Optional.empty(), bag.openSound());
        assertEquals(Optional.empty(), inventory(result).bundle());
    }

    @Test
    void slotsOfEachLayout() {
        assertEquals(9, inventory(item("\"msm:item_inventory\": {\"rows\": 1}", "")).bag().orElseThrow().slots());
        assertEquals(54, inventory(item("\"msm:item_inventory\": {\"rows\": 6}", "")).bag().orElseThrow().slots());
        assertFalse(inventory(item("\"msm:item_inventory\": {\"rows\": 6}", "")).bag().orElseThrow().shulkerMenu());
        assertEquals(5, inventory(item("\"msm:item_inventory\": {\"layout\": \"hopper\"}", "")).bag().orElseThrow().slots());
        assertEquals(9, inventory(item("\"msm:item_inventory\": {\"layout\": \"dispenser\"}", "")).bag().orElseThrow().slots());
    }

    @Test
    void bundleIsAnEmptyObject() {
        ParseResult<ItemDefinition> result = item("\"msm:bundle\": {}", "\"max_stack_size\": 1, ");
        assertEquals(List.of(), result.errors());
        assertTrue(inventory(result).bundle().isPresent());
        assertTrue(item("\"msm:bundle\": {\"capacity\": 2}", "").errors().getFirst().contains("capacity"));
    }

    @Test
    void rowsOnAHopperAreIgnoredWithAWarning() {
        ParseResult<ItemDefinition> result = item("\"msm:item_inventory\": {\"layout\": \"hopper\", \"rows\": 2}", "");
        assertEquals(List.of(), result.errors());
        assertEquals(1, result.warnings().size());
        assertTrue(result.warnings().getFirst().contains("rows is only for the chest layout"), result.warnings().toString());
        assertEquals(Optional.empty(), inventory(result).bag().orElseThrow().rows());
    }

    @Test
    void aLargerStackIsAWarning() {
        ParseResult<ItemDefinition> result = item("\"msm:bundle\": {}", "\"max_stack_size\": 16, ");
        assertEquals(List.of(), result.errors());
        assertEquals(List.of("max_stack_size 16 ignored; a bundle stacks to 1"), result.warnings());
        assertEquals(List.of(), item("\"msm:item_inventory\": {}", "").warnings(), "the default 64 is not a warning");
    }

    @Test
    void bagAndBundleTogetherIsAnErrorAndNeitherApplies() {
        ParseResult<ItemDefinition> result = item("\"msm:item_inventory\": {}, \"msm:bundle\": {}", "");
        assertEquals(List.of("components: msm:item_inventory and msm:bundle on one item; neither is applied"), result.errors());
        assertFalse(inventory(result).any());
    }

    @Test
    void conflictsDropTheBagAndKeepTheRest() {
        ParseResult<ItemDefinition> result = item("\"msm:item_inventory\": {}, \"msm:food\": {\"nutrition\": 2, \"saturation\": 0.1}, "
                + "\"msm:tool\": {\"type\": \"pickaxe\", \"tier\": \"iron\"}", "");
        assertEquals(List.of("components: msm:item_inventory cannot be combined with msm:tool, msm:food; msm:item_inventory is not applied"),
                result.errors());
        assertFalse(inventory(result).any());
        assertTrue(result.definition().orElseThrow().components().food().isPresent());
        assertTrue(result.definition().orElseThrow().components().tool().isPresent());
        for (String other : List.of("\"msm:shield\": {}", "\"msm:throwable\": {}", "\"msm:ranged_weapon\": {\"type\": \"bow\"}",
                "\"msm:armor\": {\"slot\": \"helmet\", \"material\": \"iron\"}", "\"msm:consumable\": {\"seconds\": 1.6, \"animation\": \"eat\"}")) {
            ParseResult<ItemDefinition> r = item("\"msm:bundle\": {}, " + other, "");
            assertEquals(1, r.errors().size(), other + ": " + r.errors());
            assertTrue(r.errors().getFirst().contains("msm:bundle is not applied"), r.errors().toString());
            assertFalse(inventory(r).any(), other);
        }
        // Durability only forces a stack of 1.
        assertEquals(List.of(), item("\"msm:item_inventory\": {}, \"msm:durability\": {\"max\": 30}", "").errors());
    }

    @Test
    void eventsMustBeDeclared() {
        ParseResult<ItemDefinition> result = item("\"msm:item_inventory\": {\"on_open\": \"t:opened\", \"on_close\": \"t:closed\"}",
                "\"events\": {\"t:opened\": {\"actions\": [{\"type\": \"play_sound\", \"sound\": \"minecraft:block.note_block.bell\"}]}}, ");
        assertEquals(List.of("components: msm:item_inventory on_close names event t:closed, which is not declared in events (or was dropped)"),
                result.errors());
        assertEquals(Optional.of(Identifier.parse("t:opened")), inventory(result).bag().orElseThrow().onOpen());
    }

    @Test
    void closedFieldsAndValues() {
        assertTrue(item("\"msm:item_inventory\": {\"size\": 27}", "").errors().getFirst().contains("size"));
        assertTrue(item("\"msm:item_inventory\": {\"rows\": 7}", "").errors().getFirst().contains("rows"));
        assertTrue(item("\"msm:item_inventory\": {\"layout\": \"barrel\"}", "").errors().getFirst().contains("barrel"));
        assertTrue(item("\"msm:item_inventory\": {\"open\": \"click\"}", "").errors().getFirst().contains("click"));
    }
}
