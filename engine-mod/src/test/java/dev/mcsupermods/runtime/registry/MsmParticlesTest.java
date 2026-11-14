package dev.mcsupermods.runtime.registry;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.client.particle.ParticleLook;
import dev.mcsupermods.runtime.loader.DefinitionParser;
import dev.mcsupermods.runtime.loader.ParseResult;
import dev.mcsupermods.runtime.loader.ParticleDefinition;
import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/**
 * A particle definition (ADR 0080 D1) as the client's {@code ParticleLook.Spec}: every valid corpus particle resolves
 * (the Codec's ranges are the spec's), absent fields take {@code Spec.resolve}'s defaults, and {@code lifetime} as a
 * number or a range. The registration itself is a GameTest ({@code MsmParticleGameTest}).
 */
class MsmParticlesTest {
    private static final Path CORPUS = Path.of(System.getProperty("msm.conformance.definition",
            "../packages/schemas/mcdoc/msm/conformance/definition"));

    private static ParticleDefinition parse(String json) {
        ParseResult<ParticleDefinition> result = DefinitionParser.parseParticle(JsonParser.parseString(json));
        assertEquals(List.of(), result.errors(), "errors");
        assertEquals(List.of(), result.warnings(), "warnings");
        return result.definition().orElseThrow();
    }

    private static JsonElement read(Path file) throws IOException {
        try (Reader r = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            return JsonParser.parseReader(r);
        }
    }

    @TestFactory
    Stream<DynamicTest> everyValidCorpusParticleResolvesToASpec() throws IOException {
        List<Path> files;
        try (Stream<Path> s = Files.list(CORPUS.resolve("valid"))) {
            files = s.filter(p -> p.getFileName().toString().startsWith("particle-")).sorted().toList();
        }
        assertFalse(files.isEmpty(), "no particle- files in the corpus");
        return files.stream().map(file -> DynamicTest.dynamicTest(file.getFileName().toString(), () -> {
            ParseResult<ParticleDefinition> result = DefinitionParser.parseParticle(read(file));
            ParticleDefinition def = result.definition().orElseThrow();
            ParticleLook.Spec spec = MsmParticles.spec(def);
            assertEquals(def.alwaysShow(), spec.alwaysShow(), "always_show");
        }));
    }

    @Test
    void minimalDefinitionIsTheDefaultSpec() {
        ParticleDefinition def = parse("{\"format\": 1, \"textures\": [\"minecraft:generic_0\"]}");
        assertEquals(List.of(Identifier.withDefaultNamespace("generic_0")), def.textures());
        assertFalse(def.alwaysShow());
        assertEquals(ParticleLook.Spec.DEFAULTS, MsmParticles.spec(def));
    }

    @Test
    void everyFieldReachesTheSpec() {
        ParticleDefinition def = parse("""
                {"format": 1, "textures": ["t:a", "t:b"], "animation": "loop", "frame_ticks": 3,
                 "lifetime": {"min": 10, "max": 40}, "size": 0.25, "size_end": 0, "gravity": -0.5, "friction": 0.9,
                 "collision": false, "color": 16755200, "color_end": 16711680, "alpha": 0.8, "fade": "in_out",
                 "emissive": true, "translucent": false, "spin": 12.5, "always_show": true}""");
        assertTrue(def.alwaysShow());
        ParticleLook.Spec spec = MsmParticles.spec(def);
        assertEquals(new ParticleLook.Spec(ParticleLook.Animation.LOOP, 3, 10, 40, 0.25f, 0f, -0.5f, 0.9f, false, 16755200,
                16711680, 0.8f, ParticleLook.Fade.IN_OUT, true, false, 12.5f, true), spec);
    }

    @Test
    void aNumberLifetimeIsFixedAndDerivedFieldsFollowTheirSources() {
        ParticleLook.Spec spec = MsmParticles.spec(parse(
                "{\"format\": 1, \"textures\": [\"t:a\"], \"lifetime\": 7, \"size\": 0.5, \"color\": 255, \"fade\": \"out\"}"));
        assertEquals(7, spec.lifetimeMin());
        assertEquals(7, spec.lifetimeMax());
        assertEquals(0.5f, spec.sizeEnd(), "size_end defaults to size");
        assertEquals(255, spec.colorEnd(), "color_end defaults to color");
        assertTrue(spec.translucent(), "a fade makes it translucent by default");
        assertEquals(ParticleLook.Animation.AGE, spec.animation());
    }

    @Test
    void lifetimeMinAboveMaxIsAnErrorNamingMax() {
        ParseResult<ParticleDefinition> result = DefinitionParser.parseParticle(JsonParser.parseString(
                "{\"format\": 1, \"textures\": [\"t:a\"], \"lifetime\": {\"min\": 10, \"max\": 5}}"));
        assertTrue(result.definition().isEmpty(), "registered anyway");
        assertEquals(1, result.errors().size(), "errors: " + result.errors());
        assertTrue(result.errors().getFirst().contains("lifetime") && result.errors().getFirst().contains("max"),
                "error: " + result.errors());
    }

    @Test
    void anOptionsTypeOrAnUnknownKeyRegistersNothing() {
        for (String json : List.of(
                "{\"format\": 1, \"textures\": [\"t:a\"], \"type\": \"minecraft:dust\"}",
                "{\"format\": 1, \"textures\": [\"t:a\"], \"lifetime\": {\"min\": 1, \"max\": 2, \"mode\": \"x\"}}")) {
            ParseResult<ParticleDefinition> result = DefinitionParser.parseParticle(JsonParser.parseString(json));
            assertTrue(result.definition().isEmpty(), json);
            assertTrue(result.errors().getFirst().contains("unknown field"), result.errors().toString());
        }
    }
}
