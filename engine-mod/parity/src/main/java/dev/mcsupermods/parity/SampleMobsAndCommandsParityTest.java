package dev.mcsupermods.parity;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.common.ClientboundShowDialogPacket;
import net.minecraft.network.protocol.game.ServerboundPlayerCommandPacket;
import net.minecraft.network.protocol.game.ServerboundPlayerLoadedPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.stats.Stats;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Bucketable;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.PlayerRideableJumping;
import net.minecraft.world.entity.ai.targeting.TargetingConditions;
import net.minecraft.world.entity.ai.village.poi.PoiType;
import net.minecraft.world.entity.ai.village.poi.PoiTypes;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.npc.villager.Villager;
import net.minecraft.world.entity.npc.villager.VillagerType;
import net.minecraft.world.entity.vehicle.boat.AbstractBoat;
import net.minecraft.world.entity.vehicle.boat.ChestBoat;
import net.minecraft.world.item.BucketItem;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LayeredCauldronBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity over {@code fixtures/sample-mobs-and-commands} (namespace {@code msm_sample_mobs}, ADRs 0107 to 0111,
 * ADR 0112 D4; B541), written against vanilla and Fabric API only, so the same tests run against the content jar (the
 * runtime's classes) and the 26.3 ejected jar (the generated ones, B537 and B537b). Run with {@code --gametest-filter
 * msm_parity_tests:sample_mobs_and_commands_parity_test_*} on the ejected jar, or {@code sample_mobs_and_commands_*} on a
 * content jar, which also runs {@link SampleMobsAndCommandsTradersParityTest} (the trader and the shoulder pet are not
 * ejected yet) and {@link SampleMobsAndCommandsScriptParityTest} (scripts and the events of ADR 0111 D3 never are).
 *
 * <p>Black box, as {@code SampleVillagersParityTest}: the registries, mobs used through {@code interactOn}, blocks
 * through {@code ServerPlayerGameMode.useItemOn} and items through {@code useItem} (the network handler's paths),
 * commands, saved data, vanilla's {@link PoiTypes}, {@link VillagerType#byBiome}, recipes, tags and tab contents, and
 * the packets a {@link ParityEars} player receives.
 *
 * <p>Covered: what registers (the bed and planks, twelve mobs and their eggs, the fish bucket, two fluids with their
 * cauldrons and the one bottle, the boat and its chest boat with recipes and tags, the villager type, two game rules,
 * two statistics, two commands, the tab); the fish bucket taking the carp with its name and health as vanilla's cod
 * bucket; hovering 3 to 5 blocks over the ground; a phasing charge through a wall; a swoop; roosting under a block and
 * waking when hurt; the magpie collecting emeralds for its owner; the hog digging up sniffer loot; the newt playing dead
 * (regeneration, not a target); the haggler bartering gold from a hand and the ground; the runner's dash cooldown on
 * the jump bar; the straw mat as a home; the fen villager type for swamps; mixing of both fluids by their rules; both
 * cauldrons by bucket and bottle; the bottle filled at a source and drunk; the boats placed on water; the game rules
 * set and bounded by {@code /gamerule}; the statistics as scoreboard criteria; {@code /signal}'s argument types and its
 * dialog; the tab's own order.
 *
 * <p>Not covered here: the looks (the client GameTest {@code MsmMobs2ClientGameTest} and the fixture's README checks).
 */
public class SampleMobsAndCommandsParityTest {
    static final String NAMESPACE = "msm_sample_mobs";
    static final List<String> MOBS = List.of("kind_merchant", "pond_carp", "ember_wisp", "shade", "dusk_swooper", "cave_flitter",
            "trinket_magpie", "truffle_hog", "pond_newt", "gold_haggler", "dune_runner", "perch_owl");

    static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NAMESPACE, path);
    }

    @SuppressWarnings("unchecked")
    static <T extends Entity> EntityType<T> type(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.ENTITY_TYPE.containsKey(id(path)), "entity type " + id(path) + " is not registered");
        return (EntityType<T>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    static Block block(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.BLOCK.containsKey(id(path)), "block " + id(path) + " is not registered");
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    static Item item(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(id(path)), "item " + id(path) + " is not registered");
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    static Mob spawn(GameTestHelper helper, String path, BlockPos at) {
        return helper.spawn(SampleMobsAndCommandsParityTest.<Mob>type(helper, path), at);
    }

    /** A stone floor at y 0 under the whole 8 by 8 area, and air above it. */
    static void floor(GameTestHelper helper) {
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                helper.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
            }
        }
    }

    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    static ServerPlayer player(GameTestHelper helper, Vec3 at) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.snapTo(helper.absoluteVec(at));
        player.connection.handleAcceptPlayerLoad(new ServerboundPlayerLoadedPacket());
        player.setOnGround(true);
        return player;
    }

    static void leave(GameTestHelper helper, ServerPlayer... players) {
        for (ServerPlayer player : players) {
            player.stopRiding();
            player.closeContainer();
            helper.getLevel().getServer().getPlayerList().remove(player);
        }
    }

    static InteractionResult use(ServerPlayer player, Entity mob, ItemStack held) {
        player.setItemInHand(InteractionHand.MAIN_HAND, held);
        return player.interactOn(mob, InteractionHand.MAIN_HAND, Vec3.ZERO);
    }

    /** A right click on the top of the block at {@code rel} with {@code stack} in the main hand, as the network handler does. */
    static InteractionResult useOn(GameTestHelper helper, ServerPlayer player, BlockPos rel, ItemStack stack) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        BlockPos abs = helper.absolutePos(rel);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs).add(0, 0.5, 0), Direction.UP, abs, false);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND), InteractionHand.MAIN_HAND, hit);
    }

    /** Uses the held stack in the air while looking straight down from {@code at}, as a right-click does. */
    static InteractionResult useDown(GameTestHelper helper, ServerPlayer player, Vec3 at, ItemStack stack) {
        Vec3 abs = helper.absoluteVec(at);
        player.snapTo(abs.x, abs.y, abs.z, 0f, 90f);
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        return player.gameMode.useItem(player, helper.getLevel(), player.getMainHandItem(), InteractionHand.MAIN_HAND);
    }

    static List<ItemEntity> items(GameTestHelper helper, Vec3 around, double range, Item item) {
        return helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(around, around).inflate(range),
                e -> item == null || e.getItem().is(item));
    }

    static int count(List<ItemEntity> items) {
        return items.stream().mapToInt(e -> e.getItem().getCount()).sum();
    }

    /** Runs a command with {@code source} and returns its result (0 when it failed or did not parse). */
    static int command(CommandSourceStack source, String command) {
        AtomicInteger result = new AtomicInteger();
        source.getServer().getCommands().performPrefixedCommand(source.withSuppressedOutput().withCallback((success, value) ->
                result.set(success ? Math.max(value, 1) : 0)), command);
        return result.get();
    }

    /** Runs a command as the server in the test's level (permission level 4). */
    static int command(GameTestHelper helper, String command) {
        return command(helper.getLevel().getServer().createCommandSourceStack().withLevel(helper.getLevel()), command);
    }

    /** The value {@code /gamerule <rule>} reports (booleans as 1 and 0). */
    static int gameRule(GameTestHelper helper, String rule) {
        AtomicInteger result = new AtomicInteger(-99);
        CommandSourceStack source = helper.getLevel().getServer().createCommandSourceStack().withSuppressedOutput();
        source.getServer().getCommands().performPrefixedCommand(source.withCallback((success, value) -> result.set(success ? value : -98)),
                "gamerule " + rule);
        return result.get();
    }

    static String coords(GameTestHelper helper, BlockPos rel) {
        BlockPos abs = helper.absolutePos(rel);
        return abs.getX() + " " + abs.getY() + " " + abs.getZ();
    }

    static String name(BlockState state) {
        return BuiltInRegistries.BLOCK.getKey(state.getBlock()) + (state.hasProperty(LayeredCauldronBlock.LEVEL)
                ? "[level=" + state.getValue(LayeredCauldronBlock.LEVEL) + "]" : "");
    }

    // What registers

    @GameTest
    public void everythingRegisters(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        for (String mob : MOBS) {
            helper.assertTrue(type(helper, mob).create(level, EntitySpawnReason.COMMAND) instanceof Mob, mob + " is not a mob");
            item(helper, mob + "_spawn_egg");
        }
        for (String path : List.of("straw_mat", "larch_planks")) {
            block(helper, path);
            item(helper, path);
        }
        helper.assertValueEqual(new ItemStack(item(helper, "pond_carp_bucket")).getMaxStackSize(), 1, "the fish bucket stacks to");
        helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id("ember_wisp_bucket")), "a mob without msm:bucketable has a bucket");
        for (String fluid : List.of("maple_syrup", "hot_tar")) {
            helper.assertTrue(BuiltInRegistries.FLUID.containsKey(id(fluid)), "fluid " + fluid);
            helper.assertTrue(block(helper, fluid).defaultBlockState().liquid(), fluid + " block is not a liquid");
            helper.assertTrue(item(helper, fluid + "_bucket") instanceof BucketItem, fluid + " bucket");
            helper.assertTrue(block(helper, fluid + "_cauldron").defaultBlockState().is(net.minecraft.tags.BlockTags.CAULDRONS),
                    fluid + " cauldron is not in #minecraft:cauldrons");
        }
        helper.assertTrue(block(helper, "maple_syrup_cauldron").defaultBlockState().hasProperty(LayeredCauldronBlock.LEVEL),
                "the syrup cauldron has no levels");
        helper.assertFalse(block(helper, "hot_tar_cauldron").defaultBlockState().hasProperty(LayeredCauldronBlock.LEVEL),
                "the lava-like cauldron has levels");
        helper.assertValueEqual(new ItemStack(item(helper, "maple_syrup_bottle")).getMaxStackSize(), 16, "the bottle stacks to");
        helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id("hot_tar_bottle")), "hot tar has a bottle");
        helper.assertValueEqual(block(helper, "hot_tar").defaultBlockState().getLightEmission(), 10, "hot tar light");

        helper.assertTrue(type(helper, "larch_boat").create(level, EntitySpawnReason.COMMAND) instanceof AbstractBoat boat
                && !(boat instanceof ChestBoat), "larch_boat is not a plain boat");
        helper.assertTrue(type(helper, "larch_chest_boat").create(level, EntitySpawnReason.COMMAND) instanceof ChestBoat,
                "larch_chest_boat is not a chest boat");
        for (String boatItem : List.of("larch_boat", "larch_chest_boat")) {
            helper.assertValueEqual(new ItemStack(item(helper, boatItem)).getMaxStackSize(), 1, boatItem + " stacks to");
            helper.assertTrue(server.getRecipeManager().byKey(ResourceKey.create(Registries.RECIPE, id(boatItem))).isPresent(),
                    "no recipe " + boatItem);
        }
        helper.assertTrue(new ItemStack(item(helper, "larch_boat")).is(ItemTags.BOATS), "the boat is not in #minecraft:boats");
        helper.assertTrue(new ItemStack(item(helper, "larch_chest_boat")).is(ItemTags.CHEST_BOATS), "the chest boat is not in #minecraft:chest_boats");

        helper.assertTrue(BuiltInRegistries.VILLAGER_TYPE.containsKey(id("fen")), "villager type fen");
        for (String stat : List.of("carp_caught", "distance_hopped")) {
            helper.assertTrue(BuiltInRegistries.CUSTOM_STAT.containsKey(id(stat)), "statistic " + stat);
        }
        var root = server.getCommands().getDispatcher().getRoot();
        for (String literal : List.of("signal", "tally")) {
            helper.assertTrue(root.getChild(literal) != null, "no /" + literal);
        }
        var gamerule = root.getChild("gamerule");
        for (String rule : List.of("calm_nights", "merchant_bonus")) {
            helper.assertTrue(gamerule != null && gamerule.getChild(id(rule).toString()) != null, "no game rule " + rule);
        }
        helper.assertTrue(BuiltInRegistries.CREATIVE_MODE_TAB.containsKey(id("mobs_tab")), "creative tab mobs_tab");
        helper.succeed();
    }

    // Fish buckets (ADR 0109 D1)

    private static void pool(GameTestHelper helper) {
        floor(helper);
        for (int x = 1; x <= 6; x++) {
            for (int z = 1; z <= 6; z++) {
                boolean wall = x == 1 || x == 6 || z == 1 || z == 6;
                helper.setBlock(new BlockPos(x, 1, z), wall ? Blocks.STONE : Blocks.WATER);
            }
        }
    }

    /** The bucket of {@code fish}, taken with a water bucket and put back as vanilla's: its name and health come back. */
    private static void bucket(GameTestHelper helper, Mob fish, Item expected, BlockPos release) {
        fish.setCustomName(Component.literal("Finn"));
        fish.setHealth(2.0f);
        ServerPlayer catcher = player(helper, new Vec3(3.5, 2, 0.5));
        helper.assertTrue(fish instanceof Bucketable, BuiltInRegistries.ENTITY_TYPE.getKey(fish.getType()) + " is not Bucketable");
        helper.assertTrue(use(catcher, fish, new ItemStack(Items.WATER_BUCKET)).consumesAction(), "the water bucket did not take the fish");
        ItemStack held = catcher.getMainHandItem();
        helper.assertTrue(held.is(expected) && held.getCount() == 1, "held after the pickup: " + held);
        CompoundTag data = held.getOrDefault(DataComponents.BUCKET_ENTITY_DATA, CustomData.EMPTY).copyTag();
        helper.assertTrue(Math.abs(data.getFloatOr("Health", 0) - 2.0f) < 1.0e-4, "the health in the bucket: " + data);
        helper.assertTrue(fish.isRemoved(), "the fish stayed in the water");
        helper.assertTrue(useDown(helper, catcher, Vec3.atBottomCenterOf(release).add(0, 1, 0), held.copy()).consumesAction(),
                "the bucket was not emptied");
        helper.assertTrue(catcher.getMainHandItem().is(Items.BUCKET), "left in hand: " + catcher.getMainHandItem());
        List<Mob> back = helper.getLevel().getEntitiesOfClass(Mob.class, new AABB(helper.absolutePos(release)).inflate(1.5),
                e -> e.getType() == fish.getType());
        helper.assertValueEqual(back.size(), 1, "released fish");
        helper.assertValueEqual(back.getFirst().getCustomName() == null ? null : back.getFirst().getCustomName().getString(), "Finn", "the name");
        helper.assertTrue(Math.abs(back.getFirst().getHealth() - 2.0f) < 1.0e-4, "the health: " + back.getFirst().getHealth());
        helper.assertTrue(((Bucketable) back.getFirst()).fromBucket() && back.getFirst().requiresCustomPersistence(),
                "not marked as from a bucket");
        back.getFirst().discard();
        leave(helper, catcher);
    }

    @GameTest(maxTicks = 40)
    public void aWaterBucketTakesTheCarpAsVanillasCodBucketTakesACod(GameTestHelper helper) {
        pool(helper);
        bucket(helper, helper.spawn(EntityTypes.COD, new BlockPos(3, 1, 3)), Items.COD_BUCKET, new BlockPos(4, 1, 4));
        bucket(helper, spawn(helper, "pond_carp", new BlockPos(3, 1, 3)), item(helper, "pond_carp_bucket"), new BlockPos(4, 1, 4));
        helper.succeed();
    }

    // Flight (ADR 0109 D3)

    @GameTest(maxTicks = 220)
    public void theEmberWispHoversFourBlocksOverTheGround(GameTestHelper helper) {
        floor(helper);
        Mob wisp = spawn(helper, "ember_wisp", new BlockPos(4, 1, 4));
        double ground = helper.absoluteVec(new Vec3(0, 1, 0)).y;
        double[] range = {Double.MAX_VALUE, -Double.MAX_VALUE};
        int[] t = {0};
        helper.onEachTick(() -> {
            t[0]++;
            if (t[0] >= 100) {
                range[0] = Math.min(range[0], wisp.getY() - ground);
                range[1] = Math.max(range[1], wisp.getY() - ground);
            }
            if (t[0] == 200) {
                helper.assertTrue(range[0] > 3.0 && range[1] < 5.0, "the height over the ground from tick 100 to 200: " + range[0] + " to "
                        + range[1]);
                helper.assertTrue(wisp.isNoGravity(), "a hovering mob has gravity");
                helper.succeed();
            }
        });
    }

    @GameTest(maxTicks = 300)
    public void theShadeChargesThroughAWallAtAPig(GameTestHelper helper) {
        floor(helper);
        for (int z = 0; z < 8; z++) {
            for (int y = 1; y <= 6; y++) {
                helper.setBlock(new BlockPos(4, y, z), Blocks.STONE);
            }
        }
        LivingEntity pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, new BlockPos(6, 1, 4));
        Mob shade = spawn(helper, "shade", new BlockPos(1, 2, 4));
        shade.setTarget(pig);
        double wall = helper.absoluteVec(new Vec3(5, 0, 0)).x;
        float health = shade.getMaxHealth();
        helper.succeedWhen(() -> {
            helper.assertTrue(pig.getHealth() < pig.getMaxHealth(), "the pig behind the wall was not hit");
            helper.assertTrue(shade.getX() > wall - 0.5, "the shade did not get through the wall: x " + shade.getX());
            helper.assertTrue(shade.getHealth() == health, "the shade took damage in the wall: " + shade.getHealth());
        });
    }

    @GameTest(maxTicks = 400)
    public void theDuskSwooperCirclesHighThenDivesAtItsTarget(GameTestHelper helper) {
        floor(helper);
        LivingEntity pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, new BlockPos(4, 1, 4));
        Mob swooper = spawn(helper, "dusk_swooper", new BlockPos(1, 3, 1));
        swooper.setTarget(pig);
        double[] highest = {-Double.MAX_VALUE};
        helper.onEachTick(() -> highest[0] = Math.max(highest[0], swooper.getY() - pig.getY()));
        helper.succeedWhen(() -> {
            helper.assertTrue(highest[0] > 3.0, "the swooper never circled high: " + highest[0]);
            helper.assertTrue(pig.getHealth() < pig.getMaxHealth(), "the dive never hit");
        });
    }

    @GameTest(maxTicks = 300)
    public void theCaveFlitterHangsUnderABlockAndWakesWhenHurt(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        floor(helper);
        helper.setBlock(new BlockPos(4, 6, 4), Blocks.STONE);
        Mob flitter = spawn(helper, "cave_flitter", new BlockPos(4, 2, 4));
        double ceiling = helper.absoluteVec(new Vec3(0, 6, 0)).y;
        boolean[] hurt = {false};
        helper.succeedWhen(() -> {
            if (!hurt[0]) {
                helper.assertTrue(Math.abs(flitter.getBoundingBox().maxY - ceiling) < 1.0e-6, "not hanging yet: the box's top is at "
                        + flitter.getBoundingBox().maxY + ", the block's underside at " + ceiling);
                helper.assertTrue(flitter.isNoGravity(), "hanging with gravity");
                helper.assertTrue(SampleVillagersParityTest.saved(helper, flitter).getBooleanOr("Roosting", false), "Roosting is not saved");
                helper.assertTrue(flitter.hurtServer(level, level.damageSources().generic(), 1.0f), "the flitter was not hurt");
                hurt[0] = true;
            }
            // Roosting is saved only while the mob hangs.
            helper.assertFalse(SampleVillagersParityTest.saved(helper, flitter).getBooleanOr("Roosting", false), "a hurt flitter kept hanging");
        });
    }

    // Habits (ADR 0109 D4)

    @GameTest(maxTicks = 400)
    public void theTrinketMagpieBringsEmeraldsLikeItsOwnToItsOwner(GameTestHelper helper) {
        floor(helper);
        ServerPlayer owner = player(helper, new Vec3(0.5, 1, 0.5));
        Mob magpie = spawn(helper, "trinket_magpie", new BlockPos(1, 1, 1));
        helper.assertTrue(use(owner, magpie, new ItemStack(Items.EMERALD, 2)).consumesAction(), "the magpie did not take the emerald");
        helper.assertValueEqual(owner.getMainHandItem().getCount(), 1, "emeralds left in the hand");
        owner.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        for (int i = 0; i < 2; i++) {
            helper.spawnItem(Items.EMERALD, new Vec3(6.5, 1, 6.5 - i));
        }
        helper.spawnItem(Items.DIRT, new Vec3(6.5, 1, 4.5));
        Vec3 home = owner.position();
        helper.succeedWhen(() -> {
            owner.setOnGround(true);
            int near = count(items(helper, home, 3, Items.EMERALD)) + owner.getInventory().countItem(Items.EMERALD);
            helper.assertValueEqual(near, 2, "emeralds brought to the owner");
            helper.assertValueEqual(count(items(helper, helper.absoluteVec(new Vec3(6.5, 1, 4.5)), 2, Items.DIRT)), 1, "the dirt was left");
            leave(helper, owner);
        });
    }

    @GameTest(maxTicks = 600)
    public void theTruffleHogDigsMossForTheSniffersLoot(GameTestHelper helper) {
        floor(helper);
        for (int x = 4; x < 8; x++) {
            for (int z = 4; z < 8; z++) {
                helper.setBlock(new BlockPos(x, 0, z), Blocks.MOSS_BLOCK);
            }
        }
        spawn(helper, "truffle_hog", new BlockPos(1, 1, 1));
        Vec3 moss = helper.absoluteVec(new Vec3(5.5, 1, 5.5));
        helper.succeedWhen(() -> helper.assertTrue(count(items(helper, moss, 5, Items.TORCHFLOWER_SEEDS))
                + count(items(helper, moss, 5, Items.PITCHER_POD)) > 0, "nothing dug up yet"));
    }

    @GameTest(maxTicks = 200)
    public void thePondNewtPlaysDeadWhenBadlyHurtAndRecovers(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        floor(helper);
        Mob newt = spawn(helper, "pond_newt", new BlockPos(4, 1, 4));
        Mob other = spawn(helper, "pond_newt", new BlockPos(1, 1, 1));
        LivingEntity pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, new BlockPos(6, 1, 6));
        helper.assertTrue(TargetingConditions.forCombat().test(level, pig, newt), "not seen as an enemy before");
        other.hurtServer(level, level.damageSources().generic(), 2.0f);
        helper.assertFalse(other.hasEffect(MobEffects.REGENERATION), "a light hit made the newt play dead");
        newt.hurtServer(level, level.damageSources().generic(), 12.0f);
        helper.assertTrue(newt.hasEffect(MobEffects.REGENERATION), "no regeneration while playing dead");
        helper.assertFalse(TargetingConditions.forCombat().test(level, pig, newt), "seen as an enemy while playing dead");
        float hurtHealth = newt.getHealth();
        Vec3 at = newt.position();
        helper.runAfterDelay(30, () -> helper.assertTrue(newt.position().distanceTo(at) < 0.1, "moved while playing dead"));
        helper.runAfterDelay(70, () -> {
            helper.assertTrue(TargetingConditions.forCombat().test(level, pig, newt), "still not a target after its ticks");
            helper.assertTrue(newt.getHealth() > hurtHealth, "no health came back: " + newt.getHealth());
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 300)
    public void theGoldHagglerBartersGoldFromAHandAndTheGround(GameTestHelper helper) {
        floor(helper);
        ServerPlayer player = player(helper, new Vec3(4.5, 1, 2.5));
        Mob haggler = spawn(helper, "gold_haggler", new BlockPos(4, 1, 4));
        helper.assertFalse(use(player, haggler, new ItemStack(Items.DIRT)).consumesAction() && player.getMainHandItem().isEmpty(),
                "the haggler took dirt");
        helper.assertTrue(use(player, haggler, new ItemStack(Items.GOLD_INGOT, 2)).consumesAction(), "the haggler did not take gold");
        helper.assertValueEqual(player.getMainHandItem().getCount(), 1, "gold left in the hand");
        player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        Vec3 around = haggler.position();
        Vec3 ground = helper.absoluteVec(new Vec3(6.5, 1, 6.5));
        boolean[] rolled = {false};
        helper.succeedWhen(() -> {
            if (!rolled[0]) {
                helper.assertTrue(count(items(helper, around, 6, null)) > 0, "the roll dropped nothing");
                for (ItemEntity e : items(helper, around, 8, null)) {
                    e.discard();
                }
                helper.spawnItem(Items.GOLD_INGOT, new Vec3(6.5, 1, 6.5));
                rolled[0] = true;
            }
            helper.assertValueEqual(count(items(helper, ground, 1.5, Items.GOLD_INGOT)), 0, "the gold on the ground");
            helper.assertTrue(count(items(helper, haggler.position(), 6, null)) > 0, "the gold from the ground was not bartered");
            leave(helper, player);
        });
    }

    @GameTest(maxTicks = 100)
    public void theDuneRunnersJumpBarDashesAndCoolsDown(GameTestHelper helper) {
        floor(helper);
        Mob runner = spawn(helper, "dune_runner", new BlockPos(4, 1, 4));
        ServerPlayer rider = player(helper, new Vec3(4.5, 1, 2.5));
        helper.assertTrue(use(rider, runner, ItemStack.EMPTY).consumesAction() && rider.getVehicle() == runner, "the rider did not mount");
        helper.assertTrue(runner instanceof PlayerRideableJumping, "the runner has no jump bar");
        PlayerRideableJumping bar = (PlayerRideableJumping) runner;
        helper.assertTrue(bar.canJump(), "no jump bar before the dash");
        rider.connection.handlePlayerCommand(new ServerboundPlayerCommandPacket(rider, ServerboundPlayerCommandPacket.Action.START_RIDING_JUMP, 90));
        helper.assertValueEqual(bar.getJumpCooldown(), 40, "the bar's cooldown after the dash");
        helper.assertFalse(bar.canJump(), "the bar shows during the cooldown");
        helper.runAfterDelay(41, () -> {
            helper.assertTrue(bar.canJump(), "no bar after the cooldown");
            leave(helper, rider);
            helper.succeed();
        });
    }

    // Villager homes and types (ADR 0107 D4, D5)

    @GameTest
    public void theStrawMatIsAVillagersHomeAsVanillasBedsAre(GameTestHelper helper) {
        Holder<PoiType> home = PoiTypes.forState(Blocks.BED.red().defaultBlockState()
                .setValue(net.minecraft.world.level.block.BedBlock.PART, net.minecraft.world.level.block.state.properties.BedPart.HEAD))
                .orElseThrow();
        Block mat = block(helper, "straw_mat");
        for (BlockState state : mat.getStateDefinition().getPossibleStates()) {
            Optional<Holder<PoiType>> poi = PoiTypes.forState(state);
            boolean head = state.getValue(net.minecraft.world.level.block.BedBlock.PART) == net.minecraft.world.level.block.state.properties.BedPart.HEAD;
            helper.assertValueEqual(poi.isPresent() && poi.get().is(PoiTypes.HOME), head, "home point of interest of " + state);
        }
        floor(helper);
        helper.assertTrue(command(helper, "setblock " + coords(helper, new BlockPos(2, 1, 2)) + " " + NAMESPACE
                + ":straw_mat[part=foot,facing=east]") > 0, "the foot was not placed");
        helper.assertTrue(command(helper, "setblock " + coords(helper, new BlockPos(3, 1, 2)) + " " + NAMESPACE
                + ":straw_mat[part=head,facing=east]") > 0, "the head was not placed");
        helper.assertValueEqual(helper.getLevel().getPoiManager().getType(helper.absolutePos(new BlockPos(3, 1, 2))), Optional.of(home),
                "the home recorded at the head");
        helper.succeed();
    }

    @GameTest
    public void villagersOfSwampsAreFenVillagers(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        var biomes = level.registryAccess().lookupOrThrow(Registries.BIOME);
        helper.assertValueEqual(VillagerType.byBiome(biomes.getOrThrow(Biomes.SWAMP)).identifier(), id("fen"), "swamp villagers");
        helper.assertValueEqual(VillagerType.byBiome(biomes.getOrThrow(Biomes.MANGROVE_SWAMP)).identifier(), id("fen"), "mangrove swamp villagers");
        helper.assertValueEqual(VillagerType.byBiome(biomes.getOrThrow(Biomes.DESERT)).identifier(), VillagerType.DESERT.identifier(),
                "desert villagers are vanilla's");
        Villager villager = helper.spawnWithNoFreeWill(EntityTypes.VILLAGER, new BlockPos(1, 2, 1));
        var fen = BuiltInRegistries.VILLAGER_TYPE.wrapAsHolder(BuiltInRegistries.VILLAGER_TYPE.getValue(id("fen")));
        villager.setVillagerData(villager.getVillagerData().withType(fen));
        CompoundTag tag = SampleVillagersParityTest.saved(helper, villager);
        helper.assertTrue(tag.toString().contains(id("fen").toString()), "the type was not saved: " + tag);
        villager.discard();
        helper.succeed();
    }

    // Mixing (ADR 0108 D1)

    /** Places {@code first} at A, then {@code second} at B beside it (either may be a state string), checking B two ticks later. */
    private static void meet(GameTestHelper helper, String first, String second, Block atB) {
        floor(helper);
        for (int x = 1; x <= 4; x++) {
            for (int z = 1; z <= 3; z++) {
                boolean wall = x == 1 || x == 4 || z == 1 || z == 3;
                helper.setBlock(new BlockPos(x, 1, z), wall ? Blocks.STONE : Blocks.AIR);
            }
        }
        BlockPos a = new BlockPos(2, 1, 2);
        BlockPos b = new BlockPos(3, 1, 2);
        helper.assertTrue(command(helper, "setblock " + coords(helper, a) + " " + first) > 0, "setblock " + first);
        helper.assertTrue(command(helper, "setblock " + coords(helper, b) + " " + second) > 0, "setblock " + second);
        helper.runAfterDelay(2, () -> {
            BlockState state = helper.getBlockState(b);
            helper.assertTrue(state.is(atB), second + " beside " + first + " became " + name(state) + ", expected "
                    + BuiltInRegistries.BLOCK.getKey(atB));
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 20)
    public void mapleSyrupBesideLavaBecomesAHoneycombBlock(GameTestHelper helper) {
        meet(helper, "minecraft:lava", NAMESPACE + ":maple_syrup", Blocks.HONEYCOMB_BLOCK);
    }

    @GameTest(maxTicks = 20)
    public void flowingMapleSyrupBesideLavaBecomesBrownTerracotta(GameTestHelper helper) {
        meet(helper, "minecraft:lava", NAMESPACE + ":maple_syrup[level=3]", BuiltInRegistries.BLOCK.getValue(Identifier.withDefaultNamespace("brown_terracotta")));
    }

    @GameTest(maxTicks = 20)
    public void hotTarBesideWaterBecomesBlackstone(GameTestHelper helper) {
        meet(helper, "minecraft:water", NAMESPACE + ":hot_tar", Blocks.BLACKSTONE);
    }

    @GameTest(maxTicks = 20)
    public void flowingHotTarBesideWaterBecomesBasalt(GameTestHelper helper) {
        meet(helper, "minecraft:water", NAMESPACE + ":hot_tar[level=2]", Blocks.BASALT);
    }

    // Cauldrons and the bottle (ADR 0108 D2, D3)

    private static void step(GameTestHelper helper, ServerPlayer p, BlockPos at, Item item, String block, Item hand) {
        String before = name(helper.getBlockState(at));
        InteractionResult r = useOn(helper, p, at, new ItemStack(item));
        String after = name(helper.getBlockState(at));
        String what = before + " + " + BuiltInRegistries.ITEM.getKey(item) + " -> " + r + " => " + after + ", hand " + p.getMainHandItem();
        helper.assertValueEqual(after, block, what);
        helper.assertTrue(p.getMainHandItem().is(hand), what + " (hand should be " + BuiltInRegistries.ITEM.getKey(hand) + ")");
    }

    @GameTest(maxTicks = 20)
    public void bothCauldronsFillAndEmptyByBucketAndTheSyrupOneByBottle(GameTestHelper helper) {
        BlockPos c = new BlockPos(1, 1, 1);
        String syrup = NAMESPACE + ":maple_syrup_cauldron";
        String tar = NAMESPACE + ":hot_tar_cauldron";
        Item bottle = item(helper, "maple_syrup_bottle");
        ServerPlayer p = player(helper, new Vec3(2.5, 1, 2.5));
        helper.setBlock(c, Blocks.CAULDRON);
        step(helper, p, c, item(helper, "maple_syrup_bucket"), syrup + "[level=3]", Items.BUCKET);
        step(helper, p, c, Items.GLASS_BOTTLE, syrup + "[level=2]", bottle);
        step(helper, p, c, Items.GLASS_BOTTLE, syrup + "[level=1]", bottle);
        step(helper, p, c, Items.GLASS_BOTTLE, "minecraft:cauldron", bottle);
        step(helper, p, c, bottle, syrup + "[level=1]", Items.GLASS_BOTTLE);
        step(helper, p, c, Items.BUCKET, syrup + "[level=1]", Items.BUCKET); // only a full one
        step(helper, p, c, bottle, syrup + "[level=2]", Items.GLASS_BOTTLE);
        step(helper, p, c, bottle, syrup + "[level=3]", Items.GLASS_BOTTLE);
        step(helper, p, c, Items.BUCKET, "minecraft:cauldron", item(helper, "maple_syrup_bucket"));
        // The lava-like one is full only, as vanilla's lava cauldron.
        step(helper, p, c, item(helper, "hot_tar_bucket"), tar, Items.BUCKET);
        helper.assertValueEqual(helper.getBlockState(c).getAnalogOutputSignal(helper.getLevel(), helper.absolutePos(c), Direction.NORTH), 3,
                "the full cauldron's comparator signal");
        step(helper, p, c, Items.GLASS_BOTTLE, tar, Items.GLASS_BOTTLE);
        step(helper, p, c, Items.BUCKET, "minecraft:cauldron", item(helper, "hot_tar_bucket"));
        leave(helper, p);
        helper.succeed();
    }

    @GameTest(maxTicks = 80)
    public void aGlassBottleFillsAtASyrupSourceAndTheBottleIsDrunk(GameTestHelper helper) {
        floor(helper);
        for (int x = 1; x <= 5; x++) {
            for (int z = 1; z <= 5; z++) {
                boolean wall = x == 1 || x == 5 || z == 1 || z == 5;
                helper.setBlock(new BlockPos(x, 1, z), wall ? Blocks.STONE : block(helper, "maple_syrup"));
            }
        }
        Item bottle = item(helper, "maple_syrup_bottle");
        ServerPlayer p = player(helper, new Vec3(3.5, 2, 3.5));
        // Every step is scheduled from here: a callback that schedules another changes the list the test is ticking.
        helper.runAfterDelay(1, () -> {
            useDown(helper, p, new Vec3(3.5, 2, 3.5), new ItemStack(Items.GLASS_BOTTLE));
            helper.assertTrue(p.getMainHandItem().is(bottle), "a glass bottle at the source gave " + p.getMainHandItem());
            helper.assertTrue(helper.getBlockState(new BlockPos(3, 1, 3)).is(block(helper, "maple_syrup")), "the source is gone");
            p.snapTo(helper.absoluteVec(new Vec3(6.5, 1, 6.5)));
            p.getFoodData().setFoodLevel(10);
            helper.assertTrue(p.gameMode.useItem(p, helper.getLevel(), p.getMainHandItem(), InteractionHand.MAIN_HAND).consumesAction()
                    && p.isUsingItem(), "the drink did not start");
        });
        for (int t = 2; t <= 52; t++) {
            helper.runAfterDelay(t, () -> {
                if (p.isUsingItem()) {
                    p.doTick();
                }
            });
        }
        helper.runAfterDelay(56, () -> {
            helper.assertTrue(p.getMainHandItem().is(Items.GLASS_BOTTLE), "hand after drinking " + p.getMainHandItem());
            helper.assertValueEqual(p.getFoodData().getFoodLevel(), 12, "food after the bottle");
            helper.assertTrue(p.hasEffect(MobEffects.SPEED), "no speed from the bottle");
            leave(helper, p);
            helper.succeed();
        });
    }

    // Boats (ADR 0110)

    @GameTest(maxTicks = 60)
    public void theLarchBoatsArePlacedOnWaterAndFloatAsVanillasDo(GameTestHelper helper) {
        // A pool over the whole area: a boat is placed only where its box touches no wall.
        floor(helper);
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                boolean wall = x == 0 || x == 7 || z == 0 || z == 7;
                helper.setBlock(new BlockPos(x, 1, z), wall ? Blocks.STONE : Blocks.WATER);
            }
        }
        ServerPlayer placer = player(helper, new Vec3(4, 3, 4));
        for (String path : List.of("larch_boat", "larch_chest_boat")) {
            Vec3 at = path.equals("larch_boat") ? new Vec3(2.5, 3, 2.5) : new Vec3(5.5, 3, 5.5);
            InteractionResult used = useDown(helper, placer, at, new ItemStack(item(helper, path)));
            helper.assertTrue(used.consumesAction(), path + " was not used: " + used + " at " + placer.position() + " pitch "
                    + placer.getXRot() + ", below " + helper.getBlockState(BlockPos.containing(at).below(2)));
            helper.assertTrue(placer.getMainHandItem().isEmpty(), path + " left in a survival hand: " + placer.getMainHandItem());
        }
        leave(helper, placer);
        AABB area = new AABB(helper.absolutePos(BlockPos.ZERO)).expandTowards(8, 8, 8);
        List<AbstractBoat> boats = helper.getLevel().getEntitiesOfClass(AbstractBoat.class, area,
                b -> BuiltInRegistries.ENTITY_TYPE.getKey(b.getType()).getNamespace().equals(NAMESPACE));
        helper.assertValueEqual(boats.size(), 2, "boats placed");
        helper.assertValueEqual(boats.stream().filter(b -> b instanceof ChestBoat).count(), 1L, "chest boats placed");
        helper.runAfterDelay(40, () -> {
            double top = helper.absoluteVec(new Vec3(0, 2, 0)).y;
            for (AbstractBoat b : boats) {
                helper.assertTrue(!b.isRemoved() && b.getY() > top - 0.6 && b.getY() < top + 0.1, b.getType() + " floats at " + b.getY()
                        + ", water top " + top);
                b.discard();
            }
            helper.succeed();
        });
    }

    // Game rules and statistics (ADR 0111 D5, D6)

    @GameTest
    public void theGameRulesAreSetAndBoundedByGamerule(GameTestHelper helper) {
        String calm = id("calm_nights").toString();
        String bonus = id("merchant_bonus").toString();
        try {
            helper.assertValueEqual(gameRule(helper, calm), 0, "calm_nights by default");
            helper.assertValueEqual(gameRule(helper, bonus), 2, "merchant_bonus by default");
            helper.assertTrue(command(helper, "gamerule " + calm + " true") > 0, "calm_nights was not set");
            helper.assertValueEqual(gameRule(helper, calm), 1, "calm_nights after setting it");
            helper.assertTrue(command(helper, "gamerule " + bonus + " 5") > 0, "merchant_bonus 5 was refused");
            helper.assertValueEqual(command(helper, "gamerule " + bonus + " 6"), 0, "merchant_bonus 6 (above its max) was accepted");
            helper.assertValueEqual(command(helper, "gamerule " + bonus + " -1"), 0, "merchant_bonus -1 (below its min) was accepted");
            helper.assertValueEqual(gameRule(helper, bonus), 5, "merchant_bonus after the refusals");
            helper.assertValueEqual(command(helper, "gamerule calm_nights true"), 0, "the rule was found without its namespace");
        } finally {
            command(helper, "gamerule " + calm + " false");
            command(helper, "gamerule " + bonus + " 2");
        }
        helper.succeed();
    }

    @GameTest
    public void theStatisticsCountAsScoreboardCriteria(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        try (ParityEars ears = new ParityEars(helper, new BlockPos(1, 1, 1), GameType.SURVIVAL, "msm-mc-stats")) {
            ServerPlayer p = ears.player;
            helper.assertTrue(command(helper, "scoreboard objectives add b541carp minecraft.custom:" + NAMESPACE + ".carp_caught") > 0,
                    "the criterion of carp_caught was refused");
            helper.assertValueEqual(command(helper, "scoreboard objectives add b541none minecraft.custom:" + NAMESPACE + ".no_such_stat"), 0,
                    "an unknown statistic's criterion was accepted");
            Identifier carp = BuiltInRegistries.CUSTOM_STAT.getValue(id("carp_caught"));
            Identifier hopped = BuiltInRegistries.CUSTOM_STAT.getValue(id("distance_hopped"));
            p.awardStat(carp, 2);
            p.awardStat(carp);
            p.awardStat(hopped, 250);
            helper.assertValueEqual(p.getStats().getValue(Stats.CUSTOM.get(carp)), 3, "carp_caught");
            var objective = server.getScoreboard().getObjective("b541carp");
            helper.assertValueEqual(server.getScoreboard().getPlayerScoreInfo(p, objective).value(), 3, "the score");
            helper.assertValueEqual(Stats.CUSTOM.get(hopped).format(250), "2.50 m", "distance_hopped is a distance");
            helper.assertValueEqual(Stats.CUSTOM.get(carp).format(3), "3", "carp_caught is a count");
            server.getScoreboard().removeObjective(objective);
        }
        helper.succeed();
    }

    // Commands (ADR 0111 D2, D4)

    private static List<String> dialogs(List<Packet<?>> packets) {
        List<String> out = new ArrayList<>();
        for (Packet<?> packet : packets) {
            if (packet instanceof ClientboundShowDialogPacket show) {
                out.add(show.dialog().unwrapKey().map(k -> k.identifier().toString()).orElse("inline"));
            }
        }
        return out;
    }

    @GameTest
    public void signalTakesItsArgumentTypesAndOpensTheDialog(GameTestHelper helper) {
        try (ParityEars ears = new ParityEars(helper, new BlockPos(1, 1, 1), GameType.SURVIVAL, "msm-mc-signal")) {
            ServerPlayer p = ears.player;
            CommandSourceStack op = p.createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER);
            CommandSourceStack plain = p.createCommandSourceStack().withPermission(LevelBasedPermissionSet.ALL);
            String uuid = UUID.nameUUIDFromBytes("b541".getBytes()).toString();
            String args = " minecraft:the_nether 2d ff8800 90 0 " + uuid + " #minecraft:planks minecraft:stone";
            ears.packets();
            helper.assertValueEqual(command(plain, "signal" + args), 0, "a player without permission ran /signal");
            int ran = command(op, "signal" + args + " meet me there");
            helper.assertTrue(ran > 0, "/signal with every argument failed");
            helper.assertValueEqual(dialogs(ears.packets()), List.of(id("welcome").toString()), "dialogs sent to the player");
            helper.assertValueEqual(p.getInventory().countItem(Items.COMPASS), 1, "compasses given");
            helper.assertTrue(command(op, "signal" + args) > 0, "/signal without its optional note failed");
            // Not checked: an unknown dimension id, which the content jar refuses when the command runs (as vanilla's
            // execute in does) but the 26.3 eject accepts (B541 follow-up for the eject).
            for (String bad : List.of(" minecraft:the_nether 2q ff8800 90 0 " + uuid + " #minecraft:planks minecraft:stone",
                    " minecraft:the_nether 2d orange 90 0 " + uuid + " #minecraft:planks minecraft:stone",
                    " minecraft:the_nether 2d ff8800 90 0 not-a-uuid #minecraft:planks minecraft:stone")) {
                helper.assertValueEqual(command(op, "signal" + bad), 0, "/signal" + bad + " was accepted");
            }
            helper.assertValueEqual(dialogs(ears.packets()), List.of(id("welcome").toString()), "dialogs after the second run");
        }
        helper.succeed();
    }

    // The creative tab (ADR 0111 D7)

    @GameTest
    public void theTabListsItsItemsInItsOwnOrderThenTheRest(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        CreativeModeTab tab = BuiltInRegistries.CREATIVE_MODE_TAB.getValue(id("mobs_tab"));
        helper.assertTrue(tab != null, "mobs_tab is not registered");
        tab.buildContents(new CreativeModeTab.ItemDisplayParameters(server.getWorldData().enabledFeatures(), true, server.registryAccess()));
        List<String> shown = tab.getDisplayItems().stream().map(ItemStack::getItem).map(i -> BuiltInRegistries.ITEM.getKey(i).toString()).toList();
        helper.assertValueEqual(shown, List.of(id("pond_carp_bucket").toString(), id("maple_syrup_bottle").toString(),
                id("larch_chest_boat").toString(), id("larch_boat").toString(), "minecraft:water_bucket", id("straw_mat").toString()),
                "mobs_tab's items");
        helper.succeed();
    }
}
