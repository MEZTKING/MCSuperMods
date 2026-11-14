package dev.mcsupermods.runtime.gametest;

import com.mojang.authlib.GameProfile;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.MsmBlock;
import dev.mcsupermods.runtime.registry.MsmParticles;
import dev.mcsupermods.runtime.registry.types.MsmPortalBlock;
import dev.mcsupermods.runtime.registry.types.MsmUntintedLeavesBlock;
import io.netty.buffer.Unpooled;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import net.fabricmc.fabric.api.event.registry.RegistryAttribute;
import net.fabricmc.fabric.api.event.registry.RegistryAttributeHolder;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleType;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.Connection;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.network.protocol.game.ClientboundBundlePacket;
import net.minecraft.network.protocol.game.ClientboundLevelParticlesPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.phys.Vec3;

/**
 * Project particle types (ADR 0080 D1, D3, D7; ADR 0081 D6 (b)): the definitions of {@code msm/msm_test/particle/} are
 * option-less types in the synced particle registry, broken ones register nothing, and every place that takes a particle
 * type without options takes them: {@code /particle}, {@code spawn_particle}, an effect's {@code particle}, a leaves
 * block's {@code falling_particle} and a portal's {@code particles.type}.
 *
 * <p>Particles are observed as the packets a listening player receives ({@link Eyes}), as {@code MsmSoundGameTest}
 * hears sounds: a plain {@code ServerPlayer} on a {@code Connection} inside a Netty {@code EmbeddedChannel}, whose
 * outbound queue holds the packets unencoded. Only packets sent at the test's own position are counted, so another
 * test's particles never count here. Drawing is the client's (limit K4; B356).
 */
public class MsmParticleGameTest {
    private static final BlockPos AT = new BlockPos(1, 1, 1);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static ParticleType<?> type(String path) {
        return BuiltInRegistries.PARTICLE_TYPE.getValue(id(path));
    }

    /** A spectator player that records the particle packets sent at one position. Remove it with {@link #close}. */
    private static final class Eyes implements AutoCloseable {
        final ServerPlayer player;
        private final EmbeddedChannel channel;
        private final MinecraftServer server;

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

    private static CommandSourceStack source(GameTestHelper helper, Vec3 at) {
        return helper.getLevel().getServer().createCommandSourceStack().withLevel(helper.getLevel()).withPosition(at)
                .withSuppressedOutput();
    }

    /** Runs {@code command} through the server's command dispatcher; a parse or command error is thrown. */
    private static int run(GameTestHelper helper, Vec3 at, String command) throws CommandSyntaxException {
        CommandSourceStack source = source(helper, at);
        return helper.getLevel().getServer().getCommands().getDispatcher().execute(command, source);
    }

    private static List<String> problems(String file) {
        List<String> all = new ArrayList<>(MsmRuntime.report().errors());
        all.addAll(MsmRuntime.report().warnings());
        return all.stream().filter(p -> p.contains(file)).toList();
    }

    // Registration (ADR 0080 D1, D3)

    @GameTest
    public void projectParticlesAreOptionLessTypes(GameTestHelper helper) {
        for (String path : List.of("spark", "glimmer")) {
            helper.assertTrue(BuiltInRegistries.PARTICLE_TYPE.containsKey(id(path)), id(path) + " not registered");
            helper.assertTrue(type(path) instanceof SimpleParticleType, id(path) + " is not a SimpleParticleType: " + type(path));
            helper.assertTrue(MsmParticles.types().get(id(path)) == type(path), id(path) + " missing from MsmParticles.types()");
            helper.assertTrue(MsmParticles.definition(id(path)).isPresent(), id(path) + " has no definition");
            helper.assertTrue(MsmRuntime.report().particles().contains(id(path)), id(path) + " missing from the report");
            helper.assertValueEqual(problems("/particle/" + path + ".json"), List.of(), path + " problems");
        }
        helper.assertFalse(type("spark").getOverrideLimiter(), "spark overrides the limiter without always_show");
        helper.assertTrue(type("glimmer").getOverrideLimiter(), "glimmer's always_show is not the type's override limiter");
        helper.succeed();
    }

    /** Fact F18 (both versions): Fabric syncs the particle type registry, so a client must have the same types. */
    @GameTest
    public void particleTypeRegistryIsSynced(GameTestHelper helper) {
        helper.assertTrue(RegistryAttributeHolder.get(BuiltInRegistries.PARTICLE_TYPE).hasAttribute(RegistryAttribute.SYNCED),
                "the particle type registry is not synced");
        helper.succeed();
    }

    @GameTest
    public void invalidDefinitionsRegisterNothingWithOneErrorEach(GameTestHelper helper) {
        record Case(String path, String field) {}
        for (Case c : List.of(new Case("particle_bad_lifetime", "max"), new Case("particle_bad_key", "velocity"))) {
            helper.assertFalse(BuiltInRegistries.PARTICLE_TYPE.containsKey(id(c.path())), id(c.path()) + " registered");
            helper.assertFalse(MsmRuntime.report().particles().contains(id(c.path())), id(c.path()) + " in the report");
            List<String> errors = MsmRuntime.report().errors().stream().filter(e -> e.contains("/particle/" + c.path() + ".json")).toList();
            helper.assertValueEqual(errors.size(), 1, c.path() + " errors " + errors);
            helper.assertTrue(errors.getFirst().contains(c.field()) && errors.getFirst().contains("msm_runtime_gametest"),
                    c.path() + " error does not name '" + c.field() + "' and the mod: " + errors);
        }
        helper.succeed();
    }

    @GameTest
    public void anIdAlreadyRegisteredIsAnError(GameTestHelper helper) {
        List<String> errors = MsmRuntime.report().errors().stream().filter(e -> e.contains("msm/minecraft/particle/flame.json")).toList();
        helper.assertValueEqual(errors.size(), 1, "duplicate errors " + errors);
        helper.assertTrue(errors.getFirst().contains("particle type id minecraft:flame is already registered"), "error: " + errors);
        helper.assertTrue(BuiltInRegistries.PARTICLE_TYPE.getValue(Identifier.withDefaultNamespace("flame")) == ParticleTypes.FLAME,
                "vanilla's flame was replaced");
        helper.assertFalse(MsmRuntime.report().particles().contains(Identifier.withDefaultNamespace("flame")), "flame in the report");
        helper.succeed();
    }

    // /particle (ADR 0080 D1: no change to the command)

    @GameTest
    public void particleCommandReachesAPlayer(GameTestHelper helper) throws CommandSyntaxException {
        Vec3 at = helper.absoluteVec(Vec3.atCenterOf(AT));
        try (Eyes eyes = new Eyes(helper, AT)) {
            run(helper, at, "particle msm_test:spark ~ ~1 ~ 0.2 0.2 0.2 0 5");
            List<ClientboundLevelParticlesPacket> seen = eyes.seen(at.add(0, 1, 0), 0.01);
            helper.assertValueEqual(seen.size(), 1, "packets at the command's position");
            ClientboundLevelParticlesPacket packet = seen.getFirst();
            helper.assertTrue(packet.particle().getType() == type("spark"), "packet type " + packet.particle());
            helper.assertValueEqual(packet.count(), 5, "count");
            helper.assertValueEqual(packet.xDist(), 0.2f, "x spread");
            helper.assertFalse(packet.overrideLimiter(), "override flag without force");
        }
        helper.succeed();
    }

    @GameTest
    public void particleCommandForceSetsTheOverrideFlag(GameTestHelper helper) throws CommandSyntaxException {
        Vec3 at = helper.absoluteVec(Vec3.atCenterOf(AT));
        try (Eyes eyes = new Eyes(helper, AT)) {
            run(helper, at, "particle msm_test:spark ~ ~ ~ 0 0 0 0 1 force");
            List<ClientboundLevelParticlesPacket> seen = eyes.seen(at, 0.01);
            helper.assertValueEqual(seen.size(), 1, "packets at the command's position");
            helper.assertTrue(seen.getFirst().particle().getType() == type("spark"), "packet type " + seen.getFirst().particle());
            helper.assertTrue(seen.getFirst().overrideLimiter(), "force did not set the override flag");
        }
        helper.succeed();
    }

    @GameTest
    public void particleCommandWithAnUnknownIdFails(GameTestHelper helper) {
        Vec3 at = helper.absoluteVec(Vec3.atCenterOf(AT));
        try {
            run(helper, at, "particle msm_test:missing ~ ~ ~");
            helper.fail("/particle msm_test:missing succeeded");
        } catch (CommandSyntaxException e) {
            String key = e.getRawMessage() instanceof Component c && c.getContents() instanceof TranslatableContents t ? t.getKey() : null;
            helper.assertValueEqual(key, "particle.notFound", "error key of " + e.getMessage());
        }
        helper.succeed();
    }

    /** The packet's own stream codec, with the server's registries, carries a project type by its synced id. */
    @GameTest
    public void particlePacketRoundTripsThroughItsStreamCodec(GameTestHelper helper) {
        SimpleParticleType spark = (SimpleParticleType) type("spark");
        ClientboundLevelParticlesPacket packet = new ClientboundLevelParticlesPacket(spark, true, false, 1.5, 2.5, 3.5, 0.1f, 0.2f,
                0.3f, 0.05f, 7);
        RegistryFriendlyByteBuf buf = new RegistryFriendlyByteBuf(Unpooled.buffer(), helper.getLevel().registryAccess());
        try {
            ClientboundLevelParticlesPacket.STREAM_CODEC.encode(buf, packet);
            ClientboundLevelParticlesPacket back = ClientboundLevelParticlesPacket.STREAM_CODEC.decode(buf);
            helper.assertTrue(back.particle() == spark, "decoded particle " + back.particle());
            helper.assertValueEqual(back.count(), 7, "count");
            helper.assertTrue(back.overrideLimiter(), "override flag");
            helper.assertValueEqual(buf.readableBytes(), 0, "bytes left over");
        } finally {
            buf.release();
        }
        helper.succeed();
    }

    // Fields that take a particle type without options (ADR 0080 D7)

    @GameTest
    public void effectParticleIsAProjectParticle(GameTestHelper helper) {
        helper.assertValueEqual(problems("effect/sparkling.json"), List.of(), "sparkling problems");
        Holder<MobEffect> sparkling = BuiltInRegistries.MOB_EFFECT.get(id("sparkling")).orElseThrow();
        ParticleOptions particle = sparkling.value().createParticleOptions(new MobEffectInstance(sparkling, 100));
        helper.assertTrue(particle.getType() == type("spark"), "effect particle " + particle);
        helper.succeed();
    }

    @GameTest
    public void leavesAndPortalTakeProjectParticles(GameTestHelper helper) {
        helper.assertValueEqual(problems("block/spark_leaves.json"), List.of(), "spark_leaves problems");
        helper.assertValueEqual(problems("block/spark_portal.json"), List.of(), "spark_portal problems");
        Block leaves = BuiltInRegistries.BLOCK.getValue(id("spark_leaves"));
        helper.assertTrue(leaves instanceof MsmUntintedLeavesBlock, "spark_leaves has no falling particle: " + leaves);
        Block portal = BuiltInRegistries.BLOCK.getValue(id("spark_portal"));
        helper.assertTrue(portal instanceof MsmPortalBlock, "spark_portal is not a portal: " + portal);
        Optional<ParticleOptions> particle = MsmPortalBlock.particle(((MsmPortalBlock) portal).portal().particles());
        helper.assertTrue(particle.isPresent() && particle.get().getType() == type("glimmer"), "portal particle " + particle);
        helper.succeed();
    }

    @GameTest
    public void spawnParticleActionSendsAProjectParticle(GameTestHelper helper) {
        helper.assertValueEqual(problems("block/spark_block.json"), List.of(), "spark_block problems");
        MsmBlock block = (MsmBlock) BuiltInRegistries.BLOCK.getValue(id("spark_block"));
        helper.setBlock(AT, block);
        try (Eyes eyes = new Eyes(helper, AT.above())) {
            EventRunner.fire(block.id(), block.definition().events(), id("sparkle"),
                    EventContext.forBlock(helper.getLevel(), helper.absolutePos(AT), null));
            List<ClientboundLevelParticlesPacket> seen = eyes.seen(helper.absoluteVec(Vec3.atCenterOf(AT)), 1.0);
            helper.assertValueEqual(seen.size(), 1, "spawn_particle packets");
            helper.assertTrue(seen.getFirst().particle().getType() == type("spark"), "packet type " + seen.getFirst().particle());
            helper.assertValueEqual(seen.getFirst().count(), 4, "count");
            helper.assertValueEqual(seen.getFirst().xDist(), 0.25f, "spread");
        }
        helper.succeed();
    }
}
