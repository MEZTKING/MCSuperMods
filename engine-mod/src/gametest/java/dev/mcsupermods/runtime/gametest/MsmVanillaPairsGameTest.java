package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.registry.BlockExtras;
import dev.mcsupermods.runtime.registry.VanillaPairs;
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
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Strip, flatten, till, wax, age and burn rules for vanilla blocks ({@code msm:vanilla_block_rules}, ADR 0105 D4; B514)
 * and {@code msm:flattenable} and {@code msm:tillable} on project blocks (D3), on {@code msm/msm_test/vanilla_block_rules/
 * vr_a.json} and {@code vr_b.json} and the blocks {@code vp_*} and {@code tools_dirt}. The rules name vanilla blocks no
 * other GameTest uses with tools or fire. Uses go through {@code ServerPlayerGameMode.useItemOn} with a mock survival
 * player, as the network handler does.
 */
public class MsmVanillaPairsGameTest {
    private static final BlockPos AT = new BlockPos(1, 1, 1);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static ServerPlayer player(GameTestHelper helper) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.setPos(helper.absoluteVec(new Vec3(0.5, 2, 0.5)));
        return player;
    }

    private static InteractionResult use(GameTestHelper helper, ServerPlayer player, ItemStack stack, BlockPos rel, Direction face) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        BlockPos abs = helper.absolutePos(rel);
        Vec3 hitAt = Vec3.atCenterOf(abs).add(face.getStepX() * 0.5, face.getStepY() * 0.5, face.getStepZ() * 0.5);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND),
                InteractionHand.MAIN_HAND, new BlockHitResult(hitAt, face, abs, false));
    }

    /** Sets {@code start} at {@link #AT} with air above, uses {@code stack} on its top and checks the block it became. */
    private static ServerPlayer tool(GameTestHelper helper, Block start, ItemStack stack, Block expected) {
        ServerPlayer player = player(helper);
        helper.setBlock(AT, start);
        helper.setBlock(AT.above(), Blocks.AIR);
        InteractionResult result = use(helper, player, stack, AT, Direction.UP);
        Block now = helper.getBlockState(AT).getBlock();
        helper.assertTrue(now == expected, BuiltInRegistries.BLOCK.getKey(start) + " with " + stack + " became "
                + BuiltInRegistries.BLOCK.getKey(now) + ", expected " + BuiltInRegistries.BLOCK.getKey(expected) + " (" + result + ")");
        return player;
    }

    private static Map<String, Integer> drops(GameTestHelper helper) {
        Map<String, Integer> found = new TreeMap<>();
        for (ItemEntity e : helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(AT)).inflate(2))) {
            found.merge(BuiltInRegistries.ITEM.getKey(e.getItem().getItem()).toString(), e.getItem().getCount(), Integer::sum);
            e.discard();
        }
        return found;
    }

    @GameTest
    public void anAxeShovelAndHoeChangeVanillaBlocksByTheRules(GameTestHelper helper) {
        // The later file (vr_b) wins for the bone block.
        ServerPlayer p = tool(helper, Blocks.BONE_BLOCK, new ItemStack(Items.IRON_AXE), block("vp_stripped"));
        helper.assertValueEqual(p.getMainHandItem().getDamageValue(), 1, "axe damage");
        tool(helper, Blocks.SNOW_BLOCK, new ItemStack(Items.IRON_SHOVEL), block("vp_flat"));
        drops(helper);
        tool(helper, Blocks.MYCELIUM, new ItemStack(Items.IRON_HOE), block("vp_tilled"));
        helper.assertValueEqual(drops(helper), Map.of("minecraft:brown_mushroom", 1), "tilling mycelium drops");
        // A rule for a block vanilla already pairs replaces vanilla's (coarse dirt would till into dirt).
        tool(helper, Blocks.COARSE_DIRT, new ItemStack(Items.IRON_HOE), block("vp_tilled"));
        // Vanilla's own pairs are untouched.
        tool(helper, Blocks.DIRT, new ItemStack(Items.IRON_HOE), Blocks.FARMLAND);
        tool(helper, Blocks.BIRCH_LOG, new ItemStack(Items.IRON_AXE), Blocks.STRIPPED_BIRCH_LOG);
        helper.succeed();
    }

    @GameTest
    public void flatteningAndTillingNeedAirAboveAndATopOrSideClick(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        helper.setBlock(AT, Blocks.SNOW_BLOCK);
        helper.setBlock(AT.above(), Blocks.STONE);
        use(helper, player, new ItemStack(Items.IRON_SHOVEL), AT, Direction.UP);
        helper.assertBlockPresent(Blocks.SNOW_BLOCK, AT);
        helper.setBlock(AT.above(), Blocks.AIR);
        helper.setBlock(AT, Blocks.MYCELIUM);
        use(helper, player, new ItemStack(Items.IRON_HOE), AT, Direction.DOWN);
        helper.assertBlockPresent(Blocks.MYCELIUM, AT);
        use(helper, player, new ItemStack(Items.IRON_HOE), AT, Direction.NORTH);
        helper.assertBlockPresent(block("vp_tilled"), AT);
        drops(helper);
        helper.succeed();
    }

    @GameTest
    public void honeycombWaxesAVanillaBlockAndAnAxeTurnsItBack(GameTestHelper helper) {
        ServerPlayer player = tool(helper, Blocks.CALCITE, new ItemStack(Items.HONEYCOMB, 2), block("vp_waxed"));
        helper.assertValueEqual(player.getMainHandItem().getCount(), 1, "honeycomb left");
        tool(helper, block("vp_waxed"), new ItemStack(Items.IRON_AXE), Blocks.CALCITE);
        // Vanilla copper still waxes as vanilla's.
        tool(helper, Blocks.COPPER_BLOCK.weathering().unaffected(), new ItemStack(Items.HONEYCOMB), Blocks.COPPER_BLOCK.waxed().unaffected());
        helper.succeed();
    }

    @GameTest
    public void projectBlocksFlattenAndTillByTheirComponentsWhichWinOverARulesFile(GameTestHelper helper) {
        tool(helper, block("tools_dirt"), new ItemStack(Items.IRON_SHOVEL), block("vp_flat"));
        drops(helper);
        tool(helper, block("tools_dirt"), new ItemStack(Items.IRON_HOE), block("vp_tilled"));
        helper.assertValueEqual(drops(helper), Map.of("minecraft:stick", 1), "tilling tools_dirt drops");
        helper.assertValueEqual(BlockExtras.changedInto(BlockExtras.Change.FLATTEN, block("tools_dirt")).orElse(null), id("vp_flat"),
                "the component's flatten target");
        helper.succeed();
    }

    @GameTest
    public void rulesFilesReportReplacedSkippedAndUnavailableRules(GameTestHelper helper) {
        List<String> warnings = MsmRuntime.report().warnings();
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("vanilla_block_rules/vr_b.json") && w.contains("minecraft:bone_block")
                && w.contains("replaces") && w.contains("vr_a.json")), "no warning for the replaced strip rule: " + warnings);
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("vr_a.json") && w.contains("msm_test:no_such_block")
                && w.contains("not a registered block")), "no warning for the unknown block: " + warnings);
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("vr_a.json") && w.contains("msm_test:tools_dirt")
                && w.contains("msm:flattenable")), "no warning for the rule a component overrides: " + warnings);
        boolean ageWarned = warnings.stream().anyMatch(w -> w.contains("vr_a.json") && w.contains("minecraft:oxidized_copper_grate")
                && w.contains("not on this Minecraft version"));
        helper.assertValueEqual(ageWarned, !VanillaPairs.agesVanillaBlocks(), "the age warning on a version that cannot age vanilla blocks");
        helper.assertFalse(MsmRuntime.report().errors().stream().anyMatch(e -> e.contains("vanilla_block_rules/")),
                "rules errors: " + MsmRuntime.report().errors());
        helper.assertTrue(BlockExtras.lateWarnings().isEmpty(), "unknown targets after start-up: " + BlockExtras.lateWarnings());
        // strip 2 (one replaced, both used) + flatten 1 + till 2 + wax 1 + burn 1 (+ age 1 where it works),
        // and the sim_parity fixture's tool_rules (strip, flatten, till and wax: 4).
        helper.assertValueEqual(BlockExtras.rulesUsed(), VanillaPairs.agesVanillaBlocks() ? 12 : 11, "rules used");
        helper.succeed();
    }

    @GameTest(maxTicks = 40)
    public void aVanillaBlockBurnsAtTheGivenRates(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        for (Block target : new Block[] {Blocks.SMOOTH_BASALT, Blocks.COBBLESTONE}) {
            BlockPos below = target == Blocks.SMOOTH_BASALT ? new BlockPos(1, 1, 1) : new BlockPos(5, 1, 5);
            BlockPos fire = below.above();
            helper.setBlock(below, target);
            RandomSource random = RandomSource.create(11L);
            int k = 0;
            for (; k < 3000 && helper.getBlockState(below).is(target); k++) {
                if (!helper.getBlockState(fire).is(Blocks.FIRE)) {
                    helper.setBlock(fire, Blocks.FIRE);
                }
                helper.getBlockState(fire).tick(level, helper.absolutePos(fire), random);
            }
            boolean burnt = !helper.getBlockState(below).is(target);
            helper.assertValueEqual(burnt, target == Blocks.SMOOTH_BASALT, BuiltInRegistries.BLOCK.getKey(target) + " burnt after " + k + " fire ticks");
            helper.setBlock(fire, Blocks.AIR);
        }
        helper.succeed();
    }

    @GameTest(maxTicks = 40)
    public void aVanillaCopperBlockAgesIntoTheNextStageWhereTheVersionAllows(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockState grate = Blocks.COPPER_GRATE.weathering().oxidized().defaultBlockState();
        if (!VanillaPairs.agesVanillaBlocks()) {
            helper.assertFalse(grate.isRandomlyTicking(), "26.4: the last copper stage ticks");
            helper.succeed();
            return;
        }
        helper.assertTrue(grate.isRandomlyTicking(), "the oxidized grate does not random-tick");
        BlockPos abs = helper.absolutePos(AT);
        RandomSource random = RandomSource.create(7L);
        Block into = null;
        for (int k = 0; k < 20000 && into == null; k++) {
            level.setBlock(abs, grate, 2 | 16);
            grate.randomTick(level, abs, random);
            if (level.getBlockState(abs) != grate) {
                into = level.getBlockState(abs).getBlock();
            }
        }
        helper.assertTrue(into == block("vp_ancient"), "the oxidized grate aged into " + into);
        helper.succeed();
    }
}
