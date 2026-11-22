package dev.mcsupermods.runtime.gametest;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.dev.DevBiomeLists;
import dev.mcsupermods.runtime.dev.DevFiles;
import dev.mcsupermods.runtime.dev.DevMode;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.SharedConstants;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Climate;
import net.minecraft.world.level.biome.MultiNoiseBiomeSource;
import net.minecraft.world.level.biome.MultiNoiseBiomeSourceParameterList;
import net.minecraft.world.level.levelgen.NoiseBasedChunkGenerator;
import net.minecraft.world.level.levelgen.NoiseGeneratorSettings;

/**
 * Vanilla's resolved biome lists from dev mode (ADR 0119 D4, reserve B592; {@link DevBiomeLists}). Each test uses its own
 * folder in the run directory (under {@code msm-dev-biomes-gametest/}) with its own {@code dev.json}, and decides dev mode for it
 * through {@link DevMode#decide} (the GameTest route), so the shared dev folder of {@code MsmDevModeGameTest} is never
 * touched.
 *
 * <p>{@link #writesTheReferenceCells} also writes {@code reference.json} there: the biome the game itself picks (vanilla's
 * climate sampler through the {@code ClimateReference} seam and the same list) at a grid of cells for four seeds, which
 * the terrain package's test compares with the live preview when {@code TERRAIN_BIOME_LISTS} names that folder. Both
 * files stay in the build's run folder (never committed).
 */
public class MsmDevBiomeListsGameTest {
    private static final Path ROOT = Path.of("msm-dev-biomes-gametest").toAbsolutePath().normalize();
    /** The seeds of the spike B574's worlds. */
    private static final long[] SEEDS = {0L, 1L, 12345L, -7046235981325167892L};

    /** The dev mode state for {@code root}, decided as a GameTest run decides it. */
    private static DevMode.State devState(Path root) {
        write(root.resolve(DevFiles.DEV_INFO_FILE), "{\n  \"appVersion\": \"gametest\",\n  \"format\": 1,\n  \"namespaces\": [\"msm_test\"],\n"
                + "  \"target\": \"gametest\",\n  \"world\": \"msm-test-msm_test\"\n}\n");
        DevMode.Decision decision = DevMode.decide(false, true, true, Path.of("game"), root.toString(), MsmDevBiomeListsGameTest::read);
        return decision.state().orElseThrow(() -> new IllegalStateException("dev mode off for " + root + ": " + decision.problem()));
    }

    /**
     * Dev mode off writes nothing; on, the file holds the overworld and Nether lists of the running version as vanilla's
     * accessor gives them (every point, in order, with registered biomes); an unchanged list is not written again.
     */
    @GameTest
    public void writesVanillasListsInDevModeOnly(GameTestHelper helper) {
        Path root = ROOT.resolve("lists-check");
        deleteTree(root);
        try {
            helper.assertValueEqual(DevBiomeLists.writeFor(null), Optional.empty(), "dev mode off");
            helper.assertFalse(Files.exists(root), "folder made with dev mode off");
            DevMode.State state = devState(root);
            Path file = root.resolve(DevBiomeLists.FILE);
            DevBiomeLists.Result first = DevBiomeLists.writeFor(state).orElseThrow();
            helper.assertValueEqual(first.file(), file, "file");
            helper.assertTrue(first.written(), "not written");
            Map<MultiNoiseBiomeSourceParameterList.Preset, Climate.ParameterList<ResourceKey<Biome>>> known =
                    MultiNoiseBiomeSourceParameterList.knownPresets();
            String text = read(file);
            helper.assertValueEqual(text, DevBiomeLists.render(SharedConstants.getCurrentVersion().id(), known), "text");

            JsonObject json = JsonParser.parseString(text).getAsJsonObject();
            helper.assertValueEqual(json.get("format").getAsInt(), DevBiomeLists.FORMAT, "format");
            helper.assertValueEqual(json.get("minecraftVersion").getAsString(), SharedConstants.getCurrentVersion().id(), "version");
            JsonObject presets = json.getAsJsonObject("presets");
            helper.assertValueEqual(List.copyOf(presets.keySet()), List.of("minecraft:nether", "minecraft:overworld"), "presets");
            HolderLookup.RegistryLookup<Biome> biomes = helper.getLevel().registryAccess().lookupOrThrow(Registries.BIOME);
            int total = 0;
            for (var entry : known.entrySet()) {
                JsonObject preset = presets.getAsJsonObject(entry.getKey().id().toString());
                JsonArray palette = preset.getAsJsonArray("biomes");
                JsonArray points = preset.getAsJsonArray("points");
                List<com.mojang.datafixers.util.Pair<Climate.ParameterPoint, ResourceKey<Biome>>> values = entry.getValue().values();
                helper.assertValueEqual(points.size(), values.size(), "points of " + entry.getKey().id());
                for (JsonElement id : palette) {
                    helper.assertTrue(biomes.get(ResourceKey.create(Registries.BIOME, net.minecraft.resources.Identifier.parse(id.getAsString())))
                            .isPresent(), "unregistered biome " + id);
                }
                for (int i = 0; i < values.size(); i++) {
                    JsonArray point = points.get(i).getAsJsonArray();
                    Climate.ParameterPoint p = values.get(i).getFirst();
                    helper.assertValueEqual(point.size(), 14, "numbers of a point");
                    helper.assertValueEqual(palette.get(point.get(0).getAsInt()).getAsString(),
                            values.get(i).getSecond().identifier().toString(), "biome of point " + i);
                    helper.assertValueEqual(point.get(1).getAsLong(), p.temperature().min(), "temperature of point " + i);
                    helper.assertValueEqual(point.get(10).getAsLong(), p.depth().max(), "depth of point " + i);
                    helper.assertValueEqual(point.get(13).getAsLong(), p.offset(), "offset of point " + i);
                }
                total += values.size();
            }
            helper.assertTrue(presets.getAsJsonObject("minecraft:overworld").getAsJsonArray("points").size() > 1000,
                    "overworld points");
            helper.assertValueEqual(first.points(), total, "points");

            long time = Files.getLastModifiedTime(file).toMillis();
            DevBiomeLists.Result second = DevBiomeLists.writeFor(state).orElseThrow();
            helper.assertFalse(second.written(), "written again unchanged");
            helper.assertValueEqual(Files.getLastModifiedTime(file).toMillis(), time, "time");
            helper.assertFalse(Files.exists(root.resolve(DevBiomeLists.FILE + ".tmp")), "temporary file left");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } finally {
            deleteTree(root);
        }
        helper.succeed();
    }

    /**
     * The biome the game picks (vanilla's sampler and list, through vanilla's own lookup) at a grid of cells, written as
     * {@code reference.json} beside the lists for the terrain package's comparison; the overworld has more than one biome.
     */
    @GameTest
    public void writesTheReferenceCells(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        DevMode.State state = devState(ROOT);
        DevBiomeLists.writeFor(state).orElseThrow();
        var noises = server.registryAccess().lookupOrThrow(Registries.NOISE);
        var settings = server.registryAccess().lookupOrThrow(Registries.NOISE_SETTINGS);
        Map<MultiNoiseBiomeSourceParameterList.Preset, Climate.ParameterList<ResourceKey<Biome>>> known =
                MultiNoiseBiomeSourceParameterList.knownPresets();
        StringBuilder out = new StringBuilder("{\n  \"cells\": [");
        Set<String> overworldBiomes = new HashSet<>();
        boolean first = true;
        for (long seed : SEEDS) {
            for (var preset : List.of(MultiNoiseBiomeSourceParameterList.Preset.OVERWORLD, MultiNoiseBiomeSourceParameterList.Preset.NETHER)) {
                boolean overworld = preset == MultiNoiseBiomeSourceParameterList.Preset.OVERWORLD;
                NoiseGeneratorSettings noise = settings.getOrThrow(overworld ? NoiseGeneratorSettings.OVERWORLD : NoiseGeneratorSettings.NETHER)
                        .value();
                Climate.Sampler sampler = ClimateReference.sampler(noises, seed, noise);
                Climate.ParameterList<ResourceKey<Biome>> list = known.get(preset);
                int step = overworld ? 256 : 128;
                int count = overworld ? 16 : 8;
                List<Integer> ys = overworld ? List.of(-32, 64, 160) : List.of(32);
                for (int y : ys) {
                    for (int i = 0; i < count; i++) {
                        for (int j = 0; j < count; j++) {
                            int x = (i - count / 2) * step;
                            int z = (j - count / 2) * step;
                            String biome = list.findValue(sampler.sample(x >> 2, y >> 2, z >> 2)).identifier().toString();
                            if (overworld) {
                                overworldBiomes.add(biome);
                            }
                            out.append(first ? "\n" : ",\n").append("    {\"biome\": \"").append(biome).append("\", \"preset\": \"")
                                    .append(preset.id()).append("\", \"seed\": \"").append(seed).append("\", \"x\": ").append(x)
                                    .append(", \"y\": ").append(y).append(", \"z\": ").append(z).append('}');
                            first = false;
                        }
                    }
                }
            }
        }
        // The GameTest world's own levels, where their generator is vanilla's multi_noise preset: the biome their generator
        // gives (its own random state) must equal the sampler above at the level's seed, which checks the reference route.
        List<String> levels = new ArrayList<>();
        for (var dimension : List.of(Level.OVERWORLD, Level.NETHER)) {
            ServerLevel level = server.getLevel(dimension);
            if (level == null || !(level.getChunkSource().getGenerator() instanceof NoiseBasedChunkGenerator generator)
                    || !(generator.getBiomeSource() instanceof MultiNoiseBiomeSource source)) {
                levels.add(dimension.identifier() + " not multi_noise");
                continue;
            }
            boolean overworld = dimension == Level.OVERWORLD;
            var preset = overworld ? MultiNoiseBiomeSourceParameterList.Preset.OVERWORLD : MultiNoiseBiomeSourceParameterList.Preset.NETHER;
            Climate.Sampler sampler = ClimateReference.sampler(noises, level.getSeed(), generator.generatorSettings().value());
            var resolver = source.createUncachedResolver(level.getChunkSource().randomState());
            int same = 0;
            int y = overworld ? 64 : 32;
            for (int i = 0; i < 8; i++) {
                for (int j = 0; j < 8; j++) {
                    int x = (i - 4) * 192;
                    int z = (j - 4) * 192;
                    String biome = resolver.getNoiseBiome(x >> 2, y >> 2, z >> 2).unwrapKey().orElseThrow().identifier().toString();
                    String ours = known.get(preset).findValue(sampler.sample(x >> 2, y >> 2, z >> 2)).identifier().toString();
                    same += biome.equals(ours) ? 1 : 0;
                    out.append(first ? "\n" : ",\n").append("    {\"biome\": \"").append(biome).append("\", \"preset\": \"")
                            .append(preset.id()).append("\", \"seed\": \"").append(level.getSeed()).append("\", \"x\": ").append(x)
                            .append(", \"y\": ").append(y).append(", \"z\": ").append(z).append('}');
                    first = false;
                }
            }
            levels.add(dimension.identifier() + " seed " + level.getSeed() + ": " + same + " of 64 as the sampler");
            helper.assertValueEqual(same, 64, "cells of " + dimension.identifier() + " as the sampler gives them");
        }
        MsmRuntime.LOGGER.info("[{}] B592 reference levels: {}", MsmRuntime.MOD_ID, levels);
        out.append("\n  ],\n  \"minecraftVersion\": \"").append(SharedConstants.getCurrentVersion().id()).append("\"\n}\n");
        write(ROOT.resolve("reference.json"), out.toString());
        helper.assertTrue(overworldBiomes.size() > 10, "overworld biomes: " + overworldBiomes);
        helper.succeed();
    }

    private static String read(Path file) {
        try {
            return Files.isRegularFile(file) ? Files.readString(file, StandardCharsets.UTF_8) : null;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void write(Path file, String text) {
        try {
            Files.createDirectories(file.getParent());
            Files.writeString(file, text, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void deleteTree(Path root) {
        if (!Files.exists(root)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(root)) {
            for (Path p : walk.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(p);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
