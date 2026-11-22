package dev.mcsupermods.runtime.loader;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.components.Goal;
import dev.mcsupermods.runtime.registry.fluid.FluidDefinition;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/**
 * Vanilla parity 3 batch 2's format (B527; ADRs 0107 to 0111 and their amendments after B524 and B525): the defaults of
 * the new fields, and the load rules the mcdoc cannot express, which the conformance corpus therefore cannot carry.
 */
class VanillaParity3Batch2FormatTest {
    private static final String MODEL = "\"msm:animated_model\": {\"model\": \"t:entity/m\", \"texture\": \"t:entity/m\"}";

    private static <T> T clean(Function<com.google.gson.JsonElement, ParseResult<T>> parser, String json) {
        ParseResult<T> result = parser.apply(JsonParser.parseString(json));
        assertEquals(List.of(), result.errors(), "errors");
        assertEquals(List.of(), result.warnings(), "warnings");
        return result.definition().orElseThrow();
    }

    private static <T> List<String> warnings(Function<com.google.gson.JsonElement, ParseResult<T>> parser, String json) {
        ParseResult<T> result = parser.apply(JsonParser.parseString(json));
        assertEquals(List.of(), result.errors(), "errors");
        assertTrue(result.definition().isPresent(), "definition missing");
        return result.warnings();
    }

    private static <T> void failsOn(Function<com.google.gson.JsonElement, ParseResult<T>> parser, String field, String json) {
        ParseResult<T> result = parser.apply(JsonParser.parseString(json));
        assertFalse(result.errors().isEmpty(), "no error for " + json);
        String all = String.join("\n", result.errors());
        assertTrue(all.contains(field), "errors do not mention '" + field + "': " + all);
    }

    private static String mob(String components) {
        return "{\"format\": 1, \"category\": \"creature\", \"size\": {\"width\": 0.5, \"height\": 0.5}, \"components\": {" + MODEL
                + (components.isEmpty() ? "" : ", " + components) + "}}";
    }

    private static EntityComponents components(String components) {
        return clean(DefinitionParser::parseEntity, mob(components)).components();
    }

    private static Identifier id(String s) {
        return Identifier.parse(s);
    }

    @Test
    void traderReputationDefaultsAreVanillasNumbers() {
        TraderParser.Trader trader = components("\"msm:trader\": {\"trade_sets\": [{\"trade_set\": \"t:a\"}], \"reputation\": {}}")
                .trader().orElseThrow();
        TraderParser.Reputation rep = trader.reputation().orElseThrow();
        assertEquals(new TraderParser.Reputation(25, 2, Optional.empty(), 25, 20, Optional.empty()), rep);
        assertTrue(trader.demand());
        assertEquals(Optional.empty(), trader.workSite());
        TraderParser.Trader plain = components("\"msm:trader\": {\"trade_sets\": [{\"trade_set\": \"t:a\"}]}").trader().orElseThrow();
        assertEquals(Optional.empty(), plain.reputation());
        assertTrue(plain.demand());
        TraderParser.Trader site = components("\"msm:trader\": {\"trade_sets\": [{\"trade_set\": \"t:a\"}], \"demand\": false,"
                + " \"work_site\": \"#minecraft:logs\"}").trader().orElseThrow();
        assertFalse(site.demand());
        assertEquals(Optional.of("#minecraft:logs"), site.workSite());
    }

    @Test
    void shoulderSidesDefaultToEither() {
        String pet = "\"msm:tameable\": {\"items\": [\"minecraft:wheat\"]}, \"msm:shoulder_riding\": {}";
        EntityComponents c = clean(DefinitionParser::parseEntity, mob(pet).replace("\"category\"", "\"base\": \"animal\", \"category\""))
                .components();
        assertEquals(StorageParser.ShoulderSide.EITHER, c.shoulderRiding().orElseThrow().sides());
    }

    @Test
    void bucketableDefaultsAndNeedsSwim() {
        EntityComponents c = components("\"msm:movement\": {\"mode\": \"swim\"}, \"msm:bucketable\": {}");
        assertEquals(new EntityComponents.Bucketable(Optional.empty(), true), c.bucketable().orElseThrow());
        assertEquals(id("t:minnow_bucket"), EntityComponents.Bucketable.itemId(id("t:minnow")));
        assertEquals("item.t.fish.minnow_bucket", EntityComponents.Bucketable.defaultItemName(id("t:fish/minnow")));
        List<String> warned = warnings(DefinitionParser::parseEntity, mob("\"msm:bucketable\": {}"));
        assertEquals(1, warned.size());
        assertTrue(warned.getFirst().contains("msm:bucketable"), warned.getFirst());
        assertEquals(Optional.empty(), DefinitionParser.parseEntity(JsonParser.parseString(mob("\"msm:bucketable\": {}")))
                .definition().orElseThrow().components().bucketable());
    }

    @Test
    void hoverAndPhaseFlyAndHoverHeightDefaultsToFour() {
        EntityComponents.Movement hover = components("\"msm:movement\": {\"mode\": \"hover\"}").movementOrDefault();
        assertEquals(EntityComponents.MovementMode.HOVER, hover.mode());
        assertEquals(4.0f, hover.hoverHeight());
        assertTrue(hover.mode().flies());
        assertTrue(EntityComponents.MovementMode.PHASE.flies());
        assertFalse(EntityComponents.MovementMode.SWIM.flies());
        assertEquals(4.0f, EntityComponents.Movement.DEFAULT.hoverHeight());
    }

    @Test
    void dashDefaults() {
        EntityComponents.Rideable ride = components("\"msm:rideable\": {\"dash\": {}}").rideable().orElseThrow();
        assertEquals(new EntityComponents.RideDash(1.0f, 55), ride.dash().orElseThrow());
        assertEquals(Optional.empty(), components("\"msm:rideable\": {}").rideable().orElseThrow().dash());
    }

    @Test
    void newGoalDefaults() {
        List<Goal> goals = components("\"msm:ai_goals\": {\"goals\": [{\"type\": \"swoop\"}, {\"type\": \"roost\"},"
                + " {\"type\": \"collect_items\"}, {\"type\": \"dig_items\", \"dig_blocks\": [\"#minecraft:dirt\"], \"loot_table\": \"t:dig\"},"
                + " {\"type\": \"play_dead\"}, {\"type\": \"barter\", \"item\": \"minecraft:gold_ingot\", \"loot_table\": \"t:barter\"}]}")
                .goals();
        assertEquals(List.of(
                new Goal.Swoop(Optional.empty(), 1.0f, 12.0f, List.of(), true, false),
                new Goal.Roost(Optional.empty(), true, false, 8),
                new Goal.CollectItems(Optional.empty(), 1.0f, 32.0f, true),
                new Goal.DigItems(Optional.empty(), List.of("#minecraft:dirt"), id("t:dig"), 240, 1.0f),
                new Goal.PlayDead(Optional.empty(), 0.5f, 200, true),
                new Goal.Barter(Optional.empty(), "minecraft:gold_ingot", id("t:barter"), 120, true)), goals);
        assertEquals(List.of(id("minecraft:player")), components("\"msm:ai_goals\": {\"goals\": [{\"type\": \"swoop\","
                + " \"targets\": [\"minecraft:player\"]}]}").goals().getFirst().entityTypes());
    }

    @Test
    void boatDefaultsAndCompanionIds() {
        ItemDefinition item = clean(DefinitionParser::parseItem, "{\"format\": 1, \"components\": {\"msm:boat\": {}}}");
        BoatParser.Boat boat = item.components().boat().orElseThrow();
        assertEquals(new BoatParser.Boat(false, false, Optional.empty()), boat);
        assertEquals(id("t:maple"), boat.woodOf(id("t:maple_boat")));
        assertEquals(id("t:maple_chest_boat"), boat.chestBoatId(id("t:maple_boat")));
        assertEquals(id("t:skiff_chest_boat"), boat.chestBoatId(id("t:skiff")));
        BoatParser.Boat raft = new BoatParser.Boat(true, true, Optional.of(id("t:reed")));
        assertEquals(id("t:reed_chest_raft"), raft.chestBoatId(id("t:reed_raft")));
        assertEquals(id("t:reed"), raft.woodOf(id("t:anything_raft")));
        assertEquals(Optional.empty(), clean(DefinitionParser::parseItem, "{\"format\": 1}").components().boat());
    }

    @Test
    void fluidMixingCauldronAndBottle() {
        FluidDefinition fluid = clean(FluidParser::parse, "{\"format\": 1, \"mixing\": [{\"with\": \"lava\", \"source\": \"minecraft:obsidian\"},"
                + " {\"with\": \"t:goo\", \"flowing\": \"minecraft:clay\"}], \"cauldron\": {}, \"bottle\": {\"on_drink\": \"t:drank\"},"
                + " \"events\": {\"t:drank\": {\"actions\": []}}}");
        assertEquals(List.of(
                new FluidDefinition.Mixing(Optional.of(FluidDefinition.Behaviour.LAVA), Optional.empty(), Optional.of(id("minecraft:obsidian")),
                        Optional.empty()),
                new FluidDefinition.Mixing(Optional.empty(), Optional.of(id("t:goo")), Optional.empty(), Optional.of(id("minecraft:clay")))),
                fluid.mixing());
        assertEquals(Optional.of(new FluidDefinition.Cauldron(false)), fluid.cauldron());
        assertEquals(new FluidDefinition.Bottle(Optional.empty(), List.of(), Optional.of(id("t:drank"))), fluid.bottle().orElseThrow());
        FluidDefinition plain = clean(FluidParser::parse, "{\"format\": 1}");
        assertEquals(List.of(), plain.mixing());
        assertEquals(Optional.empty(), plain.cauldron());
        assertEquals(Optional.empty(), plain.bottle());
    }

    @Test
    void fluidRulesTheMcdocCannotSay() {
        List<String> dropped = warnings(FluidParser::parse, "{\"format\": 1, \"mixing\": [{\"with\": \"water\"}]}");
        assertTrue(dropped.getFirst().contains("mixing[0]"), dropped.toString());
        assertEquals(List.of(), FluidParser.parse(JsonParser.parseString("{\"format\": 1, \"mixing\": [{\"with\": \"water\"}]}"))
                .definition().orElseThrow().mixing());
        List<String> lava = warnings(FluidParser::parse, "{\"format\": 1, \"behaves_like\": \"lava\", \"cauldron\": {\"levels\": true}}");
        assertTrue(lava.getFirst().contains("cauldron"), lava.toString());
        failsOn(FluidParser::parse, "on_drink", "{\"format\": 1, \"bottle\": {\"on_drink\": \"t:nothing\"}}");
    }

    @Test
    void everyNewArgumentTypeParsesAndGreedyOnesGoLast() {
        List<String> names = List.of("dimension", "time", "team_colour", "hex_colour", "rotation", "angle", "uuid", "objective",
                "score_holder", "score_holders", "item_predicate", "block_predicate", "effect", "enchantment", "biome", "biome_or_tag",
                "structure", "structure_or_tag", "entity_type", "particle", "game_mode", "text_component", "int_range", "identifier",
                "team", "slot", "nbt", "message", "dialog", "loot_table", "advancement", "recipe");
        assertEquals(44, CommandParser.ArgumentType.values().length);
        for (String name : names) {
            CommandParser.Command cmd = clean(CommandParser::parse, "{\"format\": 1, \"name\": \"c\", \"function\": \"t:f\","
                    + " \"arguments\": [{\"name\": \"a\", \"type\": \"" + name + "\"}]}");
            assertEquals(name, cmd.arguments().getFirst().type().serialName());
        }
        failsOn(CommandParser::parse, "message", "{\"format\": 1, \"name\": \"c\", \"function\": \"t:f\", \"arguments\": ["
                + "{\"name\": \"a\", \"type\": \"message\"}, {\"name\": \"b\", \"type\": \"word\"}]}");
    }

    @Test
    void creativeTabByHand() {
        CreativeTabParser.Tab tab = clean(CreativeTabParser::parse, "{\"format\": 1, \"icon\": \"t:a\", \"order\": \"by_hand\","
                + " \"items\": [\"t:a\", \"minecraft:stick\"]}");
        assertEquals(CreativeTabParser.Order.BY_HAND, tab.order());
        assertEquals(List.of(id("t:a"), id("minecraft:stick")), tab.items());
        assertEquals(List.of(), clean(CreativeTabParser::parse, "{\"format\": 1, \"icon\": \"t:a\"}").items());
        CreativeTabParser.Tab none = CreativeTabParser.parse(JsonParser.parseString("{\"format\": 1, \"icon\": \"t:a\", \"order\": \"by_hand\"}"))
                .definition().orElseThrow();
        assertEquals(CreativeTabParser.Order.AS_LISTED, none.order());
        assertEquals(1, warnings(CreativeTabParser::parse, "{\"format\": 1, \"icon\": \"t:a\", \"order\": \"by_hand\"}").size());
        assertEquals(1, warnings(CreativeTabParser::parse, "{\"format\": 1, \"icon\": \"t:a\", \"items\": [\"t:a\"]}").size());
    }

    @Test
    void villagerTypeAndItsPictures() {
        VillagerTypeParser.VillagerType type = clean(VillagerTypeParser::parse, "{\"format\": 1, \"biomes\": [\"minecraft:plains\", \"#t:glades\"]}");
        assertEquals(List.of("minecraft:plains", "#t:glades"), type.biomes());
        assertEquals(id("t:textures/entity/villager/type/blossom.png"), VillagerTypeParser.VillagerType.villagerTexture(id("t:blossom")));
        assertEquals(id("t:textures/entity/zombie_villager/type/blossom.png"),
                VillagerTypeParser.VillagerType.zombieVillagerTexture(id("t:blossom")));
    }

    @Test
    void gameRuleDefaultsAndRanges() {
        assertEquals(new GameRuleParser.GameRule(GameRuleParser.Kind.BOOLEAN, GameRuleParser.Category.MISC, false, 0, Optional.empty(),
                Optional.empty()), clean(GameRuleParser::parse, "{\"format\": 1, \"kind\": \"boolean\"}"));
        assertEquals(new GameRuleParser.GameRule(GameRuleParser.Kind.INTEGER, GameRuleParser.Category.MOBS, false, 3, Optional.of(1),
                Optional.of(9)), clean(GameRuleParser::parse, "{\"format\": 1, \"kind\": \"integer\", \"category\": \"mobs\", \"default\": 3,"
                + " \"min\": 1, \"max\": 9}"));
        assertEquals(5, clean(GameRuleParser::parse, "{\"format\": 1, \"kind\": \"integer\", \"min\": 5}").integerDefault());
        assertEquals(-2, clean(GameRuleParser::parse, "{\"format\": 1, \"kind\": \"integer\", \"max\": -2}").integerDefault());
        failsOn(GameRuleParser::parse, "min", "{\"format\": 1, \"kind\": \"integer\", \"min\": 5, \"max\": 2}");
        failsOn(GameRuleParser::parse, "default", "{\"format\": 1, \"kind\": \"integer\", \"default\": 12, \"max\": 10}");
        failsOn(GameRuleParser::parse, "max", "{\"format\": 1, \"kind\": \"boolean\", \"max\": 1}");
        assertEquals("gamerule.t.ghosts", GameRuleParser.GameRule.translationKey(id("t:ghosts")));
        assertEquals("gamerule.t.ghosts.description", GameRuleParser.GameRule.descriptionKey(id("t:ghosts")));
    }

    @Test
    void statFormatterAndCriterion() {
        assertEquals(StatParser.Formatter.DEFAULT, clean(StatParser::parse, "{\"format\": 1}").formatter());
        assertEquals(StatParser.Formatter.DISTANCE, clean(StatParser::parse, "{\"format\": 1, \"formatter\": \"distance\"}").formatter());
        assertEquals("minecraft.custom:t.haunted", StatParser.criterion(id("t:haunted")));
        assertEquals("stat.t.haunted", StatParser.translationKey(id("t:haunted")));
    }
}
