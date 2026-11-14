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

    private static List<Path> files(String group) throws IOException {
        try (Stream<Path> s = Files.list(CORPUS.resolve(group))) {
            return s.filter(p -> {
                String name = p.getFileName().toString();
                return name.endsWith(".json");
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
            new Kind("biome-addition-", DefinitionParser::parseBiomeAddition),
            new Kind("loot-addition-", DefinitionParser::parseLootAddition),
            new Kind("block-item-components-", DefinitionParser::parseBlock),
            new Kind("trigger-item-", DefinitionParser::parseItem),
            new Kind("trigger-block-", DefinitionParser::parseBlock),
            new Kind("trigger-entity-", DefinitionParser::parseEntity))
            .sorted(Comparator.comparingInt((Kind k) -> k.prefix().length()).reversed())
            .toList();

    /** The trigger components of ADR 0061 D1 to D3, which this runtime does not decode yet. */
    private static final List<String> TRIGGER_COMPONENTS = List.of("msm:on_hit", "msm:on_use_on_block", "msm:while_held",
            "msm:while_worn", "msm:on_break", "msm:on_place", "msm:on_random_tick", "msm:on_entity_inside", "msm:on_tick",
            "msm:on_spawn");

    private static Kind kind(Path file) {
        String name = file.getFileName().toString();
        return KINDS.stream().filter(k -> name.startsWith(k.prefix())).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("corpus file without a known prefix: " + name));
    }

    private static ParseResult<?> parse(Path file) throws IOException {
        return kind(file).parser().apply(read(file));
    }

    /** {@code trigger-} files: B235 decodes trigger components; until then only the rest of the file is checked here. */
    private static boolean isTrigger(Path file) {
        return kind(file).prefix().startsWith("trigger-");
    }

    /** The warnings of a trigger file that only name trigger components (unknown to this runtime, so ignored). */
    private static List<String> otherThanTriggerWarnings(List<String> warnings) {
        return warnings.stream()
                .filter(w -> TRIGGER_COMPONENTS.stream().noneMatch(c -> w.equals("unknown component '" + c + "' ignored")))
                .toList();
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
        assertEquals(keys, names, "expected-errors.json and invalid/ disagree");
    }

    @TestFactory
    Stream<DynamicTest> validFilesParseCleanly() throws IOException {
        return files("valid").stream().map(file -> DynamicTest.dynamicTest("valid/" + file.getFileName(), () -> {
            ParseResult<?> result = parse(file);
            assertEquals(List.of(), result.errors(), "errors");
            // B235 decodes trigger components: here a valid trigger file may only warn about those components.
            assertEquals(List.of(), isTrigger(file) ? otherThanTriggerWarnings(result.warnings()) : result.warnings(), "warnings");
            assertTrue(result.definition().isPresent(), "definition missing");
        }));
    }

    @TestFactory
    Stream<DynamicTest> invalidFilesFailOnTheExpectedField() throws IOException {
        JsonObject expected = read(CORPUS.resolve("expected-errors.json")).getAsJsonObject();
        return files("invalid").stream().map(file -> DynamicTest.dynamicTest("invalid/" + file.getFileName(), () -> {
            ParseResult<?> result = parse(file);
            if (isTrigger(file)) {
                // B235 decodes trigger components: the expected error is in a trigger component, which this runtime
                // ignores with a warning; the rest of the file must still parse.
                assertTrue(result.definition().isPresent(), "the non-trigger part does not parse: " + result.errors());
                assertEquals(List.of(), result.errors(), "errors outside the trigger components");
                assertTrue(otherThanTriggerWarnings(result.warnings()).size() < result.warnings().size(),
                        "no trigger component warning: " + result.warnings());
                return;
            }
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
