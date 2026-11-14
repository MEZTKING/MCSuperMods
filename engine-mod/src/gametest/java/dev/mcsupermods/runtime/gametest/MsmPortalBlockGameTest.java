package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.registry.portal.PortalFrame;
import dev.mcsupermods.runtime.registry.portal.PortalIndex;
import dev.mcsupermods.runtime.registry.portal.PortalIndexAttachment;
import dev.mcsupermods.runtime.registry.portal.PortalLighting;
import dev.mcsupermods.runtime.registry.types.MsmPortalBlock;
import java.util.List;
import java.util.Optional;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.animal.cow.Cow;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.Portal;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;

/**
 * The portal block type, its lighting and looks (ADR 0077 D1, D3, D4; B334) on {@code msm/msm_test/block/portal_*.json}:
 * {@code portal_basic} (a project frame block {@code portal_frame}, flint and steel, every default), {@code portal_clash_a}
 * and {@code portal_clash_b} (the same frame and the project key {@code portal_key}: the first by id wins),
 * {@code portal_quiet} ({@code igniter: false}, lit by {@code portal_beacon}'s {@code light_portal}, players only, no
 * overlay, dust, silent, {@code delay_ticks} 7, light 15), {@code portal_tag} (frame and igniter tags),
 * {@code portal_with_item} (an explicit item and loot table) and the deliberately broken {@code portal_bad_*} files.
 *
 * <p>Lighting goes through {@code ServerPlayerGameMode.useItemOn}, as the network handler does, so the Fabric
 * {@code UseBlockCallback} and the item's own use run as in a game. Frames stand in the test structure (8 by 8 by 8);
 * index entries a test adds are removed before it succeeds (the GameTest world is kept between runs). Travel is B336.
 */
public class MsmPortalBlockGameTest {
    private static final double EPS = 1e-6;

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static MsmPortalBlock portal(String path) {
        return (MsmPortalBlock) block(path);
    }

    private static Item item(String path) {
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    private static ServerPlayer player(GameTestHelper helper, GameType mode) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(mode);
        player.setPos(helper.absoluteVec(new Vec3(4.5, 1, 7.5)));
        return player;
    }

    /** A right-click on {@code face} of the block at {@code rel} with the main hand, as the network handler does. */
    private static InteractionResult use(GameTestHelper helper, ServerPlayer player, BlockPos rel, Direction face) {
        BlockPos abs = helper.absolutePos(rel);
        Vec3 hitAt = Vec3.atCenterOf(abs).add(face.getStepX() * 0.5, face.getStepY() * 0.5, face.getStepZ() * 0.5);
        BlockHitResult hit = new BlockHitResult(hitAt, face, abs, false);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND),
                InteractionHand.MAIN_HAND, hit);
    }

    /**
     * A frame around an inside of {@code width} by {@code height} whose lowest left inside block is {@code min} (test
     * coordinates), corners included; {@code frames} are used in turn around the ring.
     */
    private static void frame(GameTestHelper helper, BlockPos min, Direction.Axis axis, int width, int height, Block... frames) {
        Direction right = PortalFrame.along(axis);
        int n = 0;
        for (int i = -1; i <= width; i++) {
            for (int up = -1; up <= height; up++) {
                boolean ring = i == -1 || i == width || up == -1 || up == height;
                helper.setBlock(min.relative(right, i).above(up), ring ? frames[n++ % frames.length] : Blocks.AIR);
            }
        }
    }

    /** The inside rectangle of {@link #frame} in absolute coordinates. */
    private static PortalFrame.Rectangle inside(GameTestHelper helper, BlockPos min, Direction.Axis axis, int width, int height) {
        return new PortalFrame.Rectangle(helper.absolutePos(min), axis, width, height);
    }

    private static boolean allOf(GameTestHelper helper, PortalFrame.Rectangle rect, Block block) {
        return PortalFrame.isComplete(helper.getLevel(), rect, block);
    }

    private static boolean noneOf(GameTestHelper helper, PortalFrame.Rectangle rect, Block block) {
        return PortalFrame.isUnlit(helper.getLevel(), rect, block);
    }

    /** Forgets every index entry of {@code block} whose inside starts in this test's area. */
    private static void forget(GameTestHelper helper, Block block) {
        ServerLevel level = helper.getLevel();
        BlockPos origin = helper.absolutePos(BlockPos.ZERO);
        for (PortalIndex.Entry entry : PortalIndexAttachment.get(level).entries()) {
            BlockPos d = entry.min().subtract(origin);
            if (entry.block().equals(PortalIndexAttachment.id(block)) && Math.abs(d.getX()) <= 16 && Math.abs(d.getZ()) <= 16) {
                PortalIndexAttachment.remove(level, entry);
            }
        }
    }

    // ---- loading and per-type defaults (D1) ---------------------------------------------------------------------------

    /** Portals register as {@link MsmPortalBlock} in sorted id order; only the {@code portal_bad_*} files have load errors. */
    @GameTest
    public void portalsRegisterAndOnlyTheBrokenFilesFail(GameTestHelper helper) {
        for (String path : List.of("portal_basic", "portal_clash_a", "portal_clash_b", "portal_quiet", "portal_tag", "portal_with_item",
                "portal_bad_particle", "portal_bad_tag_frame", "portal_bad_component")) {
            helper.assertTrue(block(path) instanceof MsmPortalBlock, path + " is not a portal block: " + block(path));
        }
        helper.assertFalse(block("portal_frame") instanceof MsmPortalBlock, "portal_frame is a portal");
        List<String> ids = PortalLighting.portals().stream().map(p -> BuiltInRegistries.BLOCK.getKey(p).toString())
                .filter(s -> s.startsWith("msm_test:portal_")).toList();
        helper.assertValueEqual(ids, List.of("msm_test:portal_bad_component", "msm_test:portal_bad_particle", "msm_test:portal_bad_tag_frame",
                "msm_test:portal_basic", "msm_test:portal_clash_a", "msm_test:portal_clash_b", "msm_test:portal_quiet", "msm_test:portal_tag",
                "msm_test:portal_with_item"), "portals in sorted id order");
        List<String> errors = MsmRuntime.report().errors().stream().filter(e -> e.contains("/portal_")).toList();
        helper.assertTrue(errors.stream().allMatch(e -> e.contains("/portal_bad_")), "portal errors outside portal_bad_*: " + errors);
        for (String bad : List.of("portal_bad_particle", "portal_bad_tag_frame", "portal_bad_component", "portal_bad_light")) {
            long n = errors.stream().filter(e -> e.contains("/" + bad + ".json")).count();
            helper.assertValueEqual(n, 1L, "errors of " + bad + ": " + errors);
        }
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("portal_bad_particle.json") && e.contains("minecraft:dust")),
                "particle error: " + errors);
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("portal_bad_tag_frame.json") && e.contains("frame_block")),
                "frame_block error: " + errors);
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("portal_bad_component.json") && e.contains("msm:on_interact")),
                "component error: " + errors);
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("portal_bad_light.json") && e.contains("light_portal names msm_test:portal_frame")),
                "light_portal error: " + errors);
        helper.assertFalse(MsmRuntime.report().warnings().stream().anyMatch(w -> w.contains("/portal_")),
                "portal warnings: " + MsmRuntime.report().warnings());
        helper.succeed();
    }

    /** The broken files still register: the default particle, no exit block, the disallowed component dropped. */
    @GameTest
    public void brokenPortalsKeepTheirDefaults(GameTestHelper helper) {
        helper.assertTrue(portal("portal_bad_particle").particle() == ParticleTypes.PORTAL, "bad particle not replaced by the default");
        helper.assertTrue(portal("portal_bad_tag_frame").portal().frameBlock().isEmpty(), "a tag frame without frame_block has an exit block");
        helper.assertTrue(portal("portal_bad_component").driver().definition().components().onInteract().isEmpty(),
                "msm:on_interact kept on a portal");
        helper.assertValueEqual(portal("portal_tag").portal().frameBlock(), Optional.of(Identifier.withDefaultNamespace("gold_block")),
                "frame_block of a tag frame");
        helper.assertValueEqual(portal("portal_basic").portal().frameBlock(), Optional.of(id("portal_frame")), "frame block defaults to frame");
        helper.assertTrue(portal("portal_basic").particle() == ParticleTypes.PORTAL, "default particle");
        helper.assertTrue(portal("portal_basic").ambientSound() != null, "no default ambient sound");
        helper.assertTrue(portal("portal_quiet").particle() instanceof DustParticleOptions, "color is not dust: " + portal("portal_quiet").particle());
        helper.assertTrue(portal("portal_quiet").ambientSound() == null, "ambient: false still plays");
        helper.succeed();
    }

    /** Light 11 (or msm:light_emitter), no collision, unbreakable, no item and no loot unless given (D1). */
    @GameTest
    public void portalDefaultsLightNoCollisionNoItemNoDrops(GameTestHelper helper) {
        BlockPos at = new BlockPos(3, 2, 3);
        helper.setBlock(at, block("portal_basic"));
        BlockState state = helper.getBlockState(at);
        helper.assertValueEqual(state.getLightEmission(), 11, "light");
        helper.assertValueEqual(block("portal_quiet").defaultBlockState().getLightEmission(), 15, "msm:light_emitter");
        helper.assertTrue(state.getCollisionShape(helper.getLevel(), helper.absolutePos(at)).isEmpty(), "a portal has collision");
        helper.assertValueEqual(state.getDestroySpeed(helper.getLevel(), helper.absolutePos(at)), -1.0f, "hardness");
        helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id("portal_basic")), "a portal without item has an item");
        helper.assertTrue(block("portal_basic").asItem() == Items.AIR, "asItem");
        helper.assertTrue(block("portal_basic").getLootTable().isEmpty(), "loot table: " + block("portal_basic").getLootTable());
        helper.assertTrue(Block.getDrops(state, helper.getLevel(), helper.absolutePos(at), null, null, ItemStack.EMPTY).isEmpty(), "drops");
        helper.assertTrue(state.getCloneItemStack(helper.getLevel(), helper.absolutePos(at), false).isEmpty(), "pick block");
        // An explicit item and loot table are kept.
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(id("portal_with_item")), "an explicit item is missing");
        helper.assertTrue(block("portal_with_item").getLootTable().isPresent(), "an explicit loot table is missing");
        BlockState withItem = block("portal_with_item").defaultBlockState();
        helper.assertValueEqual(withItem.getCloneItemStack(helper.getLevel(), helper.absolutePos(at), false).getItem(),
                item("portal_with_item"), "pick block with an item");
        helper.succeed();
    }

    /** The axis turns with a rotation; the shape is 4 pixels thick across the axis. */
    @GameTest
    public void axisRotatesAndTheShapeIsThin(GameTestHelper helper) {
        BlockState x = block("portal_basic").defaultBlockState().setValue(MsmPortalBlock.AXIS, Direction.Axis.X);
        helper.assertValueEqual(x.rotate(Rotation.CLOCKWISE_90).getValue(MsmPortalBlock.AXIS), Direction.Axis.Z, "rotated");
        helper.assertValueEqual(x.rotate(Rotation.CLOCKWISE_180).getValue(MsmPortalBlock.AXIS), Direction.Axis.X, "half turn");
        BlockState z = x.rotate(Rotation.COUNTERCLOCKWISE_90);
        helper.assertValueEqual(z.getValue(MsmPortalBlock.AXIS), Direction.Axis.Z, "rotated back");
        BlockPos at = helper.absolutePos(new BlockPos(1, 1, 1));
        AABB xs = x.getShape(helper.getLevel(), at, CollisionContext.empty()).bounds();
        AABB zs = z.getShape(helper.getLevel(), at, CollisionContext.empty()).bounds();
        helper.assertTrue(Math.abs(xs.minZ - 6 / 16.0) < EPS && Math.abs(xs.maxZ - 10 / 16.0) < EPS && xs.minX < EPS && xs.maxX > 1 - EPS,
                "axis x shape " + xs);
        helper.assertTrue(Math.abs(zs.minX - 6 / 16.0) < EPS && Math.abs(zs.maxX - 10 / 16.0) < EPS && zs.minZ < EPS && zs.maxZ > 1 - EPS,
                "axis z shape " + zs);
        helper.succeed();
    }

    // ---- lighting with an igniter (D3 (a)) ----------------------------------------------------------------------------

    /** Flint and steel against a frame of the project block lights it on both axes and loses one durability. */
    @GameTest
    public void flintAndSteelLightsAProjectFrameOnBothAxes(GameTestHelper helper) {
        MsmPortalBlock portal = portal("portal_basic");
        Block frameBlock = block("portal_frame");
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        ItemStack flint = new ItemStack(Items.FLINT_AND_STEEL);
        player.setItemInHand(InteractionHand.MAIN_HAND, flint);
        BlockPos minX = new BlockPos(2, 2, 2);
        BlockPos minZ = new BlockPos(6, 2, 2);
        frame(helper, minX, Direction.Axis.X, 2, 3, frameBlock);
        frame(helper, minZ, Direction.Axis.Z, 2, 3, frameBlock);
        helper.assertValueEqual(use(helper, player, minX.below(), Direction.UP), InteractionResult.SUCCESS, "use result");
        PortalFrame.Rectangle x = inside(helper, minX, Direction.Axis.X, 2, 3);
        helper.assertTrue(allOf(helper, x, portal), "axis x frame not lit");
        helper.assertValueEqual(helper.getLevel().getBlockState(x.min()).getValue(MsmPortalBlock.AXIS), Direction.Axis.X, "axis x");
        helper.assertValueEqual(flint.getDamageValue(), 1, "durability used");
        helper.assertTrue(PortalIndexAttachment.at(helper.getLevel(), portal, x.max()).isPresent(), "lit portal not indexed");
        // The click on the side frame's face that looks into the inside lights the other frame.
        use(helper, player, minZ.north(), Direction.SOUTH);
        PortalFrame.Rectangle z = inside(helper, minZ, Direction.Axis.Z, 2, 3);
        helper.assertTrue(allOf(helper, z, portal), "axis z frame not lit");
        helper.assertValueEqual(helper.getLevel().getBlockState(z.min()).getValue(MsmPortalBlock.AXIS), Direction.Axis.Z, "axis z");
        helper.assertValueEqual(flint.getDamageValue(), 2, "durability used twice");
        // A lit frame is not lit again: flint and steel then does its own thing (nothing on a portal block).
        use(helper, player, minX.below(), Direction.UP);
        helper.assertValueEqual(flint.getDamageValue(), 2, "a lit frame used the igniter");
        forget(helper, portal);
        helper.succeed();
    }

    /** A key that is not damageable is used up one; two portals with the same frame and igniter: the first by id wins. */
    @GameTest
    public void keyIsUsedUpAndTheFirstPortalByIdWins(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item("portal_key"), 3));
        BlockPos min = new BlockPos(3, 2, 3);
        frame(helper, min, Direction.Axis.X, 3, 4, Blocks.CHISELED_QUARTZ_BLOCK);
        use(helper, player, min.below(), Direction.UP);
        PortalFrame.Rectangle rect = inside(helper, min, Direction.Axis.X, 3, 4);
        helper.assertTrue(allOf(helper, rect, block("portal_clash_a")), "portal_clash_a did not win");
        helper.assertTrue(noneOf(helper, rect, block("portal_clash_b")), "portal_clash_b lit");
        helper.assertValueEqual(player.getMainHandItem().getCount(), 2, "key count");
        forget(helper, block("portal_clash_a"));
        helper.succeed();
    }

    /** In creative nothing is used. */
    @GameTest
    public void creativeUsesNothing(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.CREATIVE);
        ItemStack flint = new ItemStack(Items.FLINT_AND_STEEL);
        player.setItemInHand(InteractionHand.MAIN_HAND, flint);
        BlockPos a = new BlockPos(2, 2, 2);
        frame(helper, a, Direction.Axis.X, 2, 3, block("portal_frame"));
        use(helper, player, a.below(), Direction.UP);
        helper.assertTrue(allOf(helper, inside(helper, a, Direction.Axis.X, 2, 3), block("portal_basic")), "not lit in creative");
        helper.assertValueEqual(flint.getDamageValue(), 0, "durability used in creative");
        ItemStack key = new ItemStack(item("portal_key"), 1);
        player.setItemInHand(InteractionHand.MAIN_HAND, key);
        BlockPos b = new BlockPos(2, 2, 6);
        frame(helper, b, Direction.Axis.X, 2, 3, Blocks.CHISELED_QUARTZ_BLOCK);
        use(helper, player, b.below(), Direction.UP);
        helper.assertTrue(allOf(helper, inside(helper, b, Direction.Axis.X, 2, 3), block("portal_clash_a")), "key frame not lit in creative");
        helper.assertValueEqual(player.getMainHandItem().getCount(), 1, "key used in creative");
        forget(helper, block("portal_basic"));
        forget(helper, block("portal_clash_a"));
        helper.succeed();
    }

    /**
     * A wrong item does nothing to the frame; flint and steel on a frame whose portal has {@code igniter: false} only
     * places vanilla fire; a frame too small is not lit.
     */
    @GameTest
    public void wrongItemsAndIgniterFalseDoNotLight(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        BlockPos a = new BlockPos(2, 2, 2);
        frame(helper, a, Direction.Axis.X, 2, 3, block("portal_frame"));
        PortalFrame.Rectangle rect = inside(helper, a, Direction.Axis.X, 2, 3);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.STICK));
        use(helper, player, a.below(), Direction.UP);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item("portal_key"), 2));
        use(helper, player, a.below(), Direction.UP);
        helper.assertTrue(noneOf(helper, rect, block("portal_basic")), "lit by a wrong item");
        helper.assertValueEqual(player.getMainHandItem().getCount(), 2, "a wrong key was used");
        // igniter: false: flint and steel places fire as on any block.
        BlockPos b = new BlockPos(2, 2, 6);
        frame(helper, b, Direction.Axis.X, 2, 3, Blocks.GILDED_BLACKSTONE);
        ItemStack flint = new ItemStack(Items.FLINT_AND_STEEL);
        player.setItemInHand(InteractionHand.MAIN_HAND, flint);
        use(helper, player, b.below(), Direction.UP);
        helper.assertTrue(noneOf(helper, inside(helper, b, Direction.Axis.X, 2, 3), block("portal_quiet")), "igniter: false lit by an item");
        helper.assertTrue(helper.getBlockState(b).is(Blocks.FIRE), "no vanilla fire: " + helper.getBlockState(b));
        helper.assertValueEqual(flint.getDamageValue(), 1, "vanilla fire used the flint and steel");
        // Too small: 1 wide.
        BlockPos c = new BlockPos(6, 2, 2);
        frame(helper, c, Direction.Axis.X, 1, 3, block("portal_frame"));
        use(helper, player, c.below(), Direction.UP);
        helper.assertFalse(helper.getBlockState(c).is(block("portal_basic")), "a 1 wide frame was lit");
        helper.succeed();
    }

    /** A frame of mixed tag blocks is lit by an item of the igniter tag (a fire charge, used up one). */
    @GameTest
    public void tagFrameAndTagIgniter(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.FIRE_CHARGE, 2));
        BlockPos min = new BlockPos(3, 2, 3);
        frame(helper, min, Direction.Axis.Z, 2, 3, Blocks.IRON_BLOCK, Blocks.GOLD_BLOCK, Blocks.EMERALD_BLOCK);
        use(helper, player, min.below(), Direction.UP);
        helper.assertTrue(allOf(helper, inside(helper, min, Direction.Axis.Z, 2, 3), block("portal_tag")), "tag frame not lit");
        helper.assertValueEqual(player.getMainHandItem().getCount(), 1, "fire charge count");
        forget(helper, block("portal_tag"));
        helper.succeed();
    }

    // ---- the light_portal action (D3 (b)) ------------------------------------------------------------------------------

    /** Using {@code portal_beacon} lights the frame beside it; with no frame there it does nothing. */
    @GameTest
    public void lightPortalActionLightsTheNeighbouringFrame(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        BlockPos min = new BlockPos(2, 2, 3);
        frame(helper, min, Direction.Axis.X, 2, 3, Blocks.GILDED_BLACKSTONE);
        BlockPos beacon = min.north(); // in front of the inside's lowest left block
        helper.setBlock(beacon, block("portal_beacon"));
        use(helper, player, beacon, Direction.UP);
        PortalFrame.Rectangle rect = inside(helper, min, Direction.Axis.X, 2, 3);
        helper.assertTrue(allOf(helper, rect, block("portal_quiet")), "light_portal did not light the frame");
        helper.assertTrue(PortalIndexAttachment.at(helper.getLevel(), block("portal_quiet"), rect.min()).isPresent(), "not indexed");
        // A beacon with nothing around it.
        BlockPos lone = new BlockPos(6, 2, 6);
        helper.setBlock(lone, block("portal_beacon"));
        use(helper, player, lone, Direction.UP);
        for (Direction d : Direction.values()) {
            helper.assertFalse(helper.getBlockState(lone.relative(d)).is(block("portal_quiet")), "lit beside a lone beacon: " + d);
        }
        forget(helper, block("portal_quiet"));
        helper.succeed();
    }

    // ---- the block (D4) ----------------------------------------------------------------------------------------------

    /** Breaking a frame block turns the whole inside to air and the index entry is dropped on the next lookup. */
    @GameTest
    public void breakingAFrameBlockRemovesThePortal(GameTestHelper helper) {
        MsmPortalBlock portal = portal("portal_basic");
        BlockPos min = new BlockPos(2, 2, 2);
        frame(helper, min, Direction.Axis.X, 3, 3, block("portal_frame"));
        PortalFrame.Rectangle rect = inside(helper, min, Direction.Axis.X, 3, 3);
        PortalLighting.light(helper.getLevel(), portal, rect);
        helper.assertTrue(allOf(helper, rect, portal), "not lit");
        helper.setBlock(min.relative(Direction.EAST, 3).above(1), Blocks.AIR); // the right side frame
        helper.assertTrue(PortalFrame.isUnlit(helper.getLevel(), rect, portal), "portal blocks left after the frame broke");
        helper.assertTrue(PortalIndexAttachment.at(helper.getLevel(), portal, rect.min()).isEmpty(), "stale entry kept");
        forget(helper, portal);
        helper.succeed();
    }

    /** A lone portal block (a /setblock) stays until a neighbour above, below or along its axis changes. */
    @GameTest
    public void aLonePortalBlockStaysUntilANeighbourChanges(GameTestHelper helper) {
        BlockPos at = new BlockPos(3, 3, 3);
        helper.setBlock(at, block("portal_basic").defaultBlockState().setValue(MsmPortalBlock.AXIS, Direction.Axis.X));
        helper.assertBlockPresent(block("portal_basic"), at);
        helper.setBlock(at.south(), Blocks.STONE); // across the axis: no update
        helper.assertBlockPresent(block("portal_basic"), at);
        helper.setBlock(at.east(), Blocks.STONE); // along the axis
        helper.assertBlockPresent(Blocks.AIR, at);
        helper.setBlock(at, block("portal_basic").defaultBlockState().setValue(MsmPortalBlock.AXIS, Direction.Axis.X));
        helper.setBlock(at.above(), Blocks.STONE);
        helper.assertBlockPresent(Blocks.AIR, at);
        helper.succeed();
    }

    /** {@code overlay} picks vanilla's confusion transition or none. */
    @GameTest
    public void localTransitionFollowsOverlay(GameTestHelper helper) {
        helper.assertValueEqual(portal("portal_basic").getLocalTransition(), Portal.Transition.CONFUSION, "overlay default");
        helper.assertValueEqual(portal("portal_quiet").getLocalTransition(), Portal.Transition.NONE, "overlay false");
        helper.succeed();
    }

    /** Survival players: delay_ticks or the gamerule; creative players: the creative gamerule; mobs: 0. */
    @GameTest
    public void transitionTimeForPlayersAndMobs(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        GameRules rules = level.getGameRules();
        ServerPlayer survival = player(helper, GameType.SURVIVAL);
        ServerPlayer creative = player(helper, GameType.CREATIVE);
        Cow cow = helper.spawn(EntityTypes.COW, new BlockPos(1, 1, 1));
        int before = rules.get(GameRules.PLAYERS_NETHER_PORTAL_DEFAULT_DELAY);
        try {
            helper.assertValueEqual(portal("portal_basic").getPortalTransitionTime(level, survival), before, "gamerule delay");
            rules.set(GameRules.PLAYERS_NETHER_PORTAL_DEFAULT_DELAY, 33, level.getServer());
            helper.assertValueEqual(portal("portal_basic").getPortalTransitionTime(level, survival), 33, "changed gamerule delay");
        } finally {
            rules.set(GameRules.PLAYERS_NETHER_PORTAL_DEFAULT_DELAY, before, level.getServer());
        }
        helper.assertValueEqual(portal("portal_quiet").getPortalTransitionTime(level, survival), 7, "delay_ticks");
        int creativeDelay = rules.get(GameRules.PLAYERS_NETHER_PORTAL_CREATIVE_DELAY);
        helper.assertValueEqual(portal("portal_basic").getPortalTransitionTime(level, creative), creativeDelay, "creative");
        helper.assertValueEqual(portal("portal_quiet").getPortalTransitionTime(level, creative), creativeDelay, "creative ignores delay_ticks");
        helper.assertValueEqual(portal("portal_basic").getPortalTransitionTime(level, cow), 0, "mob");
        cow.discard();
        helper.succeed();
    }

    /** {@code players_only} keeps a cow out of vanilla's portal processing; a player still enters. */
    @GameTest
    public void playersOnlyKeepsACowOut(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockPos at = helper.absolutePos(new BlockPos(3, 1, 3));
        Cow free = helper.spawn(EntityTypes.COW, new BlockPos(1, 1, 1));
        Cow kept = helper.spawn(EntityTypes.COW, new BlockPos(5, 1, 5));
        block("portal_basic").defaultBlockState().entityInside(level, at, free, InsideBlockEffectApplier.NOOP, true);
        block("portal_quiet").defaultBlockState().entityInside(level, at, kept, InsideBlockEffectApplier.NOOP, true);
        helper.assertTrue(free.portalProcess != null && free.portalProcess.isSamePortal(portal("portal_basic")), "a cow did not enter");
        helper.assertTrue(kept.portalProcess == null, "players_only let a cow in");
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        block("portal_quiet").defaultBlockState().entityInside(level, at, player, InsideBlockEffectApplier.NOOP, true);
        helper.assertTrue(player.portalProcess != null && player.portalProcess.isSamePortal(portal("portal_quiet")), "a player did not enter");
        free.portalProcess = null;
        player.portalProcess = null;
        free.discard();
        kept.discard();
        helper.succeed();
    }

    /** The definition's portal fields as decoded (sanity of the Codec on the registered block). */
    @GameTest
    public void portalFieldsAreDecoded(GameTestHelper helper) {
        BlockType.Portal quiet = portal("portal_quiet").portal();
        helper.assertTrue(quiet.igniter().isEmpty(), "igniter: false");
        helper.assertTrue(quiet.travel().playersOnly() && !quiet.travel().overlay(), "travel: " + quiet.travel());
        helper.assertTrue(quiet.sounds().ambient().off() && quiet.sounds().travel().off(), "sounds: " + quiet.sounds());
        helper.assertValueEqual(quiet.particles().count(), 2, "count");
        BlockType.Portal basic = portal("portal_basic").portal();
        helper.assertValueEqual(basic.igniter(), Optional.of(BlockType.Portal.DEFAULT_IGNITER), "default igniter");
        helper.assertValueEqual(basic.returnTo(), Identifier.withDefaultNamespace("overworld"), "default return_to");
        helper.assertValueEqual(basic.destination(), Identifier.withDefaultNamespace("the_nether"), "destination");
        helper.assertTrue(portal("portal_tag").portal().frame().tag(), "tag frame");
        helper.succeed();
    }
}
