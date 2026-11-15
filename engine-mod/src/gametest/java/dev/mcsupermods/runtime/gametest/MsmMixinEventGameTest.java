package dev.mcsupermods.runtime.gametest;

import com.mojang.authlib.GameProfile;
import dev.mcsupermods.runtime.scripting.ScriptHost;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.Connection;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.network.protocol.game.ClientboundBlockUpdatePacket;
import net.minecraft.network.protocol.game.ClientboundContainerSetContentPacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.item.PrimedTnt;
import net.minecraft.world.entity.monster.Creeper;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.context.DirectionalPlaceContext;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for the two Mixins of ADR 0096 D3 and their script events, through the handlers of
 * {@code msm/msm_test/script/api16.js}: {@code BlockItemPlaceMixin} ({@code block.place}: a player's placement through
 * {@code ServerPlayerGameMode.useItemOn}, as the network handler drives it; a cancel for the player named
 * {@code msm-noplace}; a placement without a player is not seen) and {@code ServerExplosionMixin}
 * ({@code world.explosion}: primed TNT and an ignited creeper named {@code msm-cancel}, {@code msm-keep} or
 * {@code msm-both}, and a sourceless explosion). Every explosion here happens over a floor and walls of dirt, which
 * vanilla's TNT breaks, with a pig standing two blocks away.
 */
public class MsmMixinEventGameTest {
    private static final BlockPos AT = new BlockPos(1, 1, 1);
    private static final Vec3 MID = new Vec3(3.5, 1, 3.5);

    private static ScriptHost host(GameTestHelper helper) {
        ScriptHost host = ScriptHost.current();
        helper.assertTrue(host != null, "no ScriptHost: SERVER_STARTING did not load scripts");
        return host;
    }

    /** Every api16.js log line that starts with {@code start}, without the script prefix. */
    private static List<String> lines(GameTestHelper helper, String start) {
        String prefix = "msm_test:api16: " + start;
        return host(helper).recentLogs().stream().filter(l -> l.startsWith(prefix)).map(l -> l.substring("msm_test:api16: ".length()))
                .toList();
    }

    // ---- block.place -----------------------------------------------------------------------------------

    /** A connection that records the resync packets sent to its player. */
    private static final class RecordingConnection extends Connection {
        final List<Packet<?>> sent = new ArrayList<>();

        RecordingConnection() {
            super(PacketFlow.SERVERBOUND);
        }

        @Override
        public void send(Packet<?> packet, ChannelFutureListener listener, boolean flush) {
            sent.add(packet);
            super.send(packet, listener, flush);
        }

        List<String> resync() {
            List<String> out = new ArrayList<>();
            for (Packet<?> p : sent) {
                switch (p) {
                    case ClientboundContainerSetContentPacket c -> out.add("inventory " + c.containerId());
                    case ClientboundBlockUpdatePacket b -> out.add("block " + b.getPos().toShortString());
                    default -> { }
                }
            }
            return out;
        }
    }

    private record Recorded(ServerPlayer player, RecordingConnection connection) {}

    /** A survival player with {@code name}, placed as {@code makeMockServerPlayerInLevel} does, with a recording connection. */
    private static Recorded recordingPlayer(GameTestHelper helper, String name) {
        ServerLevel level = helper.getLevel();
        CommonListenerCookie cookie = CommonListenerCookie.createInitial(new GameProfile(UUID.randomUUID(), name), false);
        ServerPlayer player = new ServerPlayer(level.getServer(), level, cookie.gameProfile(), cookie.clientInformation());
        RecordingConnection connection = new RecordingConnection();
        new EmbeddedChannel(connection);
        level.getServer().getPlayerList().placeNewPlayer(connection, player, cookie);
        player.setGameMode(GameType.SURVIVAL);
        player.snapTo(helper.absoluteVec(MID));
        connection.sent.clear();
        return new Recorded(player, connection);
    }

    private static void remove(GameTestHelper helper, ServerPlayer player) {
        helper.getLevel().getServer().getPlayerList().remove(player);
    }

    /** Right-click on the top face of {@code rel} through {@code ServerPlayerGameMode.useItemOn}. */
    private static InteractionResult use(GameTestHelper helper, ServerPlayer player, BlockPos rel) {
        BlockPos abs = helper.absolutePos(rel);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs).add(0, 0.5, 0), Direction.UP, abs, false);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND),
                InteractionHand.MAIN_HAND, hit);
    }

    private static String pos(BlockPos abs) {
        return abs.getX() + ", " + abs.getY() + ", " + abs.getZ();
    }

    /** A placement goes ahead and reports the position, the block, the item and the count before placing. */
    @GameTest
    public void placementFiresBlockPlace(GameTestHelper helper) {
        helper.setBlock(AT, Blocks.STONE);
        Recorded r = recordingPlayer(helper, "msm-place");
        r.player().setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.OAK_PLANKS, 5));
        InteractionResult result = use(helper, r.player(), AT);
        helper.assertFalse(result instanceof InteractionResult.Fail, "placing was refused: " + result);
        helper.assertBlockPresent(Blocks.OAK_PLANKS, AT.above());
        helper.assertValueEqual(r.player().getMainHandItem().getCount(), 4, "one plank used");
        String at = pos(helper.absolutePos(AT.above()));
        helper.assertTrue(lines(helper, "place msm-place ").contains("place msm-place minecraft:oak_planks " + at
                + " minecraft:oak_planks 5 true"), "block.place: " + lines(helper, "place msm-place "));
        helper.assertValueEqual(r.connection().resync(), List.of(), "no resync after an uncancelled placement");
        remove(helper, r.player());
        helper.succeed();
    }

    /**
     * A cancelled placement leaves the block unplaced and the stack whole, returns {@code FAIL} and resyncs the inventory,
     * the placement position and its six neighbours (the client predicted the block).
     */
    @GameTest
    public void cancelledPlacementLeavesTheBlockUnplacedAndResyncs(GameTestHelper helper) {
        helper.setBlock(AT, Blocks.STONE);
        Recorded r = recordingPlayer(helper, "msm-noplace");
        r.player().setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.OAK_DOOR, 3));
        InteractionResult result = use(helper, r.player(), AT);
        helper.assertTrue(result instanceof InteractionResult.Fail, "cancel() did not return FAIL: " + result);
        helper.assertBlockPresent(Blocks.AIR, AT.above());
        helper.assertBlockPresent(Blocks.AIR, AT.above(2));
        helper.assertValueEqual(r.player().getMainHandItem().getCount(), 3, "no door used");
        BlockPos placement = helper.absolutePos(AT.above());
        List<String> expected = new ArrayList<>(List.of("inventory 0", "block " + placement.toShortString()));
        for (Direction d : Direction.values()) {
            expected.add("block " + placement.relative(d).toShortString());
        }
        helper.assertValueEqual(r.connection().resync(), expected, "resync after a cancelled block.place");
        helper.assertTrue(lines(helper, "place msm-noplace ").contains("place msm-noplace minecraft:oak_door " + pos(placement)
                + " minecraft:oak_door 3 true"), "block.place: " + lines(helper, "place msm-noplace "));
        remove(helper, r.player());
        helper.succeed();
    }

    /** A placement without a player (a dispenser's context) is not seen (ADR 0096 Q17). */
    @GameTest
    public void placementWithoutAPlayerIsNotSeen(GameTestHelper helper) {
        BlockPos abs = helper.absolutePos(AT);
        ItemStack stack = new ItemStack(Items.LAPIS_BLOCK);
        InteractionResult result = ((BlockItem) Items.LAPIS_BLOCK).place(
                new DirectionalPlaceContext(helper.getLevel(), abs, Direction.DOWN, stack, Direction.UP));
        helper.assertFalse(result instanceof InteractionResult.Fail, "placing failed: " + result);
        helper.assertBlockPresent(Blocks.LAPIS_BLOCK, AT);
        helper.assertTrue(lines(helper, "place ").stream().noneMatch(l -> l.contains(" " + pos(abs) + " ")),
                "block.place fired without a player: " + lines(helper, "place "));
        helper.succeed();
    }

    // ---- world.explosion -------------------------------------------------------------------------------

    /** A dirt floor and a ring of dirt around the middle, and a pig two blocks east. */
    private static Mob arena(GameTestHelper helper) {
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                helper.setBlock(x, 0, z, Blocks.DIRT);
                if (x == 1 || x == 6 || z == 1 || z == 6) {
                    helper.setBlock(x, 1, z, Blocks.DIRT);
                }
            }
        }
        return helper.spawnWithNoFreeWill(EntityTypes.PIG, MID.add(2, 0, 0));
    }

    private static int dirt(GameTestHelper helper) {
        int count = 0;
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                count += helper.getBlockState(new BlockPos(x, 0, z)).is(Blocks.DIRT) ? 1 : 0;
                count += helper.getBlockState(new BlockPos(x, 1, z)).is(Blocks.DIRT) ? 1 : 0;
            }
        }
        return count;
    }

    /** The floor (64) and the ring (28). */
    private static final int DIRT = 64 + 28;

    /** Dropped dirt around the arena (a pig the explosion killed drops its own loot, which is not counted). */
    private static List<ItemEntity> drops(GameTestHelper helper) {
        AABB box = new AABB(helper.absoluteVec(new Vec3(-4, -2, -4)), helper.absoluteVec(new Vec3(12, 8, 12)));
        return helper.getLevel().getEntitiesOfClass(ItemEntity.class, box, e -> e.getItem().is(Items.DIRT));
    }

    private static PrimedTnt tnt(GameTestHelper helper, String name) {
        PrimedTnt tnt = helper.spawn(EntityTypes.TNT, MID);
        tnt.setFuse(2);
        tnt.setCustomName(Component.literal(name));
        return tnt;
    }

    /** After {@code source} exploded: its event line, every block, the pig's health and no drops. */
    private static void afterExplosion(GameTestHelper helper, Entity source, String cause, String radius, Mob pig, boolean hurt) {
        helper.succeedWhen(() -> {
            helper.assertTrue(source.isRemoved(), "not exploded yet");
            List<String> seen = lines(helper, "explosion " + source.getStringUUID() + " ");
            helper.assertValueEqual(seen.size(), 1, "one world.explosion for the source: " + seen);
            helper.assertTrue(seen.get(0).startsWith("explosion " + source.getStringUUID() + " " + cause + " " + radius + " "),
                    "event: " + seen.get(0));
            helper.assertValueEqual(dirt(helper), DIRT, "dirt blocks left");
            helper.assertValueEqual(drops(helper).size(), 0, "dropped dirt");
            if (hurt) {
                helper.assertTrue(pig.getHealth() < pig.getMaxHealth() || !pig.isAlive(), "keepBlocks did not hurt the pig");
            } else {
                helper.assertValueEqual(pig.getHealth(), pig.getMaxHealth(), "the pig's health after a cancelled explosion");
            }
        });
    }

    /** {@code cancel()} stops primed TNT: no block breaks and the pig is not hurt. */
    @GameTest(maxTicks = 40)
    public void cancelStopsTnt(GameTestHelper helper) {
        Mob pig = arena(helper);
        afterExplosion(helper, tnt(helper, "msm-cancel"), "minecraft:tnt", "4", pig, false);
    }

    /** {@code cancel()} stops an ignited creeper's explosion (the creeper is gone, as after any explosion of its own). */
    @GameTest(maxTicks = 80)
    public void cancelStopsACreeper(GameTestHelper helper) {
        Mob pig = arena(helper);
        Creeper creeper = (Creeper) helper.spawnWithNoFreeWill(EntityTypes.CREEPER, MID);
        creeper.setCustomName(Component.literal("msm-cancel"));
        creeper.ignite();
        afterExplosion(helper, creeper, "minecraft:creeper", "3", pig, false);
    }

    /** {@code keepBlocks()} keeps every block (no break, drop or fire) while the pig is still hurt. */
    @GameTest(maxTicks = 40)
    public void keepBlocksKeepsEveryBlockWhileEntitiesAreHurt(GameTestHelper helper) {
        Mob pig = arena(helper);
        afterExplosion(helper, tnt(helper, "msm-keep"), "minecraft:tnt", "4", pig, true);
    }

    /** {@code cancel()} wins over {@code keepBlocks()}. */
    @GameTest(maxTicks = 40)
    public void cancelWinsOverKeepBlocks(GameTestHelper helper) {
        Mob pig = arena(helper);
        afterExplosion(helper, tnt(helper, "msm-both"), "minecraft:tnt", "4", pig, false);
    }

    /** An explosion without an entity reports no source and the cause {@code "block"}. */
    @GameTest
    public void sourcelessExplosionHasCauseBlock(GameTestHelper helper) {
        Vec3 at = helper.absoluteVec(MID);
        int before = lines(helper, "explosion none block 0.75 ").size();
        helper.getLevel().explode(null, at.x, at.y, at.z, 0.75f, false, Level.ExplosionInteraction.NONE);
        helper.assertValueEqual(lines(helper, "explosion none block 0.75 ").size(), before + 1, "world.explosion without a source");
        helper.succeed();
    }
}
