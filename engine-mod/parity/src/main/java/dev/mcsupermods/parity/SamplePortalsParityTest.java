package dev.mcsupermods.parity;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.animal.cow.Cow;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.Portal;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.portal.TeleportTransition;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity over {@code fixtures/sample-portals} (namespace {@code msm_sample_portals}, ADRs 0077 and 0078),
 * against vanilla and Fabric API only (ADR 0033 D5): the content jar's runtime classes and the ejected project's classes
 * differ, so every check goes through vanilla types (block states and {@link BlockStateProperties#HORIZONTAL_AXIS},
 * {@link ItemStack} damage, entities and their levels), vanilla calls ({@code ServerPlayerGameMode.useItemOn}, the call
 * the server's use packet makes; vanilla portal processing of ticking entities), commands ({@code /fill}, {@code /loot})
 * and the chat line of the beacon's {@code say} function ({@link ParityChat}). Run with
 * {@code --gametest-filter msm_parity_tests:sample_portals_*}.
 *
 * <ul>
 *   <li>{@code sky_portal}: frame {@code sky_stone}, flint and steel, to {@code msm_sample_portals:sky_realm}.</li>
 *   <li>{@code ember_portal}: frame tag {@code #msm_sample_portals:ember_frame} (gold, copper, waxed copper),
 *       {@code frame_block} gold, the {@code ember_key} (64 uses), to the Nether, scaled 8:1 by the dimension types.</li>
 *   <li>{@code drift_portal}: crying obsidian, {@code igniter: false} (lit by using {@code drift_beacon}, whose
 *       {@code light_portal} action lights a frame beside it), to {@code sky_realm}, players only.</li>
 * </ul>
 *
 * <p>The GameTest server makes no level of a data pack dimension (F20, limit P8: {@code GameTestServer} bakes its world
 * from the {@code flat_all_dimensions} preset with an empty level stem registry), so {@code sky_realm} does not exist
 * here: trips to it are refused (the cow stays, as with any missing level) and CI lets the runtime's missing-level
 * warning pass with {@code --allow-line}. Travel itself is checked on {@code ember_portal} to the Nether; the
 * {@code on_travel} line of {@code sky_portal} is left to the dedicated server and the in-game check.
 *
 * <p>The GameTest world is new for each run but shared by the tests of a batch, and exits link to the nearest portal of
 * the same block: so every lighting test removes its portal in the tick it lit it, and one test holds every ember trip.
 */
public class SamplePortalsParityTest {
    static {
        ParityChat.register();
    }

    private static final String NAMESPACE = "msm_sample_portals";
    private static final List<String> PORTALS = List.of("sky_portal", "ember_portal", "drift_portal");
    private static final String BEACON_USED = "The drift beacon is used.";

    /** The bottom-left inside block of the test frames; the openings are 2 wide and 3 high. */
    private static final BlockPos INSIDE = new BlockPos(2, 2, 3);
    private static final int WIDTH = 2;
    private static final int HEIGHT = 3;

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

    /** The direction the opening runs along on {@code axis}. */
    private static Direction along(Direction.Axis axis) {
        return axis == Direction.Axis.X ? Direction.EAST : Direction.SOUTH;
    }

    /** The relative position {@code right} along and {@code up} above the bottom-left inside block. */
    private static BlockPos at(Direction.Axis axis, int right, int up) {
        return INSIDE.relative(along(axis), right).above(up);
    }

    /** The relative inside positions of the opening. */
    private static List<BlockPos> inside(Direction.Axis axis) {
        return inside(axis, WIDTH, HEIGHT);
    }

    private static List<BlockPos> inside(Direction.Axis axis, int width, int height) {
        List<BlockPos> out = new ArrayList<>();
        for (int right = 0; right < width; right++) {
            for (int up = 0; up < height; up++) {
                out.add(at(axis, right, up));
            }
        }
        return out;
    }

    private static String coordinates(GameTestHelper helper, BlockPos rel) {
        BlockPos abs = helper.absolutePos(rel);
        return abs.getX() + " " + abs.getY() + " " + abs.getZ();
    }

    /** Runs {@code command} as the server at the test's origin and returns its result (-1 when it failed). */
    private static int command(GameTestHelper helper, String command) {
        ServerLevel level = helper.getLevel();
        int[] result = {-1};
        CommandSourceStack source = level.getServer().createCommandSourceStack().withLevel(level)
                .withPosition(Vec3.atBottomCenterOf(helper.absolutePos(BlockPos.ZERO))).withSuppressedOutput()
                .withCallback((success, value) -> result[0] = success ? value : -1);
        level.getServer().getCommands().performPrefixedCommand(source, command);
        return result[0];
    }

    /**
     * Builds an upright frame of {@code frame} (corners included) around an opening of {@code width} by {@code height}
     * from {@link #INSIDE} along {@code axis} with {@code /fill}, the opening left as air.
     */
    private static void frame(GameTestHelper helper, Direction.Axis axis, int width, int height, String frame) {
        BlockPos from = at(axis, -1, -1);
        BlockPos to = at(axis, width, height);
        helper.assertTrue(command(helper, "fill " + coordinates(helper, from) + " " + coordinates(helper, to) + " " + frame) > 0,
                "/fill of the frame failed");
        BlockPos in = at(axis, width - 1, height - 1);
        helper.assertTrue(command(helper, "fill " + coordinates(helper, INSIDE) + " " + coordinates(helper, in) + " minecraft:air") > 0,
                "/fill of the opening failed");
    }

    private static void setblock(GameTestHelper helper, BlockPos rel, String block) {
        helper.assertTrue(command(helper, "setblock " + coordinates(helper, rel) + " " + block) > 0, "/setblock " + block + " failed");
    }

    /** Air over the whole frame and opening of a 2 by 3 portal (so no later trip links to it). */
    private static void clear(GameTestHelper helper, Direction.Axis axis) {
        command(helper, "fill " + coordinates(helper, at(axis, -1, -1)) + " " + coordinates(helper, at(axis, WIDTH, HEIGHT)) + " minecraft:air");
    }

    /** A mock player in the level in front of the opening, holding {@code stack}. */
    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    private static ServerPlayer player(GameTestHelper helper, GameType mode, ItemStack stack) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(mode);
        player.setPos(helper.absoluteVec(new Vec3(INSIDE.getX() + 0.5, INSIDE.getY(), INSIDE.getZ() - 1.5)));
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        return player;
    }

    private static void leave(GameTestHelper helper, ServerPlayer player) {
        player.closeContainer();
        helper.getLevel().getServer().getPlayerList().remove(player);
    }

    /** A right-click with the main hand on {@code face} of the block at {@code rel}, as the network handler does. */
    private static InteractionResult use(GameTestHelper helper, ServerPlayer player, BlockPos rel, Direction face) {
        BlockPos abs = helper.absolutePos(rel);
        Vec3 point = Vec3.atCenterOf(abs).add(face.getStepX() * 0.5, face.getStepY() * 0.5, face.getStepZ() * 0.5);
        BlockHitResult hit = new BlockHitResult(point, face, abs, false);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND),
                InteractionHand.MAIN_HAND, hit);
    }

    /** Uses {@code stack} on the top of the bottom frame block under the opening (as with flint and steel on a Nether frame). */
    private static ItemStack light(GameTestHelper helper, GameType mode, ItemStack stack) {
        ServerPlayer player = player(helper, mode, stack);
        try {
            use(helper, player, INSIDE.below(), Direction.UP);
            return player.getMainHandItem();
        } finally {
            leave(helper, player);
        }
    }

    /** Asserts that the whole opening is {@code portal} with the frame's axis. */
    private static void assertLit(GameTestHelper helper, Block portal, Direction.Axis axis, String what) {
        for (BlockPos rel : inside(axis)) {
            BlockState state = helper.getBlockState(rel);
            helper.assertTrue(state.is(portal), what + ": " + state + " at " + rel + ", expected " + portal);
            helper.assertValueEqual(state.getValue(BlockStateProperties.HORIZONTAL_AXIS), axis, what + ": the axis at " + rel);
        }
    }

    /** How many {@code block} blocks stand in {@code box} of {@code level}. */
    private static List<BlockPos> blocksIn(ServerLevel level, AABB box, Block block) {
        List<BlockPos> out = new ArrayList<>();
        BlockPos.betweenClosedStream(box).forEach(pos -> {
            if (level.getBlockState(pos).is(block)) {
                out.add(pos.immutable());
            }
        });
        return out;
    }

    private static List<BlockPos> portalBlocks(GameTestHelper helper, Block portal) {
        return blocksIn(helper.getLevel(), helper.absoluteAABB(new AABB(BlockPos.ZERO).expandTowards(7, 7, 7)), portal);
    }

    private static ServerLevel nether(GameTestHelper helper) {
        return helper.getLevel().getServer().getLevel(Level.NETHER);
    }

    /** The middle of the opening's bottom row, at feet height (absolute). */
    private static Vec3 middle(GameTestHelper helper, Direction.Axis axis) {
        Direction along = along(axis);
        Vec3 corner = Vec3.atBottomCenterOf(helper.absolutePos(INSIDE));
        return corner.add(along.getStepX() * 0.5, 0, along.getStepZ() * 0.5);
    }

    private static <T extends Entity> List<T> tagged(ServerLevel level, Class<T> type, AABB box, String tag) {
        return level.getEntitiesOfClass(type, box, e -> e.entityTags().contains(tag));
    }

    // Registration (ADR 0077 D1, D3)

    /**
     * The three portals are registered with the horizontal axis and light 11 and have no item and no loot table; the
     * frame block, the beacon and the key are items; {@code sky_realm} is a project dimension id.
     */
    @GameTest
    public void portalsRegisterWithoutItems(GameTestHelper helper) {
        for (String path : PORTALS) {
            Block portal = block(helper, path);
            BlockState state = portal.defaultBlockState();
            helper.assertTrue(state.hasProperty(BlockStateProperties.HORIZONTAL_AXIS), path + " has no axis property");
            helper.assertValueEqual(state.getLightEmission(), 11, path + " light");
            helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id(path)), path + " has an item");
            helper.assertTrue(portal.asItem() == Items.AIR, path + " has a block item: " + portal.asItem());
            helper.assertTrue(portal.getLootTable().isEmpty(), path + " has a loot table: " + portal.getLootTable());
            helper.assertFalse(state.hasBlockEntity(), path + " has a block entity");
        }
        for (String path : List.of("sky_stone", "drift_beacon")) {
            helper.assertTrue(block(helper, path).asItem() == item(helper, path), path + ": block item");
        }
        helper.assertValueEqual(new ItemStack(item(helper, "ember_key")).getMaxDamage(), 64, "the ember key's uses");
        helper.assertValueEqual(block(helper, "sky_stone").defaultBlockState().getLightEmission(), 5, "sky stone light");
        helper.succeed();
    }

    // Lighting (ADR 0077 D2, D4)

    /** Flint and steel in a Sky Stone frame along x lights the whole opening; in Survival it loses one point. */
    @GameTest
    public void flintAndSteelLightsTheSkyPortalAlongX(GameTestHelper helper) {
        Block portal = block(helper, "sky_portal");
        frame(helper, Direction.Axis.X, WIDTH, HEIGHT, "msm_sample_portals:sky_stone");
        ItemStack left = light(helper, GameType.SURVIVAL, new ItemStack(Items.FLINT_AND_STEEL));
        assertLit(helper, portal, Direction.Axis.X, "sky portal along x");
        helper.assertValueEqual(portalBlocks(helper, portal).size(), WIDTH * HEIGHT, "portal blocks");
        helper.assertTrue(left.is(Items.FLINT_AND_STEEL), "flint and steel left: " + left);
        helper.assertValueEqual(left.getDamageValue(), 1, "flint and steel damage in Survival");
        clear(helper, Direction.Axis.X);
        helper.succeed();
    }

    /** The same along z, without corners; in Creative the flint and steel takes no damage. */
    @GameTest
    public void flintAndSteelLightsTheSkyPortalAlongZ(GameTestHelper helper) {
        Block portal = block(helper, "sky_portal");
        Direction.Axis axis = Direction.Axis.Z;
        frame(helper, axis, WIDTH, HEIGHT, "msm_sample_portals:sky_stone");
        for (BlockPos corner : List.of(at(axis, -1, -1), at(axis, WIDTH, -1), at(axis, -1, HEIGHT), at(axis, WIDTH, HEIGHT))) {
            helper.setBlock(corner, Blocks.AIR);
        }
        ItemStack left = light(helper, GameType.CREATIVE, new ItemStack(Items.FLINT_AND_STEEL));
        assertLit(helper, portal, axis, "sky portal along z");
        helper.assertValueEqual(left.getDamageValue(), 0, "flint and steel damage in Creative");
        clear(helper, axis);
        helper.succeed();
    }

    /**
     * Other items light nothing: a stick and the Ember Key in a Sky Stone frame, and flint and steel in the gold ember
     * frame or the crying obsidian frame (no portal: vanilla's fire instead).
     */
    @GameTest
    public void otherItemsLightNoPortal(GameTestHelper helper) {
        Direction.Axis axis = Direction.Axis.X;
        frame(helper, axis, WIDTH, HEIGHT, "msm_sample_portals:sky_stone");
        light(helper, GameType.SURVIVAL, new ItemStack(Items.STICK));
        light(helper, GameType.SURVIVAL, new ItemStack(item(helper, "ember_key")));
        for (BlockPos rel : inside(axis)) {
            helper.assertTrue(helper.getBlockState(rel).isAir(), "not air in the sky stone frame at " + rel + ": " + helper.getBlockState(rel));
        }
        for (String frame : List.of("minecraft:gold_block", "minecraft:crying_obsidian")) {
            frame(helper, axis, WIDTH, HEIGHT, frame);
            light(helper, GameType.SURVIVAL, new ItemStack(Items.FLINT_AND_STEEL));
            helper.assertTrue(helper.getBlockState(INSIDE).is(Blocks.FIRE), "no vanilla fire in the " + frame + " frame: "
                    + helper.getBlockState(INSIDE));
            for (String path : PORTALS) {
                helper.assertValueEqual(portalBlocks(helper, block(helper, path)).size(), 0, path + " blocks in the " + frame + " frame");
            }
            clear(helper, axis);
        }
        helper.succeed();
    }

    /** An opening 1 wide, or a frame with a gap in a side, lights nothing: flint and steel makes vanilla fire. */
    @GameTest
    public void aTooSmallOrOpenFrameLightsNothing(GameTestHelper helper) {
        Block portal = block(helper, "sky_portal");
        Direction.Axis axis = Direction.Axis.X;
        frame(helper, axis, 1, HEIGHT, "msm_sample_portals:sky_stone");
        light(helper, GameType.SURVIVAL, new ItemStack(Items.FLINT_AND_STEEL));
        helper.assertValueEqual(portalBlocks(helper, portal).size(), 0, "portal blocks in a 1 wide opening");
        helper.assertTrue(helper.getBlockState(INSIDE).is(Blocks.FIRE), "no vanilla fire: " + helper.getBlockState(INSIDE));
        command(helper, "fill " + coordinates(helper, at(axis, -1, -1)) + " " + coordinates(helper, at(axis, 1, HEIGHT)) + " minecraft:air");
        frame(helper, axis, WIDTH, HEIGHT, "msm_sample_portals:sky_stone");
        helper.setBlock(at(axis, WIDTH, 1), Blocks.AIR); // a gap in the right side
        light(helper, GameType.SURVIVAL, new ItemStack(Items.FLINT_AND_STEEL));
        helper.assertValueEqual(portalBlocks(helper, portal).size(), 0, "portal blocks in a frame with a gap");
        clear(helper, axis);
        helper.succeed();
    }

    /** The Ember Key lights a frame of any mix of the tag's blocks and loses one of its 64 uses in Survival. */
    @GameTest
    public void emberKeyLightsMixedTagFrames(GameTestHelper helper) {
        Block portal = block(helper, "ember_portal");
        Direction.Axis axis = Direction.Axis.Z;
        frame(helper, axis, WIDTH, HEIGHT, "minecraft:gold_block");
        setblock(helper, at(axis, -1, 1), "minecraft:copper_block");
        setblock(helper, at(axis, WIDTH, 0), "minecraft:waxed_copper_block");
        setblock(helper, at(axis, 1, HEIGHT), "minecraft:copper_block");
        ItemStack left = light(helper, GameType.SURVIVAL, new ItemStack(item(helper, "ember_key")));
        assertLit(helper, portal, axis, "ember portal");
        helper.assertValueEqual(left.getDamageValue(), 1, "ember key damage");
        clear(helper, axis);
        helper.succeed();
    }

    /** An Ember Key on its last use lights the frame and breaks. */
    @GameTest
    public void emberKeyIsUsedUp(GameTestHelper helper) {
        Block portal = block(helper, "ember_portal");
        Direction.Axis axis = Direction.Axis.X;
        frame(helper, axis, WIDTH, HEIGHT, "minecraft:copper_block");
        ItemStack key = new ItemStack(item(helper, "ember_key"));
        key.setDamageValue(key.getMaxDamage() - 1);
        ItemStack left = light(helper, GameType.SURVIVAL, key);
        assertLit(helper, portal, axis, "ember portal on the key's last use");
        helper.assertTrue(left.isEmpty(), "the key is not used up: " + left);
        clear(helper, axis);
        helper.succeed();
    }

    /** Using the Drift Beacon lights the crying obsidian frame beside it and says the beacon's line. */
    @GameTest
    public void driftBeaconLightsTheDriftPortal(GameTestHelper helper) {
        Block portal = block(helper, "drift_portal");
        Direction.Axis axis = Direction.Axis.X;
        frame(helper, axis, WIDTH, HEIGHT, "minecraft:crying_obsidian");
        BlockPos beacon = INSIDE.north();
        helper.setBlock(beacon, block(helper, "drift_beacon"));
        int mark = ParityChat.mark();
        ServerPlayer player = player(helper, GameType.SURVIVAL, ItemStack.EMPTY);
        try {
            use(helper, player, beacon, Direction.NORTH);
        } finally {
            leave(helper, player);
        }
        assertLit(helper, portal, axis, "drift portal");
        List<String> said = ParityChat.since(mark);
        helper.assertTrue(said.contains(BEACON_USED), "no chat line '" + BEACON_USED + "'; said " + said);
        clear(helper, axis);
        helper.setBlock(beacon, Blocks.AIR);
        helper.succeed();
    }

    // The portal block (ADR 0077 D3)

    /** Breaking a frame block (and, again, a portal block) puts the whole portal out. */
    @GameTest
    public void breakingTheFrameOrThePortalPutsItOut(GameTestHelper helper) {
        Block portal = block(helper, "sky_portal");
        Direction.Axis axis = Direction.Axis.X;
        frame(helper, axis, WIDTH, HEIGHT, "msm_sample_portals:sky_stone");
        light(helper, GameType.CREATIVE, new ItemStack(Items.FLINT_AND_STEEL));
        assertLit(helper, portal, axis, "before breaking the frame");
        helper.getLevel().destroyBlock(helper.absolutePos(at(axis, -1, 1)), true);
        helper.assertValueEqual(portalBlocks(helper, portal).size(), 0, "portal blocks after breaking a side");
        helper.setBlock(at(axis, -1, 1), block(helper, "sky_stone"));
        light(helper, GameType.CREATIVE, new ItemStack(Items.FLINT_AND_STEEL));
        assertLit(helper, portal, axis, "lit again");
        helper.getLevel().destroyBlock(helper.absolutePos(at(axis, 1, 2)), true);
        helper.assertValueEqual(portalBlocks(helper, portal).size(), 0, "portal blocks after breaking a portal block");
        clear(helper, axis);
        helper.succeed();
    }

    /** {@code /loot ... mine} gives nothing for a portal block, while the frame block gives itself. */
    @GameTest
    public void portalsGiveNoLoot(GameTestHelper helper) {
        Block portal = block(helper, "sky_portal");
        Direction.Axis axis = Direction.Axis.X;
        frame(helper, axis, WIDTH, HEIGHT, "msm_sample_portals:sky_stone");
        light(helper, GameType.CREATIVE, new ItemStack(Items.FLINT_AND_STEEL));
        assertLit(helper, portal, axis, "before /loot");
        BlockPos drop = new BlockPos(6, 2, 6);
        String to = coordinates(helper, drop);
        command(helper, "loot spawn " + to + " mine " + coordinates(helper, at(axis, 0, 1)) + " minecraft:diamond_pickaxe");
        command(helper, "loot spawn " + to + " mine " + coordinates(helper, at(axis, -1, 0)) + " minecraft:diamond_pickaxe");
        List<ItemEntity> drops = helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(drop)).inflate(1.5));
        List<String> what = drops.stream().map(e -> e.getItem().toString()).toList();
        helper.assertValueEqual(drops.size(), 1, "items from /loot: " + what);
        helper.assertTrue(drops.getFirst().getItem().is(block(helper, "sky_stone").asItem()), "the one item is not sky stone: " + what);
        drops.forEach(Entity::discard);
        clear(helper, axis);
        helper.succeed();
    }

    // Travel (ADR 0077 D5, D6)

    /**
     * An item and a cow put in a lit Ember Portal go to the Nether at x and z divided by 8, into one exit portal built
     * there of gold (2 by 3 with corners, on the entry's axis); the way back from that exit leads into the entry portal
     * and nothing new is built.
     */
    @GameTest(maxTicks = 200)
    public void emberPortalTakesItemsAndCowsToTheNetherAndBack(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        ServerLevel nether = nether(helper);
        Block portal = block(helper, "ember_portal");
        Direction.Axis axis = Direction.Axis.X;
        frame(helper, axis, WIDTH, HEIGHT, "minecraft:gold_block");
        light(helper, GameType.CREATIVE, new ItemStack(item(helper, "ember_key")));
        assertLit(helper, portal, axis, "the entry");
        Vec3 inside = middle(helper, axis);
        AABB around = new AABB(BlockPos.containing(inside.x / 8, inside.y, inside.z / 8)).inflate(24, 300, 24);

        ItemEntity thrown = helper.spawnItem(Items.NAUTILUS_SHELL, helper.relativeVec(inside));
        thrown.setItem(new ItemStack(Items.NAUTILUS_SHELL, 5));
        thrown.setDeltaMovement(Vec3.ZERO);
        thrown.addTag("msm_parity_portal_item");
        Cow cow = helper.spawnWithNoFreeWill(EntityTypes.COW, helper.relativeVec(inside));
        cow.addTag("msm_parity_portal_cow");
        AtomicReference<Cow> arrived = new AtomicReference<>();
        AtomicReference<List<BlockPos>> exit = new AtomicReference<>();
        helper.startSequence()
                .thenWaitUntil(() -> {
                    helper.assertTrue(thrown.isRemoved() && thrown.getRemovalReason() == Entity.RemovalReason.CHANGED_DIMENSION,
                            "the item has not left: " + thrown.getRemovalReason());
                    helper.assertTrue(cow.isRemoved() && cow.getRemovalReason() == Entity.RemovalReason.CHANGED_DIMENSION,
                            "the cow has not left: " + cow.getRemovalReason());
                    List<Cow> cows = tagged(nether, Cow.class, around, "msm_parity_portal_cow");
                    helper.assertValueEqual(cows.size(), 1, "cows arrived in the Nether");
                    helper.assertValueEqual(tagged(nether, ItemEntity.class, around, "msm_parity_portal_item").size(), 1,
                            "items arrived in the Nether");
                    arrived.set(cows.getFirst());
                })
                .thenExecute(() -> {
                    Cow there = arrived.get();
                    Vec3 pos = there.position();
                    helper.assertTrue(Math.abs(pos.x - inside.x / 8) <= 17 && Math.abs(pos.z - inside.z / 8) <= 17,
                            "the cow arrived at " + pos + ", far from x and z divided by 8: " + inside.x / 8 + ", " + inside.z / 8);
                    List<BlockPos> blocks = blocksIn(nether, new AABB(there.blockPosition()).inflate(3), portal);
                    helper.assertValueEqual(blocks.size(), WIDTH * HEIGHT, "exit portal blocks around the arrival " + pos);
                    helper.assertTrue(blocks.stream().anyMatch(p -> p.equals(there.blockPosition()) || p.equals(there.blockPosition().above())),
                            "no exit portal block at the arrival " + pos + ": " + blocks);
                    BlockPos min = blocks.stream().reduce((a, b) -> new BlockPos(Math.min(a.getX(), b.getX()), Math.min(a.getY(), b.getY()),
                            Math.min(a.getZ(), b.getZ()))).orElseThrow();
                    for (BlockPos p : blocks) {
                        helper.assertValueEqual(nether.getBlockState(p).getValue(BlockStateProperties.HORIZONTAL_AXIS), axis,
                                "the exit's axis at " + p);
                    }
                    Direction a = along(axis);
                    for (int right = -1; right <= WIDTH; right++) {
                        for (int up = -1; up <= HEIGHT; up++) {
                            boolean ring = right == -1 || right == WIDTH || up == -1 || up == HEIGHT;
                            if (ring) {
                                BlockPos p = min.relative(a, right).above(up);
                                helper.assertTrue(nether.getBlockState(p).is(Blocks.GOLD_BLOCK),
                                        "the exit's frame is not gold at " + p + ": " + nether.getBlockState(p));
                            }
                        }
                    }
                    ItemEntity item = tagged(nether, ItemEntity.class, around, "msm_parity_portal_item").getFirst();
                    helper.assertValueEqual(item.getItem().getCount(), 5, "nautilus shells arrived");
                    helper.assertTrue(new AABB(min).inflate(3).contains(item.position()), "the item arrived away from the exit: " + item.position());
                    exit.set(blocks);
                    item.discard();
                    there.discard();
                })
                .thenExecute(() -> {
                    // The way back through vanilla's Portal interface (the call vanilla's portal processing makes for an
                    // entity standing in the exit): a ticking cow would need the exit's Nether chunk to tick entities,
                    // which the GameTest server does not always do for a level without players.
                    BlockPos min = exit.get().stream().reduce((a, b) -> new BlockPos(Math.min(a.getX(), b.getX()),
                            Math.min(a.getY(), b.getY()), Math.min(a.getZ(), b.getZ()))).orElseThrow();
                    Direction a = along(axis);
                    Cow returning = EntityTypes.COW.create(nether, EntitySpawnReason.TRIGGERED);
                    returning.snapTo(Vec3.atBottomCenterOf(min).add(a.getStepX() * 0.5, 0, a.getStepZ() * 0.5));
                    helper.assertTrue(portal instanceof Portal, "ember_portal is not a vanilla Portal: " + portal.getClass());
                    TeleportTransition way = ((Portal) portal).getPortalDestination(nether, returning, min);
                    helper.assertTrue(way != null && way.newLevel() == level, "the way back does not lead to the overworld: " + way);
                    BlockPos p = BlockPos.containing(way.position());
                    helper.assertTrue(level.getBlockState(p).is(portal) || level.getBlockState(p.above()).is(portal),
                            "the way back does not land in the entry portal: " + way.position() + " (entry at "
                                    + helper.absolutePos(INSIDE) + ")");
                    returning.discard();
                })
                .thenExecute(() -> {
                    helper.assertValueEqual(blocksIn(level, helper.absoluteAABB(new AABB(BlockPos.ZERO).expandTowards(7, 7, 7)).inflate(16), portal)
                            .size(), WIDTH * HEIGHT, "ember portal blocks around the entry (nothing built on the way back)");
                    helper.assertValueEqual(blocksIn(nether, new AABB(exit.get().getFirst()).inflate(16), portal).size(), WIDTH * HEIGHT,
                            "ember portal blocks in the Nether (one exit)");
                    for (BlockPos p : exit.get()) {
                        nether.setBlock(p, Blocks.AIR.defaultBlockState(), Block.UPDATE_CLIENTS);
                    }
                    clear(helper, axis);
                })
                .thenSucceed();
    }

    /** A cow in a lit Drift Portal stays where it is: the portal takes players only. */
    @GameTest(maxTicks = 60)
    public void driftPortalRefusesCows(GameTestHelper helper) {
        Block portal = block(helper, "drift_portal");
        Direction.Axis axis = Direction.Axis.Z;
        frame(helper, axis, WIDTH, HEIGHT, "minecraft:crying_obsidian");
        BlockPos beacon = INSIDE.west();
        helper.setBlock(beacon, block(helper, "drift_beacon"));
        ServerPlayer player = player(helper, GameType.SURVIVAL, ItemStack.EMPTY);
        try {
            use(helper, player, beacon, Direction.WEST);
        } finally {
            leave(helper, player);
        }
        assertLit(helper, portal, axis, "drift portal");
        Cow cow = helper.spawnWithNoFreeWill(EntityTypes.COW, helper.relativeVec(middle(helper, axis)));
        helper.runAfterDelay(30, () -> {
            helper.assertFalse(cow.isRemoved(), "the cow left: " + cow.getRemovalReason());
            helper.assertTrue(cow.level() == helper.getLevel(), "the cow is in " + cow.level().dimension());
            cow.discard();
            clear(helper, axis);
            helper.setBlock(beacon, Blocks.AIR);
            helper.succeed();
        });
    }

    /**
     * A cow in a lit Sky Portal stays where it is on the GameTest server, which has no {@code sky_realm} level (limit
     * P8): a portal to a missing level takes nobody, in the runtime and in the ejected mod alike.
     */
    @GameTest(maxTicks = 60)
    public void skyPortalTakesNobodyWithoutItsLevel(GameTestHelper helper) {
        ResourceKey<Level> skyRealm = ResourceKey.create(Registries.DIMENSION, id("sky_realm"));
        helper.assertTrue(helper.getLevel().getServer().getLevel(skyRealm) == null,
                "the GameTest server has a sky_realm level now: travel to it can be checked here (update this test)");
        Block portal = block(helper, "sky_portal");
        Direction.Axis axis = Direction.Axis.X;
        frame(helper, axis, WIDTH, HEIGHT, "msm_sample_portals:sky_stone");
        light(helper, GameType.CREATIVE, new ItemStack(Items.FLINT_AND_STEEL));
        assertLit(helper, portal, axis, "sky portal");
        Cow cow = helper.spawnWithNoFreeWill(EntityTypes.COW, helper.relativeVec(middle(helper, axis)));
        helper.runAfterDelay(30, () -> {
            helper.assertFalse(cow.isRemoved(), "the cow left: " + cow.getRemovalReason());
            helper.assertTrue(cow.level() == helper.getLevel(), "the cow is in " + cow.level().dimension());
            helper.assertTrue(cow.isOnPortalCooldown(), "vanilla sets the portal cooldown after a refused trip");
            cow.discard();
            clear(helper, axis);
            helper.succeed();
        });
    }
}
