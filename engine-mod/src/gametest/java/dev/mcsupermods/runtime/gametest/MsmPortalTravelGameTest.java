package dev.mcsupermods.runtime.gametest;

import com.mojang.authlib.GameProfile;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.registry.portal.ExitPortals;
import dev.mcsupermods.runtime.registry.portal.PortalFrame;
import dev.mcsupermods.runtime.registry.portal.PortalIndex;
import dev.mcsupermods.runtime.registry.portal.PortalIndexAttachment;
import dev.mcsupermods.runtime.registry.portal.PortalLighting;
import dev.mcsupermods.runtime.registry.portal.PortalTravel;
import dev.mcsupermods.runtime.registry.types.MsmPortalBlock;
import io.netty.channel.embedded.EmbeddedChannel;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.network.protocol.game.ClientboundBundlePacket;
import net.minecraft.network.protocol.game.ClientboundSoundPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.animal.cow.Cow;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.portal.TeleportTransition;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Portal travel and linking (ADR 0077 D6; B336) on {@code msm/msm_test/block/portal_travel_*.json}, each with its own
 * vanilla frame block so that no two tests link to each other's exits (only portals of the same block link):
 * {@code portal_travel_nether} (flint and steel, to the Nether, {@code cooldown_ticks} 345, {@code on_travel} running
 * {@code msm_test:portal/arrived} as the traveller), {@code portal_travel_linked} and {@code portal_travel_radius} (to the
 * Nether, lit by the tests), {@code portal_travel_scaled} (to the End, {@code scale} 4), {@code portal_travel_surface}
 * (to the End, {@code arrival: surface}, no travel sound), {@code portal_travel_players} (to the End, players only,
 * {@code delay_ticks} 0, {@code cooldown_ticks} 77, the project travel sound {@code msm_test:chime}),
 * {@code portal_travel_surface_nether} (to the Nether, {@code arrival: surface}, no travel sound; B336b) and {@code portal_travel_missing} (to a level
 * this world does not have).
 *
 * <p>F20 does not hold (B330): a dimension shipped in the GameTest resources creates no level, so travel uses the Nether
 * and the End (limit P8). The GameTest world (flat in every dimension) and its portal indexes are kept between local runs:
 * tests that look for a built exit first forget (and clear) the exits of their own block around the spot. A moved
 * non-player is re-created in the other level, so arrivals are found by a tag the traveller carries (F19). Tests that
 * need ticking entities stand in their test structure; the others call {@code getPortalDestination} directly at spots
 * far out in the overworld (4096 blocks apart, so 512 apart in the Nether).
 */
public class MsmPortalTravelGameTest {
    private static final int FLAGS = Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE;
    private static final BlockState AIR = Blocks.AIR.defaultBlockState();

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static MsmPortalBlock portal(String path) {
        return (MsmPortalBlock) BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static BlockState frameOf(MsmPortalBlock portal) {
        return PortalTravel.frameState(portal.portal()).orElseThrow();
    }

    private static ServerLevel nether(GameTestHelper helper) {
        return helper.getLevel().getServer().getLevel(Level.NETHER);
    }

    private static ServerLevel end(GameTestHelper helper) {
        return helper.getLevel().getServer().getLevel(Level.END);
    }

    /** Spot {@code n} far out in the overworld (x only; z is {@value #FAR_Z}). */
    private static int farX(int n) {
        return -60_000 - n * 4_096;
    }

    private static final int FAR_Z = -60_000;

    /** The flat ground's first free y at a column, through the generator's layers only (what earlier runs built is not ground). */
    private static int groundAir(ServerLevel level, int x, int z) {
        int y = level.getMinY();
        while (y < level.getMaxY()) {
            BlockState state = level.getBlockState(new BlockPos(x, y, z));
            if (!(state.is(Blocks.BEDROCK) || state.is(Blocks.SANDSTONE) || state.is(Blocks.BASALT) || state.is(Blocks.END_STONE))) {
                return y;
            }
            y++;
        }
        return y;
    }

    /** Air from the ground to ten blocks above it within {@code radius} of the column. */
    private static void clearAbove(ServerLevel level, int x, int z, int radius) {
        int ground = groundAir(level, x, z);
        for (int dx = -radius; dx <= radius; dx++) {
            for (int dz = -radius; dz <= radius; dz++) {
                for (int y = ground; y <= ground + 10; y++) {
                    BlockPos pos = new BlockPos(x + dx, y, z + dz);
                    if (!level.getBlockState(pos).isAir()) {
                        level.setBlock(pos, AIR, FLAGS);
                    }
                }
            }
        }
    }

    /** Forgets the index entries of {@code portal} whose inside starts within {@code radius} of the column, clearing their blocks. */
    private static void forget(ServerLevel level, MsmPortalBlock portal, int x, int z, int radius) {
        for (PortalIndex.Entry entry : PortalIndexAttachment.get(level).entries()) {
            if (entry.block().equals(PortalIndexAttachment.id(portal)) && Math.abs(entry.min().getX() - x) <= radius
                    && Math.abs(entry.min().getZ() - z) <= radius) {
                PortalFrame.Rectangle r = entry.rectangle();
                for (int i = -1; i <= r.width(); i++) {
                    for (int up = -1; up <= r.height(); up++) {
                        level.setBlock(r.at(i, up), AIR, FLAGS);
                    }
                }
                PortalIndexAttachment.remove(level, entry);
            }
        }
    }

    /** The index entries of {@code portal} whose inside starts within {@code radius} of the column. */
    private static List<PortalIndex.Entry> entries(ServerLevel level, MsmPortalBlock portal, int x, int z, int radius) {
        return PortalIndexAttachment.get(level).entries().stream().filter(e -> e.block().equals(PortalIndexAttachment.id(portal))
                && Math.abs(e.min().getX() - x) <= radius && Math.abs(e.min().getZ() - z) <= radius).toList();
    }

    /** A frame of {@code frame} with corners around an inside of {@code width} by {@code height} at {@code min}; inside air. */
    private static PortalFrame.Rectangle frame(ServerLevel level, BlockPos min, Direction.Axis axis, int width, int height, BlockState frame) {
        PortalFrame.Rectangle r = new PortalFrame.Rectangle(min, axis, width, height);
        for (int i = -1; i <= width; i++) {
            for (int up = -1; up <= height; up++) {
                boolean ring = i == -1 || i == width || up == -1 || up == height;
                level.setBlock(r.at(i, up), ring ? frame : AIR, FLAGS);
            }
        }
        return r;
    }

    /** A lit 2 by 3 portal of {@code portal} on the ground at the column, indexed as lighting does. */
    private static PortalFrame.Rectangle litPortal(ServerLevel level, MsmPortalBlock portal, int x, int z, Direction.Axis axis) {
        BlockPos min = new BlockPos(x, groundAir(level, x, z) + 1, z);
        PortalFrame.Rectangle r = frame(level, min, axis, 2, 3, frameOf(portal));
        PortalLighting.light(level, portal, r);
        return r;
    }

    /** A cow that is not added to any level, standing at {@code at} (enough for {@code getPortalDestination}). */
    private static Cow traveller(ServerLevel level, Vec3 at) {
        Cow cow = EntityTypes.COW.create(level, EntitySpawnReason.TRIGGERED);
        cow.setPos(at);
        return cow;
    }

    /** The middle of the bottom row of {@code r} (feet height). */
    private static Vec3 middle(PortalFrame.Rectangle r) {
        Vec3 corner = Vec3.atBottomCenterOf(r.min());
        Direction along = r.along();
        return corner.add(along.getStepX() * (r.width() - 1) / 2.0, 0, along.getStepZ() * (r.width() - 1) / 2.0);
    }

    /** Whether {@code at} is in {@code r} grown by one block each way (a collision-free nudge may move a traveller a little). */
    private static boolean near(PortalFrame.Rectangle r, Vec3 at) {
        BlockPos p = BlockPos.containing(at);
        BlockPos max = r.max();
        return p.getX() >= r.min().getX() - 1 && p.getX() <= max.getX() + 1 && p.getY() >= r.min().getY() - 1 && p.getY() <= max.getY() + 1
                && p.getZ() >= r.min().getZ() - 1 && p.getZ() <= max.getZ() + 1;
    }

    /** The indexed portal of {@code portal} holding the block at (or just beside) {@code at}. */
    private static Optional<PortalIndex.Entry> exitAt(ServerLevel level, MsmPortalBlock portal, Vec3 at) {
        return PortalIndexAttachment.nearest(level, PortalIndexAttachment.id(portal), BlockPos.containing(at), 2);
    }

    /** A survival player on a connection inside an {@code EmbeddedChannel}, recording the sounds it is sent (as {@code MsmSoundGameTest}'s ears). */
    private static final class Listener implements AutoCloseable {
        final ServerPlayer player;
        private final EmbeddedChannel channel;
        private final MinecraftServer server;

        Listener(GameTestHelper helper, Vec3 at) {
            server = helper.getLevel().getServer();
            GameProfile profile = new GameProfile(UUID.randomUUID(), "msm-traveller");
            CommonListenerCookie cookie = CommonListenerCookie.createInitial(profile, false);
            player = new ServerPlayer(server, helper.getLevel(), profile, cookie.clientInformation());
            Connection connection = new Connection(PacketFlow.SERVERBOUND);
            channel = new EmbeddedChannel(connection);
            server.getPlayerList().placeNewPlayer(connection, player, cookie);
            player.setGameMode(GameType.SURVIVAL);
            player.snapTo(helper.absoluteVec(at));
            heard();
        }

        List<Identifier> heard() {
            channel.flushOutbound();
            List<Identifier> out = new ArrayList<>();
            for (Object message = channel.readOutbound(); message != null; message = channel.readOutbound()) {
                if (message instanceof Packet<?> packet) {
                    collect(packet, out);
                }
            }
            return out;
        }

        private static void collect(Packet<?> packet, List<Identifier> out) {
            switch (packet) {
                case ClientboundSoundPacket p -> out.add(p.getSound().value().location());
                case ClientboundBundlePacket b -> b.subPackets().forEach(p -> collect(p, out));
                default -> {}
            }
        }

        @Override
        public void close() {
            server.getPlayerList().remove(player);
            channel.close();
        }
    }

    // ---- a cow through a lit portal and back (test structure, ticking) ----------------------------------------------

    /**
     * Flint and steel lights the frame (with vanilla's flint and steel sound); a cow placed in the portal is taken to the
     * Nether by vanilla's portal processing, arrives in an exit portal built there with the entry's axis and indexed,
     * runs {@code on_travel} as itself and carries {@code cooldown_ticks}; a second cow reuses that exit, and the way back
     * from the exit lands in the entry portal without building one.
     */
    @GameTest(maxTicks = 120)
    public void aCowTravelsThroughALitPortalAndBack(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        ServerLevel nether = nether(helper);
        MsmPortalBlock portal = portal("portal_travel_nether");
        BlockPos min = new BlockPos(3, 2, 4);
        PortalFrame.Rectangle entry = new PortalFrame.Rectangle(helper.absolutePos(min), Direction.Axis.X, 2, 3);
        for (int i = -1; i <= 2; i++) {
            for (int up = -1; up <= 3; up++) {
                boolean ring = i == -1 || i == 2 || up == -1 || up == 3;
                helper.setBlock(min.east(i).above(up), ring ? Blocks.POLISHED_BLACKSTONE_BRICKS : Blocks.AIR);
            }
        }
        Vec3 inside = middle(entry);
        BlockPos target = BlockPos.containing(inside.x / 8, inside.y, inside.z / 8);
        forget(nether, portal, target.getX(), target.getZ(), 48);
        forget(level, portal, entry.min().getX(), entry.min().getZ(), 8);

        Listener lighter = new Listener(helper, new Vec3(4.5, 2, 6.5));
        lighter.player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.FLINT_AND_STEEL));
        BlockPos clicked = helper.absolutePos(min.below());
        InteractionResult lit = lighter.player.gameMode.useItemOn(lighter.player, level, lighter.player.getItemInHand(InteractionHand.MAIN_HAND),
                InteractionHand.MAIN_HAND, new BlockHitResult(Vec3.atCenterOf(clicked).add(0, 0.5, 0), Direction.UP, clicked, false));
        helper.assertTrue(lit.consumesAction(), "lighting: " + lit);
        helper.assertTrue(PortalFrame.isComplete(level, entry, portal), "the frame is lit");
        List<Identifier> heard = lighter.heard();
        helper.assertTrue(heard.contains(Identifier.withDefaultNamespace("item.flintandsteel.use")), "lighting sound: " + heard);
        lighter.close();

        // The cooldown at on_travel time, before the cow ticks in the exit (where the portal keeps refreshing it).
        List<Integer> cooldowns = Collections.synchronizedList(new ArrayList<>());
        EventListener seen = new EventListener() {
            @Override
            public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
                if (owner.equals(id("portal_travel_nether")) && ctx.entity() != null && ctx.entity().entityTags().contains("msm_b336_first")) {
                    cooldowns.add(ctx.entity().getPortalCooldown());
                }
            }
        };
        EventRunner.addListener(seen);
        Cow first = helper.spawnWithNoFreeWill(EntityTypes.COW, helper.relativeVec(inside));
        first.addTag("msm_b336_first");
        AtomicReference<Cow> arrived = new AtomicReference<>();
        AtomicReference<PortalIndex.Entry> exit = new AtomicReference<>();
        AtomicReference<Cow> second = new AtomicReference<>();
        AABB around = new AABB(target).inflate(48, 400, 48);
        helper.startSequence()
                .thenWaitUntil(() -> {
                    helper.assertTrue(first.isRemoved() && first.getRemovalReason() == Entity.RemovalReason.CHANGED_DIMENSION,
                            "the cow has not left: " + first.getRemovalReason());
                    List<Cow> found = nether.getEntitiesOfClass(Cow.class, around, c -> c.entityTags().contains("msm_b336_first"));
                    helper.assertTrue(found.size() == 1, "arrivals in the Nether: " + found);
                    arrived.set(found.getFirst());
                })
                .thenExecute(() -> {
                    Cow cow = arrived.get();
                    helper.assertTrue(cow.entityTags().contains("msm_portal_arrived"), "on_travel ran as the traveller: " + cow.entityTags());
                    EventRunner.removeListener(seen);
                    helper.assertValueEqual(List.copyOf(cooldowns), List.of(345), "cooldown_ticks at on_travel");
                    helper.assertTrue(cow.getPortalCooldown() > 300, "standing in the exit keeps cooldown_ticks: " + cow.getPortalCooldown());
                    Optional<PortalIndex.Entry> found = exitAt(nether, portal, cow.position());
                    helper.assertTrue(found.isPresent(), "no indexed exit at " + cow.position());
                    helper.assertValueEqual(found.get().axis(), Direction.Axis.X, "the exit has the entry's axis");
                    helper.assertTrue(PortalFrame.isComplete(nether, found.get().rectangle(), portal), "the exit is lit");
                    helper.assertTrue(nether.getBlockState(found.get().rectangle().at(-1, -1)).is(Blocks.POLISHED_BLACKSTONE_BRICKS),
                            "the exit is built of the frame block");
                    helper.assertValueEqual(entries(nether, portal, target.getX(), target.getZ(), 48).size(), 1, "one exit");
                    exit.set(found.get());
                    Cow next = helper.spawnWithNoFreeWill(EntityTypes.COW, helper.relativeVec(inside));
                    next.addTag("msm_b336_second");
                    second.set(next);
                })
                .thenWaitUntil(() -> {
                    helper.assertTrue(second.get().isRemoved(), "the second cow has not left");
                    List<Cow> found = nether.getEntitiesOfClass(Cow.class, around, c -> c.entityTags().contains("msm_b336_second"));
                    helper.assertTrue(found.size() == 1, "second arrivals: " + found);
                    helper.assertTrue(exit.get().rectangle().contains(BlockPos.containing(found.getFirst().position()))
                            || near(exit.get().rectangle(), found.getFirst().position()), "the second cow arrived elsewhere: " + found);
                    found.getFirst().discard();
                })
                .thenExecute(() -> {
                    helper.assertValueEqual(entries(nether, portal, target.getX(), target.getZ(), 48), List.of(exit.get()), "no second exit");
                    int before = entries(level, portal, entry.min().getX(), entry.min().getZ(), 128).size();
                    Cow cow = arrived.get();
                    TeleportTransition back = portal.getPortalDestination(nether, cow, exit.get().min());
                    helper.assertTrue(back != null && back.newLevel() == level, "back to the overworld: " + back);
                    helper.assertTrue(near(entry, back.position()), "back at the entry portal " + entry + ": " + back.position());
                    helper.assertValueEqual(entries(level, portal, entry.min().getX(), entry.min().getZ(), 128).size(), before,
                            "nothing built on the way back");
                    cow.discard();
                    forget(level, portal, entry.min().getX(), entry.min().getZ(), 8);
                })
                .thenSucceed();
    }

    /** A portal to a level the world does not have: one warning at start, one at use, and the cow stays where it is. */
    @GameTest(maxTicks = 40)
    public void aMissingLevelLeavesTheCowInPlace(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MsmPortalBlock portal = portal("portal_travel_missing");
        String warning = "portal msm_test:portal_travel_missing: dimension msm_test:nowhere is not a level of this world";
        long atStart = MsmRuntime.report().warnings().stream().filter(w -> w.startsWith(warning)).count();
        helper.assertValueEqual(atStart, 1L, "start-up warnings: " + MsmRuntime.report().warnings());
        helper.assertFalse(MsmRuntime.report().warnings().stream().anyMatch(w -> w.contains("portal_travel_nether")),
                "a portal whose levels exist warned");
        BlockPos min = new BlockPos(3, 2, 4);
        PortalFrame.Rectangle entry = frame(level, helper.absolutePos(min), Direction.Axis.Z, 2, 3, frameOf(portal));
        PortalLighting.light(level, portal, entry);
        Vec3 inside = middle(entry);
        Cow cow = helper.spawnWithNoFreeWill(EntityTypes.COW, helper.relativeVec(inside));
        helper.assertTrue(portal.getPortalDestination(level, cow, entry.min()) == null, "a transition to a missing level");
        helper.runAfterDelay(10, () -> {
            helper.assertTrue(PortalTravel.warnedAtUse().contains("msm_test:portal_travel_missing>msm_test:nowhere"),
                    "use warning: " + PortalTravel.warnedAtUse());
            helper.assertFalse(cow.isRemoved(), "the cow left: " + cow.getRemovalReason());
            helper.assertTrue(cow.level() == level, "the cow is in " + cow.level().dimension());
            helper.assertTrue(cow.isOnPortalCooldown(), "vanilla sets the cooldown after a failed attempt");
            cow.discard();
            PortalIndexAttachment.remove(level, PortalIndex.Entry.of(PortalIndexAttachment.id(portal), entry));
            helper.succeed();
        });
    }

    /**
     * A survival player with {@code delay_ticks} 0, marked inside the portal (as the movement handler does), travels on its
     * next {@code doTick} (mock players are not ticked by the server) to the End, into an indexed exit, and is sent the
     * project travel sound; {@code players_only} gives a cow no destination.
     */
    @GameTest
    public void aPlayerTravelsAndHearsTheProjectSound(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MsmPortalBlock portal = portal("portal_travel_players");
        BlockPos min = new BlockPos(3, 2, 4);
        PortalFrame.Rectangle entry = frame(level, helper.absolutePos(min), Direction.Axis.X, 2, 3, frameOf(portal));
        PortalLighting.light(level, portal, entry);
        Vec3 inside = middle(entry);
        Cow cow = traveller(level, inside);
        helper.assertTrue(portal.getPortalDestination(level, cow, entry.min()) == null, "players_only gave a cow a destination");
        try (Listener traveller = new Listener(helper, helper.relativeVec(inside))) {
            ServerPlayer player = traveller.player;
            portal.defaultBlockState().entityInside(level, entry.min(), player, InsideBlockEffectApplier.NOOP, true);
            helper.assertTrue(player.portalProcess != null, "the player is not inside the portal");
            player.doTick();
            helper.assertTrue(player.level().dimension() == Level.END, "the player is in " + player.level().dimension());
            helper.assertValueEqual(player.getPortalCooldown(), 77, "cooldown_ticks on the arrived player, kept while it stands in the exit");
            helper.assertTrue(exitAt(end(helper), portal, player.position()).isPresent(), "no indexed exit at " + player.position());
            List<Identifier> heard = traveller.heard();
            helper.assertTrue(heard.contains(id("chime")), "travel sound: " + heard);
            helper.assertTrue(PortalTravel.travelSound(portal.portal()) instanceof PortalTravel.TravelSound.Own, "own travel sound");
        }
        PortalIndexAttachment.remove(level, PortalIndex.Entry.of(PortalIndexAttachment.id(portal), entry));
        helper.succeed();
    }

    // ---- numbers, linking and arrival (direct calls far out) --------------------------------------------------------

    /**
     * Overworld to Nether by the dimension types (x and z divided by 8): an exit is built with the entry's axis at the
     * scaled position and indexed; a second trip reuses it; the way back (times 8) lands in the entry portal.
     */
    @GameTest
    public void eightToOneByDimensionTypesAndTheWayBack(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        ServerLevel nether = nether(helper);
        MsmPortalBlock portal = portal("portal_travel_linked");
        int x = farX(0);
        int z = FAR_Z;
        forget(level, portal, x, z, 8);
        clearAbove(level, x, z, 6);
        int nx = Math.floorDiv(x, 8);
        int nz = Math.floorDiv(z, 8);
        forget(nether, portal, nx, nz, 40);
        clearAbove(nether, nx, nz, 24);
        PortalFrame.Rectangle entry = litPortal(level, portal, x, z, Direction.Axis.Z);
        Cow cow = traveller(level, middle(entry));
        helper.assertValueEqual(PortalTravel.factor(portal.portal(), Level.OVERWORLD.identifier(), Level.NETHER.identifier(),
                level.dimensionType(), nether.dimensionType()), 0.125, "factor");
        TeleportTransition there = portal.getPortalDestination(level, cow, entry.min());
        helper.assertTrue(there != null && there.newLevel() == nether, "to the Nether: " + there);
        Optional<PortalIndex.Entry> exit = exitAt(nether, portal, there.position());
        helper.assertTrue(exit.isPresent(), "no indexed exit at " + there.position());
        helper.assertValueEqual(exit.get().axis(), Direction.Axis.Z, "the entry's axis");
        BlockPos scaled = BlockPos.containing(middle(entry).x / 8, 0, middle(entry).z / 8);
        helper.assertTrue(Math.abs(exit.get().min().getX() - scaled.getX()) <= 1 && Math.abs(exit.get().min().getZ() - scaled.getZ()) <= 2,
                "exit " + exit.get().min() + " not at x and z divided by 8: " + scaled);
        helper.assertTrue(near(exit.get().rectangle(), there.position()), "arrival " + there.position() + " not in " + exit.get());

        TeleportTransition again = portal.getPortalDestination(level, cow, entry.min());
        helper.assertTrue(near(exit.get().rectangle(), again.position()), "the second trip did not reuse the exit");
        helper.assertValueEqual(entries(nether, portal, nx, nz, 40).size(), 1, "one exit after two trips");

        Cow back = traveller(nether, there.position());
        TeleportTransition home = portal.getPortalDestination(nether, back, exit.get().min());
        helper.assertTrue(home != null && home.newLevel() == level, "back to the overworld: " + home);
        helper.assertTrue(near(entry, home.position()), "back at " + home.position() + ", not in the entry " + entry);
        helper.assertValueEqual(entries(level, portal, x, z, 128).size(), 1, "nothing built in the overworld");
        helper.succeed();
    }

    /**
     * {@code travel.scale} 4 between the overworld and the End: x and z divided by 4 going, times 4 coming back (into the
     * entry). From a third dimension (the Nether) the portal leads to {@code destination} by the dimension types (8).
     */
    @GameTest
    public void travelScaleAndAThirdDimension(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        ServerLevel nether = nether(helper);
        ServerLevel end = end(helper);
        MsmPortalBlock portal = portal("portal_travel_scaled");
        int x = farX(1);
        int z = FAR_Z;
        forget(level, portal, x, z, 8);
        clearAbove(level, x, z, 6);
        int ex = Math.floorDiv(x, 4);
        int ez = Math.floorDiv(z, 4);
        forget(end, portal, ex, ez, 40);
        clearAbove(end, ex, ez, 24);
        PortalFrame.Rectangle entry = litPortal(level, portal, x, z, Direction.Axis.X);
        Vec3 at = middle(entry);
        TeleportTransition there = portal.getPortalDestination(level, traveller(level, at), entry.min());
        helper.assertTrue(there != null && there.newLevel() == end, "to the End: " + there);
        Optional<PortalIndex.Entry> exit = exitAt(end, portal, there.position());
        helper.assertTrue(exit.isPresent(), "no exit at " + there.position());
        helper.assertTrue(Math.abs(exit.get().min().getX() - Math.floor(at.x / 4)) <= 2 && Math.abs(exit.get().min().getZ() - Math.floor(at.z / 4)) <= 1,
                "exit " + exit.get().min() + " not at a quarter of " + at);
        TeleportTransition home = portal.getPortalDestination(end, traveller(end, there.position()), exit.get().min());
        helper.assertTrue(home != null && home.newLevel() == level && near(entry, home.position()), "times 4 back into the entry: " + home);

        int nx = -7_000;
        int nz = -9_000;
        forget(nether, portal, nx, nz, 8);
        clearAbove(nether, nx, nz, 6);
        helper.assertValueEqual(PortalTravel.factor(portal.portal(), Level.NETHER.identifier(), Level.END.identifier(),
                nether.dimensionType(), end.dimensionType()), 8.0, "third dimension: the dimension types' factor");
        forget(end, portal, nx * 8, nz * 8, 40);
        clearAbove(end, nx * 8, nz * 8, 24);
        PortalFrame.Rectangle third = litPortal(nether, portal, nx, nz, Direction.Axis.X);
        Vec3 from = middle(third);
        TeleportTransition onward = portal.getPortalDestination(nether, traveller(nether, from), third.min());
        helper.assertTrue(onward != null && onward.newLevel() == end, "the Nether leads to the destination: " + onward);
        helper.assertTrue(Math.abs(onward.position().x - from.x * 8) <= 18 && Math.abs(onward.position().z - from.z * 8) <= 18,
                "times 8 into the End: " + onward.position() + " from " + from);
        helper.succeed();
    }

    /**
     * The linking radius is {@code clamp(round(128 * min(1, factor)), 16, 128)}: going to the Nether (16) an indexed exit 20
     * blocks from the target is not used (a new one is built); going to the overworld (128) one 20 blocks away is used.
     */
    @GameTest
    public void theSearchRadiusFollowsTheFactor(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        ServerLevel nether = nether(helper);
        MsmPortalBlock portal = portal("portal_travel_radius");
        helper.assertValueEqual(PortalTravel.searchRadius(0.125), 16, "radius into the Nether");
        helper.assertValueEqual(PortalTravel.searchRadius(0.25), 32, "radius at a quarter");
        helper.assertValueEqual(PortalTravel.searchRadius(1.0), 128, "radius at 1:1");
        helper.assertValueEqual(PortalTravel.searchRadius(8.0), 128, "radius out of the Nether");
        helper.assertValueEqual(PortalTravel.searchRadius(1.0 / 30_000_000), 16, "radius at the smallest scale");

        int x = farX(2);
        int z = FAR_Z;
        forget(level, portal, x, z, 8);
        clearAbove(level, x, z, 6);
        int nx = Math.floorDiv(x, 8);
        int nz = Math.floorDiv(z, 8);
        forget(nether, portal, nx, nz, 48);
        clearAbove(nether, nx, nz, 36);
        PortalFrame.Rectangle entry = litPortal(level, portal, x, z, Direction.Axis.X);
        Vec3 at = middle(entry);
        BlockPos target = BlockPos.containing(at.x / 8, 0, at.z / 8);
        BlockPos far = new BlockPos(target.getX() + 20, groundAir(nether, target.getX() + 20, target.getZ()) + 1, target.getZ());
        PortalFrame.Rectangle away = ExitPortals.build(nether, far, Direction.Axis.Z, portal, frameOf(portal));
        helper.assertTrue(away.min().getX() - target.getX() >= 18, "the far exit is " + away.min() + " for " + target);
        TeleportTransition there = portal.getPortalDestination(level, traveller(level, at), entry.min());
        helper.assertTrue(there != null && there.newLevel() == nether, "to the Nether: " + there);
        helper.assertFalse(near(away, there.position()), "the exit 20 blocks away was used going to the Nether");
        helper.assertValueEqual(entries(nether, portal, nx, nz, 48).size(), 2, "a new exit was built");

        int sx = farX(3) / 8;
        int sz = FAR_Z / 8;
        forget(nether, portal, sx, sz, 8);
        clearAbove(nether, sx, sz, 6);
        PortalFrame.Rectangle source = litPortal(nether, portal, sx, sz, Direction.Axis.X);
        Vec3 from = middle(source);
        BlockPos home = BlockPos.containing(from.x * 8, 0, from.z * 8);
        forget(level, portal, home.getX(), home.getZ(), 140);
        clearAbove(level, home.getX(), home.getZ(), 30);
        BlockPos twenty = new BlockPos(home.getX() + 20, groundAir(level, home.getX() + 20, home.getZ()) + 1, home.getZ());
        PortalFrame.Rectangle twentyAway = ExitPortals.build(level, twenty, Direction.Axis.X, portal, frameOf(portal));
        helper.assertTrue(twentyAway.min().getX() - home.getX() >= 18, "the overworld portal is " + twentyAway.min() + " for " + home);
        TeleportTransition out = portal.getPortalDestination(nether, traveller(nether, from), source.min());
        helper.assertTrue(out != null && out.newLevel() == level, "to the overworld: " + out);
        helper.assertTrue(near(twentyAway, out.position()), "the portal 20 blocks away was not used going to the overworld: " + out.position());
        helper.assertValueEqual(entries(level, portal, home.getX(), home.getZ(), 140).size(), 1, "nothing built in the overworld");
        helper.succeed();
    }

    /**
     * {@code arrival: surface} lands on the ground at the target column and builds nothing; over a void column it falls
     * back to a built exit. A tag frame without {@code frame_block} (no exit block) arrives at the surface too.
     */
    @GameTest
    public void surfaceArrivalBuildsNothingAndFallsBackOverAVoid(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        ServerLevel end = end(helper);
        MsmPortalBlock portal = portal("portal_travel_surface");
        int x = farX(4);
        int z = FAR_Z;
        forget(level, portal, x, z, 8);
        clearAbove(level, x, z, 8);
        forget(end, portal, x, z, 40);
        clearAbove(end, x, z, 24);
        PortalFrame.Rectangle entry = litPortal(level, portal, x, z, Direction.Axis.X);
        Vec3 at = middle(entry);
        int ground = groundAir(end, (int) Math.floor(at.x), (int) Math.floor(at.z));
        helper.assertValueEqual(PortalTravel.arrival(portal, end, BlockPos.containing(at), traveller(level, at)), PortalTravel.Arrival.SURFACE, "arrival");
        TeleportTransition there = portal.getPortalDestination(level, traveller(level, at), entry.min());
        helper.assertTrue(there != null && there.newLevel() == end, "to the End: " + there);
        helper.assertValueEqual(there.position(), new Vec3(Math.floor(at.x) + 0.5, ground, Math.floor(at.z) + 0.5), "on the ground at the target");
        helper.assertTrue(end.getBlockState(BlockPos.containing(there.position()).below()).is(Blocks.END_STONE), "standing on end stone");
        helper.assertTrue(entries(end, portal, x, z, 40).isEmpty(), "surface arrival built an exit");
        helper.assertTrue(PortalTravel.travelSound(portal.portal()) instanceof PortalTravel.TravelSound.None, "travel: false");
        helper.assertTrue(PortalTravel.travelSound(portal("portal_travel_linked").portal()) instanceof PortalTravel.TravelSound.Vanilla,
                "default travel sound");

        BlockPos voidColumn = BlockPos.containing(at).east(6);
        for (int y = end.getMinY(); y <= ExitPortals.topY(end); y++) {
            end.setBlock(new BlockPos(voidColumn.getX(), y, voidColumn.getZ()), AIR, FLAGS);
        }
        Vec3 overVoid = Vec3.atBottomCenterOf(voidColumn.atY((int) at.y));
        helper.assertValueEqual(PortalTravel.arrival(portal, end, voidColumn, traveller(level, overVoid)), PortalTravel.Arrival.PORTAL, "void");
        TeleportTransition fallback = portal.getPortalDestination(level, traveller(level, overVoid), entry.min());
        helper.assertTrue(fallback != null && fallback.newLevel() == end, "to the End: " + fallback);
        Optional<PortalIndex.Entry> built = exitAt(end, portal, fallback.position());
        helper.assertTrue(built.isPresent(), "no exit was built over the void: " + fallback.position());
        helper.assertValueEqual(entries(end, portal, x, z, 40).size(), 1, "one exit built");
        for (int y = end.getMinY(); y < ground; y++) {
            end.setBlock(new BlockPos(voidColumn.getX(), y, voidColumn.getZ()), Blocks.END_STONE.defaultBlockState(), FLAGS);
        }

        MsmPortalBlock tagged = portal("portal_bad_tag_frame");
        helper.assertTrue(PortalTravel.frameState(tagged.portal()).isEmpty(), "a tag frame without frame_block has no exit block");
        helper.assertValueEqual(PortalTravel.arrival(tagged, end, BlockPos.containing(at), traveller(level, at)), PortalTravel.Arrival.SURFACE,
                "a tag frame without frame_block arrives at the surface");
        helper.succeed();
    }

    /** A sheet of {@code state} on the Nether's flat ground within {@code radius} of the column; returns the sheet's y. */
    private static int sheet(ServerLevel nether, BlockPos column, int radius, BlockState state) {
        int y = groundAir(nether, column.getX(), column.getZ());
        for (int dx = -radius; dx <= radius; dx++) {
            for (int dz = -radius; dz <= radius; dz++) {
                nether.setBlock(new BlockPos(column.getX() + dx, y, column.getZ() + dz), state, FLAGS);
            }
        }
        return y;
    }

    /**
     * B336b: lava is never ground. With a lava sheet under the target column in the Nether, {@code arrival: surface} finds no
     * spot and falls back to a built exit; the traveller ends up neither on nor in lava.
     */
    @GameTest
    public void surfaceArrivalNeverLandsOnLava(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        ServerLevel nether = nether(helper);
        MsmPortalBlock portal = portal("portal_travel_surface_nether");
        int x = farX(6);
        int z = FAR_Z;
        forget(level, portal, x, z, 8);
        clearAbove(level, x, z, 6);
        int nx = Math.floorDiv(x, 8);
        int nz = Math.floorDiv(z, 8);
        forget(nether, portal, nx, nz, 48);
        clearAbove(nether, nx, nz, 24);
        PortalFrame.Rectangle entry = litPortal(level, portal, x, z, Direction.Axis.X);
        Vec3 at = middle(entry);
        BlockPos target = PortalTravel.targetPosition(nether, at, 0.125);
        int y = sheet(nether, target, 3, Blocks.LAVA.defaultBlockState());
        try {
            helper.assertTrue(nether.getFluidState(target.atY(y)).is(FluidTags.LAVA), "no lava under the target");
            helper.assertTrue(PortalTravel.surface(nether, target, traveller(nether, at)).isEmpty(), "lava counted as ground");
            helper.assertValueEqual(PortalTravel.arrival(portal, nether, target, traveller(level, at)), PortalTravel.Arrival.PORTAL, "arrival");
            TeleportTransition there = portal.getPortalDestination(level, traveller(level, at), entry.min());
            helper.assertTrue(there != null && there.newLevel() == nether, "to the Nether: " + there);
            BlockPos feet = BlockPos.containing(there.position());
            helper.assertFalse(nether.getFluidState(feet).is(FluidTags.LAVA), "in lava at " + there.position());
            helper.assertFalse(nether.getFluidState(feet.below()).is(FluidTags.LAVA), "standing on lava at " + there.position());
            helper.assertTrue(exitAt(nether, portal, there.position()).isPresent(), "no exit was built: " + there.position());
        } finally {
            sheet(nether, target, 3, AIR);
            forget(nether, portal, nx, nz, 48);
            forget(level, portal, x, z, 8);
        }
        helper.succeed();
    }

    /** B336b: water stays ground; with a water sheet under the target column the traveller stands on its surface. */
    @GameTest
    public void surfaceArrivalStandsOnWater(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        ServerLevel nether = nether(helper);
        MsmPortalBlock portal = portal("portal_travel_surface_nether");
        int x = farX(7);
        int z = FAR_Z;
        forget(level, portal, x, z, 8);
        clearAbove(level, x, z, 6);
        int nx = Math.floorDiv(x, 8);
        int nz = Math.floorDiv(z, 8);
        forget(nether, portal, nx, nz, 48);
        clearAbove(nether, nx, nz, 24);
        PortalFrame.Rectangle entry = litPortal(level, portal, x, z, Direction.Axis.X);
        Vec3 at = middle(entry);
        BlockPos target = PortalTravel.targetPosition(nether, at, 0.125);
        int y = sheet(nether, target, 3, Blocks.WATER.defaultBlockState());
        try {
            helper.assertValueEqual(PortalTravel.arrival(portal, nether, target, traveller(level, at)), PortalTravel.Arrival.SURFACE, "arrival");
            TeleportTransition there = portal.getPortalDestination(level, traveller(level, at), entry.min());
            helper.assertTrue(there != null && there.newLevel() == nether, "to the Nether: " + there);
            helper.assertValueEqual(there.position(), new Vec3(target.getX() + 0.5, y + 1, target.getZ() + 0.5), "on the water surface");
            helper.assertTrue(nether.getFluidState(BlockPos.containing(there.position()).below()).is(FluidTags.WATER), "standing on water");
            helper.assertTrue(entries(nether, portal, nx, nz, 48).isEmpty(), "surface arrival on water built an exit");
        } finally {
            sheet(nether, target, 3, AIR);
            forget(nether, portal, nx, nz, 48);
            forget(level, portal, x, z, 8);
        }
        helper.succeed();
    }

    /** The target is clamped to the target level's world border. */
    @GameTest
    public void theTargetIsClampedToTheWorldBorder(GameTestHelper helper) {
        ServerLevel end = end(helper);
        BlockPos clamped = PortalTravel.targetPosition(end, new Vec3(29_000_000, 70, -29_000_000), 4.0);
        helper.assertTrue(end.getWorldBorder().isWithinBounds(clamped), "outside the border: " + clamped);
        helper.assertValueEqual(clamped.getY(), 70, "y kept");
        BlockPos plain = PortalTravel.targetPosition(end, new Vec3(800.5, 64, -160.5), 0.125);
        helper.assertValueEqual(plain, new BlockPos(100, 64, -21), "x and z times the factor");
        helper.assertValueEqual(PortalTravel.targetDimension(portal("portal_travel_linked").portal(), Level.NETHER.identifier()),
                Level.OVERWORLD.identifier(), "from the destination back to return_to");
        helper.assertValueEqual(PortalTravel.targetDimension(portal("portal_travel_linked").portal(), Level.END.identifier()),
                Level.NETHER.identifier(), "from a third dimension to the destination");
        helper.succeed();
    }

    /**
     * A portal placed without lighting (its blocks set directly, as {@code /fill} or a structure would) joins the index the
     * first time something uses it; a lone portal block still takes a traveller but is not indexed.
     */
    @GameTest
    public void anUnlitPortalJoinsTheIndexOnFirstUse(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        ServerLevel nether = nether(helper);
        MsmPortalBlock portal = portal("portal_travel_linked");
        int x = farX(5);
        int z = FAR_Z;
        forget(level, portal, x, z, 16);
        clearAbove(level, x, z, 14);
        forget(nether, portal, Math.floorDiv(x, 8), Math.floorDiv(z, 8), 40);
        clearAbove(nether, Math.floorDiv(x, 8), Math.floorDiv(z, 8), 24);
        BlockPos min = new BlockPos(x, groundAir(level, x, z) + 1, z);
        PortalFrame.Rectangle placed = frame(level, min, Direction.Axis.X, 3, 4, frameOf(portal));
        PortalFrame.fill(level, placed, portal.defaultBlockState());
        helper.assertTrue(PortalIndexAttachment.at(level, portal, placed.min()).isEmpty(), "indexed before use");
        TeleportTransition there = portal.getPortalDestination(level, traveller(level, middle(placed)), placed.at(1, 1));
        helper.assertTrue(there != null, "no destination");
        helper.assertValueEqual(PortalIndexAttachment.at(level, portal, placed.min()),
                Optional.of(PortalIndex.Entry.of(PortalIndexAttachment.id(portal), placed)), "joined the index on first use");

        BlockPos lone = min.east(10);
        level.setBlock(lone, portal.defaultBlockState(), FLAGS);
        TeleportTransition fromLone = portal.getPortalDestination(level, traveller(level, Vec3.atBottomCenterOf(lone)), lone);
        helper.assertTrue(fromLone != null && fromLone.newLevel() == nether, "a lone portal block: " + fromLone);
        helper.assertTrue(PortalIndexAttachment.at(level, portal, lone).isEmpty(), "a lone portal block was indexed");
        level.setBlock(lone, AIR, FLAGS);
        helper.succeed();
    }
}
