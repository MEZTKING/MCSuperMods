package dev.mcsupermods.runtime.gametest.spike3;

import static dev.mcsupermods.runtime.gametest.spike3.B503Help.R;
import static dev.mcsupermods.runtime.gametest.spike3.B503Mod.b;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.item.BoneMealItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.MultifaceBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;

/**
 * B503 spike (throwaway), X1 and X3: each vanilla plant class with {@code Properties} only ("naked") and with its partner
 * linked; forced random ticks and bone meal; which blocks the plant makes (ours or vanilla's) and how far it grows.
 */
public class X01PlantClassesGameTest {
    static final String TALL = "msm_runtime_gametest:b503_tall";

    /** The column from {@code base} along {@code dir} while the block is not air or water (absolute positions). */
    static List<BlockPos> column(ServerLevel level, BlockPos base, Direction dir) {
        List<BlockPos> out = new ArrayList<>();
        BlockPos at = base;
        for (int i = 0; i < 40; i++) {
            BlockState s = level.getBlockState(at);
            if (s.isAir() || s.is(Blocks.WATER)) {
                break;
            }
            out.add(at);
            at = at.relative(dir);
        }
        return out;
    }

    static List<String> describe(ServerLevel level, List<BlockPos> col) {
        List<String> out = new ArrayList<>();
        for (BlockPos p : col) {
            out.add(B503Help.name(level.getBlockState(p)));
        }
        return out;
    }

    /** Counts distinct block ids in a column. */
    static Map<String, Integer> ids(ServerLevel level, List<BlockPos> col) {
        Map<String, Integer> m = new TreeMap<>();
        for (BlockPos p : col) {
            m.merge(B503Help.id(level.getBlockState(p).getBlock()), 1, Integer::sum);
        }
        return m;
    }

    /** Random-ticks every block of the column {@code n} times; returns the tick count at each new length. */
    static Map<String, Object> grow(GameTestHelper helper, BlockPos baseRel, Direction dir, int n) {
        ServerLevel level = helper.getLevel();
        RandomSource random = RandomSource.create(503L);
        BlockPos base = helper.absolutePos(baseRel);
        List<Integer> lengthAt = new ArrayList<>();
        int last = column(level, base, dir).size();
        for (int k = 0; k < n; k++) {
            for (BlockPos p : column(level, base, dir)) {
                BlockState s = level.getBlockState(p);
                if (s.isRandomlyTicking()) {
                    s.randomTick(level, p, random);
                }
            }
            int len = column(level, base, dir).size();
            if (len != last) {
                lengthAt.add(k);
                last = len;
            }
        }
        List<BlockPos> col = column(level, base, dir);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ticks", n);
        m.put("length", col.size());
        m.put("ids", ids(level, col));
        m.put("tip", col.isEmpty() ? "none" : B503Help.name(level.getBlockState(col.getLast())));
        m.put("growthTicks", lengthAt);
        return m;
    }

    static Map<String, Object> boneMeal(GameTestHelper helper, BlockPos rel, BlockPos baseRel, Direction dir, int times) {
        ServerLevel level = helper.getLevel();
        Map<String, Object> m = new LinkedHashMap<>();
        List<Boolean> results = new ArrayList<>();
        for (int i = 0; i < times; i++) {
            List<BlockPos> col = column(level, helper.absolutePos(baseRel), dir);
            BlockPos target = rel != null ? helper.absolutePos(rel) : col.getLast();
            results.add(BoneMealItem.growCrop(new ItemStack(Items.BONE_MEAL), level, target));
        }
        List<BlockPos> col = column(level, helper.absolutePos(baseRel), dir);
        m.put("results", results);
        m.put("length", col.size());
        m.put("ids", ids(level, col));
        m.put("blocks", describe(level, col));
        return m;
    }

    static void water(GameTestHelper helper, int x, int z, int fromY, int toY) {
        for (int y = fromY; y <= toY; y++) {
            helper.setBlock(new BlockPos(x, y, z), Blocks.WATER);
        }
    }

    /** Kelp-like heads in a water column on stone. */
    @GameTest(structure = TALL, maxTicks = 100)
    public void x1x3Kelp(GameTestHelper helper) {
        int x = 1;
        for (String path : List.of("kelp_naked", "kelp")) {
            String key = "X1.kelp." + path;
            R.section(key, () -> {
                int z = path.equals("kelp") ? 3 : 1;
                water(helper, x, z, 1, 34);
                helper.setBlock(new BlockPos(x, 1, z), b(path));
                BlockState placed = helper.getBlockState(new BlockPos(x, 1, z));
                R.put(key + ".placed", B503Help.name(placed));
                R.put(key + ".ageValues", placed.hasProperty(BlockStateProperties.AGE_25) ? "AGE_25 0..25" : String.valueOf(placed.getProperties()));
                R.put(key + ".grow", grow(helper, new BlockPos(x, 1, z), Direction.UP, 3000));
            });
            R.section(key + ".bone", () -> {
                int z = path.equals("kelp") ? 7 : 5;
                water(helper, x, z, 1, 34);
                helper.setBlock(new BlockPos(x, 1, z), b(path));
                R.put(key + ".bone", boneMeal(helper, null, new BlockPos(x, 1, z), Direction.UP, 5));
            });
        }
        helper.succeed();
    }

    /** Weeping, twisting and cave vines: hanging from or standing on stone. */
    @GameTest(structure = TALL, maxTicks = 100)
    public void x1x3Vines(GameTestHelper helper) {
        int z = 1;
        String[][] heads = {{"weeping_naked", "down"}, {"weeping", "down"}, {"twisting_naked", "up"}, {"twisting", "up"},
                {"cave_naked", "down"}, {"cave", "down"}};
        int x = 0;
        for (String[] h : heads) {
            String path = h[0];
            boolean down = h[1].equals("down");
            int cx = x;
            String key = "X1.vines." + path;
            R.section(key, () -> {
                BlockPos base = down ? new BlockPos(cx, 33, z) : new BlockPos(cx, 1, z);
                if (down) {
                    helper.setBlock(base.above(), Blocks.STONE);
                }
                helper.setBlock(base, b(path));
                R.put(key + ".placed", B503Help.name(helper.getBlockState(base)));
                R.put(key + ".grow", grow(helper, base, down ? Direction.DOWN : Direction.UP, 3000));
            });
            R.section(key + ".bone", () -> {
                BlockPos base = down ? new BlockPos(cx, 33, z + 4) : new BlockPos(cx, 1, z + 4);
                if (down) {
                    helper.setBlock(base.above(), Blocks.STONE);
                }
                helper.setBlock(base, b(path));
                R.put(key + ".bone", boneMeal(helper, null, base, down ? Direction.DOWN : Direction.UP, 4));
            });
            x += 2;
        }
        helper.succeed();
    }

    /** Sugar cane and cactus on sand (cane with water beside), bamboo stalk and shoot on dirt. */
    @GameTest(structure = TALL, maxTicks = 100)
    public void x1x3Stalks(GameTestHelper helper) {
        R.section("X1.cane", () -> {
            helper.setBlock(new BlockPos(1, 0, 1), Blocks.SAND);
            helper.setBlock(new BlockPos(2, 0, 1), Blocks.WATER);
            helper.setBlock(new BlockPos(1, 1, 1), b("cane_naked"));
            R.put("X1.cane.placed", B503Help.name(helper.getBlockState(new BlockPos(1, 1, 1))));
            R.put("X1.cane.grow", grow(helper, new BlockPos(1, 1, 1), Direction.UP, 3000));
            helper.setBlock(new BlockPos(1, 0, 4), Blocks.SAND);
            helper.setBlock(new BlockPos(2, 0, 4), Blocks.WATER);
            helper.setBlock(new BlockPos(1, 1, 4), b("cane_naked"));
            R.put("X1.cane.bone", boneMeal(helper, new BlockPos(1, 1, 4), new BlockPos(1, 1, 4), Direction.UP, 3));
        });
        R.section("X1.cactus", () -> {
            helper.setBlock(new BlockPos(4, 0, 1), Blocks.SAND);
            helper.setBlock(new BlockPos(4, 1, 1), b("cactus_naked"));
            R.put("X1.cactus.grow", grow(helper, new BlockPos(4, 1, 1), Direction.UP, 6000));
            helper.setBlock(new BlockPos(4, 0, 4), Blocks.SAND);
            helper.setBlock(new BlockPos(4, 1, 4), b("cactus_naked"));
            R.put("X1.cactus.bone", boneMeal(helper, new BlockPos(4, 1, 4), new BlockPos(4, 1, 4), Direction.UP, 3));
        });
        for (String[] s : new String[][] {{"bamboo_naked", "7"}, {"shoot_naked", "9"}, {"shoot", "11"}}) {
            int x = Integer.parseInt(s[1]);
            String key = "X1." + s[0];
            R.section(key, () -> {
                helper.setBlock(new BlockPos(x, 0, 1), Blocks.DIRT);
                helper.setBlock(new BlockPos(x, 1, 1), b(s[0]));
                R.put(key + ".placed", B503Help.name(helper.getBlockState(new BlockPos(x, 1, 1))));
                R.put(key + ".grow", grow(helper, new BlockPos(x, 1, 1), Direction.UP, 3000));
                List<String> col = describe(helper.getLevel(), column(helper.getLevel(), helper.absolutePos(new BlockPos(x, 1, 1)), Direction.UP));
                R.put(key + ".column", col);
                helper.setBlock(new BlockPos(x, 0, 5), Blocks.DIRT);
                helper.setBlock(new BlockPos(x, 1, 5), b(s[0]));
                R.put(key + ".bone", boneMeal(helper, null, new BlockPos(x, 1, 5), Direction.UP, 6));
            });
        }
        R.put("X1.swaps", new ArrayList<>(B503Mod.INIT.stream().filter(l -> l.startsWith("swapped")).toList()));
        helper.succeed();
    }

    /** Big and small dripleaf on clay (bone meal), glow lichen on a stone wall (bone meal spreads it). */
    @GameTest(structure = TALL, maxTicks = 100)
    public void x1x3DripleafAndLichen(GameTestHelper helper) {
        R.section("X1.bigleaf", () -> {
            helper.setBlock(new BlockPos(1, 0, 1), Blocks.CLAY);
            helper.setBlock(new BlockPos(1, 1, 1), b("big_leaf_naked"));
            R.put("X1.bigleaf.placed", B503Help.name(helper.getBlockState(new BlockPos(1, 1, 1))));
            R.put("X1.bigleaf.bone", boneMeal(helper, new BlockPos(1, 1, 1), new BlockPos(1, 1, 1), Direction.UP, 1));
            List<BlockPos> col = column(helper.getLevel(), helper.absolutePos(new BlockPos(1, 1, 1)), Direction.UP);
            BlockPos top = col.getLast();
            R.put("X1.bigleaf.bone2", boneMeal(helper, helper.relativePos(top), new BlockPos(1, 1, 1), Direction.UP, 3));
        });
        R.section("X1.stem", () -> {
            helper.setBlock(new BlockPos(3, 0, 1), Blocks.CLAY);
            helper.setBlock(new BlockPos(3, 1, 1), b("leaf_stem_naked"));
            helper.setBlock(new BlockPos(3, 2, 1), b("big_leaf_naked"));
            BlockState stem = helper.getBlockState(new BlockPos(3, 1, 1));
            R.put("X1.stem.canSurviveUnderOwnLeaf", stem.canSurvive(helper.getLevel(), helper.absolutePos(new BlockPos(3, 1, 1))));
            helper.setBlock(new BlockPos(5, 0, 1), Blocks.CLAY);
            helper.setBlock(new BlockPos(5, 1, 1), Blocks.BIG_DRIPLEAF_STEM);
            helper.setBlock(new BlockPos(5, 2, 1), b("big_leaf_naked"));
            R.put("X1.stem.vanillaStemUnderOwnLeaf", Blocks.BIG_DRIPLEAF_STEM.defaultBlockState()
                    .canSurvive(helper.getLevel(), helper.absolutePos(new BlockPos(5, 1, 1))));
            R.put("X1.stem.ownLeafOnVanillaStem", b("big_leaf_naked").defaultBlockState()
                    .canSurvive(helper.getLevel(), helper.absolutePos(new BlockPos(5, 2, 1))));
        });
        R.section("X1.smallleaf", () -> {
            helper.setBlock(new BlockPos(7, 0, 1), Blocks.CLAY);
            BlockState lower = b("small_leaf_naked").defaultBlockState().setValue(BlockStateProperties.DOUBLE_BLOCK_HALF, DoubleBlockHalf.LOWER);
            helper.setBlock(new BlockPos(7, 1, 1), lower);
            helper.setBlock(new BlockPos(7, 2, 1), lower.setValue(BlockStateProperties.DOUBLE_BLOCK_HALF, DoubleBlockHalf.UPPER));
            R.put("X1.smallleaf.placed", describe(helper.getLevel(), column(helper.getLevel(), helper.absolutePos(new BlockPos(7, 1, 1)), Direction.UP)));
            R.put("X1.smallleaf.bone", boneMeal(helper, new BlockPos(7, 1, 1), new BlockPos(7, 1, 1), Direction.UP, 1));
        });
        R.section("X1.lichen", () -> {
            for (int y = 1; y <= 5; y++) {
                for (int x = 9; x <= 13; x++) {
                    helper.setBlock(new BlockPos(x, y, 2), Blocks.STONE);
                }
            }
            BlockState lichen = b("lichen_naked").defaultBlockState().setValue(MultifaceBlock.getFaceProperty(Direction.SOUTH), true);
            helper.setBlock(new BlockPos(11, 3, 1), lichen);
            R.put("X1.lichen.placed", B503Help.name(helper.getBlockState(new BlockPos(11, 3, 1))));
            List<Boolean> results = new ArrayList<>();
            for (int i = 0; i < 4; i++) {
                results.add(BoneMealItem.growCrop(new ItemStack(Items.BONE_MEAL), helper.getLevel(), helper.absolutePos(new BlockPos(11, 3, 1))));
            }
            Map<String, Integer> found = new TreeMap<>();
            for (int y = 0; y <= 7; y++) {
                for (int x = 7; x <= 15; x++) {
                    for (int zz = 0; zz <= 3; zz++) {
                        BlockState s = helper.getBlockState(new BlockPos(x, y, zz));
                        if (s.getBlock() instanceof MultifaceBlock) {
                            found.merge(B503Help.id(s.getBlock()), 1, Integer::sum);
                        }
                    }
                }
            }
            R.put("X1.lichen.bone", Map.of("results", results, "multifaceBlocks", found));
            R.put("X1.lichen.light", helper.getLevel().getMaxLocalRawBrightness(helper.absolutePos(new BlockPos(11, 3, 1))));
        });
        helper.succeed();
    }

    /** Cave vine berries: picking with an empty hand (what item), the light with and without berries. */
    @GameTest(structure = TALL, maxTicks = 100)
    public void x3Berries(GameTestHelper helper) {
        for (String path : List.of("cave_naked", "cave")) {
            int x = path.equals("cave") ? 4 : 1;
            String key = "X3.berries." + path;
            R.section(key, () -> {
                helper.setBlock(new BlockPos(x, 10, 1), Blocks.STONE);
                BlockState with = b(path).defaultBlockState().setValue(net.minecraft.world.level.block.CaveVines.BERRIES, true);
                helper.setBlock(new BlockPos(x, 9, 1), with);
                int lightWith = helper.getLevel().getLightEmission(helper.absolutePos(new BlockPos(x, 9, 1)));
                var player = B503Help.player(helper, new BlockPos(x, 8, 2), net.minecraft.world.level.GameType.SURVIVAL);
                var result = B503Help.use(helper, player, new BlockPos(x, 9, 1), Direction.SOUTH, ItemStack.EMPTY);
                List<String> drops = new ArrayList<>();
                helper.getLevel().getEntitiesOfClass(net.minecraft.world.entity.item.ItemEntity.class,
                        new net.minecraft.world.phys.AABB(helper.absolutePos(new BlockPos(x, 9, 1))).inflate(2))
                        .forEach(e -> drops.add(e.getItem().toString()));
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("emissionWithBerries", lightWith);
                m.put("use", String.valueOf(result));
                m.put("after", B503Help.name(helper.getBlockState(new BlockPos(x, 9, 1))));
                m.put("emissionAfter", helper.getLevel().getLightEmission(helper.absolutePos(new BlockPos(x, 9, 1))));
                m.put("drops", drops);
                m.put("pickItem", b(path).defaultBlockState().getCloneItemStack(helper.getLevel(), helper.absolutePos(new BlockPos(x, 9, 1)), false).toString());
                R.put(key, m);
            });
        }
        helper.succeed();
    }

    /** Vanilla controls: cactus (flower?), sugar cane and bamboo from a sapling, forced random ticks. */
    @GameTest(structure = TALL, maxTicks = 100)
    public void x1Controls(GameTestHelper helper) {
        R.section("X1.control.cactus", () -> {
            helper.setBlock(new BlockPos(1, 0, 1), Blocks.SAND);
            helper.setBlock(new BlockPos(1, 1, 1), Blocks.CACTUS);
            R.put("X1.control.cactus.grow", grow(helper, new BlockPos(1, 1, 1), Direction.UP, 6000));
        });
        R.section("X1.control.cactusOwnSecondRun", () -> {
            helper.setBlock(new BlockPos(3, 0, 1), Blocks.SAND);
            helper.setBlock(new BlockPos(3, 1, 1), b("cactus_naked"));
            R.put("X1.control.cactusOwn.grow", grow(helper, new BlockPos(3, 1, 1), Direction.UP, 20000));
        });
        R.section("X1.control.cane", () -> {
            helper.setBlock(new BlockPos(5, 0, 1), Blocks.SAND);
            helper.setBlock(new BlockPos(6, 0, 1), Blocks.WATER);
            helper.setBlock(new BlockPos(5, 1, 1), Blocks.SUGAR_CANE);
            R.put("X1.control.cane.grow", grow(helper, new BlockPos(5, 1, 1), Direction.UP, 3000));
        });
        R.section("X1.control.bamboo", () -> {
            helper.setBlock(new BlockPos(9, 0, 1), Blocks.DIRT);
            helper.setBlock(new BlockPos(9, 1, 1), Blocks.BAMBOO);
            R.put("X1.control.bamboo.grow", grow(helper, new BlockPos(9, 1, 1), Direction.UP, 6000));
            R.put("X1.control.bamboo.column", describe(helper.getLevel(), column(helper.getLevel(), helper.absolutePos(new BlockPos(9, 1, 1)), Direction.UP)));
        });
        helper.succeed();
    }

    /** Big dripleaf under a standing pig: the tilt each tick; cactus damage to a pig pushed into it. */
    @GameTest(structure = TALL, maxTicks = 200)
    public void x3TiltAndThorns(GameTestHelper helper) {
        List<String> tilts = new ArrayList<>();
        List<String> vtilts = new ArrayList<>();
        helper.setBlock(new BlockPos(2, 0, 2), Blocks.CLAY);
        helper.setBlock(new BlockPos(2, 1, 2), b("big_leaf_naked"));
        helper.setBlock(new BlockPos(6, 0, 2), Blocks.CLAY);
        helper.setBlock(new BlockPos(6, 1, 2), Blocks.BIG_DRIPLEAF);
        var pig = helper.spawnWithNoFreeWill(net.minecraft.world.entity.EntityTypes.PIG, new BlockPos(2, 2, 2));
        var vpig = helper.spawnWithNoFreeWill(net.minecraft.world.entity.EntityTypes.PIG, new BlockPos(6, 2, 2));
        helper.setBlock(new BlockPos(10, 0, 2), Blocks.SAND);
        helper.setBlock(new BlockPos(10, 1, 2), b("cactus_naked"));
        helper.setBlock(new BlockPos(13, 0, 2), Blocks.SAND);
        helper.setBlock(new BlockPos(13, 1, 2), Blocks.CACTUS);
        var p1 = helper.spawnWithNoFreeWill(net.minecraft.world.entity.EntityTypes.PIG, new BlockPos(10, 1, 3));
        var p2 = helper.spawnWithNoFreeWill(net.minecraft.world.entity.EntityTypes.PIG, new BlockPos(13, 1, 3));
        float h1 = p1.getHealth();
        float h2 = p2.getHealth();
        int[] t = {0};
        helper.onEachTick(() -> {
            t[0]++;
            if (t[0] <= 120) {
                tilts.add(String.valueOf(helper.getBlockState(new BlockPos(2, 1, 2)).getValue(BlockStateProperties.TILT)));
                vtilts.add(String.valueOf(helper.getBlockState(new BlockPos(6, 1, 2)).getValue(BlockStateProperties.TILT)));
            }
            p1.setDeltaMovement(new net.minecraft.world.phys.Vec3(0, p1.getDeltaMovement().y, -0.1));
            p2.setDeltaMovement(new net.minecraft.world.phys.Vec3(0, p2.getDeltaMovement().y, -0.1));
        });
        helper.runAfterDelay(130, () -> {
            R.put("X3.tilt.own", compress(tilts));
            R.put("X3.tilt.vanilla", compress(vtilts));
            R.put("X3.tilt.pigs", B503Help.name(helper.getBlockState(new BlockPos(2, 1, 2))) + " pig y " + pig.getY() + " / vanilla pig y " + vpig.getY());
            R.put("X3.thorns", "own cactus: pig health " + h1 + " -> " + p1.getHealth() + "; vanilla cactus: " + h2 + " -> " + p2.getHealth());
            helper.succeed();
        });
    }

    /** "value xN" runs. */
    static List<String> compress(List<String> in) {
        List<String> out = new ArrayList<>();
        String last = null;
        int n = 0;
        for (String s : in) {
            if (s.equals(last)) {
                n++;
            } else {
                if (last != null) {
                    out.add(last + " x" + n);
                }
                last = s;
                n = 1;
            }
        }
        if (last != null) {
            out.add(last + " x" + n);
        }
        return out;
    }

    static Block air() {
        return Blocks.AIR;
    }
}
