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
import java.util.List;
import java.util.TreeSet;
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

    /** The file name prefix selects the schema, as in the TypeScript test. */
    private static ParseResult<?> parse(Path file) throws IOException {
        String name = file.getFileName().toString();
        if (name.startsWith("block-")) {
            return DefinitionParser.parseBlock(read(file));
        }
        if (name.startsWith("item-")) {
            return DefinitionParser.parseItem(read(file));
        }
        if (name.startsWith("entity-")) {
            return DefinitionParser.parseEntity(read(file));
        }
        throw new IllegalArgumentException("corpus file without a block-, item- or entity- prefix: " + name);
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
