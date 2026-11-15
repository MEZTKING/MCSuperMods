package dev.mcsupermods.runtime.registry.weathering;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/** The weathering and waxing maps of ADR 0094 D8, D9 ({@link Weathering.Maps#build}), without a game. */
class WeatheringMapsTest {
    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("t", path);
    }

    private static Optional<Identifier> next(String path) {
        return Optional.of(id(path));
    }

    /** A tin set: four stages, each waxable into its own waxed copy. */
    private static Map<Identifier, Optional<Identifier>> tin() {
        Map<Identifier, Optional<Identifier>> declared = new LinkedHashMap<>();
        declared.put(id("tin"), next("exposed_tin"));
        declared.put(id("exposed_tin"), next("weathered_tin"));
        declared.put(id("weathered_tin"), next("oxidized_tin"));
        declared.put(id("oxidized_tin"), Optional.empty());
        return declared;
    }

    private static Map<Identifier, Identifier> tinWax() {
        Map<Identifier, Identifier> wax = new LinkedHashMap<>();
        for (String stage : List.of("tin", "exposed_tin", "weathered_tin", "oxidized_tin")) {
            wax.put(id(stage), id("waxed_" + stage));
        }
        return wax;
    }

    private static final Set<String> TIN_BLOCKS = Set.of("tin", "exposed_tin", "weathered_tin", "oxidized_tin", "waxed_tin",
            "waxed_exposed_tin", "waxed_weathered_tin", "waxed_oxidized_tin");

    private static boolean tinRegistered(Identifier id) {
        return id.getNamespace().equals("minecraft") || TIN_BLOCKS.contains(id.getPath());
    }

    @Test
    void aFullSetBuildsEveryMapWithoutErrors() {
        List<String> errors = new ArrayList<>();
        Weathering.Maps maps = Weathering.Maps.build(tin(), tinWax(), WeatheringMapsTest::tinRegistered, errors);
        assertEquals(List.of(), errors);
        assertEquals(Map.of(id("tin"), id("exposed_tin"), id("exposed_tin"), id("weathered_tin"), id("weathered_tin"), id("oxidized_tin")),
                maps.next());
        assertEquals(Map.of(id("exposed_tin"), id("tin"), id("weathered_tin"), id("exposed_tin"), id("oxidized_tin"), id("weathered_tin")),
                maps.previous());
        assertEquals(tinWax(), maps.waxInto());
        assertEquals(id("oxidized_tin"), maps.unwaxInto().get(id("waxed_oxidized_tin")));
        assertEquals(4, maps.unwaxInto().size());
    }

    @Test
    void anUnknownNextIsAnErrorAndThatBlockDoesNotAge() {
        Map<Identifier, Optional<Identifier>> declared = tin();
        declared.put(id("weathered_tin"), next("rusty_tin"));
        List<String> errors = new ArrayList<>();
        Weathering.Maps maps = Weathering.Maps.build(declared, Map.of(), WeatheringMapsTest::tinRegistered, errors);
        assertEquals(1, errors.size(), errors.toString());
        assertTrue(errors.getFirst().contains("t:weathered_tin") && errors.getFirst().contains("t:rusty_tin")
                && errors.getFirst().contains("does not age"), errors.getFirst());
        assertEquals(2, maps.next().size());
        assertTrue(!maps.next().containsKey(id("weathered_tin")));
        assertTrue(!maps.previous().containsKey(id("oxidized_tin")));
    }

    @Test
    void aCycleIsOneErrorAndNoneOfItsBlocksAges() {
        Map<Identifier, Optional<Identifier>> declared = tin();
        declared.put(id("oxidized_tin"), next("exposed_tin")); // exposed -> weathered -> oxidized -> exposed
        List<String> errors = new ArrayList<>();
        Weathering.Maps maps = Weathering.Maps.build(declared, Map.of(), WeatheringMapsTest::tinRegistered, errors);
        assertEquals(1, errors.size(), errors.toString());
        assertTrue(errors.getFirst().contains("cycle"), errors.getFirst());
        assertTrue(errors.getFirst().contains("t:exposed_tin -> t:weathered_tin -> t:oxidized_tin -> t:exposed_tin"), errors.getFirst());
        // tin itself still ages into the cycle's first block; the cycle's blocks do not.
        assertEquals(Map.of(id("tin"), id("exposed_tin")), maps.next());
        assertEquals(Map.of(id("exposed_tin"), id("tin")), maps.previous());
    }

    @Test
    void aBlockAgingIntoItselfIsACycle() {
        Map<Identifier, Optional<Identifier>> declared = new LinkedHashMap<>();
        declared.put(id("tin"), next("tin"));
        List<String> errors = new ArrayList<>();
        Weathering.Maps maps = Weathering.Maps.build(declared, Map.of(), WeatheringMapsTest::tinRegistered, errors);
        assertEquals(1, errors.size(), errors.toString());
        assertTrue(errors.getFirst().contains("t:tin -> t:tin") && errors.getFirst().contains("cycle"), errors.getFirst());
        assertTrue(maps.next().isEmpty());
    }

    @Test
    void twoBlocksAgingIntoOneLeaveItWithoutAPreviousStage() {
        Map<Identifier, Optional<Identifier>> declared = tin();
        declared.put(id("waxed_tin"), next("exposed_tin")); // a second source of exposed_tin (and a waxed copy that ages)
        List<String> errors = new ArrayList<>();
        Weathering.Maps maps = Weathering.Maps.build(declared, Map.of(), WeatheringMapsTest::tinRegistered, errors);
        assertEquals(1, errors.size(), errors.toString());
        assertTrue(errors.getFirst().contains("2 blocks age into it"), errors.getFirst());
        assertTrue(maps.next().containsKey(id("tin")) && maps.next().containsKey(id("waxed_tin")));
        assertTrue(!maps.previous().containsKey(id("exposed_tin")));
    }

    @Test
    void vanillaBlocksAreAcceptedAsNextAndInto() {
        Map<Identifier, Optional<Identifier>> declared = new LinkedHashMap<>();
        declared.put(id("tin"), Optional.of(Identifier.withDefaultNamespace("exposed_copper")));
        List<String> errors = new ArrayList<>();
        Weathering.Maps maps = Weathering.Maps.build(declared, Map.of(id("tin"), Identifier.withDefaultNamespace("waxed_copper_block")),
                WeatheringMapsTest::tinRegistered, errors);
        assertEquals(List.of(), errors);
        assertEquals(Identifier.withDefaultNamespace("exposed_copper"), maps.next().get(id("tin")));
        assertEquals(id("tin"), maps.unwaxInto().get(Identifier.withDefaultNamespace("waxed_copper_block")));
    }

    @Test
    void waxingErrorsLeaveTheLinkOut() {
        Map<Identifier, Identifier> wax = new LinkedHashMap<>();
        wax.put(id("tin"), id("waxed_tin"));
        wax.put(id("exposed_tin"), id("waxed_tin")); // two sources of one waxed block
        wax.put(id("weathered_tin"), id("candle_tin")); // unknown
        wax.put(id("oxidized_tin"), id("exposed_tin")); // a waxed copy that weathers
        List<String> errors = new ArrayList<>();
        Weathering.Maps maps = Weathering.Maps.build(tin(), wax, WeatheringMapsTest::tinRegistered, errors);
        assertEquals(3, errors.size(), errors.toString());
        assertTrue(errors.stream().anyMatch(e -> e.contains("t:candle_tin") && e.contains("not a registered block")), errors.toString());
        assertTrue(errors.stream().anyMatch(e -> e.contains("weathers itself")), errors.toString());
        assertTrue(errors.stream().anyMatch(e -> e.contains("2 blocks are waxed into it")), errors.toString());
        assertTrue(maps.waxInto().isEmpty());
        assertTrue(maps.unwaxInto().isEmpty());
    }
}
