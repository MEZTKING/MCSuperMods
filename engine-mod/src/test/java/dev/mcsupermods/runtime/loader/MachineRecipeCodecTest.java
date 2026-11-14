package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.datafixers.util.Either;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.registry.machine.MachineRecipeFormat;
import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.TreeSet;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/**
 * Runs {@link MachineRecipeFormat} over the machine recipe corpus
 * ({@code packages/schemas/mcdoc/msm/conformance/machine-recipe/}, ADR 0075 D2), which {@code validateJson} also checks
 * in TypeScript: valid files decode, invalid files fail naming the field of {@code expected-errors.json}.
 *
 * <p>The runtime decodes {@code ingredient} and {@code result} with vanilla's {@code Ingredient.CODEC} and
 * {@code ItemStackTemplate.MAP_CODEC}, which need the item registry (the corpus names {@code mymod:} items no registry
 * has), so this test plugs registry-free stand-ins of the same shapes into the shared field list; vanilla's own
 * rejections (an empty list, a result count of 100, a result without an id, a bare-string result) are checked by
 * {@code MsmMachineRecipeGameTest}. {@code type} is the recipe dispatch's key, so it is decoded here beside the fields.
 */
class MachineRecipeCodecTest {
    private static final Path CORPUS = Path.of(System.getProperty("msm.conformance.definition",
            "../packages/schemas/mcdoc/msm/conformance/definition")).resolveSibling("machine-recipe");

    /** Vanilla's ingredient shape: an item id, a {@code #tag} or a non-empty list of item ids. */
    private static final Codec<Object> INGREDIENT = Codec.either(MsmCodecs.ID_OR_TAG, MsmCodecs.nonEmptyList(ID))
            .xmap(e -> e.map(s -> (Object) s, l -> (Object) l), o -> o instanceof String s ? Either.left(s) : Either.right(castList(o)));

    @SuppressWarnings("unchecked")
    private static List<Identifier> castList(Object o) {
        return (List<Identifier>) o;
    }

    /** Vanilla's {@code ItemStackTemplate.MAP_CODEC} shape: {@code id}, {@code count} 1..99, {@code components}. */
    private record Result(Identifier id, int count, Optional<JsonElement> components) {
        static final Codec<Result> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("id", ID).forGetter(Result::id),
                optional("count", intRange(1, 99), 1).forGetter(Result::count),
                optional("components", Codec.PASSTHROUGH.xmap(d -> d.convert(com.mojang.serialization.JsonOps.INSTANCE).getValue(),
                        j -> new com.mojang.serialization.Dynamic<>(com.mojang.serialization.JsonOps.INSTANCE, j)))
                        .forGetter(Result::components)).apply(i, Result::new)), List.of("id", "count", "components"));
    }

    private record Body(Object ingredient, int count, Result result, Optional<Integer> time, float experience)
            implements MachineRecipeFormat.Fields<Object, Result> {}

    private record Recipe(Identifier type, Body body) {}

    private static final MapCodec<Body> BODY = MachineRecipeFormat.mapCodec(INGREDIENT, Result.CODEC, Body::new);
    private static final Codec<Recipe> RECIPE = RecordCodecBuilder.create(i -> i.group(
            required("type", ID).forGetter(Recipe::type),
            BODY.forGetter(Recipe::body)).apply(i, Recipe::new));

    private static List<Path> files(String group) throws IOException {
        try (Stream<Path> s = Files.list(CORPUS.resolve(group))) {
            return s.filter(p -> p.getFileName().toString().endsWith(".json")).sorted().toList();
        }
    }

    private static JsonElement read(Path file) throws IOException {
        try (Reader r = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            return JsonParser.parseReader(r);
        }
    }

    private static DataResult<Recipe> decode(Path file) throws IOException {
        return RECIPE.parse(StrictJsonOps.INSTANCE, read(file));
    }

    @Test
    void corpusHasBothGroupsAndAnExpectationPerInvalidFile() throws IOException {
        assertFalse(files("valid").isEmpty(), "no valid machine recipe files under " + CORPUS.toAbsolutePath());
        JsonObject expected = read(CORPUS.resolve("expected-errors.json")).getAsJsonObject();
        TreeSet<String> names = new TreeSet<>();
        files("invalid").forEach(p -> names.add(p.getFileName().toString()));
        assertEquals(new TreeSet<>(expected.keySet()), names, "expected-errors.json and invalid/ disagree");
    }

    @Test
    void defaultsApply() throws IOException {
        Recipe recipe = decode(CORPUS.resolve("valid/machine-recipe-item.json")).getOrThrow();
        assertEquals(Identifier.fromNamespaceAndPath("mymod", "grinder"), recipe.type());
        assertEquals(1, recipe.body().count());
        assertEquals(Optional.empty(), recipe.body().time());
        assertEquals(0f, recipe.body().experience());
        assertEquals(1, recipe.body().result().count());
    }

    @TestFactory
    Stream<DynamicTest> validFilesDecode() throws IOException {
        return files("valid").stream().map(file -> DynamicTest.dynamicTest("valid/" + file.getFileName(), () -> {
            DataResult<Recipe> result = decode(file);
            assertTrue(result.error().isEmpty(), () -> "error: " + result.error().get().message());
        }));
    }

    @TestFactory
    Stream<DynamicTest> invalidFilesFailOnTheExpectedField() throws IOException {
        JsonObject expected = read(CORPUS.resolve("expected-errors.json")).getAsJsonObject();
        return files("invalid").stream().map(file -> DynamicTest.dynamicTest("invalid/" + file.getFileName(), () -> {
            DataResult<Recipe> result = decode(file);
            assertTrue(result.error().isPresent(), "no error reported");
            String field = lastField(expected.getAsJsonObject(file.getFileName().toString()).get("path").getAsString());
            String message = result.error().get().message();
            assertTrue(message.contains(field), "error does not mention '" + field + "': " + message);
        }));
    }

    /** The last non-index segment of a JSON pointer. */
    private static String lastField(String pointer) {
        List<String> parts = new ArrayList<>(List.of(pointer.substring(1).split("/")));
        while (!parts.isEmpty() && parts.getLast().chars().allMatch(Character::isDigit)) {
            parts.removeLast();
        }
        return parts.getLast();
    }
}
