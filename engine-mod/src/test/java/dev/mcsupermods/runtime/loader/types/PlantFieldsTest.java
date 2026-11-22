package dev.mcsupermods.runtime.loader.types;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.loader.DefinitionParser;
import dev.mcsupermods.runtime.loader.ParseResult;
import java.util.List;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/** The plant and food types' own fields (ADR 0094 D2; B443's format, B445's Codecs). */
class PlantFieldsTest {
    private static ParseResult<BlockDefinition> block(String json) {
        return DefinitionParser.parseBlock(JsonParser.parseString(json));
    }

    private static BlockType.Fields fields(String type, String extra) {
        ParseResult<BlockDefinition> result = block("{\"format\": 1, \"type\": \"" + type + "\"" + extra + "}");
        assertEquals(List.of(), result.errors(), type + " errors");
        assertEquals(List.of(), result.warnings(), type + " warnings");
        return result.definition().orElseThrow().typeFields();
    }

    private static String error(String type, String extra) {
        ParseResult<BlockDefinition> result = block("{\"format\": 1, \"type\": \"" + type + "\"" + extra + "}");
        assertFalse(result.errors().isEmpty(), type + " " + extra + " parsed without an error");
        assertTrue(result.definition().isEmpty(), type + " " + extra + " gave a definition");
        return String.join("\n", result.errors());
    }

    @Test
    void fieldNamesPerType() {
        assertEquals(List.of("food", "on_eat"), PlantFields.fields("cake"));
        assertEquals(List.of("berry", "harvest", "hurts"), PlantFields.fields("berry_bush"));
        assertEquals(List.of("bonemeal"), PlantFields.fields("tall_plant"));
        assertEquals(List.of("plant", "pot"), PlantFields.fields("potted_plant"));
        assertEquals(List.of("spreads"), PlantFields.fields("vine"));
        assertEquals(List.of("support"), PlantFields.fields("cocoa"));
        for (String type : List.of("sea_pickle", "carpet", "layers", "candle")) {
            assertEquals(List.of(), PlantFields.fields(type), type);
        }
        assertEquals(PlantFields.fields("cake"), BlockType.CAKE.fields());
        assertTrue(BlockDefinition.KEYS.containsAll(List.of("food", "on_eat", "berry", "harvest", "hurts", "bonemeal", "plant", "spreads",
                "support")));
    }

    @Test
    void defaults() {
        assertEquals(new PlantFields.Cake(new PlantFields.CakeFood(2, 0.1f), Optional.empty()), fields("cake", ""));
        assertEquals(new PlantFields.BerryBush(Identifier.parse("t:berries"),
                new PlantFields.BerryHarvest(new PlantFields.CountRange(1, 2), new PlantFields.CountRange(2, 3)), true),
                fields("berry_bush", ", \"berry\": \"t:berries\""));
        assertEquals(new PlantFields.TallPlant(PlantFields.TallPlantBonemeal.DROP_COPY), fields("tall_plant", ""));
        assertEquals(new PlantFields.Vine(true), fields("vine", ""));
        assertEquals(new PlantFields.Cocoa(Identifier.parse("minecraft:supports_cocoa")), fields("cocoa", ""));
        for (String type : List.of("sea_pickle", "carpet", "layers", "candle")) {
            assertEquals(PlantFields.Plain.INSTANCE, fields(type, ""), type);
        }
    }

    @Test
    void writtenValues() {
        assertEquals(new PlantFields.Cake(new PlantFields.CakeFood(3, 0.5f), Optional.of(Identifier.parse("t:ate"))),
                fields("cake", ", \"food\": {\"nutrition\": 3, \"saturation\": 0.5}, \"on_eat\": \"t:ate\""));
        PlantFields.BerryBush bush = (PlantFields.BerryBush) fields("berry_bush",
                ", \"berry\": \"minecraft:apple\", \"harvest\": {\"ripe\": [4, 0], \"full\": [5, 5]}, \"hurts\": false");
        assertFalse(bush.hurts());
        assertEquals(new PlantFields.CountRange(4, 0), bush.harvest().ripe());
        assertEquals(0, bush.harvest().ripe().low(), "a reversed range is ordered");
        assertEquals(4, bush.harvest().ripe().high());
        assertEquals(new PlantFields.TallPlant(PlantFields.TallPlantBonemeal.NONE), fields("tall_plant", ", \"bonemeal\": \"none\""));
        assertEquals(new PlantFields.PottedPlant(Identifier.parse("minecraft:short_grass"), Optional.empty()),
                fields("potted_plant", ", \"plant\": \"minecraft:short_grass\""));
        assertEquals(new PlantFields.Vine(false), fields("vine", ", \"spreads\": false"));
        assertEquals(new PlantFields.Cocoa(Identifier.parse("minecraft:logs")), fields("cocoa", ", \"support\": \"#minecraft:logs\""));
    }

    @Test
    void eachTypeIsClosedAtTheTopLevel() {
        assertTrue(error("candle", ", \"candles\": 4").contains("candles: unknown field for type 'candle'"));
        assertTrue(error("layers", ", \"layers\": 8").contains("layers"));
        assertTrue(error("sea_pickle", ", \"pickles\": 4").contains("pickles"));
        assertTrue(error("carpet", ", \"colour\": \"red\"").contains("colour"));
        assertTrue(error("cake", ", \"candles\": true").contains("its fields are food, on_eat"));
        // Another plant type's field is refused by the type dispatch.
        assertTrue(error("cake", ", \"berry\": \"t:b\"").contains("berry: unknown field for type 'cake'"));
        assertTrue(error("vine", ", \"textures\": {}").contains("textures"), "editor-only keys are errors on these types");
    }

    @Test
    void invalidValuesNameTheirField() {
        assertTrue(error("cake", ", \"food\": {\"nutrition\": 0, \"saturation\": 0.1}").contains("nutrition"));
        assertTrue(error("cake", ", \"food\": {\"nutrition\": 2}").contains("saturation"));
        assertTrue(error("cake", ", \"food\": {\"nutrition\": 2, \"saturation\": 0.1, \"bites\": 7}").contains("bites"));
        assertTrue(error("berry_bush", "").contains("berry"));
        assertTrue(error("berry_bush", ", \"berry\": \"t:b\", \"harvest\": {\"ripe\": [1]}").contains("full"));
        assertTrue(error("berry_bush", ", \"berry\": \"t:b\", \"harvest\": {\"ripe\": [1], \"full\": [2, 3]}").contains("ripe"));
        assertTrue(error("berry_bush", ", \"berry\": \"t:b\", \"harvest\": {\"ripe\": [1, 65], \"full\": [2, 3]}").contains("ripe"));
        assertTrue(error("tall_plant", ", \"bonemeal\": \"grow\"").contains("bonemeal"));
        assertTrue(error("potted_plant", "").contains("plant"));
        assertTrue(error("vine", ", \"spreads\": \"no\"").contains("spreads"));
        assertTrue(error("cocoa", ", \"support\": 3").contains("support"));
        assertTrue(error("cocoa", ", \"support\": \"minecraft:logs\"").contains("support"), "a support without # is not a tag");
    }
}
