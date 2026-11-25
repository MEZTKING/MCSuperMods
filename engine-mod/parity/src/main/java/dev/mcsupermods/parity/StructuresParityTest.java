package dev.mcsupermods.parity;

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
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.arguments.blocks.BlockStateParser;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.Tag;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.packs.resources.Resource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.JigsawBlock;
import net.minecraft.world.level.block.Mirror;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.JigsawBlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.PoolElementStructurePiece;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import net.minecraft.world.level.levelgen.structure.pools.FeaturePoolElement;
import net.minecraft.world.level.levelgen.structure.pools.ListPoolElement;
import net.minecraft.world.level.levelgen.structure.pools.SinglePoolElement;
import net.minecraft.world.level.levelgen.structure.pools.StructurePoolElement;
import net.minecraft.world.level.levelgen.structure.pools.StructureTemplatePool;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplate;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplateManager;

/**
 * Parity of the live views of batch 4, assembled structures (ADR 0122 D9, plan brief B639): what the real game makes
 * of the files of {@code fixtures/structures-parity}, MSM's own templates, template pools, jigsaw structures and
 * processor lists.
 *
 * <p>The fixture's lowered data pack ({@code lowered/mc-<mc>/data}: the templates carry each target's
 * {@code DataVersion}) is mod data of a jar of its own ({@code msm_structures_parity_fixture}, the parity build's
 * {@code structuresFixtureJar} task), loaded only by the {@code structuresParity} task. Its structures name an empty
 * biome tag, so none of them ever starts in a world by itself; each test asks the game for starts by name through the
 * version seam {@link StructureStarts}, which calls {@code Structure.generate} as a chunk's structure step does, for
 * world seeds {@value #SEED_A} and {@value #SEED_B} and the chunks of a square (one structure per structure set, so
 * the start rotation is the structure's own draw; spike B634 4S3). Natural generation is fixed by the world seed and
 * the chunk, so a second run measures the same assemblies.
 *
 * <ul>
 *   <li>{@code assembly}: for each structure, the pieces of every start (template, rotation, box) and their jigsaw
 *       blocks as the elements report them, and from those: which parent jigsaw each piece joined (J1 to J5; the
 *       game keeps no depth on a pool element piece, so depth follows from the joins), boxes
 *       that overlap (J9, J10), depth and the fallback at the last depth (J11), both distance limits (J12, J13), and
 *       the shares B637's engine is compared on (piece counts, templates, depths, start rotations, which template took
 *       each jigsaw of the start piece, the turn of each child against its parent).
 *   <li>{@code processors}: the processor sample placed {@value #PLACEMENTS} times per processor list by the start's
 *       own {@code placeInChunk} (as {@code /place structure} does) over a box of glass, water, lava or bedrock, its
 *       floor at world y {@value #FLOOR}, and every cell read back in the template's own frame (states turned back by
 *       the piece's rotation).
 * </ul>
 *
 * <p>{@code MSM_STRUCTURES_EXPECTATIONS} names {@code fixtures/structures-parity/expectations.json}; without
 * {@code MSM_STRUCTURES_UPDATE} each section is compared with this target's: B634's 4S8 tolerance, exact for joins,
 * overlaps, depth, distance and every deterministic processor cell, and for shares a two-proportion test at
 * |z| &le; {@value #Z}, means within {@value #Z} standard errors. With it (the task's {@code -PupdateStructuresParity})
 * each test writes its section instead. Run with {@code --gametest-filter msm_parity_tests:structures_parity_test_*}.
 */
public class StructuresParityTest {
    static final String NS = "structures_parity";
    static final String EXPECTATIONS_ENV = "MSM_STRUCTURES_EXPECTATIONS";
    static final String UPDATE_ENV = "MSM_STRUCTURES_UPDATE";
    static final String TARGET_ENV = "MSM_STRUCTURES_TARGET";
    static final int FORMAT = 1;
    static final long SEED_A = 634;
    static final long SEED_B = 635;
    static final long[] SEEDS = {SEED_A, SEED_B};
    /** Chunks 0 to GRID - 1 on both axes, per seed: 450 assemblies a structure. */
    static final int GRID = 15;
    /** The lattices of 113, 841 and 341 pieces always assemble the same; fewer starts. */
    static final int LATTICE_GRID = 3;
    static final int PLACEMENTS = 32;

    /** The first chunk of the processor placements, fixed so random processors draw the same every run. */
    static final int PROCESSOR_CHUNK_X = 64;

    static final int PROCESSOR_CHUNK_Z = 64;
    static final int FLOOR = 199;
    static final double Z = 4.0;
    private static final String ARENA = "msm_parity_tests:arena";

    /** The assembly fixtures ({@code structures_parity:structure/<name>}); the lattices use {@link #LATTICE_GRID}. */
    static final List<String> STRUCTURES = List.of("match", "back", "weights", "chain_s1", "chain_s3", "chain_s20",
            "chain_d16", "chain_d32", "chain2_d15", "chain2_d16", "chain4_d16", "chain4_d17", "fb_s5", "vchain_d16",
            "vchain4_d15", "vchain4_d16", "vchain6_d16", "vchain6_d17", "vchain_v16", "vchain_h16", "shell",
            "shell_big", "shell_tall", "whub", "whub_spl", "whub_spr", "phub_eq", "phub_pe", "phub_pw", "phub_ce",
            "joint", "misc", "town", "grid_s7", "grid_s20", "cube_s6");
    static final Set<String> LATTICES = Set.of("grid_s7", "grid_s20", "cube_s6");

    /**
     * The processor lists ({@code structures_parity:processors/<name>}, each with the structure
     * {@code structure/proc_<name>}), {@code none} first: the inputs of the others.
     */
    static final List<String> LISTS = List.of("none", "nop", "ignore", "rot50", "rot50_tag", "rule_block",
            "rule_state", "rule_tag", "rule_two", "two_lists", "rule_rand", "rule_rstate", "rule_allof", "rule_anyof",
            "rule_height", "rule_loc", "rule_pos", "protected", "blackstone", "capped", "capped_u", "age0", "age50",
            "age100", "lava", "jigsawrep", "loot", "static", "legacy", "inline");
    /** Lists whose outcome depends on a random draw: compared as shares, not cells. */
    static final Set<String> RANDOM = Set.of("rot50", "rot50_tag", "rule_rand", "rule_rstate", "rule_pos", "capped",
            "capped_u", "age0", "age50", "age100");
    static final Map<String, BlockState> BACKGROUNDS = Map.of("rule_loc", Blocks.WATER.defaultBlockState(),
            "protected", Blocks.BEDROCK.defaultBlockState(), "lava", Blocks.LAVA.defaultBlockState());
    static final int[] SAMPLE_SIZE = {8, 4, 8};
    static final Map<String, String> MARKERS = Map.of("0,3,0", "minecraft:red_wool", "7,3,0", "minecraft:blue_wool",
            "0,3,7", "minecraft:yellow_wool");
    static final String VOID = "(void)";

    // --- assembly -----------------------------------------------------------------------------------------------------

    @GameTest(structure = ARENA, maxTicks = 20)
    public void assemblesStructures(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        JsonObject section = new JsonObject();
        long started = System.nanoTime();
        for (String name : STRUCTURES) {
            section.add(name, measureStructure(server, level, name, LATTICES.contains(name) ? LATTICE_GRID : GRID));
        }
        log(String.format(Locale.ROOT, "assembled %d structures in %.1f s", STRUCTURES.size(),
                (System.nanoTime() - started) / 1e9));
        finish(helper, "assembly", section);
    }

    /** One piece of a start: its element, template key, rotation, box and jigsaw blocks. */
    record Piece(PoolElementStructurePiece piece, String key, Rotation rotation, BoundingBox box,
            List<StructureTemplate.JigsawBlockInfo> jigsaws) {}

    static JsonObject measureStructure(MinecraftServer server, ServerLevel level, String name, int grid) {
        Identifier id = Identifier.fromNamespaceAndPath(NS, "structure/" + name);
        Holder<Structure> structure = server.registryAccess().lookupOrThrow(Registries.STRUCTURE)
                .get(ResourceKey.create(Registries.STRUCTURE, id))
                .orElseThrow(() -> new IllegalStateException("no structure " + id + "; is the fixture jar loaded?"));
        JsonObject definition = resourceJson(server, Identifier.fromNamespaceAndPath(NS,
                "worldgen/structure/structure/" + name + ".json"));
        int size = definition.get("size").getAsInt();
        JsonElement distance = definition.get("max_distance_from_center");
        int horizontal;
        Integer vertical;
        if (distance.isJsonPrimitive()) {
            horizontal = distance.getAsInt();
            vertical = horizontal;
        } else {
            horizontal = distance.getAsJsonObject().get("horizontal").getAsInt();
            vertical = distance.getAsJsonObject().has("vertical")
                    ? distance.getAsJsonObject().get("vertical").getAsInt() : null;
        }
        StructureTemplateManager templates = level.getStructureTemplateManager();
        Stats pieces = new Stats();
        Map<String, Integer> templateCounts = new TreeMap<>();
        Map<String, Integer> depths = new TreeMap<>();
        Map<String, Integer> startRotations = new TreeMap<>();
        Map<String, Map<String, Integer>> startJoins = new TreeMap<>();
        Map<String, Map<String, Integer>> branches = new TreeMap<>();
        Map<String, Map<String, Integer>> turns = new TreeMap<>();
        Map<String, Integer> exact = exactCounters();
        int noStart = 0;
        int assemblies = 0;
        for (long seed : SEEDS) {
            for (int cx = 0; cx < grid; cx++) {
                for (int cz = 0; cz < grid; cz++) {
                    StructureStart start = StructureStarts.generate(structure, level, seed, new ChunkPos(cx, cz));
                    if (start == null) {
                        noStart++;
                        continue;
                    }
                    assemblies++;
                    List<Piece> list = pieces(start, templates);
                    pieces.add(list.size());
                    analyse(server, list, size, horizontal, vertical, templateCounts, depths, startRotations,
                            startJoins, branches, turns, exact);
                }
            }
        }
        JsonObject out = new JsonObject();
        out.addProperty("grid", grid);
        out.addProperty("assemblies", assemblies);
        out.addProperty("noStart", noStart);
        out.addProperty("size", size);
        out.add("maxDistance", distance);
        out.add("pieces", pieces.toJson());
        out.add("templates", counts(templateCounts));
        out.add("depths", counts(depths));
        out.add("startRotations", counts(startRotations));
        out.add("startJoins", nested(startJoins));
        out.add("branches", nested(branches));
        out.add("turns", nested(turns));
        out.add("exact", counts(exact));
        return out;
    }

    static List<Piece> pieces(StructureStart start, StructureTemplateManager templates) {
        List<Piece> out = new ArrayList<>();
        for (StructurePiece raw : start.getPieces()) {
            if (!(raw instanceof PoolElementStructurePiece piece)) {
                throw new IllegalStateException("not a pool element piece: " + raw);
            }
            StructurePoolElement element = piece.getElement();
            List<StructureTemplate.JigsawBlockInfo> jigsaws = element.getShuffledJigsawBlocks(templates,
                    piece.getPosition(), piece.getRotation(), RandomSource.create(0));
            out.add(new Piece(piece, key(element), piece.getRotation(), piece.getBoundingBox(), jigsaws));
        }
        return out;
    }

    /** The template id of a single element, {@code list:<a>+<b>} of a list element, {@code feature} of a feature. */
    static String key(StructurePoolElement element) {
        if (element instanceof SinglePoolElement single) return single.getTemplateLocation().toString();
        if (element instanceof ListPoolElement list) {
            List<String> keys = new ArrayList<>();
            for (StructurePoolElement e : list.getElements()) keys.add(key(e));
            return "list:" + String.join("+", keys);
        }
        if (element instanceof FeaturePoolElement) return "feature";
        return "other:" + element;
    }

    static Map<String, Integer> exactCounters() {
        Map<String, Integer> exact = new TreeMap<>();
        for (String k : List.of("unjoined", "illegalJoins", "partialOverlaps", "nestedInParent", "nestedOther",
                "pastDepth", "targetPoolAtLastDepth", "pastHorizontal", "pastVertical", "maxDepth", "maxHorizontal",
                "maxUp", "maxDown")) {
            exact.put(k, 0);
        }
        exact.put("maxDown", Integer.MIN_VALUE);
        exact.put("maxUp", Integer.MIN_VALUE);
        return exact;
    }

    static void analyse(MinecraftServer server, List<Piece> pieces, int size, int horizontal, Integer vertical,
            Map<String, Integer> templateCounts, Map<String, Integer> depths, Map<String, Integer> startRotations,
            Map<String, Map<String, Integer>> startJoins, Map<String, Map<String, Integer>> branches,
            Map<String, Map<String, Integer>> turns, Map<String, Integer> exact) {
        Piece start = pieces.getFirst();
        BoundingBox sb = start.box();
        int cx = (sb.minX() + sb.maxX()) / 2;
        int cz = (sb.minZ() + sb.maxZ()) / 2;
        // The start piece's bottom is the start height - 1 (J16); the vertical limit counts from the start height.
        int startY = sb.minY() + 1;
        startRotations.merge(rotationName(start.rotation()), 1, Integer::sum);
        // The game keeps no depth on a pool element piece; it follows from the joins. Pieces are listed in placement
        // order, so a piece's parent is the first earlier piece with a jigsaw that the piece's own jigsaw faces.
        int[] parents = new int[pieces.size()];
        int[] depth = new int[pieces.size()];
        String[] branch = new String[pieces.size()];
        parents[0] = -1;
        for (int i = 0; i < pieces.size(); i++) {
            Piece p = pieces.get(i);
            templateCounts.merge(p.key(), 1, Integer::sum);
            BoundingBox b = p.box();
            if (b.minX() < cx - horizontal || b.maxX() > cx + horizontal || b.minZ() < cz - horizontal
                    || b.maxZ() > cz + horizontal) {
                exact.merge("pastHorizontal", 1, Integer::sum);
            }
            int far = Math.max(Math.max(cx - b.minX(), b.maxX() - cx), Math.max(cz - b.minZ(), b.maxZ() - cz));
            exact.merge("maxHorizontal", far, Math::max);
            exact.merge("maxUp", b.maxY() - startY, Math::max);
            exact.merge("maxDown", startY - b.minY(), Math::max);
            if (vertical != null && (b.minY() < startY - vertical || b.maxY() > startY + vertical)) {
                exact.merge("pastVertical", 1, Integer::sum);
            }
            if (i == 0) {
                depths.merge("0", 1, Integer::sum);
                continue;
            }
            int parent = -1;
            StructureTemplate.JigsawBlockInfo parentJigsaw = null;
            boolean legal = false;
            for (int j = 0; j < i && !legal; j++) {
                Piece q = pieces.get(j);
                for (StructureTemplate.JigsawBlockInfo pj : q.jigsaws()) {
                    BlockPos front = pj.pos().relative(JigsawBlock.getFrontFacing(pj.state()));
                    for (StructureTemplate.JigsawBlockInfo cj : p.jigsaws()) {
                        if (!cj.pos().equals(front)) continue;
                        boolean ok = canJoin(pj, cj);
                        if (parent < 0 || ok) {
                            parent = j;
                            parentJigsaw = pj;
                        }
                        if (ok) {
                            legal = true;
                            break;
                        }
                    }
                    if (legal) break;
                }
            }
            parents[i] = parent;
            if (parent < 0) {
                exact.merge("unjoined", 1, Integer::sum);
                continue;
            }
            if (!legal) exact.merge("illegalJoins", 1, Integer::sum);
            Piece q = pieces.get(parent);
            depth[i] = depth[parent] + 1;
            depths.merge(Integer.toString(depth[i]), 1, Integer::sum);
            exact.merge("maxDepth", depth[i], Math::max);
            if (depth[i] > size + 1) exact.merge("pastDepth", 1, Integer::sum);
            int turn = Math.floorMod(p.rotation().ordinal() - q.rotation().ordinal(), 4) * 90;
            turns.computeIfAbsent(p.key(), k -> new TreeMap<>()).merge(Integer.toString(turn), 1, Integer::sum);
            if (parent == 0) {
                BlockPos local = StructureTemplate.transform(parentJigsaw.pos().subtract(start.piece().getPosition()),
                        Mirror.NONE, inverse(start.rotation()), BlockPos.ZERO);
                branch[i] = local.getX() + "," + local.getY() + "," + local.getZ();
                startJoins.computeIfAbsent(branch[i], k -> new TreeMap<>()).merge(p.key(), 1, Integer::sum);
            } else {
                branch[i] = branch[parent];
            }
            if (branch[i] != null) {
                branches.computeIfAbsent(branch[i], k -> new TreeMap<>()).merge(p.key(), 1, Integer::sum);
            }
            if (depth[i] == size + 1 && fromTargetPoolOnly(server, parentJigsaw, p)) {
                exact.merge("targetPoolAtLastDepth", 1, Integer::sum);
            }
        }
        for (int i = 0; i < pieces.size(); i++) {
            for (int j = i + 1; j < pieces.size(); j++) {
                BoundingBox a = pieces.get(i).box();
                BoundingBox b = pieces.get(j).box();
                if (!a.intersects(b)) continue;
                if (contains(a, b) || contains(b, a)) {
                    boolean parentChild = parents[j] == i || parents[i] == j;
                    exact.merge(parentChild ? "nestedInParent" : "nestedOther", 1, Integer::sum);
                } else {
                    exact.merge("partialOverlaps", 1, Integer::sum);
                }
            }
        }
    }

    /**
     * J1 to J4: the name matches the target, the jigsaws face each other, and the tops agree as the joint says (the
     * parent's joint).
     */
    static boolean canJoin(StructureTemplate.JigsawBlockInfo parent, StructureTemplate.JigsawBlockInfo child) {
        // A feature element's own jigsaw has no name; the game places it at a jigsaw whose target is
        // minecraft:bottom (J18).
        boolean feature = child.name() == null && parent.target() != null
                && parent.target().toString().equals("minecraft:bottom");
        if (!feature && !java.util.Objects.equals(child.name(), parent.target())) return false;
        Direction pf = JigsawBlock.getFrontFacing(parent.state());
        Direction cf = JigsawBlock.getFrontFacing(child.state());
        if (cf != pf.getOpposite()) return false;
        Direction pt = JigsawBlock.getTopFacing(parent.state());
        Direction ct = JigsawBlock.getTopFacing(child.state());
        if (pf.getAxis().isHorizontal()) return pt == ct;
        return parent.jointType() == JigsawBlockEntity.JointType.ROLLABLE || pt == ct;
    }

    /** A piece at depth {@code size + 1} that its parent jigsaw's pool holds and that pool's fallback does not. */
    static boolean fromTargetPoolOnly(MinecraftServer server, StructureTemplate.JigsawBlockInfo parentJigsaw,
            Piece piece) {
        var pools = server.registryAccess().lookupOrThrow(Registries.TEMPLATE_POOL);
        var target = pools.get(parentJigsaw.pool());
        if (target.isEmpty()) return false;
        StructureTemplatePool pool = target.get().value();
        StructurePoolElement element = piece.piece().getElement();
        boolean inTarget = pool.getTemplates().stream().anyMatch(pair -> pair.getFirst() == element);
        boolean inFallback = pool.getFallback().value().getTemplates().stream()
                .anyMatch(pair -> pair.getFirst() == element);
        return inTarget && !inFallback;
    }

    static boolean contains(BoundingBox outer, BoundingBox inner) {
        return outer.minX() <= inner.minX() && outer.minY() <= inner.minY() && outer.minZ() <= inner.minZ()
                && outer.maxX() >= inner.maxX() && outer.maxY() >= inner.maxY() && outer.maxZ() >= inner.maxZ();
    }

    static String rotationName(Rotation rotation) {
        return rotation.name().toLowerCase(Locale.ROOT);
    }

    static Rotation inverse(Rotation rotation) {
        return switch (rotation) {
            case CLOCKWISE_90 -> Rotation.COUNTERCLOCKWISE_90;
            case COUNTERCLOCKWISE_90 -> Rotation.CLOCKWISE_90;
            default -> rotation;
        };
    }

    // --- processors ---------------------------------------------------------------------------------------------------

    @GameTest(structure = ARENA, maxTicks = 20)
    public void placesProcessors(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        // Placement k uses world seed 1000 + k at chunk (x + 2k, z) for every list, so each list meets the same
        // starts. The game's processors draw from a random of the block's world position, so the placements are
        // spread over chunks rather than repeated at one. The chunks are fixed, never the test's own place: the
        // GameTest server puts a test anywhere, and a random processor's draws then changed from run to run,
        // which once moved rot50's shares past the bar on 26.4 (2026-11-25).
        int baseX = PROCESSOR_CHUNK_X;
        int baseZ = PROCESSOR_CHUNK_Z;
        for (int k = 0; k < PLACEMENTS; k++) {
            for (int dx = -1; dx <= 0; dx++) {
                for (int dz = -1; dz <= 0; dz++) level.getChunk(baseX + 2 * k + dx, baseZ + dz);
            }
        }
        long started = System.nanoTime();
        // inputs.get(k).get(cell): the sample as placed with no processor (list `none`) at placement k.
        List<Map<String, String>> inputs = new ArrayList<>();
        JsonObject lists = new JsonObject();
        List<String> problems = new ArrayList<>();
        int floor = Integer.MIN_VALUE;
        for (String list : LISTS) {
            Identifier id = Identifier.fromNamespaceAndPath(NS, "structure/proc_" + list);
            Holder<Structure> structure = server.registryAccess().lookupOrThrow(Registries.STRUCTURE)
                    .get(ResourceKey.create(Registries.STRUCTURE, id))
                    .orElseThrow(() -> new IllegalStateException("no structure " + id));
            BlockState background = BACKGROUNDS.getOrDefault(list, Blocks.GLASS.defaultBlockState());
            boolean random = RANDOM.contains(list);
            Map<String, Map<String, Integer>> byInput = new TreeMap<>();
            Map<String, String> cells = new TreeMap<>();
            Map<String, JsonObject> blockEntities = new TreeMap<>();
            Stats changed = new Stats();
            for (int k = 0; k < PLACEMENTS; k++) {
                ChunkPos chunk = new ChunkPos(baseX + 2 * k, baseZ);
                StructureStart start = StructureStarts.generate(structure, level, 1000 + k, chunk);
                helper.assertTrue(start != null && start.getPieces().size() == 1, "proc_" + list
                        + " made no single-piece start");
                PoolElementStructurePiece piece = (PoolElementStructurePiece) start.getPieces().getFirst();
                BoundingBox box = piece.getBoundingBox();
                floor = box.minY();
                fill(level, box, background);
                for (int dx = -1; dx <= 0; dx++) {
                    for (int dz = -1; dz <= 0; dz++) {
                        int x = chunk.x() + dx;
                        int z = chunk.z() + dz;
                        start.placeInChunk(level, level.structureManager(), level.getChunkSource().getGenerator(),
                                RandomSource.create(1000 + k), new BoundingBox(x << 4, level.getMinY(), z << 4,
                                        (x << 4) + 15, level.getMaxY(), (z << 4) + 15), new ChunkPos(x, z));
                    }
                }
                Map<String, String> placed = new TreeMap<>();
                Map<String, JsonObject> entities = new TreeMap<>();
                String backgroundName = BlockStateParser.serialize(background);
                for (int y = 0; y < SAMPLE_SIZE[1]; y++) {
                    for (int z = 0; z < SAMPLE_SIZE[2]; z++) {
                        for (int x = 0; x < SAMPLE_SIZE[0]; x++) {
                            BlockPos world = piece.getPosition().offset(StructureTemplate.transform(
                                    new BlockPos(x, y, z), Mirror.NONE, piece.getRotation(), BlockPos.ZERO));
                            String cell = x + "," + y + "," + z;
                            String out = BlockStateParser.serialize(level.getBlockState(world)
                                    .rotate(inverse(piece.getRotation())));
                            placed.put(cell, out.equals(backgroundName) ? "(background)" : out);
                            BlockEntity be = level.getBlockEntity(world);
                            if (be != null && (list.equals("loot") || list.equals("static"))) {
                                entities.put(cell, blockEntity(be.saveWithoutMetadata(level.registryAccess())));
                            }
                        }
                    }
                }
                clear(level, box);
                if (list.equals("none")) {
                    for (Map.Entry<String, String> m : MARKERS.entrySet()) {
                        if (!m.getValue().equals(placed.get(m.getKey()))) {
                            problems.add("placement " + k + ": marker " + m.getValue() + " not at " + m.getKey()
                                    + " (found " + placed.get(m.getKey()) + ", rotation " + piece.getRotation() + ")");
                        }
                    }
                    Map<String, String> input = new TreeMap<>();
                    placed.forEach((cell, state) -> input.put(cell, state.equals("(background)") ? VOID : state));
                    inputs.add(input);
                }
                int differ = 0;
                for (Map.Entry<String, String> e : placed.entrySet()) {
                    String in = inputs.get(k).get(e.getKey());
                    String out = e.getValue();
                    if (in.equals(VOID) ? !out.equals("(background)") : !in.equals(out)) differ++;
                    byInput.computeIfAbsent(in, x -> new TreeMap<>()).merge(out, 1, Integer::sum);
                    if (!random) {
                        String before = cells.putIfAbsent(e.getKey(), out);
                        if (before != null && !before.equals(out)) {
                            problems.add(list + ": cell " + e.getKey() + " differs between placements (" + before
                                    + ", " + out + ")");
                        }
                    }
                }
                changed.add(differ);
                for (Map.Entry<String, JsonObject> e : entities.entrySet()) {
                    JsonObject before = blockEntities.putIfAbsent(e.getKey(), e.getValue());
                    if (before != null && !before.equals(e.getValue())) {
                        problems.add(list + ": block entity at " + e.getKey() + " differs between placements");
                    }
                }
            }
            JsonObject entry = new JsonObject();
            entry.addProperty("random", random);
            entry.addProperty("background", BlockStateParser.serialize(background));
            entry.add("changed", changed.toJson());
            entry.add("byInput", nested(byInput));
            if (!random) {
                JsonObject c = new JsonObject();
                cells.forEach(c::addProperty);
                entry.add("cells", c);
            }
            if (!blockEntities.isEmpty()) {
                JsonObject b = new JsonObject();
                blockEntities.forEach(b::add);
                entry.add("blockEntities", b);
            }
            lists.add(list, entry);
        }
        helper.assertTrue(problems.isEmpty(), "processor placements: " + String.join("; ",
                problems.subList(0, Math.min(problems.size(), 8))));
        JsonObject section = new JsonObject();
        section.addProperty("placements", PLACEMENTS);
        section.addProperty("floorY", floor);
        section.addProperty("sample", NS + ":sample");
        section.add("lists", lists);
        log(String.format(Locale.ROOT, "placed %d processor lists in %.1f s", LISTS.size(),
                (System.nanoTime() - started) / 1e9));
        finish(helper, "processors", section);
    }

    /** The fixture-relevant part of a block entity's saved data (the loot seed is random: only its presence). */
    static JsonObject blockEntity(CompoundTag tag) {
        JsonObject out = new JsonObject();
        com.google.gson.JsonArray keys = new com.google.gson.JsonArray();
        new TreeSet<>(tag.keySet()).forEach(keys::add);
        out.add("keys", keys);
        Tag loot = tag.get("LootTable");
        if (loot != null) out.addProperty("LootTable", loot.toString());
        Tag name = tag.get("CustomName");
        if (name != null) out.addProperty("CustomName", name.toString());
        return out;
    }

    static void fill(ServerLevel level, BoundingBox box, BlockState state) {
        for (BlockPos pos : BlockPos.betweenClosed(box.minX() - 1, box.minY() - 1, box.minZ() - 1, box.maxX() + 1,
                box.maxY() + 1, box.maxZ() + 1)) {
            level.setBlock(pos, state, 2 | 16);
        }
    }

    static void clear(ServerLevel level, BoundingBox box) {
        for (BlockPos pos : BlockPos.betweenClosed(box.minX() - 1, box.minY() - 1, box.minZ() - 1, box.maxX() + 1,
                box.maxY() + 1, box.maxZ() + 1)) {
            level.removeBlockEntity(pos);
            level.setBlock(pos, Blocks.AIR.defaultBlockState(), 2 | 16);
        }
    }

    // --- statistics -----------------------------------------------------------------------------------------------------

    /** A histogram of whole numbers with its mean, standard deviation, minimum and maximum. */
    static final class Stats {
        final Map<Integer, Integer> histogram = new TreeMap<>();
        long n;
        double sum;
        double squares;

        void add(int value) {
            histogram.merge(value, 1, Integer::sum);
            n++;
            sum += value;
            squares += (double) value * value;
        }

        JsonObject toJson() {
            JsonObject out = new JsonObject();
            JsonObject h = new JsonObject();
            histogram.forEach((k, v) -> h.addProperty(Integer.toString(k), v));
            out.add("histogram", h);
            out.addProperty("n", n);
            double mean = n == 0 ? 0 : sum / n;
            double variance = n < 2 ? 0 : Math.max(0, (squares - n * mean * mean) / (n - 1));
            out.addProperty("mean", round(mean));
            out.addProperty("sd", round(Math.sqrt(variance)));
            out.addProperty("min", histogram.isEmpty() ? 0 : ((TreeMap<Integer, Integer>) histogram).firstKey());
            out.addProperty("max", histogram.isEmpty() ? 0 : ((TreeMap<Integer, Integer>) histogram).lastKey());
            return out;
        }
    }

    static double round(double value) {
        return Math.round(value * 10_000) / 10_000.0;
    }

    static JsonObject counts(Map<String, Integer> map) {
        JsonObject out = new JsonObject();
        map.forEach(out::addProperty);
        return out;
    }

    static JsonObject nested(Map<String, Map<String, Integer>> map) {
        JsonObject out = new JsonObject();
        map.forEach((k, v) -> out.add(k, counts(v)));
        return out;
    }

    static JsonObject resourceJson(MinecraftServer server, Identifier id) {
        Resource resource = server.getResourceManager().getResource(id)
                .orElseThrow(() -> new IllegalStateException("no resource " + id));
        try (Reader reader = resource.openAsReader()) {
            return JsonParser.parseReader(reader).getAsJsonObject();
        } catch (IOException e) {
            throw new IllegalStateException(id + ": " + e, e);
        }
    }

    static void log(String line) {
        System.out.println("[msm structures parity] " + line);
    }

    // --- recording and checking -------------------------------------------------------------------------------------

    /** Writes the section (update mode) or checks it against the expectations, then ends the test. */
    static void finish(GameTestHelper helper, String name, JsonObject measured) {
        String file = System.getenv(EXPECTATIONS_ENV);
        helper.assertTrue(file != null && !file.isBlank(), EXPECTATIONS_ENV + " is not set; run the parity build's"
                + " structuresParity task");
        String target = System.getenv(TARGET_ENV);
        helper.assertTrue(target != null && !target.isBlank(), TARGET_ENV + " is not set; run the parity build's"
                + " structuresParity task");
        try {
            String update = System.getenv(UPDATE_ENV);
            if (update != null && !update.isBlank()) {
                writeSection(Path.of(file), target, name, measured);
                log("wrote " + target + " " + name + " (" + measured.size() + " entries)");
                helper.succeed();
                return;
            }
            JsonObject root = JsonParser.parseString(Files.readString(Path.of(file), StandardCharsets.UTF_8))
                    .getAsJsonObject();
            JsonObject targets = root.getAsJsonObject("targets");
            JsonObject section = targets == null || !targets.has(target) ? null
                    : targets.getAsJsonObject(target).getAsJsonObject(name);
            helper.assertTrue(section != null, "expectations.json has no " + name + " section for " + target
                    + "; run the parity build's structuresParity task with -PupdateStructuresParity");
            List<String> problems = new ArrayList<>();
            if (name.equals("assembly")) compareAssembly(section, measured, problems);
            else compareProcessors(section, measured, problems);
            helper.assertTrue(problems.isEmpty(), "the real game differs from expectations.json (" + target + " "
                    + name + "): " + String.join("; ", problems.subList(0, Math.min(problems.size(), 8)))
                    + (problems.size() > 8 ? "; and " + (problems.size() - 8) + " more" : ""));
            log("checked " + target + " " + name + " (" + measured.size() + " entries)");
            helper.succeed();
        } catch (IOException e) {
            throw new IllegalStateException("expectations.json: " + e, e);
        }
    }

    static void compareAssembly(JsonObject expected, JsonObject measured, List<String> problems) {
        keys(expected, measured).forEach(k -> {
            if (!expected.has(k) || !measured.has(k)) {
                problems.add(k + ": " + (expected.has(k) ? "missing" : "not expected"));
                return;
            }
            JsonObject e = expected.getAsJsonObject(k);
            JsonObject m = measured.getAsJsonObject(k);
            for (String field : List.of("grid", "assemblies", "noStart", "size", "maxDistance", "exact")) {
                exact(k + "." + field, e.get(field), m.get(field), problems);
            }
            int en = e.get("assemblies").getAsInt();
            int mn = m.get("assemblies").getAsInt();
            compareStats(k + ".pieces", e.getAsJsonObject("pieces"), m.getAsJsonObject("pieces"), problems);
            int ep = total(e.getAsJsonObject("templates"));
            int mp = total(m.getAsJsonObject("templates"));
            shares(k + ".templates", e.getAsJsonObject("templates"), ep, m.getAsJsonObject("templates"), mp, problems);
            shares(k + ".depths", e.getAsJsonObject("depths"), ep, m.getAsJsonObject("depths"), mp, problems);
            shares(k + ".startRotations", e.getAsJsonObject("startRotations"), en,
                    m.getAsJsonObject("startRotations"), mn, problems);
            JsonObject ej = e.getAsJsonObject("startJoins");
            JsonObject mj = m.getAsJsonObject("startJoins");
            keys(ej, mj).forEach(j -> shares(k + ".startJoins." + j, obj(ej, j), en, obj(mj, j), mn, problems));
            JsonObject eb = e.getAsJsonObject("branches");
            JsonObject mb = m.getAsJsonObject("branches");
            keys(eb, mb).forEach(j -> shares(k + ".branches." + j, obj(eb, j), en, obj(mb, j), mn, problems));
            JsonObject et = e.getAsJsonObject("turns");
            JsonObject mt = m.getAsJsonObject("turns");
            keys(et, mt).forEach(t -> shares(k + ".turns." + t, obj(et, t), total(obj(et, t)), obj(mt, t),
                    total(obj(mt, t)), problems));
        });
    }

    static void compareProcessors(JsonObject expected, JsonObject measured, List<String> problems) {
        for (String field : List.of("placements", "floorY", "sample")) {
            exact(field, expected.get(field), measured.get(field), problems);
        }
        JsonObject el = expected.getAsJsonObject("lists");
        JsonObject ml = measured.getAsJsonObject("lists");
        keys(el, ml).forEach(k -> {
            if (!el.has(k) || !ml.has(k)) {
                problems.add(k + ": " + (el.has(k) ? "missing" : "not expected"));
                return;
            }
            JsonObject e = el.getAsJsonObject(k);
            JsonObject m = ml.getAsJsonObject(k);
            boolean random = e.get("random").getAsBoolean();
            for (String field : List.of("random", "background", "cells", "blockEntities")) {
                exact(k + "." + field, e.get(field), m.get(field), problems);
            }
            if (!random) {
                exact(k + ".changed", e.get("changed"), m.get("changed"), problems);
                exact(k + ".byInput", e.get("byInput"), m.get("byInput"), problems);
                return;
            }
            compareStats(k + ".changed", e.getAsJsonObject("changed"), m.getAsJsonObject("changed"), problems);
            JsonObject ei = e.getAsJsonObject("byInput");
            JsonObject mi = m.getAsJsonObject("byInput");
            keys(ei, mi).forEach(in -> shares(k + ".byInput." + in, obj(ei, in), total(obj(ei, in)), obj(mi, in),
                    total(obj(mi, in)), problems));
        });
    }

    /** Piece or cell counts: equal when the expected spread is 0, else the means within {@link #Z} errors. */
    static void compareStats(String path, JsonObject e, JsonObject m, List<String> problems) {
        double esd = e.get("sd").getAsDouble();
        double msd = m.get("sd").getAsDouble();
        long en = e.get("n").getAsLong();
        long mn = m.get("n").getAsLong();
        if (esd == 0 && msd == 0) {
            exact(path, e, m, problems);
            return;
        }
        double se = Math.sqrt(esd * esd / en + msd * msd / mn);
        double diff = Math.abs(e.get("mean").getAsDouble() - m.get("mean").getAsDouble());
        if (diff > Z * se) {
            problems.add(String.format(Locale.ROOT, "%s: mean %.3f expected, %.3f measured (allowed %.3f)", path,
                    e.get("mean").getAsDouble(), m.get("mean").getAsDouble(), Z * se));
        }
        shares(path + ".histogram", e.getAsJsonObject("histogram"), (int) en, m.getAsJsonObject("histogram"),
                (int) mn, problems);
    }

    /** Each key's share of its total by a two-proportion test at |z| at most {@link #Z} (exact at shares of 0 and 1). */
    static void shares(String path, JsonObject e, int en, JsonObject m, int mn, List<String> problems) {
        for (String k : keys(e, m)) {
            int a = e.has(k) ? e.get(k).getAsInt() : 0;
            int b = m.has(k) ? m.get(k).getAsInt() : 0;
            if (en == 0 || mn == 0) {
                if (a != b) problems.add(path + "." + k + ": " + a + " expected, " + b + " measured");
                continue;
            }
            double p1 = a / (double) en;
            double p2 = b / (double) mn;
            double p = (a + b) / (double) (en + mn);
            double se = Math.sqrt(p * (1 - p) * (1.0 / en + 1.0 / mn));
            if (se == 0 ? p1 != p2 : Math.abs(p1 - p2) / se > Z) {
                problems.add(String.format(Locale.ROOT, "%s.%s: share %.4f expected, %.4f measured", path, k, p1, p2));
            }
        }
    }

    static void exact(String path, JsonElement e, JsonElement m, List<String> problems) {
        if (e == null && m == null) return;
        if (e == null || m == null || !e.equals(m)) {
            String text = String.valueOf(m);
            problems.add(path + ": expected " + abbreviate(String.valueOf(e)) + ", measured " + abbreviate(text));
        }
    }

    static String abbreviate(String text) {
        return text.length() > 200 ? text.substring(0, 200) + "..." : text;
    }

    static Set<String> keys(JsonObject a, JsonObject b) {
        Set<String> keys = new TreeSet<>();
        if (a != null) keys.addAll(a.keySet());
        if (b != null) keys.addAll(b.keySet());
        return keys;
    }

    static JsonObject obj(JsonObject parent, String key) {
        return parent != null && parent.has(key) ? parent.getAsJsonObject(key) : new JsonObject();
    }

    static int total(JsonObject counts) {
        int sum = 0;
        for (String k : counts.keySet()) sum += counts.get(k).getAsInt();
        return sum;
    }

    /** Writes one section of this target into the expectations file (sorted keys, two-space indents). */
    static synchronized void writeSection(Path file, String target, String name, JsonObject measured)
            throws IOException {
        JsonObject root = Files.isRegularFile(file)
                ? JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject()
                : new JsonObject();
        root.addProperty("format", FORMAT);
        root.addProperty("about", "Measured by StructuresParityTest on the real game (ADR 0122 D9, B639): what each"
                + " target's server made of the files of fixtures/structures-parity. assembly: per structure, the"
                + " starts Structure.generate made for world seeds " + SEED_A + " and " + SEED_B + " at chunks 0 to"
                + " grid - 1 on both axes, as a chunk's structure step makes them; README.md lists every field."
                + " processors: per processor list, the sample placed " + PLACEMENTS + " times by the start's own"
                + " placeInChunk, each cell read back in the template's frame. Rewritten by the parity build's"
                + " structuresParity task with -PupdateStructuresParity; never edited by hand.");
        root.add("seeds", JsonParser.parseString("[" + SEED_A + ", " + SEED_B + "]"));
        JsonObject targets = root.has("targets") ? root.getAsJsonObject("targets") : new JsonObject();
        JsonObject section = targets.has(target) ? targets.getAsJsonObject(target) : new JsonObject();
        section.add(name, measured);
        targets.add(target, section);
        root.add("targets", targets);
        StringBuilder out = new StringBuilder();
        WorldgenParityTest.writeJson(out, root, 0);
        out.append('\n');
        if (file.getParent() != null) Files.createDirectories(file.getParent());
        Files.writeString(file, out.toString(), StandardCharsets.UTF_8);
    }
}
