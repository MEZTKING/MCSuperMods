package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.registry.weathering.Lightning;
import dev.mcsupermods.runtime.registry.weathering.Weathering;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.LightningBolt;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChangeOverTimeBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.AttachFace;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.level.block.state.properties.WallSide;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for weathering on rods, buttons, pressure plates (plain and weighted), fences, fence gates and walls (ADR 0104
 * D1) and for lightning on project weathering blocks (D2 and its amendment after B503, X5), on
 * {@code msm/msm_test/block/weathering2_*}: each type ages under forced random ticks at vanilla copper's rate (measured
 * beside vanilla copper with the same random sequence) and keeps every state property; honeycomb, the axe and scraping on
 * each; a pressed button or plate that changes stage still lets go; a bolt sends the struck block to its first stage and
 * takes neighbours back one stage, measured beside the same bolts on vanilla oxidized copper; a struck rod and the block a
 * rod stands on; waxed blocks and the first stage untouched.
 */
public class MsmWeathering2GameTest {
    private static final String ARENA = "msm_runtime_gametest:arena";
    private static final List<String> TYPES = List.of("rod", "button", "plate", "heavy_plate", "fence", "gate", "wall");

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    /** A start state of each type with properties other than the defaults, so keeping them is seen. */
    private static BlockState start(String type, String stage) {
        BlockState s = block("weathering2_" + stage + "tin_" + type).defaultBlockState();
        return switch (type) {
            case "rod" -> s.setValue(BlockStateProperties.FACING, Direction.EAST);
            case "button" -> s.setValue(BlockStateProperties.ATTACH_FACE, AttachFace.FLOOR).setValue(BlockStateProperties.HORIZONTAL_FACING,
                    Direction.WEST);
            case "plate" -> s;
            case "heavy_plate" -> s;
            case "fence" -> s.setValue(BlockStateProperties.NORTH, true).setValue(BlockStateProperties.WATERLOGGED, true);
            case "gate" -> s.setValue(BlockStateProperties.HORIZONTAL_FACING, Direction.SOUTH).setValue(BlockStateProperties.OPEN, true)
                    .setValue(BlockStateProperties.IN_WALL, true);
            case "wall" -> s.setValue(BlockStateProperties.UP, true).setValue(BlockStateProperties.EAST_WALL, WallSide.TALL)
                    .setValue(BlockStateProperties.WATERLOGGED, true);
            default -> throw new IllegalArgumentException(type);
        };
    }

    /** Every property of {@code from} that {@code to} has, with the same value. */
    private static boolean keepsProperties(BlockState from, BlockState to) {
        for (Property<?> p : from.getProperties()) {
            if (!to.hasProperty(p) || !to.getValue(p).equals(from.getValue(p))) {
                return false;
            }
        }
        return true;
    }

    private static void clear(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        for (int x = 0; x < 8; x++) {
            for (int y = 1; y < 8; y++) {
                for (int z = 0; z < 8; z++) {
                    level.setBlock(helper.absolutePos(new BlockPos(x, y, z)), Blocks.AIR.defaultBlockState(), 2 | 16);
                }
            }
        }
    }

    /** The share of {@code n} forced random ticks that change {@code start} alone in the middle of a cleared area. */
    private static double rate(GameTestHelper helper, BlockState start, int n, BlockState[] into) {
        ServerLevel level = helper.getLevel();
        clear(helper);
        RandomSource random = RandomSource.create(4490L);
        BlockPos abs = helper.absolutePos(new BlockPos(3, 3, 3));
        int changes = 0;
        for (int k = 0; k < n; k++) {
            level.setBlock(abs, start, 2 | 16);
            start.randomTick(level, abs, random);
            BlockState now = level.getBlockState(abs);
            if (now != start) {
                changes++;
                into[0] = now;
            }
        }
        level.setBlock(abs, Blocks.AIR.defaultBlockState(), 2 | 16);
        return changes / (double) n;
    }

    @GameTest(maxTicks = 40)
    public void eachNewTypeAgesAtVanillaCoppersRateAndKeepsItsState(GameTestHelper helper) {
        int n = 20000;
        BlockState[] into = new BlockState[1];
        double copper = rate(helper, Blocks.COPPER_BLOCK.weathering().unaffected().defaultBlockState(), n, into);
        Map<String, Double> rates = new LinkedHashMap<>();
        rates.put("copper", copper);
        for (String type : TYPES) {
            BlockState start = start(type, "");
            helper.assertTrue(start.getBlock() instanceof Weathering.Ageing, type + " is not a weathering block: " + start.getBlock());
            helper.assertTrue(start.isRandomlyTicking(), type + " does not random-tick");
            into[0] = null;
            double r = rate(helper, start, n, into);
            rates.put(type, r);
            helper.assertTrue(into[0] != null && into[0].is(block("weathering2_exposed_tin_" + type)), type + " aged into " + into[0]);
            helper.assertTrue(keepsProperties(start, into[0]), type + " lost its state: " + start + " -> " + into[0]);
            helper.assertTrue(Math.abs(r - copper) <= 0.15 * copper, type + " rate " + r + ", vanilla copper " + copper);
            // The last stage and the waxed copy never tick or age.
            helper.assertFalse(block("weathering2_exposed_tin_" + type).defaultBlockState().isRandomlyTicking(), type + " last stage ticks");
            helper.assertFalse(block("weathering2_waxed_tin_" + type) instanceof ChangeOverTimeBlock<?>, type + " waxed copy weathers");
        }
        MsmRuntime.LOGGER.info("[{}] B510 weathering rates over {} random ticks: {}", MsmRuntime.MOD_ID, n, rates);
        helper.succeed();
    }

    private static ServerPlayer player(GameTestHelper helper) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.setPos(helper.absoluteVec(new Vec3(3.5, 2, 6.5)));
        return player;
    }

    private static InteractionResult use(GameTestHelper helper, ServerPlayer player, BlockPos rel, ItemStack stack) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        BlockPos abs = helper.absolutePos(rel);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs), Direction.UP, abs, true);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND),
                InteractionHand.MAIN_HAND, hit);
    }

    @GameTest
    public void honeycombWaxesAndTheAxeUnwaxesAndScrapesEachNewType(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        BlockPos at = new BlockPos(3, 2, 3);
        helper.setBlock(at.below(), Blocks.STONE);
        for (String type : TYPES) {
            BlockState start = start(type, "");
            helper.getLevel().setBlock(helper.absolutePos(at), start, 2 | 16);
            ItemStack honeycomb = new ItemStack(Items.HONEYCOMB, 2);
            helper.assertTrue(use(helper, player, at, honeycomb).consumesAction(), type + ": honeycomb did nothing");
            BlockState waxed = helper.getBlockState(at);
            helper.assertTrue(waxed.is(block("weathering2_waxed_tin_" + type)) && keepsProperties(start, waxed), type + " waxed into " + waxed);
            helper.assertValueEqual(player.getMainHandItem().getCount(), 1, type + ": honeycomb left");
            ItemStack axe = new ItemStack(Items.IRON_AXE);
            helper.assertTrue(use(helper, player, at, axe).consumesAction(), type + ": the axe did not unwax");
            BlockState unwaxed = helper.getBlockState(at);
            helper.assertTrue(unwaxed.is(block("weathering2_tin_" + type)) && keepsProperties(start, unwaxed), type + " unwaxed into " + unwaxed);
            BlockState exposed = start(type, "exposed_");
            helper.getLevel().setBlock(helper.absolutePos(at), exposed, 2 | 16);
            use(helper, player, at, player.getMainHandItem());
            BlockState scraped = helper.getBlockState(at);
            helper.assertTrue(scraped.is(block("weathering2_tin_" + type)) && keepsProperties(exposed, scraped), type + " scraped into " + scraped);
            helper.assertValueEqual(player.getMainHandItem().getDamageValue(), 2, type + ": axe damage");
        }
        helper.succeed();
    }

    @GameTest(maxTicks = 100)
    public void aPressedButtonOrPlateThatChangesStageStillLetsGo(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        for (int x = 0; x < 8; x++) {
            helper.setBlock(new BlockPos(x, 1, 3), Blocks.STONE);
        }
        BlockPos aged = new BlockPos(1, 2, 3);
        BlockPos waxed = new BlockPos(3, 2, 3);
        BlockPos plate = new BlockPos(5, 2, 3);
        BlockPos heavy = new BlockPos(7, 2, 3);
        for (BlockPos p : List.of(aged, waxed)) {
            helper.setBlock(p, start("button", ""));
            helper.assertTrue(use(helper, player, p, ItemStack.EMPTY).consumesAction(), "button not pressed");
            helper.assertTrue(helper.getBlockState(p).getValue(BlockStateProperties.POWERED), "button not powered");
        }
        // Pressed plates with nothing on them: their let-go tick is the one scheduled after the change.
        helper.setBlock(plate, start("plate", "").setValue(BlockStateProperties.POWERED, true));
        helper.setBlock(heavy, start("heavy_plate", "").setValue(BlockStateProperties.POWER, 4));
        ServerLevel level = helper.getLevel();
        RandomSource random = RandomSource.create(510L);
        for (BlockPos p : List.of(aged, plate, heavy)) {
            BlockPos abs = helper.absolutePos(p);
            BlockState s = level.getBlockState(abs);
            for (int k = 0; k < 20000 && level.getBlockState(abs) == s; k++) {
                s.randomTick(level, abs, random);
            }
        }
        use(helper, player, waxed, new ItemStack(Items.HONEYCOMB));
        helper.assertTrue(helper.getBlockState(aged).is(block("weathering2_exposed_tin_button"))
                && helper.getBlockState(aged).getValue(BlockStateProperties.POWERED), "aged button " + helper.getBlockState(aged));
        helper.assertTrue(helper.getBlockState(waxed).is(block("weathering2_waxed_tin_button"))
                && helper.getBlockState(waxed).getValue(BlockStateProperties.POWERED), "waxed button " + helper.getBlockState(waxed));
        helper.assertTrue(helper.getBlockState(plate).is(block("weathering2_exposed_tin_plate")), "plate " + helper.getBlockState(plate));
        helper.assertTrue(helper.getBlockState(heavy).is(block("weathering2_exposed_tin_heavy_plate")), "heavy plate " + helper.getBlockState(heavy));
        helper.succeedWhen(() -> {
            helper.assertFalse(helper.getBlockState(aged).getValue(BlockStateProperties.POWERED), "the aged button stays pressed");
            helper.assertFalse(helper.getBlockState(waxed).getValue(BlockStateProperties.POWERED), "the waxed button stays pressed");
            helper.assertFalse(helper.getBlockState(plate).getValue(BlockStateProperties.POWERED), "the aged plate stays pressed");
            helper.assertValueEqual(helper.getBlockState(heavy).getValue(BlockStateProperties.POWER), 0, "the aged heavy plate's power");
        });
    }

    // Lightning (ADR 0104 D2)

    private static final BlockPos MIDDLE = new BlockPos(5, 1, 5);

    /** A 7 by 7 floor of {@code state} around {@code MIDDLE}, with air above. */
    private static void floor(GameTestHelper helper, BlockState state) {
        for (int x = -3; x <= 3; x++) {
            for (int z = -3; z <= 3; z++) {
                helper.getLevel().setBlock(helper.absolutePos(MIDDLE.offset(x, 0, z)), state, 2 | 16);
                for (int y = 1; y <= 2; y++) {
                    helper.getLevel().setBlock(helper.absolutePos(MIDDLE.offset(x, y, z)), Blocks.AIR.defaultBlockState(), 2 | 16);
                }
            }
        }
    }

    /** The floor cells that are no longer {@code was}, by offset from the middle. */
    private static Map<String, String> changes(GameTestHelper helper, BlockState was) {
        Map<String, String> out = new TreeMap<>();
        for (int x = -3; x <= 3; x++) {
            for (int z = -3; z <= 3; z++) {
                BlockState s = helper.getBlockState(MIDDLE.offset(x, 0, z));
                if (s != was) {
                    out.put(x + "," + z, BuiltInRegistries.BLOCK.getKey(s.getBlock()).getPath());
                }
            }
        }
        return out;
    }

    private static void strike(GameTestHelper helper, BlockPos rel) {
        LightningBolt bolt = EntityTypes.LIGHTNING_BOLT.create(helper.getLevel(), EntitySpawnReason.TRIGGERED);
        bolt.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(rel)));
        helper.getLevel().addFreshEntity(bolt);
    }

    /**
     * Alternating bolts on a floor of vanilla oxidized copper and on one of project oxidized bronze, each counted after
     * vanilla's bolt has struck; then the counts are compared.
     */
    @GameTest(structure = ARENA, maxTicks = 600)
    public void aBoltScrapesProjectBlocksAsItScrapesVanillaCopper(GameTestHelper helper) {
        BlockState copper = Blocks.COPPER_BLOCK.weathering().oxidized().defaultBlockState();
        BlockState bronze = block("weathering2_oxidized_bronze").defaultBlockState();
        int strikes = 12;
        List<Map<String, String>> vanilla = new ArrayList<>();
        List<Map<String, String>> project = new ArrayList<>();
        Runnable[] next = new Runnable[1];
        int[] n = {0};
        next[0] = () -> {
            if (n[0] == 2 * strikes) {
                finish(helper, vanilla, project);
                return;
            }
            boolean ours = n[0] % 2 == 1;
            BlockState was = ours ? bronze : copper;
            floor(helper, was);
            strike(helper, MIDDLE.above());
            helper.runAfterDelay(12, () -> {
                (ours ? project : vanilla).add(changes(helper, was));
                n[0]++;
                next[0].run();
            });
        };
        next[0].run();
    }

    private static void finish(GameTestHelper helper, List<Map<String, String>> vanilla, List<Map<String, String>> project) {
        MsmRuntime.LOGGER.info("[{}] B510 lightning on vanilla oxidized copper: {}", MsmRuntime.MOD_ID, vanilla);
        MsmRuntime.LOGGER.info("[{}] B510 lightning on project oxidized bronze: {}", MsmRuntime.MOD_ID, project);
        for (Map<String, String> m : vanilla) {
            helper.assertValueEqual(m.get("0,0"), "copper_block", "vanilla's struck block " + m);
        }
        double vanillaCells = 0;
        double projectCells = 0;
        for (Map<String, String> m : project) {
            helper.assertValueEqual(m.get("0,0"), "weathering2_bronze", "the struck project block " + m);
            helper.assertTrue(m.size() >= 2, "no neighbour scraped: " + m);
            for (var e : m.entrySet()) {
                if (!e.getKey().equals("0,0")) {
                    helper.assertTrue(e.getValue().startsWith("weathering2_"), "scraped into " + e);
                }
            }
            projectCells += m.size() - 1;
        }
        for (Map<String, String> m : vanilla) {
            vanillaCells += m.size() - 1;
        }
        double v = vanillaCells / vanilla.size();
        double p = projectCells / project.size();
        MsmRuntime.LOGGER.info("[{}] B510 neighbours changed per bolt: vanilla copper {}, project {}", MsmRuntime.MOD_ID, v, p);
        helper.assertTrue(p >= 0.5 * v && p <= 2.0 * v, "neighbours changed per bolt: vanilla copper " + v + ", project " + p);
        helper.succeed();
    }

    @GameTest(structure = ARENA, maxTicks = 100)
    public void aStruckRodGoesToItsFirstStageAndARodsBlockIsScraped(GameTestHelper helper) {
        BlockState weathered = block("weathering2_weathered_bronze").defaultBlockState();
        floor(helper, weathered);
        // A project rod standing on the floor, struck: the rod goes back to its first stage, the floor around it is scraped.
        BlockPos rod = MIDDLE.above();
        helper.getLevel().setBlock(helper.absolutePos(rod), start("rod", "exposed_").setValue(BlockStateProperties.FACING, Direction.UP),
                2 | 16);
        strike(helper, rod.above());
        helper.runAfterDelay(2, () -> {
            BlockState struck = helper.getBlockState(rod);
            helper.assertTrue(struck.is(block("weathering2_tin_rod")) && struck.getValue(BlockStateProperties.FACING) == Direction.UP,
                    "the struck rod is " + struck);
            Map<String, String> changed = changes(helper, weathered);
            helper.assertFalse(changed.isEmpty(), "nothing under the project rod was scraped");
            // A walk may come back to a cell, so a cell can lose more than one stage.
            changed.values().forEach(v -> helper.assertTrue(v.equals("weathering2_exposed_bronze") || v.equals("weathering2_bronze"),
                    "a scraped cell " + changed));
            // Vanilla's lightning rod on the floor: the floor around the block it stands on is scraped too.
            floor(helper, weathered);
            helper.getLevel().setBlock(helper.absolutePos(rod), Blocks.LIGHTNING_ROD.weathering().unaffected().defaultBlockState(), 2 | 16);
            strike(helper, rod.above());
            helper.runAfterDelay(12, () -> {
                helper.assertTrue(helper.getBlockState(rod).is(Blocks.LIGHTNING_ROD.weathering().unaffected()), "vanilla's rod is "
                        + helper.getBlockState(rod));
                helper.assertFalse(changes(helper, weathered).isEmpty(), "nothing under vanilla's rod was scraped");
                helper.succeed();
            });
        });
    }

    @GameTest(structure = ARENA)
    public void waxedBlocksTheFirstStageAndOtherBlocksAreLeftAlone(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        RandomSource random = RandomSource.create(5100L);
        // A waxed floor: nothing changes.
        BlockState waxed = block("weathering2_waxed_oxidized_bronze").defaultBlockState();
        floor(helper, waxed);
        Lightning.strike(level, helper.absolutePos(MIDDLE), random);
        helper.assertTrue(changes(helper, waxed).isEmpty(), "a waxed floor changed: " + changes(helper, waxed));
        // A floor at the first stage: nothing changes.
        BlockState first = block("weathering2_bronze").defaultBlockState();
        floor(helper, first);
        Lightning.strike(level, helper.absolutePos(MIDDLE), random);
        helper.assertTrue(changes(helper, first).isEmpty(), "a first-stage floor changed: " + changes(helper, first));
        // Stone struck in a project floor: no walk starts.
        BlockState oxidized = block("weathering2_oxidized_bronze").defaultBlockState();
        floor(helper, oxidized);
        level.setBlock(helper.absolutePos(MIDDLE), Blocks.STONE.defaultBlockState(), 2 | 16);
        Lightning.strike(level, helper.absolutePos(MIDDLE), random);
        Map<String, String> stone = changes(helper, oxidized);
        helper.assertValueEqual(stone, Map.of("0,0", "stone"), "struck stone in a project floor");
        // Vanilla copper struck in a project floor: the project neighbours are scraped.
        level.setBlock(helper.absolutePos(MIDDLE), Blocks.COPPER_BLOCK.weathering().oxidized().defaultBlockState(), 2 | 16);
        Lightning.strike(level, helper.absolutePos(MIDDLE), random);
        Map<String, String> mixed = changes(helper, oxidized);
        helper.assertTrue(mixed.size() >= 2 && mixed.entrySet().stream().allMatch(e -> e.getKey().equals("0,0")
                || e.getValue().startsWith("weathering2_") && !e.getValue().contains("oxidized")),
                "struck vanilla copper in a project floor: " + mixed);
        helper.assertValueEqual(mixed.get("0,0"), "oxidized_copper", "the struck vanilla copper (vanilla's own bolt cleans it)");
        helper.succeed();
    }
}
