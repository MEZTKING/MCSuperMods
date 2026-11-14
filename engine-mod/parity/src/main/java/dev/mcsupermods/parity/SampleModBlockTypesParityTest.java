package dev.mcsupermods.parity;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.BoneMealItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity over the block types and plants of {@code fixtures/sample-mod} (ADRs 0067 to 0069, B278), written
 * against vanilla and Fabric API only, so the same tests run against the content jar (the runtime's classes) and the
 * ejected jar (the generated ones). The sample's sets come from the Creator flows: the {@code maple} wood set (log,
 * wood and their stripped forms, planks, stairs, slab, fence, fence gate, door, trapdoor, button, pressure plate,
 * leaves, sapling and the tree {@code maple_tree}), the {@code ruby_bricks} stone set (the stone with its stairs, slab
 * and wall, a stone pickaxe or better) and the {@code ruby_berries} crop (block {@code ruby_berries_crop}, item
 * {@code ruby_berries_seeds}, produce {@code ruby_berries}, maximum age 7).
 *
 * <p>Each behaviour is observed through vanilla: block states set and tested with the {@code setblock} and
 * {@code execute if block} commands (their state names are the format's), loot through {@code Block.getDrops}, item
 * entities after a player breaks a block, vanilla tags, and a mock server player's use of an item on a block through
 * {@code ServerPlayerGameMode.useItemOn}, which runs Fabric's {@code UseBlockCallback} as a real click does (the axe
 * stripping of both jars is that callback). Checks after something changes the world wait a tick, as a block change
 * by a feature or a neighbour update may land after the call. Run with
 * {@code --gametest-filter msm_parity_tests:sample_mod_*} (this class's ids start {@code sample_mod_block_types_}).
 */
public class SampleModBlockTypesParityTest {
    private static final String NAMESPACE = "msm_sample_mod";
    private static final BlockPos AT = new BlockPos(2, 1, 2);
    /** Where {@link #ifBlock} places its gold block when the test passes; away from {@link #AT}. */
    private static final BlockPos MARKER = new BlockPos(0, 1, 4);
    /** Where mock players stand, clear of the blocks they place. */
    private static final Vec3 STAND = new Vec3(0.5, 1, 0.5);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NAMESPACE, path);
    }

    private static Block block(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.BLOCK.containsKey(id(path)), "block " + id(path) + " is not registered");
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static Item item(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(id(path)), "item " + id(path) + " is not registered");
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    private static String coords(GameTestHelper helper, BlockPos rel) {
        BlockPos abs = helper.absolutePos(rel);
        return abs.getX() + " " + abs.getY() + " " + abs.getZ();
    }

    /** Runs a command as the server in the test's level and returns its result (0 when it failed or did not parse). */
    private static int command(GameTestHelper helper, String command) {
        MinecraftServer server = helper.getLevel().getServer();
        AtomicInteger result = new AtomicInteger();
        CommandSourceStack source = server.createCommandSourceStack()
                .withLevel(helper.getLevel())
                .withSuppressedOutput()
                .withCallback((success, value) -> result.set(success ? Math.max(value, 1) : 0));
        server.getCommands().performPrefixedCommand(source, command);
        return result.get();
    }

    /** {@code setblock} of a project block with its block state, as a player would type it. */
    private static void setblock(GameTestHelper helper, BlockPos rel, String blockAndState) {
        int result = command(helper, "setblock " + coords(helper, rel) + " " + blockAndState);
        helper.assertTrue(result > 0, "setblock " + blockAndState + " failed");
    }

    /**
     * Whether {@code execute if block} matches: the command places a gold block at {@link #MARKER} only when the block
     * at {@code rel} matches {@code predicate}, so an unknown block or state name also reads as false.
     */
    private static boolean ifBlock(GameTestHelper helper, BlockPos rel, String predicate) {
        helper.setBlock(MARKER, Blocks.AIR);
        command(helper, "execute if block " + coords(helper, rel) + " " + predicate + " run setblock "
                + coords(helper, MARKER) + " minecraft:gold_block");
        boolean matched = helper.getBlockState(MARKER).is(Blocks.GOLD_BLOCK);
        helper.setBlock(MARKER, Blocks.AIR);
        return matched;
    }

    private static void assertIfBlock(GameTestHelper helper, BlockPos rel, String predicate) {
        helper.assertTrue(ifBlock(helper, rel, predicate), "execute if block " + predicate + " did not match: "
                + helper.getBlockState(rel));
    }

    private static void assertNotIfBlock(GameTestHelper helper, BlockPos rel, String predicate) {
        helper.assertFalse(ifBlock(helper, rel, predicate), "execute if block " + predicate + " matched");
    }

    /** The value of the property named {@code name}, as its serialised name. */
    private static String value(GameTestHelper helper, BlockState state, String name) {
        Property<?> property = state.getBlock().getStateDefinition().getProperty(name);
        helper.assertTrue(property != null, state.getBlock() + " has no property " + name);
        return valueName(property, state);
    }

    private static <T extends Comparable<T>> String valueName(Property<T> property, BlockState state) {
        return property.getName(state.getValue(property));
    }

    private static ServerPlayer player(GameTestHelper helper, GameType mode) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(mode);
        player.setPos(helper.absoluteVec(STAND));
        return player;
    }

    /** The player clicks the top face of the block at {@code rel} with {@code stack} in the main hand, as a block item does. */
    private static InteractionResult useOnTop(GameTestHelper helper, ServerPlayer player, ItemStack stack, BlockPos rel) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        BlockPos abs = helper.absolutePos(rel);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs).add(0, 0.5, 0), Direction.UP, abs, false);
        return stack.useOn(new UseOnContext(player, InteractionHand.MAIN_HAND, hit));
    }

    /** The player right-clicks the block at {@code rel} (its north face) through the game mode, firing Fabric's callbacks. */
    private static InteractionResult click(GameTestHelper helper, ServerPlayer player, ItemStack stack, BlockPos rel) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        BlockPos abs = helper.absolutePos(rel);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs).add(0, 0, -0.5), Direction.NORTH, abs, false);
        return player.gameMode.useItemOn(player, helper.getLevel(), stack, InteractionHand.MAIN_HAND, hit);
    }

    private static int countDrops(List<ItemStack> drops, Item item) {
        int n = 0;
        for (ItemStack stack : drops) {
            if (stack.is(item)) {
                n += stack.getCount();
            }
        }
        return n;
    }

    private static List<ItemStack> drops(GameTestHelper helper, BlockState state, ItemStack tool) {
        return Block.getDrops(state, helper.getLevel(), helper.absolutePos(AT), null, null, tool);
    }

    private static int itemEntities(GameTestHelper helper, Item item) {
        int n = 0;
        for (ItemEntity entity : helper.getLevel().getEntitiesOfClass(ItemEntity.class,
                new AABB(helper.absolutePos(AT)).inflate(3), e -> e.getItem().is(item))) {
            n += entity.getItem().getCount();
        }
        return n;
    }

    private static void floor(GameTestHelper helper, Block block) {
        for (int x = 0; x < 5; x++) {
            for (int z = 0; z < 5; z++) {
                helper.setBlock(new BlockPos(x, 0, z), block);
            }
        }
    }

    // Registration, items and tags (ADR 0067 D6, ADR 0068 D2)

    /** Every member is registered; the crop's item is its seeds, not an item named after the block. */
    @GameTest
    public void membersAndItemIds(GameTestHelper helper) {
        for (String path : List.of("maple_log", "maple_wood", "stripped_maple_log", "stripped_maple_wood", "maple_planks",
                "maple_stairs", "maple_slab", "maple_fence", "maple_fence_gate", "maple_door", "maple_trapdoor",
                "maple_button", "maple_pressure_plate", "maple_leaves", "maple_sapling", "ruby_bricks",
                "ruby_bricks_stairs", "ruby_bricks_slab", "ruby_bricks_wall", "ruby_berries_crop")) {
            block(helper, path);
        }
        Item seeds = item(helper, "ruby_berries_seeds");
        helper.assertTrue(seeds instanceof BlockItem blockItem && blockItem.getBlock() == block(helper, "ruby_berries_crop"),
                "ruby_berries_seeds does not place ruby_berries_crop");
        helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id("ruby_berries_crop")), "the crop block has an item of its own id");
        FoodProperties food = new ItemStack(item(helper, "ruby_berries")).get(DataComponents.FOOD);
        helper.assertTrue(food != null && food.nutrition() == 3, "ruby_berries food " + food);
        Item door = item(helper, "maple_door");
        helper.assertTrue(door instanceof BlockItem blockItem && blockItem.getBlock() == block(helper, "maple_door"),
                "maple_door item does not place the door");
        helper.succeed();
    }

    /** The type tags from lowering and the set's own tags, as vanilla's oak set and wheat have them. */
    @GameTest
    public void vanillaTags(GameTestHelper helper) {
        helper.assertTrue(block(helper, "maple_log").defaultBlockState().is(BlockTags.LOGS), "maple_log not in #logs");
        helper.assertTrue(new ItemStack(item(helper, "maple_log")).is(ItemTags.LOGS_THAT_BURN), "maple_log not in item #logs_that_burn");
        helper.assertTrue(new ItemStack(item(helper, "maple_planks")).is(ItemTags.PLANKS), "maple_planks not in #planks");
        helper.assertTrue(new ItemStack(item(helper, "maple_stairs")).is(ItemTags.WOODEN_STAIRS), "maple_stairs not in #wooden_stairs");
        helper.assertTrue(new ItemStack(item(helper, "maple_slab")).is(ItemTags.WOODEN_SLABS), "maple_slab not in #wooden_slabs");
        helper.assertTrue(block(helper, "maple_fence").defaultBlockState().is(BlockTags.WOODEN_FENCES), "maple_fence not in #wooden_fences");
        helper.assertTrue(block(helper, "maple_door").defaultBlockState().is(BlockTags.WOODEN_DOORS), "maple_door not in #wooden_doors");
        helper.assertTrue(block(helper, "maple_leaves").defaultBlockState().is(BlockTags.LEAVES), "maple_leaves not in #leaves");
        helper.assertTrue(block(helper, "maple_sapling").defaultBlockState().is(BlockTags.SAPLINGS), "maple_sapling not in #saplings");
        helper.assertTrue(block(helper, "ruby_bricks_wall").defaultBlockState().is(BlockTags.WALLS), "ruby_bricks_wall not in #walls");
        helper.assertTrue(block(helper, "ruby_bricks_stairs").defaultBlockState().is(BlockTags.STAIRS), "ruby_bricks_stairs not in #stairs");
        helper.assertTrue(block(helper, "ruby_berries_crop").defaultBlockState().is(BlockTags.CROPS), "ruby_berries_crop not in #crops");
        helper.assertTrue(new ItemStack(item(helper, "ruby_berries_seeds")).is(ItemTags.VILLAGER_PLANTABLE_SEEDS),
                "ruby_berries_seeds not in #villager_plantable_seeds");
        helper.succeed();
    }

    /** Lava ignites the wooden members ({@code msm:flammable}, doors with odds 0 and 0), never the stone ones. */
    @GameTest
    public void lavaIgnitesWoodNotStone(GameTestHelper helper) {
        for (String path : List.of("maple_log", "maple_planks", "maple_fence", "maple_door", "maple_trapdoor", "maple_leaves")) {
            helper.assertTrue(block(helper, path).defaultBlockState().ignitedByLava(), path + " is not ignited by lava");
        }
        for (String path : List.of("ruby_bricks", "ruby_bricks_wall")) {
            helper.assertFalse(block(helper, path).defaultBlockState().ignitedByLava(), path + " is ignited by lava");
        }
        helper.succeed();
    }

    // Placement states (ADR 0067 D2)

    /** Stairs, slab, log and trapdoor states set by {@code setblock} and matched by {@code execute if block}. */
    @GameTest
    public void placementStatesThroughCommands(GameTestHelper helper) {
        setblock(helper, AT, NAMESPACE + ":maple_stairs[facing=east,half=top]");
        assertIfBlock(helper, AT, NAMESPACE + ":maple_stairs[facing=east,half=top,shape=straight]");
        assertNotIfBlock(helper, AT, NAMESPACE + ":maple_stairs[facing=west]");
        setblock(helper, AT, NAMESPACE + ":ruby_bricks_stairs[facing=north,half=bottom]");
        assertIfBlock(helper, AT, NAMESPACE + ":ruby_bricks_stairs[facing=north,half=bottom]");
        setblock(helper, AT, NAMESPACE + ":maple_log[axis=x]");
        assertIfBlock(helper, AT, NAMESPACE + ":maple_log[axis=x]");
        assertNotIfBlock(helper, AT, NAMESPACE + ":maple_log[axis=y]");
        setblock(helper, AT, NAMESPACE + ":maple_slab[type=top]");
        assertIfBlock(helper, AT, NAMESPACE + ":maple_slab[type=top]");
        setblock(helper, AT, NAMESPACE + ":maple_trapdoor[facing=south,half=top,open=true]");
        assertIfBlock(helper, AT, NAMESPACE + ":maple_trapdoor[facing=south,half=top,open=true]");
        setblock(helper, AT, NAMESPACE + ":ruby_berries_crop[age=5]");
        assertIfBlock(helper, AT, NAMESPACE + ":ruby_berries_crop[age=5]");
        assertNotIfBlock(helper, AT, NAMESPACE + ":ruby_berries_crop[age=8]");
        helper.succeed();
    }

    /** A slab placed on a bottom slab of its kind makes a double slab, which drops two; the stone slab needs a pickaxe. */
    @GameTest
    public void slabDoublesAndDropsTwo(GameTestHelper helper) {
        Item slab = item(helper, "maple_slab");
        setblock(helper, AT, NAMESPACE + ":maple_slab[type=bottom]");
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        helper.assertTrue(useOnTop(helper, player, new ItemStack(slab), AT).consumesAction(), "placing a slab on a slab failed");
        assertIfBlock(helper, AT, NAMESPACE + ":maple_slab[type=double]");
        helper.assertValueEqual(countDrops(drops(helper, helper.getBlockState(AT), new ItemStack(Items.IRON_AXE)), slab), 2,
                "double maple slab drops");
        helper.assertValueEqual(countDrops(drops(helper, block(helper, "maple_slab").defaultBlockState(), ItemStack.EMPTY), slab), 1,
                "bottom maple slab drops");

        Item stoneSlab = item(helper, "ruby_bricks_slab");
        setblock(helper, AT, NAMESPACE + ":ruby_bricks_slab[type=double]");
        BlockState state = helper.getBlockState(AT);
        helper.assertValueEqual(countDrops(drops(helper, state, new ItemStack(Items.STONE_PICKAXE)), stoneSlab), 2,
                "double ruby bricks slab drops");
        helper.assertTrue(state.requiresCorrectToolForDrops(), "ruby_bricks_slab drops by hand");
        helper.assertTrue(new ItemStack(Items.STONE_PICKAXE).isCorrectToolForDrops(state), "a stone pickaxe cannot mine ruby_bricks_slab");
        helper.assertFalse(new ItemStack(Items.WOODEN_PICKAXE).isCorrectToolForDrops(state), "a wooden pickaxe mines ruby_bricks_slab");
        helper.succeed();
    }

    // Doors (ADR 0067 D5)

    /** The door item places both halves; breaking the lower half removes both and drops one door. */
    @GameTest(maxTicks = 40)
    public void doorHalvesPlaceAndBreakTogether(GameTestHelper helper) {
        floor(helper, Blocks.STONE);
        Item door = item(helper, "maple_door");
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        helper.assertTrue(useOnTop(helper, player, new ItemStack(door), AT.below()).consumesAction(), "placing the door failed");
        assertIfBlock(helper, AT, NAMESPACE + ":maple_door[half=lower,open=false]");
        assertIfBlock(helper, AT.above(), NAMESPACE + ":maple_door[half=upper,open=false]");
        player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        helper.useBlock(AT, player);
        helper.runAfterDelay(1, () -> {
            assertIfBlock(helper, AT, NAMESPACE + ":maple_door[half=lower,open=true]");
            assertIfBlock(helper, AT.above(), NAMESPACE + ":maple_door[half=upper,open=true]");
            helper.assertTrue(player.gameMode.destroyBlock(helper.absolutePos(AT)), "breaking the door failed");
        });
        helper.runAfterDelay(3, () -> {
            helper.assertBlockPresent(Blocks.AIR, AT);
            helper.assertBlockPresent(Blocks.AIR, AT.above());
            helper.assertValueEqual(itemEntities(helper, door), 1, "doors dropped");
            helper.succeed();
        });
    }

    /** A wooden trapdoor and fence gate open by hand; a wooden button stays pressed for 30 ticks, as oak's. */
    @GameTest(maxTicks = 80)
    public void trapdoorGateAndButton(GameTestHelper helper) {
        floor(helper, Blocks.STONE);
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        BlockPos gate = AT.east();
        BlockPos button = AT.west();
        setblock(helper, AT, NAMESPACE + ":maple_trapdoor[facing=north,half=bottom,open=false]");
        setblock(helper, gate, NAMESPACE + ":maple_fence_gate[facing=north,open=false]");
        setblock(helper, button, NAMESPACE + ":maple_button[face=floor,facing=north,powered=false]");
        helper.useBlock(AT, player);
        helper.useBlock(gate, player);
        helper.useBlock(button, player);
        helper.runAfterDelay(2, () -> {
            assertIfBlock(helper, AT, NAMESPACE + ":maple_trapdoor[open=true]");
            assertIfBlock(helper, gate, NAMESPACE + ":maple_fence_gate[open=true]");
            assertIfBlock(helper, button, NAMESPACE + ":maple_button[powered=true]");
        });
        helper.runAfterDelay(25, () -> assertIfBlock(helper, button, NAMESPACE + ":maple_button[powered=true]"));
        helper.runAfterDelay(40, () -> {
            assertIfBlock(helper, button, NAMESPACE + ":maple_button[powered=false]");
            helper.succeed();
        });
    }

    /** A wooden pressure plate is pressed by any entity, an item entity included, as oak's. */
    @GameTest(maxTicks = 60)
    public void pressurePlateFeelsItems(GameTestHelper helper) {
        floor(helper, Blocks.STONE);
        setblock(helper, AT, NAMESPACE + ":maple_pressure_plate[powered=false]");
        helper.spawnItem(Items.STICK, Vec3.atBottomCenterOf(AT).add(0, 0.2, 0));
        helper.succeedWhen(() -> assertIfBlock(helper, AT, NAMESPACE + ":maple_pressure_plate[powered=true]"));
    }

    // Connections (ADR 0067 D2)

    /** A fence connects to planks, to an oak fence (both wooden fences) and to a fence gate across it; walls to walls. */
    @GameTest
    public void fencesAndWallsConnect(GameTestHelper helper) {
        floor(helper, Blocks.STONE);
        setblock(helper, AT.east(), NAMESPACE + ":maple_planks");
        setblock(helper, AT.west(), "minecraft:oak_fence");
        setblock(helper, AT.north(), NAMESPACE + ":maple_fence_gate[facing=east]");
        setblock(helper, AT, NAMESPACE + ":maple_fence");
        assertIfBlock(helper, AT, NAMESPACE + ":maple_fence[east=true,west=true,north=true,south=false]");
        assertIfBlock(helper, AT.west(), "minecraft:oak_fence[east=true]");

        BlockPos wall = new BlockPos(2, 1, 4);
        setblock(helper, wall, NAMESPACE + ":ruby_bricks_wall");
        setblock(helper, wall.east(), NAMESPACE + ":ruby_bricks_wall");
        assertIfBlock(helper, wall, NAMESPACE + ":ruby_bricks_wall[east=low,west=none]");
        assertIfBlock(helper, wall.east(), NAMESPACE + ":ruby_bricks_wall[west=low]");
        helper.succeed();
    }

    // Stripping (ADR 0067 D4)

    /** An axe click strips a log and keeps its axis, and strips wood; a stick does nothing. */
    @GameTest(maxTicks = 20)
    public void axeStripsLogsAndWood(GameTestHelper helper) {
        floor(helper, Blocks.STONE);
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        setblock(helper, AT, NAMESPACE + ":maple_log[axis=x]");
        click(helper, player, new ItemStack(Items.STICK), AT);
        assertIfBlock(helper, AT, NAMESPACE + ":maple_log[axis=x]");
        ItemStack axe = new ItemStack(Items.IRON_AXE);
        helper.assertTrue(click(helper, player, axe, AT).consumesAction(), "an axe on maple_log did nothing");
        BlockPos wood = AT.east();
        setblock(helper, wood, NAMESPACE + ":maple_wood[axis=z]");
        click(helper, player, axe, wood);
        helper.runAfterDelay(1, () -> {
            assertIfBlock(helper, AT, NAMESPACE + ":stripped_maple_log[axis=x]");
            assertIfBlock(helper, wood, NAMESPACE + ":stripped_maple_wood[axis=z]");
            helper.assertValueEqual(axe.getDamageValue(), 2, "axe damage after two strips");
            helper.succeed();
        });
    }

    // Crops (ADR 0068 D3, D5)

    /** Seeds plant the crop on farmland only; it does not survive on dirt; bone meal ages it by 2 to 5. */
    @GameTest(maxTicks = 20)
    public void seedsPlantAndBoneMealGrows(GameTestHelper helper) {
        floor(helper, Blocks.FARMLAND);
        Block crop = block(helper, "ruby_berries_crop");
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        helper.assertTrue(useOnTop(helper, player, new ItemStack(item(helper, "ruby_berries_seeds")), AT.below()).consumesAction(),
                "planting the seeds failed");
        assertIfBlock(helper, AT, NAMESPACE + ":ruby_berries_crop[age=0]");
        BlockPos onDirt = AT.east();
        helper.setBlock(onDirt.below(), Blocks.DIRT);
        helper.assertFalse(crop.defaultBlockState().canSurvive(helper.getLevel(), helper.absolutePos(onDirt)), "the crop survives on dirt");
        helper.assertTrue(crop.defaultBlockState().canSurvive(helper.getLevel(), helper.absolutePos(AT)), "the crop does not survive on farmland");
        helper.assertTrue(BoneMealItem.growCrop(new ItemStack(Items.BONE_MEAL), helper.getLevel(), helper.absolutePos(AT)),
                "bone meal did not apply");
        helper.runAfterDelay(1, () -> {
            int age = Integer.parseInt(value(helper, helper.getBlockState(AT), "age"));
            helper.assertTrue(age >= 2 && age <= 5, "age after one bone meal " + age);
            helper.succeed();
        });
    }

    /** At age 7 the crop drops one produce and one to four seeds; younger, one seed and no produce (the crop preset). */
    @GameTest
    public void cropLootByAge(GameTestHelper helper) {
        floor(helper, Blocks.FARMLAND);
        Item seeds = item(helper, "ruby_berries_seeds");
        Item produce = item(helper, "ruby_berries");
        setblock(helper, AT, NAMESPACE + ":ruby_berries_crop[age=7]");
        BlockState ripe = helper.getBlockState(AT);
        for (int i = 0; i < 8; i++) {
            List<ItemStack> drops = drops(helper, ripe, ItemStack.EMPTY);
            helper.assertValueEqual(countDrops(drops, produce), 1, "produce at age 7");
            int n = countDrops(drops, seeds);
            helper.assertTrue(n >= 1 && n <= 4, "seeds at age 7: " + n);
        }
        setblock(helper, AT, NAMESPACE + ":ruby_berries_crop[age=6]");
        List<ItemStack> young = drops(helper, helper.getBlockState(AT), ItemStack.EMPTY);
        helper.assertValueEqual(countDrops(young, produce), 0, "produce at age 6");
        helper.assertValueEqual(countDrops(young, seeds), 1, "seeds at age 6");
        helper.succeed();
    }

    // Saplings and trees (ADR 0068 D4)

    /** Bone meal grows the sapling into the project tree: a maple log trunk where the sapling stood, maple leaves above. */
    @GameTest(maxTicks = 40)
    public void saplingGrowsTheProjectTree(GameTestHelper helper) {
        floor(helper, Blocks.GRASS_BLOCK);
        Block sapling = block(helper, "maple_sapling");
        Block log = block(helper, "maple_log");
        Block leaves = block(helper, "maple_leaves");
        setblock(helper, AT, NAMESPACE + ":maple_sapling");
        ItemStack boneMeal = new ItemStack(Items.BONE_MEAL, 64);
        for (int i = 0; i < 64 && helper.getBlockState(AT).is(sapling); i++) {
            BoneMealItem.growCrop(boneMeal, helper.getLevel(), helper.absolutePos(AT));
        }
        helper.runAfterDelay(1, () -> {
            helper.assertTrue(helper.getBlockState(AT).is(log), "no maple_log where the sapling stood: " + helper.getBlockState(AT));
            helper.assertTrue(helper.getBlockState(AT.above(3)).is(log), "the trunk is shorter than 4");
            int leafCount = 0;
            for (int x = -3; x <= 3; x++) {
                for (int y = 2; y <= 8; y++) {
                    for (int z = -3; z <= 3; z++) {
                        BlockState state = helper.getBlockState(AT.offset(x, y, z));
                        if (state.is(leaves)) {
                            leafCount++;
                            helper.assertTrue("false".equals(value(helper, state, "persistent")), "tree leaves are persistent");
                        }
                    }
                }
            }
            helper.assertTrue(leafCount > 10, "the tree has " + leafCount + " maple leaves");
            helper.succeed();
        });
    }

    // Leaves (ADR 0068 D6)

    /** Leaves away from logs decay on a random tick; next to a maple log (block tag #logs) they stay; shears get them. */
    @GameTest(maxTicks = 20)
    public void leavesDecayAwayFromLogs(GameTestHelper helper) {
        floor(helper, Blocks.STONE);
        Block leaves = block(helper, "maple_leaves");
        BlockPos kept = new BlockPos(2, 1, 4);
        setblock(helper, AT, NAMESPACE + ":maple_leaves[persistent=false,distance=1]");
        setblock(helper, kept.west(), NAMESPACE + ":maple_log");
        setblock(helper, kept, NAMESPACE + ":maple_leaves[persistent=false,distance=1]");
        helper.assertValueEqual(countDrops(drops(helper, leaves.defaultBlockState(), new ItemStack(Items.SHEARS)), leaves.asItem()), 1,
                "maple_leaves sheared");
        helper.runAfterDelay(3, () -> {
            assertIfBlock(helper, AT, NAMESPACE + ":maple_leaves[distance=7]");
            assertIfBlock(helper, kept, NAMESPACE + ":maple_leaves[distance=1]");
            helper.randomTick(AT);
            helper.randomTick(kept);
        });
        helper.runAfterDelay(4, () -> {
            helper.assertBlockPresent(Blocks.AIR, AT);
            helper.assertBlockPresent(leaves, kept);
            helper.succeed();
        });
    }

    /** Leaves a player places are persistent and never decay, as vanilla's. */
    @GameTest
    public void placedLeavesArePersistent(GameTestHelper helper) {
        floor(helper, Blocks.STONE);
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        helper.assertTrue(useOnTop(helper, player, new ItemStack(item(helper, "maple_leaves")), AT.below()).consumesAction(),
                "placing leaves failed");
        assertIfBlock(helper, AT, NAMESPACE + ":maple_leaves[persistent=true]");
        helper.succeed();
    }
}
