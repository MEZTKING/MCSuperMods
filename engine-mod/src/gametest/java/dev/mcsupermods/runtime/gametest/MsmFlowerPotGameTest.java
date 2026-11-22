package dev.mcsupermods.runtime.gametest;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.DefinitionParser;
import dev.mcsupermods.runtime.registry.types.MsmFlowerPotBlock;
import dev.mcsupermods.runtime.registry.types.PlantTypes;
import dev.mcsupermods.runtime.registry.types.PotTypes;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.stats.Stats;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FlowerPotBlock;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for project flower pots (ADR 0103 D2 and its amendment after B503, X4) on {@code msm/msm_test/block/pot_*}:
 * the pot is its own class with its own map and vanilla's pot keeps its map; a vanilla plant (poppy) and a project plant
 * ({@code type_sapling}) go into the project pot and come out; every use is compared with the same use of vanilla's pot
 * (the result, the block left, the hand and the "flowers potted" statistic), in survival and creative; breaking drops the
 * pot's loot; and the refusals of a second potted block for one plant and of a {@code pot} that is not a project pot.
 *
 * <p>Uses go through {@code ServerPlayerGameMode.useItemOn}, as the network handler does.
 */
public class MsmFlowerPotGameTest {
    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static ServerPlayer player(GameTestHelper helper, GameType mode) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(mode);
        player.setPos(helper.absoluteVec(new Vec3(2.5, 2, 5.5)));
        return player;
    }

    private static InteractionResult use(GameTestHelper helper, ServerPlayer player, BlockPos rel, ItemStack stack) {
        player.getInventory().clearContent();
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        BlockPos abs = helper.absolutePos(rel);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs).add(0, 0.5, 0), Direction.UP, abs, false);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND),
                InteractionHand.MAIN_HAND, hit);
    }

    private static int potted(ServerPlayer player) {
        return player.getStats().getValue(Stats.CUSTOM.get(Stats.POT_FLOWER));
    }

    /** Every item the player holds, with counts, as text. */
    private static String inventory(ServerPlayer player) {
        Map<String, Integer> items = new TreeMap<>();
        for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
            ItemStack s = player.getInventory().getItem(i);
            if (!s.isEmpty()) {
                items.merge(BuiltInRegistries.ITEM.getKey(s.getItem()).toString(), s.getCount(), Integer::sum);
            }
        }
        return items.toString();
    }

    private static Map<String, Integer> collectDrops(GameTestHelper helper, BlockPos rel) {
        Map<String, Integer> found = new TreeMap<>();
        for (ItemEntity e : helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(rel)).inflate(2))) {
            found.merge(BuiltInRegistries.ITEM.getKey(e.getItem().getItem()).toString(), e.getItem().getCount(), Integer::sum);
            e.discard();
        }
        return found;
    }

    @GameTest
    public void projectPotIsItsOwnClassAndLeavesVanillasPotAlone(GameTestHelper helper) {
        Block pot = block("pot_clay");
        helper.assertTrue(pot instanceof MsmFlowerPotBlock p && p.isEmptyPot(), "pot_clay is " + pot);
        helper.assertFalse(pot instanceof FlowerPotBlock, "the project pot is a vanilla FlowerPotBlock");
        MsmFlowerPotBlock clay = (MsmFlowerPotBlock) pot;
        helper.assertValueEqual(clay.pottedPlants().size(), 3, "plants in the pot's map " + clay.pottedPlants());
        helper.assertTrue(clay.pottedFor(Blocks.ALLIUM).orElseThrow() == block("pot_clay_allium"), "the listed allium's potted block");
        helper.assertTrue(clay.pottedFor(Blocks.POPPY).orElseThrow() == block("pot_clay_poppy"), "the poppy's potted block");
        helper.assertTrue(clay.pottedFor(block("type_sapling")).orElseThrow() == block("pot_clay_type_sapling"), "the sapling's potted block");
        helper.assertTrue(block("pot_clay_poppy") instanceof MsmFlowerPotBlock p && p.plant() == Blocks.POPPY && p.emptyPot() == clay,
                "pot_clay_poppy");
        helper.assertFalse(block("pot_clay_poppy") instanceof FlowerPotBlock, "the potted block is a vanilla FlowerPotBlock");
        // Vanilla's pot keeps its own poppy, and a vanilla pot still takes a poppy into vanilla's potted poppy.
        helper.assertTrue(((FlowerPotBlock) Blocks.POTTED_POPPY).getPotted() == Blocks.POPPY, "vanilla's potted poppy changed");
        BlockPos at = new BlockPos(2, 2, 2);
        helper.setBlock(at.below(), Blocks.STONE);
        helper.setBlock(at, Blocks.FLOWER_POT);
        use(helper, player(helper, GameType.SURVIVAL), at, new ItemStack(Items.POPPY));
        helper.assertBlockPresent(Blocks.POTTED_POPPY, at);
        // A dandelion is not listed: the project pot has no block for it.
        helper.assertTrue(clay.pottedFor(Blocks.DANDELION).isEmpty(), "the project pot takes a dandelion");
        helper.succeed();
    }

    @GameTest
    public void aVanillaAndAProjectPlantGoInAndComeOut(GameTestHelper helper) {
        for (String pot : List.of("pot_clay", "pot_listed")) {
            goInAndComeOut(helper, pot);
        }
        helper.succeed();
    }

    /** A poppy and the project sapling into {@code pot} and out; their potted blocks are {@code <pot>_<plant path>}. */
    private static void goInAndComeOut(GameTestHelper helper, String pot) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        BlockPos at = new BlockPos(2, 2, 2);
        helper.setBlock(at.below(), Blocks.STONE);
        for (String[] pair : List.of(new String[] {pot + "_poppy", "minecraft:poppy"}, new String[] {pot + "_type_sapling",
                "msm_test:type_sapling"})) {
            Item plant = BuiltInRegistries.ITEM.getValue(Identifier.parse(pair[1]));
            helper.setBlock(at, block(pot));
            int before = potted(player);
            InteractionResult put = use(helper, player, at, new ItemStack(plant, 2));
            helper.assertTrue(put.consumesAction(), "putting " + pair[1] + ": " + put);
            helper.assertBlockPresent(block(pair[0]), at);
            helper.assertValueEqual(player.getMainHandItem().getCount(), 1, pair[1] + " left in the hand");
            ItemStack picked = helper.getBlockState(at).getCloneItemStack(helper.getLevel(), helper.absolutePos(at), false);
            helper.assertTrue(picked.is(plant), "pick block on the potted " + pair[1] + " gave " + picked);
            InteractionResult take = use(helper, player, at, ItemStack.EMPTY);
            helper.assertTrue(take.consumesAction(), "taking " + pair[1] + ": " + take);
            helper.assertBlockPresent(block(pot), at);
            helper.assertTrue(player.getMainHandItem().is(plant), "the plant did not come back: " + player.getMainHandItem());
            helper.assertValueEqual(potted(player) - before, 1, "flowers potted for " + pair[1] + " (only putting in counts)");
        }
        ItemStack picked = helper.getBlockState(at).getCloneItemStack(helper.getLevel(), helper.absolutePos(at), false);
        helper.assertTrue(picked.is(block(pot).asItem()), "pick block on the empty " + pot + " gave " + picked);
    }

    /** What one use leaves: the result, the block (as empty, potted or other), the hand and the statistic. */
    private static String outcome(GameTestHelper helper, ServerPlayer player, BlockPos at, Block empty, Block full, ItemStack stack) {
        int before = potted(player);
        InteractionResult result = use(helper, player, at, stack);
        Block now = helper.getBlockState(at).getBlock();
        String role = now == empty ? "empty" : now == full ? "potted" : BuiltInRegistries.BLOCK.getKey(now).toString();
        return "consumes " + result.consumesAction() + ", " + role + ", inventory " + inventory(player) + ", potted +"
                + (potted(player) - before);
    }

    @GameTest
    public void everyUseMatchesVanillasPot(GameTestHelper helper) {
        List<String> differences = new ArrayList<>();
        usesMatchVanillasPot(helper, "pot_clay", differences);
        MsmRuntime.LOGGER.info("[{}] B510 pot uses compared with vanilla's pot: {} difference(s)", MsmRuntime.MOD_ID, differences.size());
        helper.assertTrue(differences.isEmpty(), "the project pot differs from vanilla's: " + differences);
        helper.succeed();
    }

    /**
     * A pot with only {@code plants} (no {@code potted_plant} elements; B510b): its companions {@code pot_listed_poppy} and
     * {@code pot_listed_type_sapling} are registered by the runtime (the sapling's after the pot, when the sapling
     * registers), carry no item, drop the pot's loot, and every use matches vanilla's pot.
     */
    @GameTest
    public void aPotWithOnlyPlantsGetsItsCompanionsAndMatchesVanillasPot(GameTestHelper helper) {
        MsmFlowerPotBlock listed = (MsmFlowerPotBlock) block("pot_listed");
        helper.assertValueEqual(listed.pottedPlants().size(), 2, "plants in the listed pot's map " + listed.pottedPlants());
        for (String[] pair : List.of(new String[] {"pot_listed_poppy", "minecraft:poppy"},
                new String[] {"pot_listed_type_sapling", "msm_test:type_sapling"})) {
            Block companion = block(pair[0]);
            Block plant = BuiltInRegistries.BLOCK.getValue(Identifier.parse(pair[1]));
            helper.assertTrue(companion instanceof MsmFlowerPotBlock p && p.plant() == plant && p.emptyPot() == listed
                    && PotTypes.isListedCompanion(p), pair[0] + " is " + companion);
            helper.assertTrue(listed.pottedFor(plant).orElseThrow() == companion, "the map's block for " + pair[1]);
            helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id(pair[0])), pair[0] + " has an item");
        }
        helper.assertTrue(((FlowerPotBlock) Blocks.POTTED_POPPY).getPotted() == Blocks.POPPY, "vanilla's potted poppy changed");
        goInAndComeOut(helper, "pot_listed");
        List<String> differences = new ArrayList<>();
        usesMatchVanillasPot(helper, "pot_listed", differences);
        helper.assertTrue(differences.isEmpty(), "the listed pot differs from vanilla's: " + differences);
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        BlockPos at = new BlockPos(2, 2, 2);
        helper.setBlock(at, block("pot_listed_poppy"));
        helper.assertTrue(player.gameMode.destroyBlock(helper.absolutePos(at)), "the listed potted poppy was not broken");
        helper.assertValueEqual(collectDrops(helper, at), Map.of("msm_test:pot_listed", 1, "minecraft:poppy", 1), "listed potted poppy drops");
        helper.succeed();
    }

    /** Every use of {@code pot} (empty, and with its poppy) beside the same use of vanilla's pot, in survival and creative. */
    private static void usesMatchVanillasPot(GameTestHelper helper, String pot, List<String> differences) {
        BlockPos at = new BlockPos(2, 2, 2);
        helper.setBlock(at.below(), Blocks.STONE);
        Block clay = block(pot);
        Block clayPoppy = block(pot + "_poppy");
        Item sapling = block("type_sapling").asItem();
        for (GameType mode : List.of(GameType.SURVIVAL, GameType.CREATIVE)) {
            ServerPlayer player = player(helper, mode);
            // Each case: the start (empty or potted), what the hand holds in vanilla's and in the project's pot. A plant the
            // pot takes is the poppy in vanilla's pot and the sapling in the project's.
            record Case(String name, boolean full, ItemStack vanilla, ItemStack project) {}
            List<Case> cases = List.of(
                    new Case("empty + its plant", false, new ItemStack(Items.POPPY, 2), new ItemStack(Items.POPPY, 2)),
                    new Case("empty + stone", false, new ItemStack(Items.STONE, 2), new ItemStack(Items.STONE, 2)),
                    new Case("empty + stick", false, new ItemStack(Items.STICK), new ItemStack(Items.STICK)),
                    new Case("empty + empty hand", false, ItemStack.EMPTY, ItemStack.EMPTY),
                    new Case("potted + empty hand", true, ItemStack.EMPTY, ItemStack.EMPTY),
                    new Case("potted + another plant it takes", true, new ItemStack(Items.DANDELION), new ItemStack(sapling)),
                    new Case("potted + stone", true, new ItemStack(Items.STONE), new ItemStack(Items.STONE)));
            for (Case c : cases) {
                helper.setBlock(at, c.full() ? Blocks.POTTED_POPPY : Blocks.FLOWER_POT);
                String vanilla = outcome(helper, player, at, Blocks.FLOWER_POT, Blocks.POTTED_POPPY, c.vanilla().copy());
                helper.setBlock(at, c.full() ? clayPoppy : clay);
                String project = outcome(helper, player, at, clay, clayPoppy, c.project().copy());
                // The other plant differs by name only: compare its count.
                String projectAsVanilla = project.replace("msm_test:type_sapling", "minecraft:dandelion");
                if (!projectAsVanilla.equals(vanilla)) {
                    differences.add(pot + " " + mode + " " + c.name() + ": vanilla " + vanilla + "; project " + project);
                }
            }
        }
    }

    @GameTest
    public void breakingDropsThePotAndThePlant(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        BlockPos at = new BlockPos(2, 2, 2);
        helper.setBlock(at.below(), Blocks.STONE);
        helper.setBlock(at, block("pot_clay_poppy"));
        helper.assertTrue(player.gameMode.destroyBlock(helper.absolutePos(at)), "the potted poppy was not broken");
        helper.assertValueEqual(collectDrops(helper, at), Map.of("msm_test:pot_clay", 1, "minecraft:poppy", 1), "potted poppy drops");
        helper.setBlock(at, block("pot_clay"));
        helper.assertTrue(player.gameMode.destroyBlock(helper.absolutePos(at)), "the pot was not broken");
        helper.assertValueEqual(collectDrops(helper, at), Map.of("msm_test:pot_clay", 1), "empty pot drops");
        helper.succeed();
    }

    /**
     * The potted blocks a project pot refuses (made in place, as the registrar would, so no load error is left in the shared
     * report): a second one for a plant the pot already holds, a {@code pot} that is no project pot (a fence, vanilla's
     * potted poppy, an unknown id), a missing plant and a two-block plant. Nothing is added to the pot's map.
     */
    @GameTest
    public void aSecondPottedBlockAndAPotThatIsNoPotAreRefused(GameTestHelper helper) {
        String noPot = "is not a registered project flower_pot";
        List<String[]> refusals = List.of(
                new String[] {"minecraft:poppy", "msm_test:pot_clay", "is already potted in msm_test:pot_clay by msm_test:pot_clay_poppy"},
                new String[] {"minecraft:dandelion", "msm_test:weathering2_tin_fence", noPot},
                new String[] {"minecraft:dandelion", "minecraft:potted_poppy", noPot},
                new String[] {"minecraft:dandelion", "msm_test:no_such_pot", noPot},
                new String[] {"msm_test:no_such_plant", "msm_test:pot_clay", "is not a registered block"},
                new String[] {"minecraft:rose_bush", "msm_test:pot_clay", "is two blocks high"},
                new String[] {"minecraft:poppy", "msm_test:pot_listed", "by msm_test:pot_listed_poppy (the pot lists it in plants)"},
                new String[] {"minecraft:allium", "msm_test:pot_clay", "by msm_test:pot_clay_allium (the pot lists it in plants)"});
        MsmFlowerPotBlock clay = (MsmFlowerPotBlock) block("pot_clay");
        for (String[] r : refusals) {
            JsonObject json = JsonParser.parseString("{\"format\": 1, \"type\": \"potted_plant\", \"plant\": \"" + r[0]
                    + "\", \"pot\": \"" + r[1] + "\"}").getAsJsonObject();
            BlockDefinition def = DefinitionParser.parseBlock(json).definition().orElseThrow();
            try {
                PlantTypes.create(id("pot_refused"), def, BlockBehaviour.Properties.of(), w -> {});
                helper.fail("potting " + r[0] + " in " + r[1] + " was not refused");
            } catch (IllegalArgumentException refused) {
                helper.assertTrue(refused.getMessage().contains(r[2]), r[0] + " in " + r[1] + ": " + refused.getMessage());
            }
        }
        helper.assertValueEqual(clay.pottedPlants().size(), 3, "the pot's map after the refusals " + clay.pottedPlants());
        helper.assertValueEqual(((MsmFlowerPotBlock) block("pot_listed")).pottedPlants().size(), 2, "the listed pot's map after the refusals");
        helper.assertTrue(clay.pottedFor(Blocks.POPPY).orElseThrow() == block("pot_clay_poppy"), "the poppy's potted block changed");
        helper.succeed();
    }
}
