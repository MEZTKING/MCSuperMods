package dev.mcsupermods.runtime.loader;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.loader.ProfessionParser.Profession;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/** {@link ProfessionParser}: defaults, the default trade sets, the name key and the closed fields (ADR 0098 D2, B474). */
class ProfessionParserTest {
    private static ParseResult<Profession> parse(String json) {
        return ProfessionParser.parse(JsonParser.parseString(json));
    }

    private static void refused(String json, String part) {
        ParseResult<Profession> result = parse(json);
        assertTrue(result.definition().isEmpty(), "registered: " + json);
        assertTrue(result.errors().stream().anyMatch(e -> e.contains(part)), part + " not in " + result.errors());
    }

    @Test
    void aJobSiteAloneTakesTheDefaults() {
        ParseResult<Profession> result = parse("{\"format\": 1, \"job_site\": \"mymod:potter_wheel\"}");
        assertEquals(List.of(), result.errors());
        assertEquals(List.of(), result.warnings());
        Profession p = result.definition().orElseThrow();
        assertEquals(Identifier.parse("mymod:potter_wheel"), p.jobSite());
        assertEquals(Optional.empty(), p.workSound());
        assertEquals(List.of(), p.requestedItems());
        assertEquals(List.of(), p.secondaryJobBlocks());
        Identifier id = Identifier.parse("mymod:crafts/potter");
        assertEquals(List.of("mymod:crafts/potter/level_1", "mymod:crafts/potter/level_2", "mymod:crafts/potter/level_3",
                "mymod:crafts/potter/level_4", "mymod:crafts/potter/level_5"),
                p.tradeSetsOf(id).stream().map(Identifier::toString).toList(), "lowering's default sets");
        assertEquals("entity.mymod.villager.crafts/potter", ProfessionParser.nameKey(id));
    }

    @Test
    void everyFieldDecodes() {
        Profession p = parse("""
                {"format": 1, "job_site": "mymod:potter_wheel", "requested_items": ["minecraft:clay_ball"],
                 "secondary_job_blocks": ["minecraft:clay"], "work_sound": "minecraft:block.decorated_pot.insert",
                 "trade_sets": ["minecraft:mason/level_1", "a:2", "a:3", "a:4", "a:5"]}""").definition().orElseThrow();
        assertEquals(List.of(Identifier.parse("minecraft:clay_ball")), p.requestedItems());
        assertEquals(List.of(Identifier.parse("minecraft:clay")), p.secondaryJobBlocks());
        assertEquals(Optional.of(Identifier.parse("minecraft:block.decorated_pot.insert")), p.workSound());
        assertEquals(Identifier.parse("minecraft:mason/level_1"), p.tradeSetsOf(Identifier.parse("x:y")).getFirst(), "written sets win");
    }

    @Test
    void closedFieldsAreErrors() {
        refused("{\"format\": 1, \"job_site\": \"a:b\", \"display_name\": \"Potter\"}", "display_name");
        refused("{\"format\": 1, \"job_site\": \"a:b\", \"textures\": {}}", "textures");
        refused("{\"format\": 1, \"job_site\": \"a:b\", \"max_tickets\": 2}", "max_tickets");
        refused("{\"format\": 1}", "job_site");
        refused("{\"format\": 1, \"job_site\": 4}", "job_site");
        refused("{\"format\": 1, \"job_site\": \"a:b\", \"trade_sets\": [\"a:1\", \"a:2\", \"a:3\", \"a:4\"]}", "trade_sets");
        refused("{\"format\": 1, \"job_site\": \"a:b\", \"trade_sets\": [\"a:1\", \"a:2\", \"a:3\", \"a:4\", \"a:5\", \"a:6\"]}",
                "trade_sets");
        refused("{\"format\": 1, \"job_site\": \"a:b\", \"requested_items\": \"a:c\"}", "requested_items");
        refused("{\"job_site\": \"a:b\"}", "format");
        refused("{\"format\": 2, \"job_site\": \"a:b\"}", "format");
    }

    @Test
    void parseAllReportsByFileAndKeepsScanOrder() {
        com.google.gson.JsonObject good = JsonParser.parseString("{\"format\": 1, \"job_site\": \"a:b\"}").getAsJsonObject();
        com.google.gson.JsonObject bad = JsonParser.parseString("{\"format\": 1}").getAsJsonObject();
        List<RawDefinition> raws = List.of(
                new RawDefinition("mod", "villager_profession", Identifier.parse("a:z"), good),
                new RawDefinition("mod", "block", Identifier.parse("a:b"), good),
                new RawDefinition("mod", "villager_profession", Identifier.parse("a:bad"), bad),
                new RawDefinition("mod", "villager_profession", Identifier.parse("a:a"), good));
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Map<Identifier, Profession> parsed = ProfessionParser.parseAll(raws, errors, warnings);
        assertEquals(List.of(Identifier.parse("a:z"), Identifier.parse("a:a")), List.copyOf(parsed.keySet()));
        assertEquals(1, errors.size(), "errors: " + errors);
        assertTrue(errors.getFirst().startsWith("msm/a/villager_profession/bad.json (mod mod): "), errors.getFirst());
        assertEquals(List.of(), warnings);
    }
}
