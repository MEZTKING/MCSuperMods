package dev.mcsupermods.runtime.loader;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.TreeSet;
import java.util.function.Function;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/**
 * Runs the Codecs over the shared MSM conformance corpus
 * ({@code packages/schemas/mcdoc/msm/conformance/definition/}), which {@code validateJson} also
 * checks in TypeScript: valid files parse without errors or warnings, invalid files fail, and each
 * failure mentions the field that {@code expected-errors.json} points at.
 */
class ConformanceCorpusTest {
    private static final Path CORPUS = Path.of(System.getProperty("msm.conformance.definition",
            "../packages/schemas/mcdoc/msm/conformance/definition"));

    /**
     * Prefixes whose schema reached the corpus before the runtime's Codec. {@code container-} was decoded by
     * B314, {@code machine-} by B316, {@code portal-} by B334, {@code particle-} by B350, {@code action-particle-} and
     * {@code ambient-particles-} by B352. Machine recipe files have their own corpus ({@link MachineRecipeCodecTest}).
     * The vehicles and client batch's format (B409): {@code key-bind-} decoded by B411 ({@code KeyBindParser}),
     * {@code hud-} and {@code action-hud-} by B416 ({@code HudParser}, the HUD actions), {@code vehicle-} by B412
     * ({@code VehicleParser}, with {@code action-explode-}); B416 also decoded {@code vehicle-tank}, which uses the HUD
     * actions. {@code command-} and {@code creative-tab-} decoded by B454 ({@code CommandParser}, {@code CreativeTabParser}).
     * Batch 2's format (B473): {@code trader-} and {@code profession-} decoded by B474 ({@code TraderParser} through
     * {@code EntityComponents}, {@code ProfessionParser}), {@code fluid-} by B475 ({@code FluidParser}), {@code storage-}
     * and {@code shoulder-} by B479 ({@code StorageParser} through {@code EntityComponents}).
     * Vanilla parity 3 batch 1's format (B506) decodes every new field: {@code weathering-2-} (weathering on rods, buttons,
     * plates, fences, gates and walls, ADR 0104 D1) since B510 extended {@code WEATHERING_TYPES}, {@code container-2-} and
     * {@code machine-2-} (a waterlogged or weathering container, a waterlogged machine, ADR 0104 D3, D6) since B513 lifted
     * {@code checkAgeing}'s Q8 drop. Batch 2's format (B527) decodes every new field in its own parsers: {@code villager-type-}
     * ({@code VillagerTypeParser}), {@code game-rule-} ({@code GameRuleParser}), {@code stat-} ({@code StatParser}), and the
     * new fields of traders, shoulders, mobs, boats, fluids, commands and tabs in the files of the existing prefixes.
     * Nothing is pending now; a later format batch adds its prefixes here.
     */
    private static final List<String> PENDING = List.of();

    private static boolean pending(String name) {
        return PENDING.stream().anyMatch(name::startsWith);
    }

    private static List<Path> files(String group) throws IOException {
        try (Stream<Path> s = Files.list(CORPUS.resolve(group))) {
            return s.filter(p -> {
                String name = p.getFileName().toString();
                return name.endsWith(".json") && !pending(name);
            }).sorted().toList();
        }
    }

    private static JsonElement read(Path file) throws IOException {
        try (Reader r = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            return JsonParser.parseReader(r);
        }
    }

    /** A corpus file name prefix and the parser it selects. */
    private record Kind(String prefix, Function<JsonElement, ParseResult<?>> parser) {}

    /**
     * The file name prefix selects the schema, as in the TypeScript test; the longest matching prefix wins, so
     * {@code block-item-components-} is a block and {@code trigger-item-} an item. Sorted longest first below.
     */
    private static final List<Kind> KINDS = Stream.of(
            new Kind("block-", DefinitionParser::parseBlock),
            new Kind("item-", DefinitionParser::parseItem),
            new Kind("entity-", DefinitionParser::parseEntity),
            new Kind("effect-", DefinitionParser::parseEffect),
            new Kind("potion-", DefinitionParser::parsePotion),
            new Kind("biome-addition-", DefinitionParser::parseBiomeAddition),
            new Kind("loot-addition-", DefinitionParser::parseLootAddition),
            new Kind("particle-", DefinitionParser::parseParticle),
            new Kind("block-item-components-", DefinitionParser::parseBlock),
            new Kind("trigger-item-", DefinitionParser::parseItem),
            new Kind("trigger-block-", DefinitionParser::parseBlock),
            new Kind("trigger-entity-", DefinitionParser::parseEntity),
            new Kind("container-", DefinitionParser::parseBlock),
            new Kind("machine-", DefinitionParser::parseBlock),
            new Kind("portal-", DefinitionParser::parseBlock),
            new Kind("portal-item-", DefinitionParser::parseItem),
            new Kind("portal-entity-", DefinitionParser::parseEntity),
            new Kind("portal-effect-", DefinitionParser::parseEffect),
            new Kind("waterlog-", DefinitionParser::parseBlock), // B449
            new Kind("weathering-", DefinitionParser::parseBlock), // B449
            new Kind("item-inventory-", DefinitionParser::parseItem), // B450
            new Kind("bundle-", DefinitionParser::parseItem), // B450
            new Kind("action-particle-", DefinitionParser::parseBlock),
            new Kind("ambient-particles-", DefinitionParser::parseBlock),
            new Kind("vehicle-", VehicleParser::parse),
            new Kind("key-bind-", KeyBindParser::parse),
            new Kind("action-explode-", DefinitionParser::parseBlock),
            new Kind("action-explode-item-", DefinitionParser::parseItem),
            new Kind("action-explode-entity-", DefinitionParser::parseEntity),
            new Kind("action-explode-effect-", DefinitionParser::parseEffect),
            new Kind("hud-", HudParser::parse),
            new Kind("action-hud-", DefinitionParser::parseBlock),
            new Kind("action-hud-item-", DefinitionParser::parseItem),
            new Kind("action-hud-entity-", DefinitionParser::parseEntity),
            new Kind("action-hud-effect-", DefinitionParser::parseEffect),
            new Kind("command-", CommandParser::parse), // B454
            new Kind("creative-tab-", CreativeTabParser::parse), // B454
            new Kind("trader-", DefinitionParser::parseEntity), // B474
            new Kind("profession-", ProfessionParser::parse), // B474
            new Kind("fluid-", FluidParser::parse), // B475
            new Kind("storage-", DefinitionParser::parseEntity), // B479
            new Kind("shoulder-", DefinitionParser::parseEntity), // B479
            new Kind("block-tools-", DefinitionParser::parseBlock), // B506
            new Kind("vanilla-block-rules-", VanillaBlockRulesParser::parse), // B506
            new Kind("villager-type-", VillagerTypeParser::parse), // B527
            new Kind("game-rule-", GameRuleParser::parse), // B527
            new Kind("stat-", StatParser::parse)) // B527
            .sorted(Comparator.comparingInt((Kind k) -> k.prefix().length()).reversed())
            .toList();

    private static Kind kind(Path file) {
        String name = file.getFileName().toString();
        return KINDS.stream().filter(k -> name.startsWith(k.prefix())).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("corpus file without a known prefix: " + name));
    }

    private static ParseResult<?> parse(Path file) throws IOException {
        return kind(file).parser().apply(read(file));
    }

    @Test
    void corpusHasBothGroupsAndAnExpectationPerInvalidFile() throws IOException {
        List<Path> valid = files("valid");
        List<Path> invalid = files("invalid");
        assertFalse(valid.isEmpty(), "no valid corpus files under " + CORPUS.toAbsolutePath());
        assertFalse(invalid.isEmpty(), "no invalid corpus files under " + CORPUS.toAbsolutePath());
        JsonObject expected = read(CORPUS.resolve("expected-errors.json")).getAsJsonObject();
        TreeSet<String> names = new TreeSet<>();
        invalid.forEach(p -> names.add(p.getFileName().toString()));
        TreeSet<String> keys = new TreeSet<>(expected.keySet());
        keys.removeIf(ConformanceCorpusTest::pending);
        assertEquals(keys, names, "expected-errors.json and invalid/ disagree");
    }

    @TestFactory
    Stream<DynamicTest> validFilesParseCleanly() throws IOException {
        return files("valid").stream().map(file -> DynamicTest.dynamicTest("valid/" + file.getFileName(), () -> {
            ParseResult<?> result = parse(file);
            assertEquals(List.of(), result.errors(), "errors");
            assertEquals(List.of(), result.warnings(), "warnings");
            assertTrue(result.definition().isPresent(), "definition missing");
        }));
    }

    @TestFactory
    Stream<DynamicTest> invalidFilesFailOnTheExpectedField() throws IOException {
        JsonObject expected = read(CORPUS.resolve("expected-errors.json")).getAsJsonObject();
        return files("invalid").stream().map(file -> DynamicTest.dynamicTest("invalid/" + file.getFileName(), () -> {
            ParseResult<?> result = parse(file);
            assertFalse(result.errors().isEmpty(), "no error reported");
            String field = lastField(expected.getAsJsonObject(file.getFileName().toString()).get("path").getAsString());
            String all = String.join("\n", result.errors());
            assertTrue(all.contains(field), "errors do not mention '" + field + "': " + all);
        }));
    }

    /** The last non-index segment of a JSON pointer: {@code /events/x/actions/0/type} gives {@code type}. */
    private static String lastField(String pointer) {
        List<String> parts = new ArrayList<>(List.of(pointer.substring(1).split("/")));
        while (!parts.isEmpty() && parts.getLast().chars().allMatch(Character::isDigit)) {
            parts.removeLast();
        }
        return parts.getLast();
    }
}
