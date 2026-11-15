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
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/** The furniture, light, sign and stem types' own fields (ADR 0094 D2; B443's format, B446's Codecs). */
class FurnitureFieldsTest {
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

    private static final List<String> PLAIN = List.of("ladder", "lantern", "chain", "rod", "scaffolding");

    @Test
    void fieldNamesPerType() {
        assertEquals(List.of("rule", "colour"), FurnitureFields.fields("bed"));
        assertEquals(List.of("particle"), FurnitureFields.fields("torch"));
        assertEquals(List.of("wood_type"), FurnitureFields.fields("sign"));
        assertEquals(List.of("wood_type"), FurnitureFields.fields("hanging_sign"));
        assertEquals(List.of("fruit", "soil", "fruit_soil"), FurnitureFields.fields("stem"));
        for (String type : PLAIN) {
            assertEquals(List.of(), FurnitureFields.fields(type), type);
        }
        assertEquals(FurnitureFields.fields("stem"), BlockType.STEM.fields());
        assertTrue(BlockDefinition.KEYS.containsAll(List.of("rule", "colour", "particle", "wood_type", "fruit", "soil", "fruit_soil")));
    }

    @Test
    void defaults() {
        assertEquals(new FurnitureFields.Bed(FurnitureFields.BedRule.BED, FurnitureFields.BedColour.WHITE), fields("bed", ""));
        assertEquals(new FurnitureFields.Torch(Identifier.parse("minecraft:flame")), fields("torch", ""));
        assertEquals(new FurnitureFields.Stem(Identifier.parse("t:gourd"), Identifier.parse("minecraft:supports_melon_stem"),
                Identifier.parse("minecraft:supports_melon_stem_fruit")), fields("stem", ", \"fruit\": \"t:gourd\""));
        for (String type : PLAIN) {
            assertEquals(FurnitureFields.Plain.INSTANCE, fields(type, ""), type);
        }
    }

    @Test
    void writtenValues() {
        assertEquals(new FurnitureFields.Bed(FurnitureFields.BedRule.STRAW_BED, FurnitureFields.BedColour.LIGHT_GRAY),
                fields("bed", ", \"rule\": \"straw_bed\", \"colour\": \"light_gray\""));
        assertEquals(new FurnitureFields.Torch(Identifier.parse("t:spark")), fields("torch", ", \"particle\": \"t:spark\""));
        assertEquals(new FurnitureFields.Sign(BlockType.WoodKind.SPRUCE), fields("sign", ", \"wood_type\": \"spruce\""));
        assertEquals(new FurnitureFields.Sign(BlockType.WoodKind.BAMBOO), fields("hanging_sign", ", \"wood_type\": \"bamboo\""));
        assertEquals(new FurnitureFields.Stem(Identifier.parse("t:gourd"), Identifier.parse("t:soil"), Identifier.parse("minecraft:sand")),
                fields("stem", ", \"fruit\": \"t:gourd\", \"soil\": \"#t:soil\", \"fruit_soil\": \"#minecraft:sand\""));
        // The sixteen colours, in vanilla's order.
        assertEquals(16, FurnitureFields.BedColour.values().length);
        assertEquals("light_blue", FurnitureFields.BedColour.LIGHT_BLUE.id());
        assertEquals("black", FurnitureFields.BedColour.values()[15].id());
    }

    @Test
    void eachTypeIsClosedAtTheTopLevel() {
        assertTrue(error("ladder", ", \"facing\": \"north\"").contains("facing: unknown field for type 'ladder' (it has no fields of its own)"));
        assertTrue(error("lantern", ", \"hanging\": true").contains("hanging"));
        assertTrue(error("chain", ", \"axis\": \"y\"").contains("axis"));
        assertTrue(error("rod", ", \"particle\": \"minecraft:end_rod\"").contains("particle: unknown field for type 'rod'"));
        assertTrue(error("scaffolding", ", \"distance\": 3").contains("distance"));
        assertTrue(error("bed", ", \"part\": \"head\"").contains("its fields are rule, colour"));
        // Another type's field is refused by the type dispatch.
        assertTrue(error("torch", ", \"wood_type\": \"oak\"").contains("wood_type: unknown field for type 'torch'"));
        assertTrue(error("sign", ", \"wood_type\": \"oak\", \"fruit\": \"t:x\"").contains("fruit"));
        assertTrue(error("stem", ", \"fruit\": \"t:x\", \"textures\": {}").contains("textures"), "editor-only keys are errors on these types");
    }

    @Test
    void invalidValuesNameTheirField() {
        assertTrue(error("bed", ", \"colour\": \"teal\"").contains("colour"));
        assertTrue(error("bed", ", \"rule\": \"hammock\"").contains("rule"));
        assertTrue(error("sign", "").contains("wood_type"));
        assertTrue(error("hanging_sign", "").contains("wood_type"));
        assertTrue(error("sign", ", \"wood_type\": \"ruby\"").contains("wood_type"));
        assertTrue(error("stem", "").contains("fruit"));
        assertTrue(error("stem", ", \"fruit\": \"t:x\", \"soil\": 1").contains("soil"));
        assertTrue(error("stem", ", \"fruit\": \"t:x\", \"fruit_soil\": \"minecraft:dirt\"").contains("fruit_soil"), "a soil without # is not a tag");
        assertTrue(error("torch", ", \"particle\": 3").contains("particle"));
    }
}
