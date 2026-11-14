package dev.mcsupermods.runtime.gametest;

import com.mojang.authlib.GameProfile;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.events.ParticleSpecs;
import dev.mcsupermods.runtime.registry.AmbientParticles;
import dev.mcsupermods.runtime.registry.MsmBlock;
import dev.mcsupermods.runtime.registry.types.DrivenBlock;
import dev.mcsupermods.runtime.registry.types.MsmPortalBlock;
import dev.mcsupermods.runtime.scripting.ScriptHost;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ItemParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.network.protocol.game.ClientboundBundlePacket;
import net.minecraft.network.protocol.game.ClientboundLevelParticlesPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;

/**
 * Spawning particles (ADR 0080 D5, D6; plan B352): {@code spawn_particle} with vanilla options objects, {@code motion},
 * {@code force} and the {@code count} cap; a broken options object found at server start; script API 1.3's
 * {@code world.spawnParticle} (the handlers of {@code msm/msm_test/script/particles.js}); and the spawn plan of
 * {@code msm:ambient_particles}, which the client draws (limit K5) and is checked here with a seeded random.
 *
 * <p>Particles are observed as the packets a listening player receives ({@link Eyes}, as in {@code MsmParticleGameTest}):
 * a plain {@code ServerPlayer} on a {@code Connection} inside a Netty {@code EmbeddedChannel}, whose outbound queue holds
 * the packets unencoded. Only packets near the test's own position are counted.
 */
public class MsmParticleSpawnGameTest {
    private static final BlockPos AT = new BlockPos(1, 1, 1);
    private static final String LOG = "msm_test:particles: ";

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    /** A spectator player that records the particle packets sent near it. Remove it with {@link #close}. */
    private static final class Eyes implements AutoCloseable {
        private final EmbeddedChannel channel;
        private final MinecraftServer server;
        private final ServerPlayer player;

        Eyes(GameTestHelper helper, BlockPos at) {
            server = helper.getLevel().getServer();
            GameProfile profile = new GameProfile(UUID.randomUUID(), "msm-eyes");
            CommonListenerCookie cookie = CommonListenerCookie.createInitial(profile, false);
            player = new ServerPlayer(server, helper.getLevel(), profile, cookie.clientInformation());
            Connection connection = new Connection(PacketFlow.SERVERBOUND);
            channel = new EmbeddedChannel(connection);
            server.getPlayerList().placeNewPlayer(connection, player, cookie);
            player.setGameMode(GameType.SPECTATOR);
            player.snapTo(helper.absoluteVec(Vec3.atCenterOf(at)));
            seen(Vec3.ZERO, Double.MAX_VALUE);
        }

        /** The particle packets sent since the last call within {@code radius} blocks of {@code near}, in order. */
        List<ClientboundLevelParticlesPacket> seen(Vec3 near, double radius) {
            channel.flushOutbound();
            List<ClientboundLevelParticlesPacket> out = new ArrayList<>();
            for (Object message = channel.readOutbound(); message != null; message = channel.readOutbound()) {
                if (message instanceof Packet<?> packet) {
                    collect(packet, out);
                }
            }
            out.removeIf(p -> new Vec3(p.x(), p.y(), p.z()).distanceTo(near) > radius);
            return out;
        }

        private static void collect(Packet<?> packet, List<ClientboundLevelParticlesPacket> out) {
            switch (packet) {
                case ClientboundLevelParticlesPacket p -> out.add(p);
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

    private static MsmBlock spawner() {
        return (MsmBlock) BuiltInRegistries.BLOCK.getValue(id("particle_spawner"));
    }

    /** Fires {@code msm_test:<event>} of {@code particle_spawner} at {@link #AT} and returns the packets within 5 blocks. */
    private static List<ClientboundLevelParticlesPacket> fire(GameTestHelper helper, String event) {
        MsmBlock block = spawner();
        try (Eyes eyes = new Eyes(helper, AT.above())) {
            EventRunner.fire(block.id(), block.definition().events(), id(event),
                    EventContext.forBlock(helper.getLevel(), helper.absolutePos(AT), null));
            return eyes.seen(helper.absoluteVec(Vec3.atCenterOf(AT)), 5.0);
        }
    }

    private static List<String> problems(String file) {
        List<String> all = new ArrayList<>(MsmRuntime.report().errors());
        all.addAll(MsmRuntime.report().warnings());
        return all.stream().filter(p -> p.contains(file)).toList();
    }

    private static void assertClose(GameTestHelper helper, double actual, double expected, String what) {
        helper.assertTrue(Math.abs(actual - expected) < 1e-6, what + ": " + actual + ", expected " + expected);
    }

    // spawn_particle options objects (ADR 0080 D5)

    @GameTest
    public void spawnerLoadsWithoutProblems(GameTestHelper helper) {
        helper.assertValueEqual(problems("block/particle_spawner.json"), List.of(), "particle_spawner problems");
        helper.assertValueEqual(ParticleSpecs.startErrors().stream().filter(e -> e.contains("particle_spawner")).toList(), List.of(),
                "particle_spawner start errors");
        helper.succeed();
    }

    @GameTest
    public void dustObjectSendsDustOfThatColourAndScale(GameTestHelper helper) {
        List<ClientboundLevelParticlesPacket> seen = fire(helper, "dust");
        helper.assertValueEqual(seen.size(), 1, "dust packets");
        ClientboundLevelParticlesPacket packet = seen.getFirst();
        helper.assertTrue(packet.particle() instanceof DustParticleOptions, "particle " + packet.particle());
        DustParticleOptions dust = (DustParticleOptions) packet.particle();
        Vector3f colour = dust.getColor();
        // The colour travels as 8-bit RGB: 0.5 becomes 127/255 or 128/255.
        helper.assertTrue(Math.abs(colour.x() - 1) < 0.01 && Math.abs(colour.y() - 0.5) < 0.01 && Math.abs(colour.z()) < 0.01,
                "colour " + colour);
        helper.assertValueEqual(dust.getScale(), 1.5f, "scale");
        helper.assertValueEqual(packet.count(), 3, "count");
        helper.assertValueEqual(packet.xDist(), 0.25f, "spread");
        helper.assertFalse(packet.overrideLimiter(), "override flag without force");
        helper.succeed();
    }

    @GameTest
    public void blockObjectSendsTheBlockState(GameTestHelper helper) {
        List<ClientboundLevelParticlesPacket> seen = fire(helper, "block");
        helper.assertValueEqual(seen.size(), 1, "block packets");
        helper.assertTrue(seen.getFirst().particle() instanceof BlockParticleOption b && b.getType() == ParticleTypes.BLOCK
                && b.getState() == Blocks.STONE.defaultBlockState(),
                "particle " + seen.getFirst().particle());
        helper.assertValueEqual(seen.getFirst().count(), 2, "count");
        helper.succeed();
    }

    @GameTest
    public void itemObjectSendsAProjectItem(GameTestHelper helper) {
        List<ClientboundLevelParticlesPacket> seen = fire(helper, "item");
        helper.assertValueEqual(seen.size(), 1, "item packets");
        helper.assertTrue(seen.getFirst().particle() instanceof ItemParticleOption i && i.getType() == ParticleTypes.ITEM
                && i.getItem().typeHolder().value() == BuiltInRegistries.ITEM.getValue(id("fuel_gem")),
                "particle " + seen.getFirst().particle());
        helper.succeed();
    }

    /**
     * The shapes the app and the library write (B353, B354): dust with an integer RGB colour and with a colour array, a
     * block as a plain id, a vanilla item.
     */
    @GameTest
    public void appAndLibraryShapesDecode(GameTestHelper helper) {
        List<ClientboundLevelParticlesPacket> dustInt = fire(helper, "dust_int");
        helper.assertValueEqual(dustInt.size(), 1, "dust_int packets");
        helper.assertTrue(dustInt.getFirst().particle() instanceof DustParticleOptions d && d.getScale() == 1f
                && Math.abs(d.getColor().x() - 1) < 0.01 && Math.abs(d.getColor().y() - 0x80 / 255f) < 0.01 && d.getColor().z() < 0.01,
                "dust_int " + dustInt.getFirst().particle());
        List<ClientboundLevelParticlesPacket> dustArray = fire(helper, "dust_array");
        helper.assertValueEqual(dustArray.size(), 1, "dust_array packets");
        helper.assertTrue(dustArray.getFirst().particle() instanceof DustParticleOptions d && d.getScale() == 1.5f
                && Math.abs(d.getColor().y() - 0.82f) < 0.01 && Math.abs(d.getColor().z() - 0.38f) < 0.01,
                "dust_array " + dustArray.getFirst().particle());
        List<ClientboundLevelParticlesPacket> item = fire(helper, "item_diamond");
        helper.assertValueEqual(item.size(), 1, "item_diamond packets");
        helper.assertTrue(item.getFirst().particle() instanceof ItemParticleOption i && i.getItem().typeHolder().value() == Items.DIAMOND,
                "item_diamond " + item.getFirst().particle());
        helper.succeed();
    }

    /** {@code motion}: one count-0 packet per particle whose distance times speed is exactly the motion; speed is unused. */
    @GameTest
    public void motionSendsOneCountZeroPacketPerParticle(GameTestHelper helper) {
        List<ClientboundLevelParticlesPacket> seen = fire(helper, "motion");
        helper.assertValueEqual(seen.size(), 5, "motion packets");
        Vec3 origin = helper.absoluteVec(Vec3.atCenterOf(AT));
        boolean moved = false;
        for (ClientboundLevelParticlesPacket p : seen) {
            helper.assertTrue(p.particle().getType() == BuiltInRegistries.PARTICLE_TYPE.getValue(id("spark")), "type " + p.particle());
            helper.assertValueEqual(p.count(), 0, "count of a motion packet");
            assertClose(helper, p.xDist() * p.xMaxSpeed(), 0, "x velocity");
            assertClose(helper, p.yDist() * p.yMaxSpeed(), 0.25f, "y velocity");
            assertClose(helper, p.zDist() * p.zMaxSpeed(), -0.1f, "z velocity");
            moved |= new Vec3(p.x(), p.y(), p.z()).distanceTo(origin) > 1e-6;
        }
        helper.assertTrue(moved, "spread 0.5 placed every particle at the origin");
        List<ClientboundLevelParticlesPacket> one = fire(helper, "motion_one");
        helper.assertValueEqual(one.size(), 1, "motion_one packets");
        ClientboundLevelParticlesPacket p = one.getFirst();
        helper.assertValueEqual(p.count(), 0, "count");
        helper.assertTrue(new Vec3(p.x(), p.y(), p.z()).distanceTo(origin) < 1e-9, "spread 0 moved the particle: " + p);
        assertClose(helper, p.xDist() * p.xMaxSpeed(), 0.1f, "x velocity");
        helper.succeed();
    }

    @GameTest
    public void forceSetsTheOverrideFlag(GameTestHelper helper) {
        List<ClientboundLevelParticlesPacket> seen = fire(helper, "force");
        helper.assertValueEqual(seen.size(), 1, "force packets");
        helper.assertTrue(seen.getFirst().overrideLimiter(), "force did not set the override flag");
        helper.assertFalse(seen.getFirst().alwaysShow(), "always-show flag");
        helper.assertValueEqual(seen.getFirst().count(), 2, "count");
        helper.succeed();
    }

    @GameTest
    public void countIsCappedAtAThousand(GameTestHelper helper) {
        List<ClientboundLevelParticlesPacket> seen = fire(helper, "many");
        helper.assertValueEqual(seen.size(), 1, "packets for count 1000");
        helper.assertValueEqual(seen.getFirst().count(), 1000, "count");
        List<String> errors = MsmRuntime.report().errors().stream().filter(e -> e.contains("/particle_bad_count.json")).toList();
        helper.assertValueEqual(errors.size(), 1, "particle_bad_count errors " + errors);
        helper.assertTrue(errors.getFirst().contains("count") && errors.getFirst().contains("1000"), "error " + errors);
        helper.succeed();
    }

    /** A broken options object: exactly one error at server start naming the definition and the field; nothing is sent. */
    @GameTest
    public void brokenOptionsObjectIsOneStartErrorAndSendsNothing(GameTestHelper helper) {
        List<String> errors = ParticleSpecs.startErrors().stream().filter(e -> e.contains("particle_bad_options.json")).toList();
        helper.assertValueEqual(errors.size(), 1, "start errors " + ParticleSpecs.startErrors());
        helper.assertTrue(errors.getFirst().contains("msm_test:broken") && errors.getFirst().contains("color"), "error " + errors);
        helper.assertValueEqual(problems("particle_bad_options.json"), List.of(), "load problems (the object decodes only at start)");
        Block block = BuiltInRegistries.BLOCK.getValue(id("particle_bad_options"));
        helper.assertTrue(block instanceof MsmBlock, "particle_bad_options did not register: " + block);
        MsmBlock bad = (MsmBlock) block;
        try (Eyes eyes = new Eyes(helper, AT.above())) {
            EventRunner.fire(bad.id(), bad.definition().events(), id("broken"),
                    EventContext.forBlock(helper.getLevel(), helper.absolutePos(AT), null));
            helper.assertValueEqual(eyes.seen(helper.absoluteVec(Vec3.atCenterOf(AT)), 5.0).size(), 0, "packets of a broken object");
        }
        helper.succeed();
    }

    // world.spawnParticle (script API 1.3)

    private static ScriptHost host(GameTestHelper helper) {
        ScriptHost host = ScriptHost.current();
        helper.assertTrue(host != null, "no ScriptHost: SERVER_STARTING did not load scripts");
        return host;
    }

    /** Calls the handler {@code msm_test:<handler>} with {@code e.pos} at {@link #AT} and returns the packets within 3 blocks. */
    private static List<ClientboundLevelParticlesPacket> script(GameTestHelper helper, String handler) {
        ScriptHost host = host(helper);
        try (Eyes eyes = new Eyes(helper, AT.above())) {
            host.action(id("particles"), id("particles"), id(handler), EventContext.forBlock(helper.getLevel(), helper.absolutePos(AT), null));
            helper.assertTrue(host.handlerErrors().stream().noneMatch(e -> e.startsWith("script msm_test:particles:")),
                    "particles.js errors: " + host.handlerErrors());
            return eyes.seen(Vec3.atLowerCornerOf(helper.absolutePos(AT)), 3.0);
        }
    }

    @GameTest
    public void scriptSpawnsIdsProjectIdsAndObjects(GameTestHelper helper) {
        List<ClientboundLevelParticlesPacket> flame = script(helper, "particles_id");
        helper.assertValueEqual(flame.size(), 1, "id packets");
        helper.assertTrue(flame.getFirst().particle() == ParticleTypes.FLAME, "particle " + flame.getFirst().particle());
        helper.assertValueEqual(flame.getFirst().count(), 3, "count");
        helper.assertValueEqual(flame.getFirst().xDist(), 0.2f, "spread");
        helper.assertValueEqual(flame.getFirst().xMaxSpeed(), 0.05f, "speed");

        List<ClientboundLevelParticlesPacket> spark = script(helper, "particles_project");
        helper.assertValueEqual(spark.size(), 1, "project id packets");
        helper.assertTrue(spark.getFirst().particle() == BuiltInRegistries.PARTICLE_TYPE.getValue(id("spark")), "particle " + spark);

        List<ClientboundLevelParticlesPacket> dust = script(helper, "particles_object");
        helper.assertValueEqual(dust.size(), 1, "object packets");
        helper.assertTrue(dust.getFirst().particle() instanceof DustParticleOptions d && d.getScale() == 2f
                && d.getColor().z() > 0.99f && d.getColor().x() < 0.01f, "particle " + dust.getFirst().particle());
        helper.assertValueEqual(dust.getFirst().count(), 4, "count");
        helper.succeed();
    }

    @GameTest
    public void scriptMotionAndForce(GameTestHelper helper) {
        List<ClientboundLevelParticlesPacket> seen = script(helper, "particles_motion");
        helper.assertValueEqual(seen.size(), 3, "motion packets");
        for (ClientboundLevelParticlesPacket p : seen) {
            helper.assertValueEqual(p.count(), 0, "count");
            helper.assertTrue(p.overrideLimiter(), "force");
            assertClose(helper, p.yDist() * p.yMaxSpeed(), 0.5, "y velocity");
        }
        helper.succeed();
    }

    @GameTest
    public void scriptParticleErrors(GameTestHelper helper) {
        ScriptHost host = host(helper);
        host.action(id("particles"), id("particles"), id("particles_errors"),
                EventContext.forBlock(helper.getLevel(), helper.absolutePos(AT), null));
        List<String> logs = host.recentLogs();
        String line = null;
        for (int i = logs.size() - 1; i >= 0 && line == null; i--) {
            if (logs.get(i).startsWith(LOG + "errors ")) {
                line = logs.get(i).substring(LOG.length());
            }
        }
        helper.assertValueEqual(line, "errors unknown:TypeError needsOptions:TypeError noType:TypeError badField:TypeError "
                + "extra:TypeError motion2:TypeError tooMany:RangeError manyNoMotion:ok", "error line");
        helper.succeed();
    }

    // msm:ambient_particles (ADR 0080 D6): the spawn plan, checked with a seeded random

    private static BlockComponents.AmbientParticles ambient(String path) {
        Block block = BuiltInRegistries.BLOCK.getValue(id(path));
        return ((DrivenBlock) block).driver().definition().components().ambientParticles().orElseThrow();
    }

    @GameTest
    public void ambientPlanPlacesAndMovesAsWritten(GameTestHelper helper) {
        helper.assertValueEqual(problems("block/ambient_spark.json"), List.of(), "ambient_spark problems");
        BlockComponents.AmbientParticles spec = ambient("ambient_spark");
        BlockState state = BuiltInRegistries.BLOCK.getValue(id("ambient_spark")).defaultBlockState();
        BlockPos pos = new BlockPos(10, 64, -3);
        List<AmbientParticles.Spawn> plan = AmbientParticles.plan(spec, state, pos, RandomSource.create(42));
        helper.assertValueEqual(plan.size(), 3, "count");
        // The rule restated: chance 1 draws nothing; each particle draws x, y, z in [-1, 1) times spread around offset.
        RandomSource r = RandomSource.create(42);
        for (AmbientParticles.Spawn s : plan) {
            assertClose(helper, s.x(), 10 + 0.5 + (2 * r.nextDouble() - 1) * 0.25, "x");
            assertClose(helper, s.y(), 64 + 1.1 + (2 * r.nextDouble() - 1) * 0, "y");
            assertClose(helper, s.z(), -3 + 0.5 + (2 * r.nextDouble() - 1) * 0.25, "z");
            helper.assertTrue(s.x() >= 10.25 && s.x() <= 10.75 && s.z() >= -2.75 && s.z() <= -2.25, "outside offset +- spread: " + s);
            assertClose(helper, s.xd(), 0, "x velocity");
            assertClose(helper, s.yd(), 0.05, "y velocity");
            assertClose(helper, s.zd(), 0, "z velocity");
        }
        helper.succeed();
    }

    @GameTest
    public void ambientPlanHonoursChance(GameTestHelper helper) {
        BlockComponents.AmbientParticles spec = ambient("ambient_chance");
        helper.assertValueEqual(spec.chance(), 0.3f, "chance");
        helper.assertTrue(spec.particle().isObject(), "dust object");
        BlockState state = BuiltInRegistries.BLOCK.getValue(id("ambient_chance")).defaultBlockState();
        RandomSource plans = RandomSource.create(7);
        RandomSource rule = RandomSource.create(7);
        int shown = 0;
        for (int n = 0; n < 200; n++) {
            List<AmbientParticles.Spawn> plan = AmbientParticles.plan(spec, state, BlockPos.ZERO, plans);
            boolean passes = rule.nextFloat() < 0.3f;
            helper.assertValueEqual(plan.size(), passes ? 2 : 0, "plan " + n);
            if (passes) {
                for (int k = 0; k < 6; k++) {
                    rule.nextDouble();
                }
                for (AmbientParticles.Spawn s : plan) {
                    helper.assertTrue(s.x() >= 0 && s.x() <= 1 && s.y() >= 0 && s.y() <= 1 && s.z() >= 0 && s.z() <= 1,
                            "default offset and spread leave the block: " + s);
                }
                shown++;
            }
        }
        helper.assertTrue(shown > 30 && shown < 90, "shown " + shown + " of 200 at chance 0.3");
        helper.succeed();
    }

    @GameTest
    public void ambientPlanFollowsTheMachinesLitState(GameTestHelper helper) {
        helper.assertValueEqual(problems("block/ambient_machine.json"), List.of(), "ambient_machine problems");
        BlockComponents.AmbientParticles spec = ambient("ambient_machine");
        BlockState idle = BuiltInRegistries.BLOCK.getValue(id("ambient_machine")).defaultBlockState();
        helper.assertTrue(idle.hasProperty(MsmBlock.LIT) && !idle.getValue(MsmBlock.LIT), "machine has no unlit lit property: " + idle);
        helper.assertValueEqual(AmbientParticles.plan(spec, idle, BlockPos.ZERO, RandomSource.create(1)).size(), 0, "unlit plan");
        BlockState lit = idle.setValue(MsmBlock.LIT, true);
        helper.assertValueEqual(AmbientParticles.plan(spec, lit, BlockPos.ZERO, RandomSource.create(1)).size(), 1, "lit plan");
        helper.succeed();
    }

    /** Ambient particles are the client's: nothing on a server level, and the block's animateTick sends no packet. */
    @GameTest
    public void ambientParticlesAreNotSentByTheServer(GameTestHelper helper) {
        BlockComponents.AmbientParticles spec = ambient("ambient_spark");
        Block block = BuiltInRegistries.BLOCK.getValue(id("ambient_spark"));
        helper.setBlock(AT, block);
        BlockState state = helper.getBlockState(AT);
        helper.assertValueEqual(AmbientParticles.planFor(spec, helper.getLevel(), state, helper.absolutePos(AT), RandomSource.create(42)),
                List.of(), "plan on a server level");
        try (Eyes eyes = new Eyes(helper, AT.above())) {
            for (int n = 0; n < 20; n++) {
                block.animateTick(state, helper.getLevel(), helper.absolutePos(AT), RandomSource.create(n));
            }
            helper.assertValueEqual(eyes.seen(helper.absoluteVec(Vec3.atCenterOf(AT)), 5.0).size(), 0, "packets from animateTick");
        }
        helper.succeed();
    }

    @GameTest
    public void ambientParticlesOnAPortalAreAnErrorAndDropped(GameTestHelper helper) {
        List<String> errors = MsmRuntime.report().errors().stream().filter(e -> e.contains("/particle_bad_ambient_portal.json")).toList();
        helper.assertValueEqual(errors.size(), 1, "errors " + errors);
        helper.assertTrue(errors.getFirst().contains("msm:ambient_particles") && errors.getFirst().contains("portal"), "error " + errors);
        Block block = BuiltInRegistries.BLOCK.getValue(id("particle_bad_ambient_portal"));
        helper.assertTrue(block instanceof MsmPortalBlock, "not a portal: " + block);
        helper.assertTrue(((MsmPortalBlock) block).driver().definition().components().ambientParticles().isEmpty(),
                "msm:ambient_particles kept on a portal");
        helper.succeed();
    }

    @GameTest
    public void ambientStatesTheBlockLacksAreAWarning(GameTestHelper helper) {
        List<String> warnings = MsmRuntime.report().warnings().stream().filter(e -> e.contains("/particle_bad_states.json")).toList();
        helper.assertValueEqual(warnings.size(), 1, "warnings " + warnings);
        helper.assertTrue(warnings.getFirst().contains("states: lit is not a property"), "warning " + warnings);
        helper.succeed();
    }
}
