package dev.mcsupermods.runtime.loader;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.serialization.JsonOps;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.Events;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/** {@link HudParser}'s defaults and rules, and the three HUD actions' Codecs (ADR 0089 D1, D2, D6). */
class HudParserTest {
    private static ParseResult<HudDefinition> parse(String json) {
        return HudParser.parse(JsonParser.parseString(json));
    }

    @Test
    void theDefaults() {
        ParseResult<HudDefinition> r = parse("{\"format\": 1, \"type\": \"bar\", \"value\": {\"source\": \"set\"}}");
        assertEquals(List.of(), r.errors());
        assertEquals(List.of(), r.warnings());
        HudDefinition d = r.definition().orElseThrow();
        assertEquals(HudDefinition.Anchor.ABOVE_HOTBAR, d.anchor());
        assertEquals(0, d.offsetX());
        assertEquals(0, d.offsetY());
        assertEquals(0, d.order());
        assertEquals(new HudDefinition.Fixed(20), d.max());
        assertEquals(HudDefinition.Show.WHEN_SET, d.show());
        assertFalse(d.startsHidden());
        assertEquals(new HudDefinition.TextStyle("{value}", 0xffffff, true), d.text());
        assertEquals(new HudDefinition.BarStyle(81, 5, 0xe0c040, 0x202020, Optional.empty(), Optional.empty()), d.bar());
        assertEquals(2f, d.icons().perIcon());
        assertInstanceOf(HudDefinition.SetOnly.class, d.value());
    }

    @Test
    void valuesAndMaxFromValues() {
        HudDefinition d = parse("""
                {"format": 1, "type": "text", "color": "#40A0ff", "value": {"source": "score", "objective": "mana"},
                 "max": {"source": "data", "scope": "world", "namespace": "m", "key": "cap"}}""").definition().orElseThrow();
        assertEquals(new HudDefinition.Score("mana", "@s"), d.value());
        assertEquals(new HudDefinition.From(new HudDefinition.Data(HudDefinition.DataScope.WORLD, "m", "cap")), d.max());
        assertTrue(d.maxFromServer());
        assertEquals(0x40a0ff, d.text().color());
        HudDefinition v = parse("{\"format\": 1, \"type\": \"text\", \"value\": {\"source\": \"vehicle\", \"stat\": \"reload\"}}")
                .definition().orElseThrow();
        assertEquals(new HudDefinition.Vehicle(HudDefinition.VehicleStat.RELOAD, Optional.empty()), v.value());
        assertFalse(v.maxFromServer());
    }

    @Test
    void aVehicleWithoutAVehicleShowIsIgnored() {
        ParseResult<HudDefinition> r = parse("""
                {"format": 1, "type": "text", "value": {"source": "set"}, "vehicle": "m:tank"}""");
        assertEquals(1, r.warnings().size(), r.warnings().toString());
        assertTrue(r.definition().orElseThrow().vehicle().isEmpty());
    }

    @Test
    void iconsWithoutAnIconWarn() {
        ParseResult<HudDefinition> r = parse("{\"format\": 1, \"type\": \"icons\", \"value\": {\"source\": \"set\"}}");
        assertTrue(r.definition().isPresent());
        assertEquals(1, r.warnings().size());
    }

    @Test
    void errors() {
        assertTrue(parse("{\"format\": 1, \"type\": \"text\", \"color\": \"red\", \"value\": {\"source\": \"set\"}}").errors().getFirst()
                .contains("color"));
        assertTrue(parse("{\"format\": 2, \"type\": \"text\", \"value\": {\"source\": \"set\"}}").errors().getFirst().contains("format"));
        assertTrue(parse("[]").definition().isEmpty());
    }

    @Test
    void parseAllSortsByIdAsAString() {
        List<RawDefinition> raws = new ArrayList<>();
        for (String id : List.of("zz:a", "aa:z", "aa:b")) {
            raws.add(new RawDefinition("test", HudParser.KIND, Identifier.parse(id),
                    JsonParser.parseString("{\"format\": 1, \"type\": \"text\", \"value\": {\"source\": \"set\"}}").getAsJsonObject()));
        }
        Map<Identifier, HudDefinition> all = HudParser.parseAll(raws, new ArrayList<>(), new ArrayList<>());
        assertEquals(List.of(Identifier.parse("aa:b"), Identifier.parse("aa:z"), Identifier.parse("zz:a")), List.copyOf(all.keySet()));
    }

    @Test
    void theThreeActions() {
        JsonObject events = JsonParser.parseString("""
                {"m:go": {"actions": [
                  {"type": "show_hud", "hud": "m:mana"},
                  {"type": "hide_hud", "hud": "m:mana"},
                  {"type": "set_hud", "hud": "m:mana", "value": 3},
                  {"type": "set_hud", "hud": "m:status", "value": "Ready"}]}}""").getAsJsonObject();
        Events decoded = Events.CODEC.parse(JsonOps.INSTANCE, events).getOrThrow();
        assertEquals(List.of(), decoded.errors());
        List<Action> actions = decoded.byId().get(Identifier.parse("m:go")).actions();
        assertEquals(new Action.ShowHud(Identifier.parse("m:mana")), actions.get(0));
        assertEquals(new Action.HideHud(Identifier.parse("m:mana")), actions.get(1));
        assertEquals(3.0, ((Action.SetHud) actions.get(2)).value().left().orElseThrow());
        assertEquals("Ready", ((Action.SetHud) actions.get(3)).value().right().orElseThrow());
        Events bad = Events.CODEC.parse(JsonOps.INSTANCE, JsonParser.parseString(
                "{\"m:go\": {\"actions\": [{\"type\": \"show_hud\", \"hud\": \"\"}]}}")).getOrThrow();
        assertEquals(1, bad.errors().size());
        assertTrue(bad.errors().getFirst().contains("hud"), bad.errors().toString());
    }
}
