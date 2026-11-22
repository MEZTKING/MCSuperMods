package dev.mcsupermods.parity;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import com.mojang.serialization.JsonOps;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.TreeMap;
import java.util.stream.Stream;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.arguments.blocks.BlockStateParser;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.RegistryOps;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.status.ChunkStatus;
import net.minecraft.world.level.dimension.DimensionType;
import net.minecraft.world.level.dimension.LevelStem;
import net.minecraft.world.level.storage.DerivedLevelData;
import net.minecraft.world.level.storage.LevelStorageSource;

/**
 * Parity of the live world generation preview against the real game (ADR 0119 D13, plan brief B579): the measured
 * expectations of {@code fixtures/worldgen-parity}.
 *
 * <p>The fixture's lowered data pack of this jar's target (MSM's own noises, functions, rules, biomes, dimension
 * types and dimensions, namespace {@code worldgen_parity}) is mod data of this jar. The GameTest server makes no level
 * of a data pack dimension, and its world has one fixed seed, so for each fixture dimension and each of
 * {@link #SEEDS} the test builds a level of its own from the dimension's {@link LevelStem}, read from the server's
 * resources with the server's registries, whose seed is that seed ({@link WorldgenLevels}, the version seam). Vanilla's
 * own chunk pipeline then makes the chunks: the test reads the whole block column of {@code 100} columns (from chunks
 * at the {@code terrain} status, which holds the land, the aquifers and the surface; the fixture's biomes have no
 * carvers or features) and the stored biome of {@code 200} scattered quart cells (from fresh chunks after the
 * generator's biome step alone, checked on every run against the level's own column chunks), and closes the level.
 *
 * <p>Without {@code MSM_WORLDGEN_PARITY_WRITE} in the environment the measurements must equal the target's section of
 * {@code expectations.json} (bundled in the jar) exactly; a version change of the game that changes a world fails
 * here. With it (the parity build's {@code worldgenParity} task with {@code -PupdateWorldgenParity}) the test writes
 * its target's section into that file instead. Run with {@code --gametest-filter msm_parity_tests:worldgen_parity_*}.
 */
public class WorldgenParityTest {
    static final String NAMESPACE = "worldgen_parity";
    static final String WRITE_ENV = "MSM_WORLDGEN_PARITY_WRITE";
    static final int FORMAT = 1;

    /** The three seeds of every dimension (the spike B574's seeds 0, 12345 and a negative one). */
    static final long[] SEEDS = {0L, 12345L, -7046235981325167892L};

    /**
     * Chunks whose columns are read: 25 columns each (every third block from 1), 100 in all. Far apart, and chosen so
     * that checkerboards of scale 1 and 2 put each of them in another of four biomes.
     */
    static final int[][] COLUMN_CHUNKS = {{0, 0}, {-55, 66}, {68, 27}, {45, -56}};

    /** Biome cells read: 200, spread over 2,048 blocks each way and over the dimension's height. */
    static final int BIOME_CELLS = 200;

    @GameTest(maxTicks = 20)
    public void measuresEveryDimension(GameTestHelper helper) throws IOException {
        MinecraftServer server = helper.getLevel().getServer();
        String target = target();
        Map<Identifier, LevelStem> stems = stems(server);
        helper.assertTrue(!stems.isEmpty(), "no " + NAMESPACE + " dimension in the server's resources");

        JsonObject measured = new JsonObject();
        Path dir = Files.createTempDirectory("msm-worldgen-parity");
        try (LevelStorageSource.LevelStorageAccess storage = LevelStorageSource.createDefault(dir).createAccess("w")) {
            for (Map.Entry<Identifier, LevelStem> entry : stems.entrySet()) {
                long start = System.nanoTime();
                measured.add(entry.getKey().toString(), measure(server, storage, entry.getKey(), entry.getValue()));
                System.out.println("[msm worldgen parity] " + target + " " + entry.getKey() + " measured in "
                        + (System.nanoTime() - start) / 1_000_000 + " ms");
            }
        } finally {
            deleteTree(dir);
        }

        String write = System.getenv(WRITE_ENV);
        if (write != null && !write.isBlank()) {
            writeExpectations(Path.of(write), target, measured);
            System.out.println("[msm worldgen parity] wrote " + target + " (" + measured.size() + " dimensions) to "
                    + write);
            helper.succeed();
            return;
        }
        JsonObject expected = expectations(target);
        helper.assertTrue(expected != null, "expectations.json has no section for " + target
                + "; run the parity build's worldgenParity task with -PupdateWorldgenParity");
        List<String> problems = compare(expected, measured);
        helper.assertTrue(problems.isEmpty(), "the real game differs from expectations.json (" + target + "): "
                + String.join("; ", problems.subList(0, Math.min(problems.size(), 8)))
                + (problems.size() > 8 ? "; and " + (problems.size() - 8) + " more" : ""));
        helper.succeed();
    }

    // --- measuring ---------------------------------------------------------------------------------------------------

    /** Every fixture dimension, by id, parsed with the server's registries. */
    private static Map<Identifier, LevelStem> stems(MinecraftServer server) throws IOException {
        RegistryOps<JsonElement> ops = RegistryOps.create(JsonOps.INSTANCE, server.registryAccess());
        Map<Identifier, LevelStem> out = new TreeMap<>(Comparator.comparing(Identifier::toString));
        var resources = server.getResourceManager().listResources("dimension",
                id -> id.getNamespace().equals(NAMESPACE) && id.getPath().endsWith(".json"));
        for (var resource : resources.entrySet()) {
            String path = resource.getKey().getPath();
            Identifier id = Identifier.fromNamespaceAndPath(NAMESPACE,
                    path.substring("dimension/".length(), path.length() - ".json".length()));
            JsonElement json;
            try (Reader reader = resource.getValue().openAsReader()) {
                json = JsonParser.parseReader(reader);
            }
            out.put(id, LevelStem.CODEC.parse(ops, json).getOrThrow(message ->
                    new IllegalStateException("dimension " + id + ": " + message)));
        }
        return out;
    }

    private static JsonObject measure(
            MinecraftServer server, LevelStorageSource.LevelStorageAccess storage, Identifier id, LevelStem stem) {
        DimensionType type = stem.type().value();
        int minY = type.minY();
        int height = type.height();
        List<int[]> columns = columns();
        List<int[]> cells = biomeCells(minY, height);

        Palette blocks = new Palette();
        Palette biomes = new Palette();
        JsonObject seeds = new JsonObject();
        for (long seed : SEEDS) {
            ResourceKey<Level> key = ResourceKey.create(Registries.DIMENSION,
                    Identifier.fromNamespaceAndPath(NAMESPACE, id.getPath() + "/seed_" + Long.toString(seed)));
            ServerLevel level = WorldgenLevels.create(server, storage,
                    new DerivedLevelData(server.getWorldData(), server.getWorldData().overworldData()), key, stem,
                    seed);
            try {
                Map<Long, ChunkAccess> biomeChunks = new java.util.HashMap<>();
                JsonArray biomeIndexes = new JsonArray();
                for (int[] cell : cells) {
                    ChunkAccess chunk = biomeChunks.computeIfAbsent(ChunkPos.pack(cell[0] >> 2, cell[2] >> 2),
                            packed -> WorldgenLevels.biomeChunk(level, cell[0] >> 2, cell[2] >> 2));
                    biomeIndexes.add(biomes.index(WorldgenLevels.stored(chunk, cell[0], cell[1], cell[2])
                            .getRegisteredName()));
                }
                JsonArray columnRuns = new JsonArray();
                for (int[] column : columns) {
                    ChunkAccess chunk = level.getChunkSource().getChunk(column[0] >> 4, column[1] >> 4,
                            ChunkStatus.TERRAIN, true);
                    columnRuns.add(runs(chunk, blocks, column[0], column[1], minY, height));
                    checkBiomeChunk(chunk, level, id, seed);
                }
                JsonObject one = new JsonObject();
                one.add("biomes", biomeIndexes);
                one.add("columns", columnRuns);
                seeds.add(Long.toString(seed), one);
            } finally {
                try {
                    level.close();
                } catch (IOException e) {
                    throw new IllegalStateException("closing the level of " + id + " seed " + seed, e);
                }
            }
        }

        JsonObject out = new JsonObject();
        out.addProperty("minY", minY);
        out.addProperty("height", height);
        out.add("columns", ints(columns));
        out.add("biomeCells", ints(cells));
        out.add("blocks", blocks.json());
        out.add("biomes", biomes.json());
        out.add("seeds", seeds);
        return out;
    }

    /**
     * The biome cells of a level's own chunk (made with its neighbours, as in a world) must equal those of a fresh
     * chunk after the generator's biome step alone ({@link WorldgenLevels#biomeChunk}), which the test reads the
     * scattered biome cells from: checked on every run, for every column chunk, dimension and seed.
     */
    private static void checkBiomeChunk(ChunkAccess chunk, ServerLevel level, Identifier id, long seed) {
        ChunkAccess fresh = WorldgenLevels.biomeChunk(level, chunk.getPos().x(), chunk.getPos().z());
        int qx0 = chunk.getPos().getMinBlockX() >> 2;
        int qz0 = chunk.getPos().getMinBlockZ() >> 2;
        for (int qy = chunk.getMinY() >> 2; qy < (chunk.getMinY() + chunk.getHeight()) >> 2; qy++) {
            for (int qx = qx0; qx < qx0 + 4; qx++) {
                for (int qz = qz0; qz < qz0 + 4; qz++) {
                    var stored = WorldgenLevels.stored(chunk, qx, qy, qz);
                    var alone = WorldgenLevels.stored(fresh, qx, qy, qz);
                    if (!stored.equals(alone)) {
                        throw new IllegalStateException(id + " seed " + seed + ": the level's chunk stored "
                                + stored.getRegisteredName() + " at quart " + qx + " " + qy + " " + qz
                                + " where the biome step alone gives " + alone.getRegisteredName());
                    }
                }
            }
        }
    }

    /** The column as runs from the bottom up: palette index, then length, repeated. */
    private static JsonArray runs(ChunkAccess chunk, Palette blocks, int x, int z, int minY, int height) {
        JsonArray out = new JsonArray();
        int last = -1;
        int length = 0;
        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
        for (int y = minY; y < minY + height; y++) {
            int index = blocks.index(BlockStateParser.serialize(chunk.getBlockState(pos.set(x, y, z))));
            if (index == last) {
                length++;
                continue;
            }
            if (last >= 0) {
                out.add(last);
                out.add(length);
            }
            last = index;
            length = 1;
        }
        out.add(last);
        out.add(length);
        return out;
    }

    /** Block x and z of the 100 columns. */
    static List<int[]> columns() {
        List<int[]> out = new ArrayList<>();
        for (int[] chunk : COLUMN_CHUNKS) {
            for (int i = 0; i < 5; i++) {
                for (int j = 0; j < 5; j++) {
                    out.add(new int[] {chunk[0] * 16 + 1 + 3 * i, chunk[1] * 16 + 1 + 3 * j});
                }
            }
        }
        return out;
    }

    /** Quart x, y and z of the biome cells: a fixed scatter (no grid, so no checkerboard aliases it). */
    static List<int[]> biomeCells(int minY, int height) {
        List<int[]> out = new ArrayList<>();
        int quarts = height / 4;
        for (int k = 0; k < BIOME_CELLS; k++) {
            int qx = (k * 7919 + 13) % 1021 - 510;
            int qz = (k * 104729 + 37) % 1019 - 509;
            int qy = (minY >> 2) + (k * 37 + 5) % quarts;
            out.add(new int[] {qx, qy, qz});
        }
        return out;
    }

    // --- comparing ---------------------------------------------------------------------------------------------------

    static List<String> compare(JsonObject expected, JsonObject measured) {
        List<String> problems = new ArrayList<>();
        JsonObject dimensions = expected.getAsJsonObject("dimensions");
        for (String id : dimensions.keySet()) {
            if (!measured.has(id)) problems.add(id + " is expected but not in the fixture");
        }
        for (String id : measured.keySet()) {
            if (!dimensions.has(id)) {
                problems.add(id + " has no expectations");
                continue;
            }
            JsonObject want = dimensions.getAsJsonObject(id);
            JsonObject got = measured.getAsJsonObject(id);
            for (String field : List.of("minY", "height", "columns", "biomeCells")) {
                if (!want.get(field).equals(got.get(field))) problems.add(id + " " + field + " differs");
            }
            List<String> wantBlocks = strings(want.getAsJsonArray("blocks"));
            List<String> gotBlocks = strings(got.getAsJsonArray("blocks"));
            List<String> wantBiomes = strings(want.getAsJsonArray("biomes"));
            List<String> gotBiomes = strings(got.getAsJsonArray("biomes"));
            for (long seed : SEEDS) {
                String key = Long.toString(seed);
                JsonObject a = want.getAsJsonObject("seeds").getAsJsonObject(key);
                JsonObject b = got.getAsJsonObject("seeds").getAsJsonObject(key);
                if (a == null) {
                    problems.add(id + " seed " + key + " has no expectations");
                    continue;
                }
                int biomeMisses = 0;
                JsonArray ab = a.getAsJsonArray("biomes");
                JsonArray bb = b.getAsJsonArray("biomes");
                for (int i = 0; i < Math.max(ab.size(), bb.size()); i++) {
                    String x = i < ab.size() ? entry(wantBiomes, ab.get(i).getAsInt()) : null;
                    String y = i < bb.size() ? entry(gotBiomes, bb.get(i).getAsInt()) : null;
                    if (x == null || !x.equals(y)) biomeMisses++;
                }
                if (biomeMisses > 0) problems.add(id + " seed " + key + ": " + biomeMisses + " biome cells differ");
                int columnMisses = 0;
                String first = null;
                JsonArray ac = a.getAsJsonArray("columns");
                JsonArray bc = b.getAsJsonArray("columns");
                for (int i = 0; i < Math.max(ac.size(), bc.size()); i++) {
                    List<String> x = i < ac.size() ? expand(ac.get(i).getAsJsonArray(), wantBlocks) : List.of();
                    List<String> y = i < bc.size() ? expand(bc.get(i).getAsJsonArray(), gotBlocks) : List.of();
                    if (!x.equals(y)) {
                        columnMisses++;
                        if (first == null) first = "column " + i + " first differs at y offset " + firstDifference(x, y);
                    }
                }
                if (columnMisses > 0) {
                    problems.add(id + " seed " + key + ": " + columnMisses + " columns differ (" + first + ")");
                }
            }
        }
        return problems;
    }

    private static List<String> expand(JsonArray runs, List<String> palette) {
        List<String> out = new ArrayList<>();
        for (int i = 0; i + 1 < runs.size(); i += 2) {
            String state = entry(palette, runs.get(i).getAsInt());
            for (int n = runs.get(i + 1).getAsInt(); n > 0; n--) out.add(state);
        }
        return out;
    }

    /** A palette entry, or a marker that equals no name when the index is out of range. */
    private static String entry(List<String> palette, int index) {
        return index >= 0 && index < palette.size() ? palette.get(index) : "#" + index;
    }

    private static int firstDifference(List<String> a, List<String> b) {
        int n = Math.min(a.size(), b.size());
        for (int i = 0; i < n; i++) {
            if (!a.get(i).equals(b.get(i))) return i;
        }
        return n;
    }

    private static List<String> strings(JsonArray array) {
        List<String> out = new ArrayList<>();
        for (JsonElement e : array) out.add(e.getAsString());
        return out;
    }

    // --- the files ---------------------------------------------------------------------------------------------------

    /** The MSM target id this jar was built for ({@code mc-<version>}, written by the build). */
    private static String target() throws IOException {
        Properties properties = new Properties();
        try (InputStream in = resource("worldgen_parity/target.properties")) {
            if (in == null) throw new IllegalStateException("the jar has no worldgen_parity/target.properties");
            properties.load(in);
        }
        return properties.getProperty("target");
    }

    /** The committed expectations of {@code target}, or null. */
    private static JsonObject expectations(String target) throws IOException {
        try (InputStream in = resource("worldgen_parity/expectations.json")) {
            if (in == null) return null;
            JsonObject root = JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8))
                    .getAsJsonObject();
            JsonObject targets = root.getAsJsonObject("targets");
            return targets == null ? null : targets.getAsJsonObject(target);
        }
    }

    private static InputStream resource(String path) {
        return WorldgenParityTest.class.getClassLoader().getResourceAsStream(path);
    }

    /** Replaces {@code target}'s section of the file (kept for the other targets), sorted, two spaces. */
    private static void writeExpectations(Path file, String target, JsonObject measured) throws IOException {
        JsonObject root = Files.isRegularFile(file)
                ? JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject()
                : new JsonObject();
        root.addProperty("format", FORMAT);
        root.addProperty("about", "Measured by WorldgenParityTest on the real game (ADR 0119 D13): for each target,"
                + " fixture dimension and seed, the stored biome of each biome cell (quart x, y, z) and each block"
                + " column (block x, z) from minY up as runs of palette index and length, at the terrain status."
                + " Rewritten by the parity build's worldgenParity task with -PupdateWorldgenParity; never edited"
                + " by hand.");
        JsonArray seeds = new JsonArray();
        for (long seed : SEEDS) seeds.add(Long.toString(seed));
        root.add("seeds", seeds);
        JsonObject targets = root.has("targets") ? root.getAsJsonObject("targets") : new JsonObject();
        JsonObject section = new JsonObject();
        section.add("dimensions", measured);
        targets.add(target, section);
        root.add("targets", targets);
        StringBuilder out = new StringBuilder();
        writeJson(out, root, 0);
        out.append('\n');
        Files.writeString(file, out.toString(), StandardCharsets.UTF_8);
    }

    /** JSON with sorted keys and two-space indents; an array of numbers or strings stays on one line. */
    static void writeJson(StringBuilder out, JsonElement element, int indent) {
        if (element.isJsonObject()) {
            JsonObject object = element.getAsJsonObject();
            if (object.isEmpty()) {
                out.append("{}");
                return;
            }
            out.append("{\n");
            List<String> keys = new ArrayList<>(object.keySet());
            keys.sort(null);
            for (int i = 0; i < keys.size(); i++) {
                out.append("  ".repeat(indent + 1)).append(new JsonPrimitive(keys.get(i))).append(": ");
                writeJson(out, object.get(keys.get(i)), indent + 1);
                out.append(i + 1 < keys.size() ? ",\n" : "\n");
            }
            out.append("  ".repeat(indent)).append('}');
        } else if (element.isJsonArray()) {
            JsonArray array = element.getAsJsonArray();
            boolean flat = true;
            for (JsonElement e : array) flat &= e.isJsonPrimitive();
            if (flat) {
                out.append('[');
                for (int i = 0; i < array.size(); i++) {
                    if (i > 0) out.append(", ");
                    out.append(array.get(i));
                }
                out.append(']');
                return;
            }
            out.append("[\n");
            for (int i = 0; i < array.size(); i++) {
                out.append("  ".repeat(indent + 1));
                writeJson(out, array.get(i), indent + 1);
                out.append(i + 1 < array.size() ? ",\n" : "\n");
            }
            out.append("  ".repeat(indent)).append(']');
        } else {
            out.append(element);
        }
    }

    private static JsonArray ints(List<int[]> rows) {
        JsonArray out = new JsonArray();
        for (int[] row : rows) {
            JsonArray a = new JsonArray();
            for (int v : row) a.add(v);
            out.add(a);
        }
        return out;
    }

    private static void deleteTree(Path dir) throws IOException {
        try (Stream<Path> walk = Files.walk(dir)) {
            for (Path p : walk.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(p);
        }
    }

    /** Names in order of first use. */
    private static final class Palette {
        private final Map<String, Integer> indexes = new LinkedHashMap<>();

        int index(String name) {
            return indexes.computeIfAbsent(name, n -> indexes.size());
        }

        JsonArray json() {
            JsonArray out = new JsonArray();
            indexes.keySet().forEach(out::add);
            return out;
        }
    }
}
