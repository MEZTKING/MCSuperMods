package dev.mcsupermods.parity;

import io.netty.buffer.Unpooled;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleType;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.protocol.game.ClientboundLevelParticlesPacket;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;

/**
 * Behaviour parity over {@code fixtures/sample-particles} (namespace {@code msm_sample_particles}, ADRs 0080 and
 * 0081), against vanilla and Fabric API only (ADR 0033 D5): the content jar's runtime classes and the ejected project's
 * classes differ, so every check goes through the particle type registry, vanilla calls ({@code
 * ServerPlayerGameMode.useItem}, the player's own tick), commands ({@code /particle}, {@code /function}), the effect's
 * vanilla {@code createParticleOptions} and synced entity data, and the particle packets a real player receives
 * ({@link ParityEars#particles}). Run with {@code --gametest-filter msm_parity_tests:sample_particles_parity_test_*}
 * on content and ejected jars; the script's test is {@link SampleParticlesScriptParityTest} (content jars only).
 *
 * <ul>
 *   <li>Particles {@code spark}, {@code petal} and {@code bubble} ({@code always_show}, so its type overrides the
 *       limiter).</li>
 *   <li>Items {@code spark_wand} ({@code on_use}: 20 {@code spark} with {@code motion} [0, 0.2, 0], so one packet of count
 *       0 per particle), {@code dust_wand} ({@code on_use}: 40 {@code minecraft:dust} of colour [0.3, 0.7, 1] and scale
 *       2), {@code petal_charm} ({@code while_held} every 20 ticks: 6 {@code petal} with {@code force}).</li>
 *   <li>Blocks {@code spark_lamp} and {@code ember_vent} with {@code msm:ambient_particles}: drawn by the client alone
 *       (limit K5), so the server sends nothing for them.</li>
 *   <li>Effect {@code glimmer} with particle {@code bubble}; function {@code burst} (30 sparks, then a {@code say}
 *       line).</li>
 * </ul>
 *
 * <p>Tests of one batch stand side by side and a normal particle packet reaches players up to 32 blocks away (512 with
 * the override flag), so each test reads only the packets near its own positions.
 */
public class SampleParticlesParityTest {
    static {
        ParityChat.register();
    }

    static final String NAMESPACE = "msm_sample_particles";
    private static final List<String> PARTICLES = List.of("spark", "petal", "bubble");
    static final BlockPos AT = new BlockPos(2, 1, 2);
    private static final double EPSILON = 1.0e-4;
    /** One step of an 8-bit colour channel (the dust colour is sent as an RGB integer). */
    private static final double COLOUR_STEP = 1.0 / 255.0 + EPSILON;

    static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NAMESPACE, path);
    }

    static ParticleType<?> particle(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.PARTICLE_TYPE.containsKey(id(path)), "particle type " + id(path) + " is not registered");
        return BuiltInRegistries.PARTICLE_TYPE.getValue(id(path));
    }

    static Block block(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.BLOCK.containsKey(id(path)), "block " + id(path) + " is not registered");
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static Item item(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(id(path)), "item " + id(path) + " is not registered");
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    /** The registry id of a packet's particle type, or null. */
    static Identifier typeOf(ClientboundLevelParticlesPacket packet) {
        return BuiltInRegistries.PARTICLE_TYPE.getKey(packet.particle().getType());
    }

    static Vec3 position(ClientboundLevelParticlesPacket packet) {
        return new Vec3(packet.x(), packet.y(), packet.z());
    }

    /** The packets of {@code type} sent within {@code radius} blocks of {@code at} (absolute). */
    static List<ClientboundLevelParticlesPacket> near(List<ClientboundLevelParticlesPacket> packets, Identifier type, Vec3 at,
            double radius) {
        List<ClientboundLevelParticlesPacket> out = new ArrayList<>();
        for (ClientboundLevelParticlesPacket packet : packets) {
            if (type.equals(typeOf(packet)) && position(packet).distanceTo(at) <= radius) {
                out.add(packet);
            }
        }
        return out;
    }

    /** Every particle packet sent within {@code radius} blocks of {@code at} (absolute), whatever its type. */
    static List<ClientboundLevelParticlesPacket> anyNear(List<ClientboundLevelParticlesPacket> packets, Vec3 at, double radius) {
        return packets.stream().filter(p -> position(p).distanceTo(at) <= radius).toList();
    }

    static void assertClose(GameTestHelper helper, double actual, double expected, double tolerance, String what) {
        helper.assertTrue(Math.abs(actual - expected) <= tolerance, what + ": " + actual + ", expected " + expected);
    }

    static void assertAt(GameTestHelper helper, ClientboundLevelParticlesPacket packet, Vec3 expected, String what) {
        helper.assertTrue(position(packet).distanceTo(expected) <= EPSILON, what + " at " + position(packet) + ", expected " + expected);
    }

    static void assertDistances(GameTestHelper helper, ClientboundLevelParticlesPacket packet, double x, double y, double z,
            String what) {
        assertClose(helper, packet.xDist(), x, EPSILON, what + " x distance");
        assertClose(helper, packet.yDist(), y, EPSILON, what + " y distance");
        assertClose(helper, packet.zDist(), z, EPSILON, what + " z distance");
    }

    /** Runs {@code command} as the server at the test's origin and returns its result (-1 when it failed). */
    static int command(GameTestHelper helper, String command) {
        ServerLevel level = helper.getLevel();
        int[] result = {-1};
        CommandSourceStack source = level.getServer().createCommandSourceStack().withLevel(level)
                .withPosition(Vec3.atBottomCenterOf(helper.absolutePos(AT))).withSuppressedOutput()
                .withCallback((success, value) -> result[0] = success ? value : -1);
        level.getServer().getCommands().performPrefixedCommand(source, command);
        return result[0];
    }

    /** Absolute coordinates for a command (fixed-point: the test positions are millions of blocks out). */
    private static String coordinates(Vec3 at) {
        return String.format(Locale.ROOT, "%.4f %.4f %.4f", at.x, at.y, at.z);
    }

    // Registration (ADR 0080 D1, D3)

    /**
     * The three particles are registered as particle types without options (vanilla's {@code SimpleParticleType}, which is
     * its own options); only {@code bubble} ({@code always_show}) overrides the limiter.
     */
    @GameTest
    public void particleTypesAreRegisteredWithoutOptions(GameTestHelper helper) {
        for (String path : PARTICLES) {
            ParticleType<?> type = particle(helper, path);
            helper.assertTrue(type instanceof SimpleParticleType, path + " takes options: " + type.getClass().getName());
            SimpleParticleType simple = (SimpleParticleType) type;
            helper.assertTrue(simple.getType() == simple, path + " is not its own options");
            helper.assertValueEqual(type.getOverrideLimiter(), path.equals("bubble"), path + " overrides the limiter");
        }
        helper.succeed();
    }

    /** The two blocks and three items exist, and the blocks are their own block items. */
    @GameTest
    public void blocksAndItemsAreRegistered(GameTestHelper helper) {
        for (String path : List.of("spark_lamp", "ember_vent")) {
            helper.assertTrue(block(helper, path).asItem() == item(helper, path), path + ": block item");
        }
        for (String path : List.of("spark_wand", "dust_wand", "petal_charm")) {
            helper.assertValueEqual(new ItemStack(item(helper, path)).getMaxStackSize(), 1, path + " stack size");
        }
        helper.assertValueEqual(block(helper, "spark_lamp").defaultBlockState().getLightEmission(), 10, "spark lamp light");
        helper.succeed();
    }

    // Commands and packets (ADR 0080 D3, F15, F16)

    /** {@code /particle} names a project particle; the player receives one packet of that type, count and spread. */
    @GameTest
    public void particleCommandReachesThePlayer(GameTestHelper helper) {
        try (ParityEars ears = ParityEars.listener(helper, AT)) {
            Vec3 at = helper.absoluteVec(Vec3.atBottomCenterOf(AT).add(0, 1, 0));
            helper.assertTrue(command(helper, "particle msm_sample_particles:spark " + coordinates(at) + " 0.1 0.2 0.3 0.05 7") > 0,
                    "/particle msm_sample_particles:spark failed");
            List<ClientboundLevelParticlesPacket> sparks = near(ears.particles(), id("spark"), at, 0.5);
            helper.assertValueEqual(sparks.size(), 1, "spark packets");
            ClientboundLevelParticlesPacket packet = sparks.getFirst();
            helper.assertValueEqual(packet.count(), 7, "count");
            assertAt(helper, packet, at, "spark");
            assertDistances(helper, packet, 0.1, 0.2, 0.3, "spark");
            assertClose(helper, packet.xMaxSpeed(), 0.05, EPSILON, "speed");
            helper.assertFalse(packet.overrideLimiter(), "a normal /particle sets the override flag");

            helper.assertTrue(command(helper, "particle msm_sample_particles:bubble " + coordinates(at) + " 0 0 0 0 3 force") > 0,
                    "/particle msm_sample_particles:bubble force failed");
            List<ClientboundLevelParticlesPacket> bubbles = near(ears.particles(), id("bubble"), at, 0.5);
            helper.assertValueEqual(bubbles.size(), 1, "bubble packets");
            helper.assertValueEqual(bubbles.getFirst().count(), 3, "bubble count");
            helper.assertTrue(bubbles.getFirst().overrideLimiter(), "/particle ... force sends no override flag");
        }
        helper.succeed();
    }

    /** An unknown particle id in the project's namespace fails {@code /particle} and sends nothing. */
    @GameTest
    public void unknownParticleIdFailsTheCommand(GameTestHelper helper) {
        try (ParityEars ears = ParityEars.listener(helper, AT)) {
            helper.assertValueEqual(command(helper, "particle msm_sample_particles:no_such_particle ~ ~1 ~"), -1,
                    "/particle of an unknown id");
            helper.assertValueEqual(command(helper, "particle msm_sample_particles:sparks ~ ~1 ~"), -1,
                    "/particle of a near-miss id");
            helper.assertValueEqual(anyNear(ears.particles(), helper.absoluteVec(Vec3.atBottomCenterOf(AT)), 3), List.of(),
                    "packets after the failed commands");
        }
        helper.succeed();
    }

    /**
     * Every project particle crosses the network: a packet of each type (and one of each with the override flag) encodes
     * with vanilla's stream codec and decodes to the same type, position, distances, speed and count.
     */
    @GameTest
    public void particlePacketsRoundTripThroughTheStreamCodec(GameTestHelper helper) {
        for (String path : PARTICLES) {
            ParticleOptions options = (SimpleParticleType) particle(helper, path);
            for (boolean force : List.of(false, true)) {
                ClientboundLevelParticlesPacket sent = new ClientboundLevelParticlesPacket(options, force, false, 1.5, 64.25, -3.75,
                        0.5f, 0.25f, 0.125f, 0.0625f, 12);
                RegistryFriendlyByteBuf buffer = new RegistryFriendlyByteBuf(Unpooled.buffer(), helper.getLevel().registryAccess());
                try {
                    ClientboundLevelParticlesPacket.STREAM_CODEC.encode(buffer, sent);
                    ClientboundLevelParticlesPacket read = ClientboundLevelParticlesPacket.STREAM_CODEC.decode(buffer);
                    helper.assertValueEqual(buffer.readableBytes(), 0, path + ": bytes left");
                    helper.assertValueEqual(typeOf(read), id(path), path + ": type after the round trip");
                    helper.assertValueEqual(read.overrideLimiter(), force, path + ": override flag");
                    helper.assertValueEqual(read.count(), 12, path + ": count");
                    assertAt(helper, read, new Vec3(1.5, 64.25, -3.75), path);
                    assertDistances(helper, read, 0.5, 0.25, 0.125, path);
                    assertClose(helper, read.xMaxSpeed(), 0.0625, EPSILON, path + ": speed");
                } finally {
                    buffer.release();
                }
            }
        }
        helper.succeed();
    }

    // Item events (ADR 0080 D5)

    /**
     * Using the spark wand sends 20 sparks with {@code motion} [0, 0.2, 0]: one count-0 packet per particle whose
     * distances are the velocity and whose speed is 1, around the player (spread 0.3), without the override flag.
     */
    @GameTest
    public void sparkWandSendsTwentyMovingSparks(GameTestHelper helper) {
        try (ParityEars ears = new ParityEars(helper, AT, GameType.SURVIVAL, "msm-spark-wand")) {
            ears.player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item(helper, "spark_wand")));
            ears.particles();
            ears.player.gameMode.useItem(ears.player, helper.getLevel(), ears.player.getMainHandItem(), InteractionHand.MAIN_HAND);
            List<ClientboundLevelParticlesPacket> sparks = near(ears.particles(), id("spark"), ears.player.position(), 3);
            helper.assertValueEqual(sparks.size(), 20, "spark packets");
            boolean spread = false;
            for (ClientboundLevelParticlesPacket packet : sparks) {
                helper.assertValueEqual(packet.count(), 0, "count of a moving spark's packet");
                assertDistances(helper, packet, 0, 0.2, 0, "motion");
                assertClose(helper, packet.xMaxSpeed(), 1, EPSILON, "speed of a moving spark");
                helper.assertFalse(packet.overrideLimiter(), "a spark without force has the override flag");
                spread |= position(packet).distanceTo(ears.player.position()) > EPSILON;
            }
            helper.assertTrue(spread, "every spark at the player's feet: no spread");
        }
        helper.succeed();
    }

    /** Using the dust wand sends one packet of 40 vanilla dust particles of colour [0.3, 0.7, 1] and scale 2. */
    @GameTest
    public void dustWandSendsSkyBlueDust(GameTestHelper helper) {
        try (ParityEars ears = new ParityEars(helper, AT, GameType.SURVIVAL, "msm-dust-wand")) {
            ears.player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item(helper, "dust_wand")));
            ears.particles();
            ears.player.gameMode.useItem(ears.player, helper.getLevel(), ears.player.getMainHandItem(), InteractionHand.MAIN_HAND);
            List<ClientboundLevelParticlesPacket> dust = near(ears.particles(), Identifier.withDefaultNamespace("dust"),
                    ears.player.position(), 0.5);
            helper.assertValueEqual(dust.size(), 1, "dust packets");
            ClientboundLevelParticlesPacket packet = dust.getFirst();
            helper.assertValueEqual(packet.count(), 40, "dust count");
            assertAt(helper, packet, ears.player.position(), "dust");
            assertDistances(helper, packet, 0.6, 0.6, 0.6, "dust");
            helper.assertTrue(packet.particle() instanceof DustParticleOptions, "dust options: " + packet.particle());
            DustParticleOptions options = (DustParticleOptions) packet.particle();
            Vector3f colour = options.getColor();
            assertClose(helper, colour.x(), 0.3, COLOUR_STEP, "dust red");
            assertClose(helper, colour.y(), 0.7, COLOUR_STEP, "dust green");
            assertClose(helper, colour.z(), 1.0, COLOUR_STEP, "dust blue");
            assertClose(helper, options.getScale(), 2.0, EPSILON, "dust scale");
        }
        helper.succeed();
    }

    /**
     * Holding the petal charm sends 6 petals with the override flag every 20 ticks of the player's own tick: two packets
     * in 40 game ticks, at the player.
     */
    @GameTest(maxTicks = 120)
    public void petalCharmHeldSendsForcedPetals(GameTestHelper helper) {
        ParityEars ears = new ParityEars(helper, AT, GameType.SURVIVAL, "msm-petal-charm");
        ears.player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item(helper, "petal_charm")));
        ears.particles();
        List<ClientboundLevelParticlesPacket> seen = new ArrayList<>();
        int[] ticks = {0};
        long[] last = {Long.MIN_VALUE};
        helper.onEachTick(() -> {
            // Once per game tick: the interval counts game time, and a test may be ticked more than once per game tick.
            long now = helper.getLevel().getGameTime();
            if (ticks[0] < 40 && now != last[0]) {
                last[0] = now;
                ticks[0]++;
                ears.player.doTick();
                seen.addAll(ears.particles());
            }
        });
        helper.runAfterDelay(90, () -> {
            try {
                helper.assertValueEqual(ticks[0], 40, "player ticks on distinct game ticks");
                // The player settles on the floor while it ticks, so the petals are only near its final position.
                List<ClientboundLevelParticlesPacket> petals = near(seen, id("petal"), ears.player.position(), 2);
                helper.assertValueEqual(petals.size(), 2, "petal packets in 40 ticks");
                for (ClientboundLevelParticlesPacket packet : petals) {
                    helper.assertValueEqual(packet.count(), 6, "petal count");
                    helper.assertTrue(packet.overrideLimiter(), "force did not set the override flag");
                    assertDistances(helper, packet, 0.4, 0.4, 0.4, "petals");
                }
            } finally {
                ears.close();
            }
            helper.succeed();
        });
    }

    // Functions (ADR 0080 D9)

    /** The project's {@code burst} function sends 30 sparks one block above where it runs, then says its line. */
    @GameTest
    public void burstFunctionSendsThirtySparks(GameTestHelper helper) {
        try (ParityEars ears = ParityEars.listener(helper, AT)) {
            int mark = ParityChat.mark();
            command(helper, "function msm_sample_particles:burst"); // a function's result is not a success count
            Vec3 at = helper.absoluteVec(Vec3.atBottomCenterOf(AT).add(0, 1, 0));
            List<ClientboundLevelParticlesPacket> sparks = near(ears.particles(), id("spark"), at, 0.5);
            helper.assertValueEqual(sparks.size(), 1, "spark packets");
            helper.assertValueEqual(sparks.getFirst().count(), 30, "spark count");
            assertAt(helper, sparks.getFirst(), at, "burst");
            assertDistances(helper, sparks.getFirst(), 0.5, 0.5, 0.5, "burst");
            helper.assertTrue(ParityChat.since(mark).stream().anyMatch(line -> line.endsWith("A burst of 30 sparks.")),
                    "no burst line: " + ParityChat.since(mark));
        }
        helper.succeed();
    }

    // Effects (ADR 0080 D7)

    /**
     * Glimmer's particle is the project {@code bubble} type: vanilla's {@code createParticleOptions} returns it, and a pig
     * under the effect syncs it as its effect particle.
     */
    @GameTest(maxTicks = 40)
    public void glimmerShowsBubbles(GameTestHelper helper) {
        Optional<Holder.Reference<MobEffect>> glimmer = BuiltInRegistries.MOB_EFFECT.get(id("glimmer"));
        helper.assertTrue(glimmer.isPresent(), "mob effect " + id("glimmer") + " is not registered");
        MobEffectInstance instance = new MobEffectInstance(glimmer.get(), 200, 0);
        ParticleOptions options = glimmer.get().value().createParticleOptions(instance);
        helper.assertValueEqual(BuiltInRegistries.PARTICLE_TYPE.getKey(options.getType()), id("bubble"), "glimmer's particle");
        helper.assertTrue(options == particle(helper, "bubble"), "glimmer's particle is not the bubble type itself: " + options);
        Mob pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, AT);
        pig.addEffect(instance);
        helper.runAfterDelay(5, () -> {
            List<Identifier> synced = new ArrayList<>();
            List<SynchedEntityData.DataValue<?>> values = pig.getEntityData().getNonDefaultValues();
            for (SynchedEntityData.DataValue<?> value : values == null ? List.<SynchedEntityData.DataValue<?>>of() : values) {
                if (value.value() instanceof List<?> list) {
                    for (Object element : list) {
                        if (element instanceof ParticleOptions particle) {
                            synced.add(BuiltInRegistries.PARTICLE_TYPE.getKey(particle.getType()));
                        }
                    }
                }
            }
            helper.assertValueEqual(synced, List.of(id("bubble")), "the pig's effect particles");
            pig.discard();
            helper.succeed();
        });
    }

    // Ambient particles (ADR 0080 D6, limit K5)

    /**
     * The spark lamp's and the ember vent's ambient particles are drawn by the client from {@code animateTick}: the server
     * sends no particle packet for them, ticking or random-ticked, for 30 ticks.
     */
    @GameTest(maxTicks = 100)
    public void ambientParticlesSendNoPacket(GameTestHelper helper) {
        BlockPos lamp = AT;
        BlockPos vent = AT.east(3);
        helper.setBlock(lamp, block(helper, "spark_lamp"));
        helper.setBlock(vent, block(helper, "ember_vent"));
        ParityEars ears = ParityEars.listener(helper, AT.east().north(2));
        List<ClientboundLevelParticlesPacket> seen = new ArrayList<>();
        int[] ticks = {0};
        helper.onEachTick(() -> {
            if (ticks[0] < 30) {
                ticks[0]++;
                helper.randomTick(lamp);
                helper.randomTick(vent);
                seen.addAll(ears.particles());
            }
        });
        helper.runAfterDelay(35, () -> {
            try {
                helper.assertValueEqual(ticks[0], 30, "ticks watched");
                for (BlockPos pos : List.of(lamp, vent)) {
                    helper.assertValueEqual(anyNear(seen, helper.absoluteVec(Vec3.atCenterOf(pos)), 2.5), List.of(),
                            "particle packets at " + helper.getBlockState(pos));
                }
                helper.assertTrue(helper.getBlockState(lamp).is(block(helper, "spark_lamp")), "the lamp is gone");
            } finally {
                ears.close();
            }
            helper.succeed();
        });
    }
}
