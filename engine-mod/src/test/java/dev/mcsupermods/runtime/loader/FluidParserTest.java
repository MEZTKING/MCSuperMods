package dev.mcsupermods.runtime.loader;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.registry.fluid.FluidDefinition;
import dev.mcsupermods.runtime.registry.fluid.FluidDefinition.Behaviour;
import dev.mcsupermods.runtime.registry.fluid.FluidDefinition.Flow;
import java.util.List;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/** {@link FluidParser}: defaults by {@code behaves_like}, partial flow objects, events and the closed fields (ADR 0099 D1). */
class FluidParserTest {
    private static ParseResult<FluidDefinition> parse(String json) {
        return FluidParser.parse(JsonParser.parseString(json));
    }

    private static FluidDefinition clean(String json) {
        ParseResult<FluidDefinition> result = parse(json);
        assertEquals(List.of(), result.errors(), "errors");
        assertEquals(List.of(), result.warnings(), "warnings");
        return result.definition().orElseThrow();
    }

    private static void refused(String json, String part) {
        ParseResult<FluidDefinition> result = parse(json);
        assertTrue(result.definition().isEmpty(), "registered: " + json);
        assertTrue(result.errors().stream().anyMatch(e -> e.contains(part)), part + " not in " + result.errors());
    }

    @Test
    void aMinimalFluidIsWaterLike() {
        FluidDefinition def = clean("{\"format\": 1}");
        assertEquals(Behaviour.WATER, def.behavesLike());
        assertEquals(new Flow(5, 4, 1, true), def.flow());
        assertEquals(0, def.light());
        assertEquals(Optional.empty(), def.tint());
        assertEquals(100.0f, def.explosionResistance());
        assertEquals(Optional.empty(), def.onEntityInside());
    }

    @Test
    void lavaLikeTakesLavaDefaults() {
        FluidDefinition def = clean("{\"format\": 1, \"behaves_like\": \"lava\"}");
        assertEquals(new Flow(30, 2, 2, false), def.flow());
        assertEquals(15, def.light(), "ADR 0099 D1: light defaults to 15 for a lava-like fluid");
        assertEquals(3, clean("{\"format\": 1, \"behaves_like\": \"lava\", \"light\": 3}").light());
    }

    @Test
    void noneTakesWaterFlow() {
        FluidDefinition def = clean("{\"format\": 1, \"behaves_like\": \"none\", \"tint\": 0}");
        assertEquals(Behaviour.NONE, def.behavesLike());
        assertEquals(Flow.WATER, def.flow());
        assertEquals(Optional.of(0), def.tint());
    }

    @Test
    void aFlowObjectSetsOnlyWhatItNames() {
        FluidDefinition def = clean("{\"format\": 1, \"behaves_like\": \"lava\", \"flow\": {\"tick_delay\": 7, \"infinite\": true}}");
        assertEquals(new Flow(7, 2, 2, true), def.flow());
        assertEquals(new Flow(5, 4, 3, true), clean("{\"format\": 1, \"flow\": {\"drop_off\": 3}}").flow());
    }

    @Test
    void eventsAndTheInsideEvent() {
        FluidDefinition def = clean("{\"format\": 1, \"on_entity_inside\": \"mymod:glow\", \"events\": {\"mymod:glow\": {\"actions\": "
                + "[{\"type\": \"apply_effect\", \"effect\": \"minecraft:glowing\", \"seconds\": 5, \"target\": \"other\"}]}}}");
        assertEquals(Optional.of(Identifier.parse("mymod:glow")), def.onEntityInside());
        assertTrue(def.events().contains(Identifier.parse("mymod:glow")));
    }

    @Test
    void anUndeclaredInsideEventIsAnErrorButTheFluidStays() {
        ParseResult<FluidDefinition> result = parse("{\"format\": 1, \"on_entity_inside\": \"mymod:nothing\"}");
        assertTrue(result.definition().isPresent());
        assertTrue(result.definition().get().onEntityInside().isEmpty());
        assertTrue(result.errors().stream().anyMatch(e -> e.startsWith("on_entity_inside") && e.contains("mymod:nothing")),
                result.errors().toString());
    }

    @Test
    void brokenEventsAndTriggerReferencesAreErrors() {
        ParseResult<FluidDefinition> result = parse("{\"format\": 1, \"events\": {\"a:b\": {\"actions\": [{\"type\": \"no_such_action\"}]},"
                + " \"a:c\": {\"actions\": [{\"type\": \"trigger_event\", \"event\": \"a:missing\"}]}}}");
        assertTrue(result.definition().isPresent());
        assertTrue(result.errors().stream().anyMatch(e -> e.contains("a:b")), result.errors().toString());
        assertTrue(result.errors().stream().anyMatch(e -> e.contains("trigger_event") && e.contains("a:missing")), result.errors().toString());
    }

    @Test
    void playAnimationIsDroppedWithAWarning() {
        ParseResult<FluidDefinition> result = parse("{\"format\": 1, \"events\": {\"a:b\": {\"actions\": "
                + "[{\"type\": \"play_animation\", \"controller\": \"main\", \"animation\": \"wave\"}]}}}");
        assertEquals(List.of(), result.errors());
        assertEquals(1, result.warnings().size(), result.warnings().toString());
        assertTrue(result.definition().orElseThrow().events().get(Identifier.parse("a:b")).orElseThrow().actions().isEmpty());
    }

    @Test
    void closedFieldsAndRangesAreErrors() {
        refused("{\"behaves_like\": \"water\"}", "format");
        refused("{\"format\": 2}", "format");
        refused("{\"format\": 1, \"behaves_like\": \"honey\"}", "behaves_like");
        refused("{\"format\": 1, \"textures\": {}}", "textures");
        refused("{\"format\": 1, \"flow\": {\"viscosity\": 3}}", "viscosity");
        refused("{\"format\": 1, \"flow\": {\"tick_delay\": 0}}", "tick_delay");
        refused("{\"format\": 1, \"flow\": {\"tick_delay\": 101}}", "tick_delay");
        refused("{\"format\": 1, \"flow\": {\"slope_distance\": 9}}", "slope_distance");
        refused("{\"format\": 1, \"flow\": {\"drop_off\": 5}}", "drop_off");
        refused("{\"format\": 1, \"flow\": {\"infinite\": \"yes\"}}", "infinite");
        refused("{\"format\": 1, \"light\": 16}", "light");
        refused("{\"format\": 1, \"tint\": 16777216}", "tint");
        refused("{\"format\": 1, \"tint\": -1}", "tint");
        refused("{\"format\": 1, \"tint\": \"red\"}", "tint");
        refused("{\"format\": 1, \"explosion_resistance\": -1}", "explosion_resistance");
        refused("{\"format\": 1, \"on_entity_inside\": 3}", "on_entity_inside");
        refused("[]", "object");
    }
}
