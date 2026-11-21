package dev.mcsupermods.runtime.loader;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.loader.TraderParser.Restock;
import dev.mcsupermods.runtime.loader.TraderParser.Trader;
import java.util.List;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/** {@link TraderParser}: {@code msm:trader} through the entity parser, its defaults and its closed fields (ADR 0098 D1, B474). */
class TraderParserTest {
    private static String entity(String trader, String events) {
        return "{\"format\": 1, \"category\": \"creature\", \"size\": {\"width\": 0.6, \"height\": 1.8},"
                + " \"components\": {\"msm:animated_model\": {\"model\": \"a:entity/m\", \"texture\": \"a:entity/m\"},"
                + " \"msm:trader\": " + trader + "}" + (events == null ? "" : ", \"events\": " + events) + "}";
    }

    private static ParseResult<EntityDefinition> parse(String trader) {
        return DefinitionParser.parseEntity(JsonParser.parseString(entity(trader, null)));
    }

    private static void refused(String trader, String part) {
        ParseResult<EntityDefinition> result = parse(trader);
        assertFalse(result.errors().isEmpty(), "no error for " + trader);
        assertTrue(result.errors().stream().anyMatch(e -> e.contains(part)), part + " not in " + result.errors());
        assertTrue(result.definition().isEmpty() || result.definition().get().components().trader().isEmpty(),
                "a broken trader was applied: " + trader);
    }

    @Test
    void oneLevelTakesTheDefaults() {
        ParseResult<EntityDefinition> result = parse("{\"trade_sets\": [{\"trade_set\": \"minecraft:wandering_trader/common\"}]}");
        assertEquals(List.of(), result.errors());
        assertEquals(List.of(), result.warnings(), "msm:trader is a known component now");
        Trader trader = result.definition().orElseThrow().components().trader().orElseThrow();
        assertEquals(1, trader.tradeSets().size());
        assertEquals(Identifier.parse("minecraft:wandering_trader/common"), trader.tradeSets().getFirst().tradeSet());
        assertTrue(trader.levels(), "levels defaults to true");
        assertEquals(Restock.TWICE_A_DAY, trader.restock());
        assertEquals(Optional.empty(), trader.tradeSound());
        assertEquals(Optional.empty(), trader.onTrade());
        assertEquals(1, trader.maxLevel());
    }

    @Test
    void levelsAndThresholds() {
        Trader trader = parse("{\"trade_sets\": [{\"trade_set\": \"a:l1\", \"xp_to_next\": 5}, {\"trade_set\": \"a:l2\"},"
                + " {\"trade_set\": \"a:l3\"}], \"restock\": \"never\", \"trade_sound\": \"minecraft:entity.wandering_trader.yes\"}")
                .definition().orElseThrow().components().trader().orElseThrow();
        assertEquals(3, trader.maxLevel());
        assertEquals(5, trader.xpToLeave(1, 10), "xp_to_next wins");
        assertEquals(70, trader.xpToLeave(2, 70), "vanilla's threshold without xp_to_next");
        assertEquals(Restock.NEVER, trader.restock());
        assertEquals(Optional.of(Identifier.parse("minecraft:entity.wandering_trader.yes")), trader.tradeSound());

        Trader flat = parse("{\"levels\": false, \"trade_sets\": [{\"trade_set\": \"a:l1\"}, {\"trade_set\": \"a:l2\"}]}")
                .definition().orElseThrow().components().trader().orElseThrow();
        assertEquals(1, flat.maxLevel(), "without levels only level 1 is used");
    }

    @Test
    void onTradeMustNameADeclaredEvent() {
        String trader = "{\"on_trade\": \"a:traded\", \"trade_sets\": [{\"trade_set\": \"a:l1\"}]}";
        ParseResult<EntityDefinition> declared = DefinitionParser.parseEntity(JsonParser.parseString(entity(trader,
                "{\"a:traded\": {\"actions\": [{\"type\": \"play_sound\", \"sound\": \"minecraft:entity.villager.celebrate\"}]}}")));
        assertEquals(List.of(), declared.errors());
        assertEquals(Optional.of(Identifier.parse("a:traded")),
                declared.definition().orElseThrow().components().trader().orElseThrow().onTrade());

        ParseResult<EntityDefinition> missing = parse(trader);
        assertTrue(missing.errors().stream().anyMatch(e -> e.contains("msm:trader.on_trade") && e.contains("a:traded")),
                "no error for an undeclared on_trade: " + missing.errors());
    }

    @Test
    void closedFieldsAreErrors() {
        refused("{\"gossip\": true, \"trade_sets\": [{\"trade_set\": \"a:l1\"}]}", "gossip");
        refused("true", "msm:trader");
        refused("{}", "trade_sets");
        refused("{\"trade_sets\": []}", "trade_sets");
        refused("{\"trade_sets\": [{\"xp_to_next\": 10}]}", "trade_set");
        refused("{\"trade_sets\": [\"a:l1\"]}", "trade_sets");
        refused("{\"trade_sets\": [{\"trade_set\": \"a:l1\", \"xp_to_next\": 0}]}", "xp_to_next");
        refused("{\"trade_sets\": [{\"trade_set\": \"a:l1\", \"xp_to_next\": 2.5}]}", "xp_to_next");
        refused("{\"restock\": \"daily\", \"trade_sets\": [{\"trade_set\": \"a:l1\"}]}", "restock");
        refused("{\"levels\": \"yes\", \"trade_sets\": [{\"trade_set\": \"a:l1\"}]}", "levels");
        refused("{\"trade_sound\": 3, \"trade_sets\": [{\"trade_set\": \"a:l1\"}]}", "trade_sound");
        refused("{\"trade_sets\": [{\"trade_set\": \"a:1\"}, {\"trade_set\": \"a:2\"}, {\"trade_set\": \"a:3\"},"
                + " {\"trade_set\": \"a:4\"}, {\"trade_set\": \"a:5\"}, {\"trade_set\": \"a:6\"}]}", "trade_sets");
    }
}
