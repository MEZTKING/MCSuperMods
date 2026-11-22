package dev.mcsupermods.parity;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientboundSoundPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.TagKey;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Container;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LightningBolt;
import net.minecraft.world.entity.animal.pig.Pig;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.item.BoneMealItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity over {@code fixtures/sample-plants-and-storage} (ADRs 0103 to 0105, ADR 0112 D4; B520), written against
 * vanilla and Fabric API only, so the same tests run against the content jar (the runtime's classes, B509 to B514) and
 * the ejected jar (the generated ones, B517). Run with {@code --gametest-filter msm_parity_tests:sample_plants_and_storage_parity_test_*}
 * alone, or {@code sample_plants_and_storage_*} (CI on both jars since B541), which also runs
 * {@link SamplePlantsAndStorageRulesParityTest} (the rules for vanilla blocks are ejected since B537).
 *
 * <p>Black box, as {@code SampleVanillaBlocksParityTest}: states are set and tested with {@code setblock} and
 * {@code execute if block} (their names are the format's), light with {@code getLightEmission}, uses through
 * {@code ServerPlayerGameMode.useItemOn} (which fires Fabric's callbacks as a click does), bone meal where the plant is
 * not the block clicked through vanilla's {@code BoneMealItem.growCrop} (as a dispenser), growth by forced random ticks
 * with a seeded random, and what others hear through the packets a second {@link ParityEars} player receives.
 *
 * <p>Covered: the 40 blocks, eight companions, the items (the vine's item is its berries, the potted grass has none) and
 * the vanilla tags; the sea ribbon growing in water by bone meal and refusing air; the glow vine's berries ripening,
 * glowing and being picked; the climbing ivy growing up and climbable; the dune reed and the spine cactus growing to
 * their heights, the reed's water and the cactus's touch damage against vanilla's; the bamboo item planting a shoot that
 * bone meal grows; the glow moss's light and spreading; the wide leaves growing by bone meal; the clay planter taking
 * its listed plants, giving them back, refusing others and dropping pot and plant; bronze ageing on the six new types
 * with their state kept, waxing, scraping and lightning; the twin crate joining into one six-row chest whose halves
 * keep their own items; the bronze chest ageing both halves with their contents; the private crate per player; the sea
 * crate holding water; the chime stone's and creaky door's own sounds; loam flattened and tilled.
 *
 * <p>Not covered here: the looks (the client GameTest {@code MsmPlants3ClientGameTest} and the fixture's README checks).
 */
public class SamplePlantsAndStorageParityTest {
    static final String NAMESPACE = "msm_sample_plants";
    /** Where {@link #ifBlock} places its gold block when the predicate matches (the empty structure is 8 by 8 by 8). */
    private static final BlockPos MARKER = new BlockPos(7, 7, 7);

    /** The six weathering types of ADR 0104 D1 that bronze comes in. */
    private static final List<String> BRONZE_TYPES = List.of("rod", "button", "pressure_plate", "fence", "fence_gate", "wall");

    /** The fixture's 40 blocks. */
    static final List<String> BLOCKS = blocks();
    /** The blocks the types make beside their own, without items. */
    static final List<String> COMPANIONS = List.of("sea_ribbon_plant", "glow_vine_plant", "climbing_ivy_plant", "reed_bamboo_shoot",
            "wide_leaf_stem", "clay_planter_dandelion", "clay_planter_poppy", "clay_planter_oak_sapling");

    private static List<String> blocks() {
        List<String> out = new ArrayList<>(List.of("sea_ribbon", "glow_vine", "climbing_ivy", "dune_reed", "spine_cactus", "reed_bamboo",
                "glow_moss", "wide_leaf", "small_wide_leaf", "clay_planter", "clay_planter_grass"));
        for (String type : BRONZE_TYPES) {
            out.addAll(List.of("bronze_" + type, "exposed_bronze_" + type, "waxed_bronze_" + type));
        }
        out.addAll(List.of("twin_crate", "private_crate", "sea_crate", "bronze_chest", "exposed_bronze_chest", "waxed_bronze_chest",
                "chime_stone", "creaky_door", "loam", "loam_path", "loam_farmland"));
        return List.copyOf(out);
    }

    static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NAMESPACE, path);
    }

    static Block block(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.BLOCK.containsKey(id(path)), "block " + id(path) + " is not registered");
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    static Item item(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(id(path)), "item " + id(path) + " is not registered");
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    private static String coords(GameTestHelper helper, BlockPos rel) {
        BlockPos abs = helper.absolutePos(rel);
        return abs.getX() + " " + abs.getY() + " " + abs.getZ();
    }

    /** Runs a command as the server in the test's level and returns its result (0 when it failed or did not parse). */
    static int command(GameTestHelper helper, String command) {
        AtomicInteger result = new AtomicInteger();
        CommandSourceStack source = helper.getLevel().getServer().createCommandSourceStack().withLevel(helper.getLevel())
                .withSuppressedOutput();
        source.getServer().getCommands().performPrefixedCommand(source.withCallback((success, value) ->
                result.set(success ? Math.max(value, 1) : 0)), command);
        return result.get();
    }

    static void setblock(GameTestHelper helper, BlockPos rel, String blockAndState) {
        helper.assertTrue(command(helper, "setblock " + coords(helper, rel) + " " + blockAndState) > 0, "setblock " + blockAndState + " failed");
    }

    /** Whether {@code execute if block} matches (an unknown block or state name reads as false). */
    static boolean ifBlock(GameTestHelper helper, BlockPos rel, String predicate) {
        helper.setBlock(MARKER, Blocks.AIR);
        command(helper, "execute if block " + coords(helper, rel) + " " + predicate + " run setblock " + coords(helper, MARKER)
                + " minecraft:gold_block");
        boolean matched = helper.getBlockState(MARKER).is(Blocks.GOLD_BLOCK);
        helper.setBlock(MARKER, Blocks.AIR);
        return matched;
    }

    static void assertIfBlock(GameTestHelper helper, BlockPos rel, String predicate) {
        helper.assertTrue(ifBlock(helper, rel, predicate), "execute if block " + predicate + " did not match: " + helper.getBlockState(rel));
    }

    /** A stone floor at y 0 under the whole 8 by 8 area. */
    static void floor(GameTestHelper helper) {
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                helper.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
            }
        }
    }

    static ServerPlayer player(GameTestHelper helper, GameType mode) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(mode);
        player.snapTo(helper.absoluteVec(new Vec3(0.5, 1, 7.5)));
        return player;
    }

    /** The player clicks face {@code face} of the block at {@code rel} holding {@code stack}, as the network handler does. */
    static InteractionResult use(GameTestHelper helper, ServerPlayer player, ItemStack stack, BlockPos rel, Direction face) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        BlockPos abs = helper.absolutePos(rel);
        Vec3 at = Vec3.atCenterOf(abs).add(face.getStepX() * 0.5, face.getStepY() * 0.5, face.getStepZ() * 0.5);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND), InteractionHand.MAIN_HAND,
                new BlockHitResult(at, face, abs, false));
    }

    /** Bone meal on the block at {@code rel}, as a dispenser applies it. */
    private static boolean boneMeal(GameTestHelper helper, BlockPos rel) {
        return BoneMealItem.growCrop(new ItemStack(Items.BONE_MEAL), helper.getLevel(), helper.absolutePos(rel));
    }

    /** {@code count} forced random ticks on whatever is at {@code rel} each time. */
    private static void randomTicks(GameTestHelper helper, BlockPos rel, int count, RandomSource random) {
        ServerLevel level = helper.getLevel();
        BlockPos abs = helper.absolutePos(rel);
        for (int i = 0; i < count; i++) {
            BlockState state = level.getBlockState(abs);
            if (state.isRandomlyTicking()) {
                state.randomTick(level, abs, random);
            }
        }
    }

    /** The length of the column from {@code rel} going {@code step} while its blocks are one of {@code blocks}. */
    private static int column(GameTestHelper helper, BlockPos rel, Direction step, Block... blocks) {
        int n = 0;
        BlockPos at = rel;
        while (n < 32) {
            BlockState state = helper.getBlockState(at);
            boolean ours = false;
            for (Block b : blocks) {
                ours |= state.is(b);
            }
            if (!ours) {
                return n;
            }
            n++;
            at = at.relative(step);
        }
        return n;
    }

    /** Random ticks on the tip of an upward column from {@code base} until it stops growing; its length. */
    private static int growUp(GameTestHelper helper, BlockPos base, int ticks, RandomSource random, Block... blocks) {
        for (int i = 0; i < ticks; i++) {
            randomTicks(helper, base.above(Math.max(column(helper, base, Direction.UP, blocks) - 1, 0)), 1, random);
        }
        return column(helper, base, Direction.UP, blocks);
    }

    /** Item entities of {@code item} within three blocks of {@code rel}, discarded after counting. */
    static int takeItems(GameTestHelper helper, BlockPos rel, Item item) {
        List<ItemEntity> found = helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(rel)).inflate(3),
                e -> e.getItem().is(item));
        int n = found.stream().mapToInt(e -> e.getItem().getCount()).sum();
        found.forEach(ItemEntity::discard);
        return n;
    }

    private static Container container(GameTestHelper helper, BlockPos rel) {
        return helper.getLevel().getBlockEntity(helper.absolutePos(rel)) instanceof Container c ? c : null;
    }

    private static int count(Container c, Item item) {
        int n = 0;
        for (int i = 0; i < c.getContainerSize(); i++) {
            if (c.getItem(i).is(item)) {
                n += c.getItem(i).getCount();
            }
        }
        return n;
    }

    private static TagKey<Block> blockTag(String path) {
        return TagKey.create(Registries.BLOCK, Identifier.withDefaultNamespace(path));
    }

    private static List<Identifier> sounds(List<Packet<?>> packets) {
        List<Identifier> out = new ArrayList<>();
        for (Packet<?> p : packets) {
            if (p instanceof ClientboundSoundPacket s) {
                out.add(s.getSound().value().location());
            }
        }
        return out;
    }

    /** Two chests of {@code path} placed side by side (west then east) by a player looking north. */
    private static ServerPlayer placePair(GameTestHelper helper, BlockPos a, String path) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        player.snapTo(helper.absoluteVec(new Vec3(a.getX() + 1, a.getY(), a.getZ() + 3.5)));
        player.setYRot(180f);
        player.setYHeadRot(180f);
        use(helper, player, new ItemStack(item(helper, path)), a.below(), Direction.UP);
        use(helper, player, new ItemStack(item(helper, path)), a.east().below(), Direction.UP);
        return player;
    }

    /** Whether the two halves at {@code a} and east of it are joined as one chest (one left, one right). */
    private static boolean joined(GameTestHelper helper, BlockPos a, String path) {
        String id = id(path).toString();
        BlockPos b = a.east();
        return ifBlock(helper, a, id + "[type=left]") && ifBlock(helper, b, id + "[type=right]")
                || ifBlock(helper, a, id + "[type=right]") && ifBlock(helper, b, id + "[type=left]");
    }

    // Registration and tags

    /**
     * The 40 blocks and eight companions are registered; a block item for every block but the glow vine (its item is its
     * berries) and the potted grass; companions have none; the vanilla tags the types join.
     */
    @GameTest
    public void blocksCompanionsItemsAndTagsAreRegistered(GameTestHelper helper) {
        helper.assertValueEqual(BLOCKS.size(), 40, "blocks listed");
        for (String path : BLOCKS) {
            block(helper, path);
            boolean noItem = path.equals("glow_vine") || path.equals("clay_planter_grass");
            helper.assertValueEqual(BuiltInRegistries.ITEM.containsKey(id(path)), !noItem, "item of " + path);
        }
        for (String path : COMPANIONS) {
            block(helper, path);
            helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id(path)), "companion " + path + " has an item");
        }
        item(helper, "glow_vine_berries");
        helper.assertTrue(block(helper, "climbing_ivy").defaultBlockState().is(blockTag("climbable")), "climbing ivy is not climbable");
        for (String potted : List.of("clay_planter_dandelion", "clay_planter_poppy", "clay_planter_oak_sapling", "clay_planter_grass")) {
            helper.assertTrue(block(helper, potted).defaultBlockState().is(blockTag("flower_pots")), potted + " is not in #flower_pots");
        }
        helper.succeed();
    }

    // Growing plants (ADR 0103 D1)

    /** The sea ribbon lives in water: bone meal adds one block at a time, as kelp; its item is not placed in air. */
    @GameTest
    public void theSeaRibbonGrowsInWaterByBoneMealAndNotInAir(GameTestHelper helper) {
        floor(helper);
        for (int y = 1; y <= 7; y++) {
            helper.setBlock(new BlockPos(2, y, 2), Blocks.WATER);
        }
        helper.setBlock(new BlockPos(2, 1, 2), Blocks.SAND);
        BlockPos base = new BlockPos(2, 2, 2);
        Block ribbon = block(helper, "sea_ribbon");
        Block strand = block(helper, "sea_ribbon_plant");
        helper.setBlock(base, ribbon);
        helper.assertTrue(helper.getBlockState(base).getFluidState().is(Fluids.WATER), "the sea ribbon holds no water");
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        for (int i = 0; i < 2; i++) {
            helper.assertTrue(use(helper, player, new ItemStack(Items.BONE_MEAL), base, Direction.UP).consumesAction(), "bone meal " + i);
        }
        helper.assertValueEqual(column(helper, base, Direction.UP, ribbon, strand), 3, "after two bone meal");
        helper.assertTrue(helper.getBlockState(base).is(strand) && helper.getBlockState(base.above(2)).is(ribbon), "strand and tip: "
                + helper.getBlockState(base) + " / " + helper.getBlockState(base.above(2)));
        helper.assertFalse(use(helper, player, new ItemStack(item(helper, "sea_ribbon")), new BlockPos(5, 0, 5), Direction.UP)
                .consumesAction(), "the sea ribbon was placed in air");
        helper.succeed();
    }

    /** The glow vine hangs from a ceiling; bone meal ripens its berries (light 14) without growing it; a hand picks them. */
    @GameTest
    public void theGlowVineRipensGlowsAndIsPicked(GameTestHelper helper) {
        BlockPos ceiling = new BlockPos(2, 6, 2);
        BlockPos at = ceiling.below();
        helper.setBlock(ceiling, Blocks.STONE);
        helper.setBlock(at, block(helper, "glow_vine"));
        helper.assertValueEqual(helper.getBlockState(at).getLightEmission(), 0, "light without berries");
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        helper.assertTrue(use(helper, player, new ItemStack(Items.BONE_MEAL), at, Direction.DOWN).consumesAction(), "bone meal");
        assertIfBlock(helper, at, id("glow_vine") + "[berries=true]");
        helper.assertTrue(helper.getBlockState(at.below()).isAir(), "bone meal grew the vine");
        helper.assertValueEqual(helper.getBlockState(at).getLightEmission(), 14, "light with berries");
        takeItems(helper, at, item(helper, "glow_vine_berries"));
        helper.assertTrue(use(helper, player, ItemStack.EMPTY, at, Direction.DOWN).consumesAction(), "picking");
        helper.assertValueEqual(takeItems(helper, at, item(helper, "glow_vine_berries")), 1, "berries picked");
        assertIfBlock(helper, at, id("glow_vine") + "[berries=false]");
        // Its tip grows down by random ticks, its own strand above it.
        RandomSource random = RandomSource.create(7);
        for (int i = 0; i < 400 && helper.getBlockState(at.below()).isAir(); i++) {
            randomTicks(helper, at, 1, random);
        }
        helper.assertTrue(helper.getBlockState(at).is(block(helper, "glow_vine_plant")), "no strand above the new tip: " + helper.getBlockState(at));
        helper.succeed();
    }

    /** The climbing ivy grows up in open air by random ticks. */
    @GameTest
    public void theClimbingIvyGrowsUp(GameTestHelper helper) {
        floor(helper);
        BlockPos base = new BlockPos(3, 1, 3);
        helper.setBlock(base, block(helper, "climbing_ivy"));
        int length = growUp(helper, base, 3000, RandomSource.create(11), block(helper, "climbing_ivy"), block(helper, "climbing_ivy_plant"));
        helper.assertTrue(length >= 3, "the ivy grew to " + length);
        helper.assertTrue(helper.getBlockState(base).is(block(helper, "climbing_ivy_plant")), "the ivy's base " + helper.getBlockState(base));
        helper.succeed();
    }

    // Column plants

    /** The dune reed stands on sand beside water and grows to three, as sugar cane; not without water. */
    @GameTest
    public void theDuneReedGrowsToThreeBesideWater(GameTestHelper helper) {
        floor(helper);
        ServerLevel level = helper.getLevel();
        Block reed = block(helper, "dune_reed");
        helper.setBlock(new BlockPos(2, 0, 2), Blocks.SAND);
        helper.setBlock(new BlockPos(2, 0, 3), Blocks.WATER);
        BlockPos base = new BlockPos(2, 1, 2);
        helper.assertTrue(reed.defaultBlockState().canSurvive(level, helper.absolutePos(base)), "reed on sand beside water");
        helper.setBlock(base, reed);
        helper.assertValueEqual(growUp(helper, base, 400, RandomSource.create(3), reed), 3, "reed height");
        helper.setBlock(new BlockPos(5, 0, 5), Blocks.SAND);
        helper.assertFalse(reed.defaultBlockState().canSurvive(level, helper.absolutePos(new BlockPos(5, 1, 5))), "reed on dry sand");
        helper.succeed();
    }

    /** The spine cactus grows to four on sand and hurts by two (vanilla's cactus by one). */
    @GameTest
    public void theSpineCactusGrowsToFourAndHurtsByTwo(GameTestHelper helper) {
        floor(helper);
        ServerLevel level = helper.getLevel();
        Block cactus = block(helper, "spine_cactus");
        helper.setBlock(new BlockPos(1, 0, 1), Blocks.SAND);
        BlockPos base = new BlockPos(1, 1, 1);
        helper.setBlock(base, cactus);
        helper.assertValueEqual(growUp(helper, base, 600, RandomSource.create(9), cactus), 4, "cactus height");
        helper.setBlock(new BlockPos(5, 0, 5), Blocks.SAND);
        helper.setBlock(new BlockPos(5, 1, 6), Blocks.STONE);
        helper.assertFalse(cactus.defaultBlockState().canSurvive(level, helper.absolutePos(new BlockPos(5, 1, 5))), "cactus beside stone");
        float[] hurt = new float[2];
        BlockPos[] at = {base, new BlockPos(4, 1, 2)};
        helper.setBlock(new BlockPos(4, 0, 2), Blocks.SAND);
        helper.setBlock(at[1], Blocks.CACTUS);
        for (int i = 0; i < 2; i++) {
            Pig pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, at[i].above(i == 0 ? 4 : 1));
            float before = pig.getHealth();
            BlockPos abs = helper.absolutePos(at[i]);
            level.getBlockState(abs).entityInside(level, abs, pig, InsideBlockEffectApplier.NOOP, true);
            hurt[i] = before - pig.getHealth();
            pig.discard();
        }
        helper.assertValueEqual(hurt[0], 2.0f, "spine cactus damage");
        helper.assertValueEqual(hurt[1], 1.0f, "vanilla cactus damage");
        helper.succeed();
    }

    /** The reed bamboo's item plants a shoot on dirt, and bone meal grows the shoot into the stalk. */
    @GameTest
    public void theReedBambooPlantsAShootThatBoneMealGrows(GameTestHelper helper) {
        floor(helper);
        helper.setBlock(new BlockPos(3, 0, 3), Blocks.DIRT);
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        BlockPos at = new BlockPos(3, 1, 3);
        helper.assertTrue(use(helper, player, new ItemStack(item(helper, "reed_bamboo")), new BlockPos(3, 0, 3), Direction.UP)
                .consumesAction(), "planting");
        helper.assertTrue(helper.getBlockState(at).is(block(helper, "reed_bamboo_shoot")), "planted " + helper.getBlockState(at));
        helper.assertTrue(boneMeal(helper, at), "bone meal on the shoot");
        helper.assertTrue(helper.getBlockState(at).is(block(helper, "reed_bamboo")), "the shoot became " + helper.getBlockState(at));
        helper.assertTrue(column(helper, at, Direction.UP, block(helper, "reed_bamboo")) >= 2, "the stalk did not grow");
        helper.succeed();
    }

    /** The glow moss gives light 7 and spreads by bone meal over the floor. */
    @GameTest
    public void theGlowMossGlowsAndSpreadsByBoneMeal(GameTestHelper helper) {
        floor(helper);
        BlockPos at = new BlockPos(3, 1, 3);
        setblock(helper, at, id("glow_moss") + "[down=true]");
        helper.assertValueEqual(helper.getBlockState(at).getLightEmission(), 7, "light");
        Block moss = block(helper, "glow_moss");
        helper.assertTrue(boneMeal(helper, at), "bone meal");
        int found = 0;
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                found += helper.getBlockState(new BlockPos(x, 1, z)).is(moss) ? 1 : 0;
            }
        }
        helper.assertTrue(found >= 2, "the moss did not spread: " + found);
        helper.succeed();
    }

    /** A small wide leaf placed on moss is two halves and grows by bone meal into the wide leaf on its stem; a wide leaf grows one. */
    @GameTest
    public void theWideLeavesGrowByBoneMeal(GameTestHelper helper) {
        floor(helper);
        Block big = block(helper, "wide_leaf");
        Block stem = block(helper, "wide_leaf_stem");
        Block small = block(helper, "small_wide_leaf");
        helper.setBlock(new BlockPos(2, 0, 2), Blocks.MOSS_BLOCK);
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        player.setYRot(180f);
        BlockPos at = new BlockPos(2, 1, 2);
        helper.assertTrue(use(helper, player, new ItemStack(item(helper, "small_wide_leaf")), at.below(), Direction.UP).consumesAction(),
                "placing the small leaf");
        helper.assertTrue(helper.getBlockState(at).is(small) && helper.getBlockState(at.above()).is(small), "small leaf halves: "
                + helper.getBlockState(at) + " / " + helper.getBlockState(at.above()));
        helper.assertTrue(boneMeal(helper, at), "bone meal on the small leaf");
        int stems = column(helper, at, Direction.UP, stem);
        helper.assertTrue(stems >= 1 && helper.getBlockState(at.above(stems)).is(big), "grown: " + stems + " stems, then "
                + helper.getBlockState(at.above(stems)));
        helper.setBlock(new BlockPos(5, 0, 5), Blocks.MOSS_BLOCK);
        BlockPos leaf = new BlockPos(5, 1, 5);
        helper.setBlock(leaf, big);
        helper.assertTrue(boneMeal(helper, leaf), "bone meal on the wide leaf");
        helper.assertTrue(helper.getBlockState(leaf).is(stem) && helper.getBlockState(leaf.above()).is(big), "after bone meal: "
                + helper.getBlockState(leaf) + " / " + helper.getBlockState(leaf.above()));
        helper.succeed();
    }

    // The project pot (ADR 0103 D2)

    /** The clay planter takes its listed plants and gives them back, refuses others, and drops pot and plant. */
    @GameTest
    public void theClayPlanterTakesItsPlantsAndGivesThemBack(GameTestHelper helper) {
        floor(helper);
        BlockPos at = new BlockPos(3, 1, 3);
        helper.setBlock(at, block(helper, "clay_planter"));
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        helper.assertTrue(use(helper, player, new ItemStack(Items.DANDELION, 2), at, Direction.UP).consumesAction(), "potting");
        helper.assertTrue(helper.getBlockState(at).is(block(helper, "clay_planter_dandelion")), "potted " + helper.getBlockState(at));
        helper.assertValueEqual(player.getMainHandItem().getCount(), 1, "dandelions left");
        player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        use(helper, player, ItemStack.EMPTY, at, Direction.UP);
        helper.assertTrue(helper.getBlockState(at).is(block(helper, "clay_planter")), "after taking it out " + helper.getBlockState(at));
        helper.assertTrue(player.getInventory().contains(new ItemStack(Items.DANDELION)), "the dandelion is not back in the inventory");
        use(helper, player, new ItemStack(Items.ALLIUM), at, Direction.UP);
        helper.assertTrue(helper.getBlockState(at).is(block(helper, "clay_planter")), "an allium went in: " + helper.getBlockState(at));
        BlockPos potted = new BlockPos(5, 1, 5);
        helper.setBlock(potted, block(helper, "clay_planter_poppy"));
        List<ItemStack> drops = Block.getDrops(helper.getBlockState(potted), helper.getLevel(), helper.absolutePos(potted), null, null,
                ItemStack.EMPTY);
        helper.assertValueEqual(drops.stream().filter(s -> s.is(Items.POPPY)).mapToInt(ItemStack::getCount).sum(), 1, "poppy dropped");
        helper.assertValueEqual(drops.stream().filter(s -> s.is(item(helper, "clay_planter"))).mapToInt(ItemStack::getCount).sum(), 1,
                "planter dropped");
        // Vanilla's own pot is untouched.
        BlockPos vanilla = new BlockPos(1, 1, 1);
        helper.setBlock(vanilla, Blocks.FLOWER_POT);
        use(helper, player, new ItemStack(Items.DANDELION), vanilla, Direction.UP);
        helper.assertTrue(helper.getBlockState(vanilla).is(Blocks.POTTED_DANDELION), "vanilla's pot " + helper.getBlockState(vanilla));
        helper.succeed();
    }

    // Bronze: weathering on the six new types and lightning (ADR 0104 D1, D2)

    /** A start state of each type with properties other than the defaults, so keeping them is seen. */
    private static String startState(String type) {
        return switch (type) {
            case "rod" -> "[facing=east]";
            case "button" -> "[face=floor,facing=west]";
            case "fence" -> "[north=true]";
            case "fence_gate" -> "[facing=south,open=true]";
            case "wall" -> "[up=true]";
            default -> "";
        };
    }

    /** Each unaffected bronze type ages by forced random ticks into its exposed stage with its state; the last stage and waxed copies do not tick. */
    @GameTest(maxTicks = 40)
    public void bronzeAgesOnTheSixTypesAndKeepsItsState(GameTestHelper helper) {
        BlockPos at = new BlockPos(3, 3, 3);
        ServerLevel level = helper.getLevel();
        for (String type : BRONZE_TYPES) {
            RandomSource random = RandomSource.create(4490L);
            Block start = block(helper, "bronze_" + type);
            setblock(helper, at, id("bronze_" + type) + startState(type));
            helper.assertTrue(helper.getBlockState(at).isRandomlyTicking(), "bronze " + type + " does not random-tick");
            int k = 0;
            while (helper.getBlockState(at).is(start) && k < 50_000) {
                helper.getBlockState(at).randomTick(level, helper.absolutePos(at), random);
                k++;
            }
            assertIfBlock(helper, at, id("exposed_bronze_" + type) + startState(type));
            helper.assertFalse(helper.getBlockState(at).isRandomlyTicking(), "exposed bronze " + type + " ticks");
            helper.assertFalse(block(helper, "waxed_bronze_" + type).defaultBlockState().isRandomlyTicking(), "waxed bronze " + type + " ticks");
            helper.setBlock(at, Blocks.AIR);
        }
        helper.succeed();
    }

    /** Honeycomb waxes bronze, an axe takes the wax off and scrapes an exposed stage back, as copper. */
    @GameTest
    public void honeycombWaxesAndTheAxeUnwaxesAndScrapesBronze(GameTestHelper helper) {
        floor(helper);
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        BlockPos at = new BlockPos(3, 1, 3);
        for (String type : List.of("wall", "fence", "rod")) {
            helper.setBlock(at, block(helper, "bronze_" + type));
            use(helper, player, new ItemStack(Items.HONEYCOMB), at, Direction.UP);
            helper.assertTrue(helper.getBlockState(at).is(block(helper, "waxed_bronze_" + type)), "honeycomb on bronze " + type + ": "
                    + helper.getBlockState(at));
            use(helper, player, new ItemStack(Items.IRON_AXE), at, Direction.UP);
            helper.assertTrue(helper.getBlockState(at).is(block(helper, "bronze_" + type)), "axe on waxed bronze " + type + ": "
                    + helper.getBlockState(at));
            helper.setBlock(at, block(helper, "exposed_bronze_" + type));
            use(helper, player, new ItemStack(Items.IRON_AXE), at, Direction.UP);
            helper.assertTrue(helper.getBlockState(at).is(block(helper, "bronze_" + type)), "axe on exposed bronze " + type + ": "
                    + helper.getBlockState(at));
            helper.setBlock(at, Blocks.AIR);
        }
        helper.succeed();
    }

    /** A bolt striking an exposed bronze wall scrapes it to its first stage. */
    @GameTest(maxTicks = 60)
    public void lightningScrapesBronze(GameTestHelper helper) {
        for (int x = 1; x <= 5; x++) {
            for (int z = 1; z <= 5; z++) {
                helper.setBlock(new BlockPos(x, 1, z), block(helper, "exposed_bronze_wall"));
            }
        }
        BlockPos struck = new BlockPos(3, 1, 3);
        LightningBolt bolt = EntityTypes.LIGHTNING_BOLT.create(helper.getLevel(), EntitySpawnReason.TRIGGERED);
        helper.assertTrue(bolt != null, "no bolt");
        bolt.setVisualOnly(true);
        bolt.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(struck.above())));
        helper.getLevel().addFreshEntity(bolt);
        helper.runAfterDelay(12, () -> {
            helper.assertTrue(helper.getBlockState(struck).is(block(helper, "bronze_wall")), "the struck wall is " + helper.getBlockState(struck));
            helper.succeed();
        });
    }

    // Storage 2 (ADR 0104 D3 to D6)

    /** Two twin crates side by side join into one chest with one six-row menu; each half keeps its own items. */
    @GameTest
    public void twinCratesJoinIntoOneSixRowChest(GameTestHelper helper) {
        floor(helper);
        BlockPos a = new BlockPos(2, 1, 2);
        BlockPos b = a.east();
        ServerPlayer player = placePair(helper, a, "twin_crate");
        helper.assertTrue(joined(helper, a, "twin_crate"), "not joined: " + helper.getBlockState(a) + " / " + helper.getBlockState(b));
        use(helper, player, ItemStack.EMPTY, a, Direction.UP);
        helper.assertTrue(player.containerMenu instanceof ChestMenu, "no chest menu: " + player.containerMenu);
        ChestMenu menu = (ChestMenu) player.containerMenu;
        helper.assertValueEqual(menu.getRowCount(), 6, "rows");
        menu.getContainer().setItem(1, new ItemStack(Items.GOLD_INGOT, 2));
        menu.getContainer().setItem(40, new ItemStack(Items.EMERALD, 5));
        player.closeContainer();
        helper.assertValueEqual(container(helper, a).getContainerSize(), 27, "half size");
        int gold = count(container(helper, a), Items.GOLD_INGOT) + count(container(helper, b), Items.GOLD_INGOT);
        int emeralds = count(container(helper, a), Items.EMERALD) + count(container(helper, b), Items.EMERALD);
        helper.assertValueEqual(gold * 10 + emeralds, 25, "items in the halves");
        BlockPos withEmeralds = count(container(helper, a), Items.EMERALD) > 0 ? a : b;
        BlockPos withGold = withEmeralds == a ? b : a;
        helper.assertValueEqual(count(container(helper, withGold), Items.GOLD_INGOT), 2, "both stacks in one half");
        helper.getLevel().destroyBlock(helper.absolutePos(withEmeralds), true);
        helper.assertValueEqual(takeItems(helper, withEmeralds, Items.EMERALD), 5, "emeralds dropped by the broken half");
        helper.assertValueEqual(takeItems(helper, withEmeralds, Items.GOLD_INGOT), 0, "gold of the other half dropped");
        assertIfBlock(helper, withGold, id("twin_crate") + "[type=single]");
        helper.succeed();
    }

    /** A joined bronze chest ages both halves together and keeps their contents. */
    @GameTest(maxTicks = 40)
    public void theBronzeChestAgesBothHalvesWithTheirContents(GameTestHelper helper) {
        floor(helper);
        BlockPos a = new BlockPos(2, 1, 2);
        BlockPos b = a.east();
        placePair(helper, a, "bronze_chest");
        helper.assertTrue(joined(helper, a, "bronze_chest"), "not joined: " + helper.getBlockState(a) + " / " + helper.getBlockState(b));
        container(helper, a).setItem(0, new ItemStack(Items.DIAMOND, 3));
        container(helper, b).setItem(5, new ItemStack(Items.EMERALD, 4));
        RandomSource random = RandomSource.create(13L);
        Block start = block(helper, "bronze_chest");
        for (int k = 0; k < 50_000 && helper.getBlockState(a).is(start) && helper.getBlockState(b).is(start); k++) {
            helper.getBlockState(a).randomTick(helper.getLevel(), helper.absolutePos(a), random);
        }
        helper.assertTrue(joined(helper, a, "exposed_bronze_chest"), "after ageing: " + helper.getBlockState(a) + " / " + helper.getBlockState(b));
        helper.assertValueEqual(count(container(helper, a), Items.DIAMOND) + count(container(helper, b), Items.DIAMOND), 3, "diamonds kept");
        helper.assertValueEqual(count(container(helper, a), Items.EMERALD) + count(container(helper, b), Items.EMERALD), 4, "emeralds kept");
        helper.succeed();
    }

    /** Each player sees their own store in the private crate; the block itself holds nothing. */
    @GameTest(maxTicks = 40)
    public void thePrivateCrateIsDifferentForEveryPlayer(GameTestHelper helper) {
        floor(helper);
        BlockPos at = new BlockPos(3, 1, 3);
        helper.setBlock(at, block(helper, "private_crate"));
        try (ParityEars ann = new ParityEars(helper, new BlockPos(3, 1, 5), GameType.SURVIVAL, "msm-sps-ann");
                ParityEars ben = new ParityEars(helper, new BlockPos(4, 1, 5), GameType.SURVIVAL, "msm-sps-ben")) {
            helper.assertValueEqual(openAndPut(helper, ann.player, at, new ItemStack(Items.DIAMOND, 4), 0), List.of(), "Ann first");
            helper.assertValueEqual(openAndPut(helper, ben.player, at, new ItemStack(Items.EMERALD, 2), 3), List.of(), "Ben first");
            helper.assertValueEqual(openAndPut(helper, ann.player, at, null, 0), List.of("0=4 diamond"), "Ann again");
            helper.assertValueEqual(openAndPut(helper, ben.player, at, null, 0), List.of("3=2 emerald"), "Ben again");
            Container own = container(helper, at);
            helper.assertTrue(own == null || own.isEmpty(), "the block itself holds items");
        }
        helper.succeed();
    }

    private static List<String> openAndPut(GameTestHelper helper, ServerPlayer player, BlockPos rel, ItemStack put, int slot) {
        use(helper, player, ItemStack.EMPTY, rel, Direction.UP);
        helper.assertTrue(player.containerMenu instanceof ChestMenu, "no chest menu for " + player.getName().getString() + ": "
                + player.containerMenu);
        Container shown = ((ChestMenu) player.containerMenu).getContainer();
        List<String> out = new ArrayList<>();
        for (int i = 0; i < shown.getContainerSize(); i++) {
            if (!shown.getItem(i).isEmpty()) {
                out.add(i + "=" + shown.getItem(i).getCount() + " " + BuiltInRegistries.ITEM.getKey(shown.getItem(i).getItem()).getPath());
            }
        }
        if (put != null) {
            shown.setItem(slot, put);
        }
        player.closeContainer();
        return out;
    }

    /** A water bucket poured from above fills the sea crate, which still opens its two rows; broken, it leaves the water. */
    @GameTest
    public void theSeaCrateHoldsWater(GameTestHelper helper) {
        floor(helper);
        BlockPos at = new BlockPos(3, 1, 3);
        helper.setBlock(at, block(helper, "sea_crate"));
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        // A bucket is used where the player looks (as the network handler hands over a use in the air): from above.
        Vec3 above = helper.absoluteVec(new Vec3(3.5, 3, 3.5));
        player.snapTo(above.x, above.y, above.z, 0f, 90f);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.WATER_BUCKET));
        player.gameMode.useItem(player, helper.getLevel(), player.getMainHandItem(), InteractionHand.MAIN_HAND);
        assertIfBlock(helper, at, id("sea_crate") + "[waterlogged=true]");
        helper.assertTrue(helper.getBlockState(at).getFluidState().is(Fluids.WATER), "no water in the crate");
        player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        use(helper, player, ItemStack.EMPTY, at, Direction.UP);
        helper.assertTrue(player.containerMenu instanceof ChestMenu menu && menu.getRowCount() == 2, "menu " + player.containerMenu);
        player.closeContainer();
        helper.getLevel().destroyBlock(helper.absolutePos(at), true);
        helper.assertTrue(helper.getBlockState(at).getFluidState().is(Fluids.WATER), "the water went with the crate: " + helper.getBlockState(at));
        helper.succeed();
    }

    // Own sounds and set types (ADR 0105 D1, D2)

    /** The chime stone is heard placed with the amethyst sound, as its block_sounds say. */
    @GameTest
    public void theChimeStoneIsPlacedWithItsOwnSound(GameTestHelper helper) {
        floor(helper);
        try (ParityEars actor = new ParityEars(helper, new BlockPos(1, 1, 1), GameType.SURVIVAL, "msm-sps-chime");
                ParityEars ears = ParityEars.listener(helper, new BlockPos(5, 1, 5))) {
            ears.packets();
            helper.assertTrue(use(helper, actor.player, new ItemStack(item(helper, "chime_stone")), new BlockPos(3, 0, 3), Direction.UP)
                    .consumesAction(), "placing");
            List<Identifier> heard = sounds(ears.packets());
            helper.assertValueEqual(heard, List.of(Identifier.withDefaultNamespace("block.amethyst_block.place")), "placed sounds");
        }
        helper.succeed();
    }

    /** The creaky door opens by hand (an iron-based set type) with its own open and close sounds. */
    @GameTest
    public void theCreakyDoorOpensByHandWithItsOwnSounds(GameTestHelper helper) {
        floor(helper);
        try (ParityEars actor = new ParityEars(helper, new BlockPos(3, 1, 6), GameType.SURVIVAL, "msm-sps-door");
                ParityEars ears = ParityEars.listener(helper, new BlockPos(6, 1, 1))) {
            actor.player.setYRot(180f);
            actor.player.setYHeadRot(180f);
            BlockPos at = new BlockPos(3, 1, 3);
            helper.assertTrue(use(helper, actor.player, new ItemStack(item(helper, "creaky_door")), at.below(), Direction.UP).consumesAction(),
                    "placing");
            assertIfBlock(helper, at, id("creaky_door") + "[half=lower,open=false]");
            ears.packets();
            use(helper, actor.player, ItemStack.EMPTY, at, Direction.SOUTH);
            assertIfBlock(helper, at, id("creaky_door") + "[open=true]");
            helper.assertValueEqual(sounds(ears.packets()), List.of(Identifier.withDefaultNamespace("block.iron_door.open")), "open sound");
            use(helper, actor.player, ItemStack.EMPTY, at, Direction.SOUTH);
            assertIfBlock(helper, at, id("creaky_door") + "[open=false]");
            helper.assertValueEqual(sounds(ears.packets()), List.of(Identifier.withDefaultNamespace("block.chest.close")), "close sound");
        }
        helper.succeed();
    }

    // Flatten and till (ADR 0105 D3)

    /** A shovel flattens loam into the loam path and a hoe tills it into loam farmland with a stick, only with air above. */
    @GameTest
    public void loamIsFlattenedAndTilled(GameTestHelper helper) {
        floor(helper);
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        BlockPos at = new BlockPos(3, 1, 3);
        helper.setBlock(at, block(helper, "loam"));
        use(helper, player, new ItemStack(Items.IRON_SHOVEL), at, Direction.UP);
        helper.assertTrue(helper.getBlockState(at).is(block(helper, "loam_path")), "shovel: " + helper.getBlockState(at));
        helper.setBlock(at, block(helper, "loam"));
        takeItems(helper, at, Items.STICK);
        use(helper, player, new ItemStack(Items.IRON_HOE), at, Direction.UP);
        helper.assertTrue(helper.getBlockState(at).is(block(helper, "loam_farmland")), "hoe: " + helper.getBlockState(at));
        helper.assertValueEqual(takeItems(helper, at, Items.STICK), 1, "sticks dropped");
        helper.setBlock(at, block(helper, "loam"));
        helper.setBlock(at.above(), Blocks.STONE);
        use(helper, player, new ItemStack(Items.IRON_SHOVEL), at, Direction.UP);
        helper.assertTrue(helper.getBlockState(at).is(block(helper, "loam")), "flattened under stone: " + helper.getBlockState(at));
        helper.succeed();
    }
}
