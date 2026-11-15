package dev.mcsupermods.runtime.loader;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/** {@link VehicleParser} and {@link VehicleDefinition}'s defaults (ADR 0090 D2, D5, D9). */
class VehicleParserTest {
    private static final String MINIMAL = """
            {"format": 1, "model": {"geometry": "a:entity/kart", "texture": "a:entity/kart"}, "movement": {"mode": "%s"}%s}""";

    private static ParseResult<VehicleDefinition> parse(String json) {
        return VehicleParser.parse(JsonParser.parseString(json));
    }

    private static VehicleDefinition clean(String json) {
        ParseResult<VehicleDefinition> result = parse(json);
        assertEquals(List.of(), result.errors(), "errors");
        assertEquals(List.of(), result.warnings(), "warnings");
        return result.definition().orElseThrow();
    }

    private static String minimal(String mode, String more) {
        return MINIMAL.formatted(mode, more.isEmpty() ? "" : ", " + more);
    }

    @Test
    void aMinimalVehicleTakesTheDefaults() {
        VehicleDefinition def = clean(minimal("ground", ""));
        assertEquals(1.375f, def.width());
        assertEquals(0.5625f, def.height());
        assertEquals(1, def.seatCount(), "one default seat");
        assertEquals(40f, def.health().max());
        assertTrue(def.pickUp());
        assertTrue(def.hud());
        assertTrue(def.fuel().isEmpty(), "no fuel needed");
        assertTrue(def.storage().isEmpty());
        assertEquals(1f, def.model().scale());
        assertEquals(VehicleDefinition.PlacesOn.GROUND, def.placesOn());
        assertTrue(def.weaponsOfSeat(0).isEmpty());
    }

    @Test
    void placesOnDefaultsByMode() {
        assertEquals(VehicleDefinition.PlacesOn.WATER, clean(minimal("water", "")).placesOn());
        assertEquals(VehicleDefinition.PlacesOn.ANY, clean(minimal("amphibious", "")).placesOn());
        assertEquals(VehicleDefinition.PlacesOn.ANY, clean(minimal("hover", "")).placesOn());
        assertEquals(VehicleDefinition.PlacesOn.GROUND, clean(minimal("air", "")).placesOn());
        assertEquals(VehicleDefinition.PlacesOn.GROUND, clean(minimal("water", "\"item\": {\"places_on\": \"ground\"}")).placesOn());
    }

    @Test
    void fuelCapacityDefaultsToTenOfTheLargestItem() {
        VehicleDefinition def = clean(minimal("ground", """
                "engine": {"fuel": {"items": [{"item": "minecraft:coal", "ticks": 1600}, {"item": "#minecraft:logs", "ticks": 300}]}}"""));
        assertEquals(16000, def.fuel().orElseThrow().capacityOrDefault());
    }

    @Test
    void theFirstSeatFiresEveryWeaponUnlessSeatsSayOtherwise() {
        String weapons = """
                "weapons": [{"id": "cannon", "projectile": "minecraft:snowball"}, {"id": "gun", "key": "second", "projectile": "minecraft:arrow"}]""";
        VehicleDefinition def = clean(minimal("ground", weapons + ", \"seats\": [{\"offset\": [0, 1, 0]}, {\"offset\": [0, 1, -1]}]"));
        assertEquals(List.of("cannon", "gun"), def.weaponsOfSeat(0));
        assertEquals(List.of(), def.weaponsOfSeat(1));
        VehicleDefinition split = clean(minimal("ground", weapons
                + ", \"seats\": [{\"offset\": [0, 1, 0], \"weapons\": [\"cannon\"]}, {\"offset\": [0, 1, -1], \"weapons\": [\"gun\"]}]"));
        assertEquals(List.of("cannon"), split.weaponsOfSeat(0));
        assertEquals(List.of("gun"), split.weaponsOfSeat(1));
        assertEquals(1, split.weaponIndex("gun"));
        VehicleDefinition.Weapon cannon = split.weapons().getFirst();
        assertEquals(VehicleDefinition.WeaponKey.FIRE, cannon.key());
        assertEquals(1.6f, cannon.speed());
        assertEquals(1f, cannon.inaccuracy());
        assertEquals(2f, cannon.damage());
        assertEquals(20, cannon.cooldownTicks());
    }

    @Test
    void anUnknownKeyAnywhereRegistersNothing() {
        ParseResult<VehicleDefinition> top = parse(minimal("ground", "\"rails\": true"));
        assertTrue(top.definition().isEmpty());
        assertTrue(top.errors().getFirst().contains("rails"), top.errors().toString());
        ParseResult<VehicleDefinition> nested = parse(minimal("ground", "\"camera\": {\"zoom\": 2}"));
        assertTrue(nested.definition().isEmpty());
        assertTrue(nested.errors().getFirst().contains("zoom"), nested.errors().toString());
    }

    @Test
    void aNewerFormatIsRefused() {
        ParseResult<VehicleDefinition> result = parse(MINIMAL.formatted("ground", "").replace("\"format\": 1", "\"format\": 2"));
        assertTrue(result.definition().isEmpty());
        assertTrue(result.errors().getFirst().contains("newer"), result.errors().toString());
    }

    @Test
    void undeclaredEventsAreErrorsButTheVehicleStays() {
        ParseResult<VehicleDefinition> result = parse(minimal("ground", """
                "events": {"a:ok": {"actions": [{"type": "explode", "power": 2}]}},
                "on_mount": "a:ok", "on_destroy": "a:missing", "on_tick": {"event": "a:gone"},
                "weapons": [{"id": "w", "projectile": "minecraft:snowball", "on_fire": "a:nope"}]"""));
        assertTrue(result.definition().isPresent());
        List<String> errors = result.errors();
        assertEquals(3, errors.size(), errors.toString());
        assertTrue(errors.stream().anyMatch(e -> e.startsWith("on_destroy names event a:missing")), errors.toString());
        assertTrue(errors.stream().anyMatch(e -> e.startsWith("on_tick names event a:gone")), errors.toString());
        assertTrue(errors.stream().anyMatch(e -> e.startsWith("weapons[0].on_fire names event a:nope")), errors.toString());
        assertEquals(20, result.definition().get().onTick().orElseThrow().interval(), "on_tick interval default");
    }

    @Test
    void aBrokenEventIsDroppedAndPlayAnimationWarns() {
        ParseResult<VehicleDefinition> result = parse(minimal("ground", """
                "events": {"a:bad": {"actions": [{"type": "fly_away"}]}, "a:anim": {"actions": [{"type": "play_animation", "animation": "x"}]}}"""));
        VehicleDefinition def = result.definition().orElseThrow();
        assertEquals(1, result.errors().size(), result.errors().toString());
        assertTrue(result.errors().getFirst().contains("a:bad"));
        assertFalse(def.events().contains(Identifier.parse("a:bad")));
        assertEquals(1, result.warnings().size(), result.warnings().toString());
        assertTrue(def.events().get(Identifier.parse("a:anim")).orElseThrow().actions().isEmpty(), "play_animation dropped");
    }

    @Test
    void duplicateIdsAndUnknownSeatWeaponsAreErrors() {
        JsonObject json = JsonParser.parseString(minimal("ground", """
                "weapons": [{"id": "w", "projectile": "minecraft:snowball"}, {"id": "w", "projectile": "minecraft:arrow"}],
                "seats": [{"offset": [0, 1, 0], "weapons": ["x"]}]""")).getAsJsonObject();
        json.add("model", JsonParser.parseString("""
                {"geometry": "a:g", "texture": "a:t", "paints": [{"id": "red", "texture": "a:r"}, {"id": "red", "texture": "a:s"}]}"""));
        ParseResult<VehicleDefinition> checked = VehicleParser.parse(json);
        assertTrue(checked.definition().isPresent());
        assertEquals(3, checked.errors().size(), checked.errors().toString());
        assertTrue(checked.errors().stream().anyMatch(e -> e.contains("two weapons have the id 'w'")));
        assertTrue(checked.errors().stream().anyMatch(e -> e.contains("two paints have the id 'red'")));
        assertTrue(checked.errors().stream().anyMatch(e -> e.contains("seats[0]: weapons names 'x'")));
        assertEquals(0, checked.definition().get().paintIndex("red"));
    }

    @Test
    void parseAllKeepsOnlyVehicleFilesAndPrefixesProblemsWithTheFile() {
        List<RawDefinition> raws = List.of(
                new RawDefinition("m", "vehicle", Identifier.parse("a:kart"), JsonParser.parseString(minimal("ground", "")).getAsJsonObject()),
                new RawDefinition("m", "vehicle", Identifier.parse("a:bad"), JsonParser.parseString(minimal("rail", "")).getAsJsonObject()),
                new RawDefinition("m", "block", Identifier.parse("a:stone"), new JsonObject()));
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Map<Identifier, VehicleDefinition> parsed = VehicleParser.parseAll(raws, errors, warnings);
        assertEquals(List.of(Identifier.parse("a:kart")), List.copyOf(parsed.keySet()));
        assertEquals(1, errors.size(), errors.toString());
        assertTrue(errors.getFirst().startsWith("msm/a/vehicle/bad.json (mod m): movement: mode: unknown movement mode 'rail'"), errors.getFirst());
    }
}
