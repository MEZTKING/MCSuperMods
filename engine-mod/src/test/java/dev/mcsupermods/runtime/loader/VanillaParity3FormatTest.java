package dev.mcsupermods.runtime.loader;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.loader.types.GrowingPlantFields;
import dev.mcsupermods.runtime.loader.types.PlantFields;
import java.util.List;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/**
 * Vanilla parity 3 batch 1's format (B506; ADRs 0103 to 0105 and their amendments): the defaults of the new fields, and
 * the load rules the mcdoc cannot express, which the conformance corpus therefore cannot carry.
 */
class VanillaParity3FormatTest {
    private static ParseResult<BlockDefinition> block(String json) {
        return DefinitionParser.parseBlock(JsonParser.parseString(json));
    }

    private static BlockDefinition clean(String json) {
        ParseResult<BlockDefinition> result = block(json);
        assertEquals(List.of(), result.errors(), "errors");
        assertEquals(List.of(), result.warnings(), "warnings");
        return result.definition().orElseThrow();
    }

    private static void failsOn(String field, String json) {
        ParseResult<BlockDefinition> result = block(json);
        assertFalse(result.errors().isEmpty(), "no error for " + json);
        String all = String.join("\n", result.errors());
        assertTrue(all.contains(field), "errors do not mention '" + field + "': " + all);
    }

    private static Identifier id(String s) {
        return Identifier.parse(s);
    }

    @Test
    void growingPlantDefaults() {
        BlockDefinition def = clean("{\"format\": 1, \"type\": \"growing_plant\"}");
        assertEquals(BlockType.GROWING_PLANT, def.type());
        GrowingPlantFields.GrowingPlant plant = (GrowingPlantFields.GrowingPlant) def.typeFields();
        assertEquals(GrowingPlantFields.GrowthDirection.UP, plant.direction());
        assertEquals(25, plant.maxAge());
        assertEquals(0.14f, plant.growthChance());
        assertEquals(Optional.empty(), plant.bonemealGrowth());
        assertFalse(plant.needsWater());
        assertTrue(plant.climbable());
        assertEquals(Optional.empty(), plant.berries());
        assertEquals(Optional.empty(), plant.soil());
    }

    @Test
    void growingPlantInWaterIsNotClimbedAndBerriesGlowAt14() {
        GrowingPlantFields.GrowingPlant kelp = (GrowingPlantFields.GrowingPlant) clean(
                "{\"format\": 1, \"type\": \"growing_plant\", \"needs_water\": true}").typeFields();
        assertFalse(kelp.climbable());
        GrowingPlantFields.GrowingPlant vines = (GrowingPlantFields.GrowingPlant) clean("{\"format\": 1, \"type\": \"growing_plant\","
                + " \"direction\": \"down\", \"berries\": {\"item\": \"t:pods\"}, \"soil\": [\"minecraft:stone\", \"#t:ceilings\"]}")
                .typeFields();
        assertEquals(14, vines.berries().orElseThrow().light());
        assertEquals(List.of(new BlockType.IdOrTag(id("minecraft:stone"), false), new BlockType.IdOrTag(id("t:ceilings"), true)),
                vines.soil().orElseThrow());
    }

    @Test
    void growingPlantFieldsAreClosed() {
        failsOn("textures", "{\"format\": 1, \"type\": \"growing_plant\", \"textures\": {}}");
        failsOn("style", "{\"format\": 1, \"type\": \"growing_plant\", \"style\": \"cane\"}");
        failsOn("max_age", "{\"format\": 1, \"type\": \"growing_plant\", \"max_age\": 26}");
    }

    @Test
    void columnPlantDefaultsByStyle() {
        GrowingPlantFields.ColumnPlant cane = (GrowingPlantFields.ColumnPlant) clean(
                "{\"format\": 1, \"type\": \"column_plant\", \"style\": \"cane\"}").typeFields();
        assertEquals(3, cane.maxHeight());
        assertEquals(3, cane.minHeight());
        assertTrue(cane.needsWaterNearby());
        assertEquals(0f, cane.touchDamage());
        GrowingPlantFields.ColumnPlant cactus = (GrowingPlantFields.ColumnPlant) clean(
                "{\"format\": 1, \"type\": \"column_plant\", \"style\": \"cactus\"}").typeFields();
        assertEquals(1f, cactus.touchDamage());
        assertFalse(cactus.needsWaterNearby());
        GrowingPlantFields.ColumnPlant bamboo = (GrowingPlantFields.ColumnPlant) clean(
                "{\"format\": 1, \"type\": \"column_plant\", \"style\": \"bamboo\"}").typeFields();
        assertEquals(16, bamboo.maxHeight());
        assertEquals(12, bamboo.minHeight());
        GrowingPlantFields.ColumnPlant shortBamboo = (GrowingPlantFields.ColumnPlant) clean(
                "{\"format\": 1, \"type\": \"column_plant\", \"style\": \"bamboo\", \"max_height\": 8}").typeFields();
        assertEquals(8, shortBamboo.minHeight());
    }

    @Test
    void columnPlantMinHeightNotAboveMax() {
        failsOn("min_height", "{\"format\": 1, \"type\": \"column_plant\", \"style\": \"cane\", \"min_height\": 4}");
        clean("{\"format\": 1, \"type\": \"column_plant\", \"style\": \"cane\", \"max_height\": 5, \"min_height\": 4}");
    }

    @Test
    void multifaceDefaults() {
        GrowingPlantFields.Multiface lichen = (GrowingPlantFields.Multiface) clean("{\"format\": 1, \"type\": \"multiface\"}")
                .typeFields();
        assertEquals(new GrowingPlantFields.Multiface(7, true, true), lichen);
    }

    @Test
    void dripleafSizeRules() {
        GrowingPlantFields.Dripleaf big = (GrowingPlantFields.Dripleaf) clean("{\"format\": 1, \"type\": \"dripleaf\", \"size\": \"big\"}")
                .typeFields();
        assertEquals(List.of(2, 10, 10), big.tiltTicks());
        clean("{\"format\": 1, \"type\": \"dripleaf\", \"size\": \"small\", \"grows_into\": \"t:big_leaf\"}");
        failsOn("grows_into", "{\"format\": 1, \"type\": \"dripleaf\", \"size\": \"small\"}");
        failsOn("grows_into", "{\"format\": 1, \"type\": \"dripleaf\", \"size\": \"big\", \"grows_into\": \"t:x\"}");
        failsOn("tilt_ticks", "{\"format\": 1, \"type\": \"dripleaf\", \"size\": \"small\", \"grows_into\": \"t:x\","
                + " \"tilt_ticks\": [1, 1, 1]}");
    }

    @Test
    void flowerPotAndPottedPlantPot() {
        GrowingPlantFields.FlowerPot pot = (GrowingPlantFields.FlowerPot) clean(
                "{\"format\": 1, \"type\": \"flower_pot\", \"plants\": [\"minecraft:poppy\", \"t:ruby_sapling\"]}").typeFields();
        assertEquals(List.of(id("minecraft:poppy"), id("t:ruby_sapling")), pot.plants());
        PlantFields.PottedPlant vanillaPot = (PlantFields.PottedPlant) clean(
                "{\"format\": 1, \"type\": \"potted_plant\", \"plant\": \"t:ruby_sapling\"}").typeFields();
        assertEquals(id("minecraft:flower_pot"), vanillaPot.pot());
        PlantFields.PottedPlant ownPot = (PlantFields.PottedPlant) clean(
                "{\"format\": 1, \"type\": \"potted_plant\", \"plant\": \"t:ruby_sapling\", \"pot\": \"t:clay_pot\"}").typeFields();
        assertEquals(id("t:clay_pot"), ownPot.pot());
        failsOn("plants", "{\"format\": 1, \"type\": \"flower_pot\", \"plants\": []}");
    }

    @Test
    void vanillaSetTypeStaysAName() {
        BlockType.Opening door = (BlockType.Opening) clean("{\"format\": 1, \"type\": \"door\", \"set_type\": \"iron\"}").typeFields();
        assertEquals(BlockType.SetType.IRON, door.setType());
        assertEquals(Optional.empty(), door.ownSetType());
    }

    @Test
    void ownSetTypeFillsInFromItsBase() {
        BlockType.Opening door = (BlockType.Opening) clean("{\"format\": 1, \"type\": \"door\", \"set_type\": {}}").typeFields();
        BlockType.OwnSetType own = door.ownSetType().orElseThrow();
        assertEquals(BlockType.SetType.WOOD, door.setType());
        assertTrue(own.canOpenByHand());
        assertTrue(own.canOpenByWindCharge());
        assertTrue(own.arrowsPress());
        assertEquals(BlockType.PlateSensitivity.EVERYTHING, own.plateSensitivity());
        assertEquals(BlockType.SetTypeSounds.NONE, own.sounds());

        BlockType.OwnSetType iron = ((BlockType.Opening) clean("{\"format\": 1, \"type\": \"trapdoor\", \"set_type\": {\"base\": \"iron\","
                + " \"sounds\": {\"open\": \"t:hatch.open\"}}}").typeFields()).ownSetType().orElseThrow();
        assertFalse(iron.canOpenByHand());
        assertFalse(iron.canOpenByWindCharge());
        assertFalse(iron.arrowsPress());
        assertEquals(BlockType.PlateSensitivity.MOBS, iron.plateSensitivity());
        assertEquals(Optional.of(id("t:hatch.open")), iron.sounds().open());

        BlockType.Button button = (BlockType.Button) clean("{\"format\": 1, \"type\": \"button\", \"set_type\": {\"base\": \"stone\","
                + " \"arrows_press\": true}}").typeFields();
        assertTrue(button.ownSetType().orElseThrow().arrowsPress());
        assertEquals(20, button.pressTicks());

        failsOn("plate_sensitivity", "{\"format\": 1, \"type\": \"pressure_plate\", \"set_type\": {\"plate_sensitivity\": \"all\"}}");
        failsOn("set_type", "{\"format\": 1, \"type\": \"door\", \"set_type\": {\"hand\": true}}");
        failsOn("set_type", "{\"format\": 1, \"type\": \"door\", \"set_type\": \"oak\"}");
    }

    @Test
    void blockSounds() {
        BlockDefinition plain = clean("{\"format\": 1}");
        assertEquals(Optional.empty(), plain.blockSounds());
        BlockDefinition def = clean("{\"format\": 1, \"sound_type\": \"wood\", \"block_sounds\": {\"break\": \"t:block.reed.break\","
                + " \"pitch\": 1.5}}");
        assertEquals(MsmSoundType.WOOD, def.soundType());
        MsmSoundType.Sounds sounds = def.blockSounds().orElseThrow();
        assertEquals(Optional.of(id("t:block.reed.break")), sounds.breakSound());
        assertEquals(Optional.empty(), sounds.step());
        assertEquals(Optional.of(1.5f), sounds.pitch());
        assertEquals(Optional.empty(), sounds.volume());
        // A portal keeps its own `sounds` (ADR 0077 D1); `block_sounds` sits beside it.
        clean("{\"format\": 1, \"type\": \"portal\", \"frame\": \"minecraft:obsidian\", \"destination\": \"t:dim\","
                + " \"sounds\": {\"ambient\": false}, \"block_sounds\": {\"break\": \"t:block.portal.break\"}}");
    }

    @Test
    void flattenableAndTillable() {
        BlockComponents c = clean("{\"format\": 1, \"components\": {\"msm:flattenable\": {\"into\": \"t:path\"},"
                + " \"msm:tillable\": {\"into\": \"t:farmland\", \"drops\": \"t:roots\"}}}").components();
        assertEquals(new BlockComponents.Flattenable(id("t:path")), c.flattenable().orElseThrow());
        assertEquals(new BlockComponents.Tillable(id("t:farmland"), Optional.of(id("t:roots"))), c.tillable().orElseThrow());
        assertEquals(List.of("msm:flattenable", "msm:tillable"), c.present());
        assertEquals(Optional.empty(), c.without(List.of("msm:tillable")).tillable());
        failsOn("into", "{\"format\": 1, \"components\": {\"msm:tillable\": {}}}");
    }

    @Test
    void doubleAndPerPlayerChests() {
        BlockComponents.Container plain = clean("{\"format\": 1, \"components\": {\"msm:container\": {}}}").components().container()
                .orElseThrow();
        assertFalse(plain.doubleChest());
        assertFalse(plain.perPlayer());
        BlockComponents.Container doubled = clean("{\"format\": 1, \"components\": {\"msm:container\": {\"double\": true}}}").components()
                .container().orElseThrow();
        assertTrue(doubled.doubleChest());
        assertTrue(clean("{\"format\": 1, \"components\": {\"msm:container\": {\"per_player\": true}}}").components().container()
                .orElseThrow().perPlayer());
    }

    /** Each rule of ADR 0104 D4, D5 that the mcdoc cannot express: an error, the option turned off, the container kept. */
    @Test
    void chestOptionRules() {
        assertTurnedOff("{\"rows\": 6, \"double\": true}", "double", false);
        assertTurnedOff("{\"keep_contents\": true, \"double\": true}", "double", false);
        assertTurnedOff("{\"layout\": \"hopper\", \"double\": true}", "double", false);
        assertTurnedOff("{\"keep_contents\": true, \"per_player\": true}", "per_player", true);
        assertTurnedOff("{\"double\": true, \"per_player\": true}", "per_player", true);
        assertTurnedOff("{\"layout\": \"none\", \"per_player\": true}", "per_player", true);
    }

    private static void assertTurnedOff(String container, String field, boolean perPlayer) {
        ParseResult<BlockDefinition> result = block("{\"format\": 1, \"components\": {\"msm:container\": " + container + "}}");
        String all = String.join("\n", result.errors());
        assertTrue(all.contains(field), "errors do not mention '" + field + "': " + all);
        BlockComponents.Container c = result.definition().orElseThrow().components().container().orElseThrow();
        assertFalse(perPlayer ? c.perPlayer() : c.doubleChest(), field + " still on for " + container);
    }

    @Test
    void vanillaBlockRules() {
        ParseResult<VanillaBlockRulesParser.Rules> result = VanillaBlockRulesParser.parse(JsonParser.parseString(
                "{\"format\": 1, \"till\": [{\"block\": \"minecraft:mud\", \"into\": \"minecraft:farmland\"}],"
                        + " \"burn\": [{\"block\": \"minecraft:dirt\", \"burn_odds\": 5, \"ignite_odds\": 20}]}"));
        assertEquals(List.of(), result.errors());
        VanillaBlockRulesParser.Rules rules = result.definition().orElseThrow();
        assertEquals(List.of(new VanillaBlockRulesParser.TillPair(id("minecraft:mud"), id("minecraft:farmland"), Optional.empty())),
                rules.till());
        assertEquals(List.of(new VanillaBlockRulesParser.BurnRule(id("minecraft:dirt"), 5, 20)), rules.burn());
        assertEquals(List.of(), rules.strip());
        assertFalse(rules.isEmpty());
        assertTrue(VanillaBlockRulesParser.parse(JsonParser.parseString("{\"format\": 1}")).definition().orElseThrow().isEmpty());
        assertTrue(String.join("\n", VanillaBlockRulesParser.parse(JsonParser.parseString("{\"format\": 2}")).errors())
                .contains("format"));
    }
}
