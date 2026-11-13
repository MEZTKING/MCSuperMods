package dev.mcsupermods.runtime.gametest;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import com.mojang.authlib.GameProfile;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.JsonOps;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.MsmBlock;
import dev.mcsupermods.runtime.registry.MsmEntity;
import dev.mcsupermods.runtime.scripting.ScriptHost;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.network.protocol.game.ClientboundBundlePacket;
import net.minecraft.network.protocol.game.ClientboundSoundEntityPacket;
import net.minecraft.network.protocol.game.ClientboundSoundPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.RegistryOps;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.Consumable;
import net.minecraft.world.item.equipment.Equippable;
import net.minecraft.world.level.GameType;
import net.minecraft.world.phys.Vec3;

/**
 * Project sound events and mob sounds (ADR 0057): the keys of {@code assets/msm_test/sounds.json} are registered, decode
 * as bare strings with {@code SoundEvent.CODEC}, and resolve in every place the runtime looks a sound up.
 *
 * <p>Sounds are observed as the packets a listening player receives ({@link Ears}): a plain {@code ServerPlayer} on a
 * {@code Connection} inside a Netty {@code EmbeddedChannel}, placed through {@code PlayerList.placeNewPlayer} as
 * {@code GameTestHelper.makeMockServerPlayerInLevel} does, but keeping the channel, whose outbound queue holds the
 * {@code Packet} objects unencoded (no encoder is installed). No class of the runtime or the game is subclassed.
 */
public class MsmSoundGameTest {
    private static final String ARENA = "msm_runtime_gametest:arena";
    private static final BlockPos MID = new BlockPos(5, 1, 5);
    private static final BlockPos AT = new BlockPos(1, 1, 1);
    private static final List<String> KEYS = List.of("chime", "golem.ambient", "golem.death", "golem.hurt", "golem.step");

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    /** A spectator player that records the sound events of the sound packets it is sent. Remove it with {@link #close}. */
    private static final class Ears implements AutoCloseable {
        final ServerPlayer player;
        private final EmbeddedChannel channel;
        private final MinecraftServer server;

        Ears(GameTestHelper helper, BlockPos at) {
            server = helper.getLevel().getServer();
            GameProfile profile = new GameProfile(UUID.randomUUID(), "msm-ears");
            CommonListenerCookie cookie = CommonListenerCookie.createInitial(profile, false);
            player = new ServerPlayer(server, helper.getLevel(), profile, cookie.clientInformation());
            Connection connection = new Connection(PacketFlow.SERVERBOUND);
            channel = new EmbeddedChannel(connection);
            server.getPlayerList().placeNewPlayer(connection, player, cookie);
            player.setGameMode(GameType.SPECTATOR); // no mob targets it, and it steps on nothing
            player.snapTo(helper.absoluteVec(Vec3.atCenterOf(at)));
            heard();
        }

        /** The sound events sent since the last call, in order. */
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
                case ClientboundSoundEntityPacket p -> out.add(p.getSound().value().location());
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

    private static boolean geckolib() {
        return FabricLoader.getInstance().isModLoaded("geckolib");
    }

    @SuppressWarnings("unchecked")
    private static EntityType<MsmEntity> type(String path) {
        return (EntityType<MsmEntity>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    private static void assertHeard(GameTestHelper helper, Ears ears, String key, String what) {
        List<Identifier> heard = ears.heard();
        helper.assertTrue(heard.contains(id(key)), what + ": " + id(key) + " not heard; heard " + heard);
    }

    // Registration

    @GameTest
    public void projectSoundKeysAreRegistered(GameTestHelper helper) {
        for (String key : KEYS) {
            helper.assertTrue(BuiltInRegistries.SOUND_EVENT.containsKey(id(key)), id(key) + " is not a registered sound event");
            helper.assertTrue(MsmRuntime.report().sounds().contains(id(key)), id(key) + " missing from the report");
            SoundEvent sound = BuiltInRegistries.SOUND_EVENT.getValue(id(key));
            helper.assertTrue(sound.fixedRange().isEmpty(), id(key) + " is not a variable-range event");
        }
        Identifier vanillaNamespace = Identifier.withDefaultNamespace("msm_test.never_registered");
        helper.assertFalse(BuiltInRegistries.SOUND_EVENT.containsKey(vanillaNamespace), "a minecraft: key of a mod's sounds.json was registered");
        helper.assertFalse(MsmRuntime.report().sounds().stream().anyMatch(s -> s.getNamespace().equals("minecraft")),
                "minecraft sounds in the report: " + MsmRuntime.report().sounds());
        helper.assertFalse(MsmRuntime.report().warnings().stream().anyMatch(w -> w.contains("sounds.json")),
                "sounds.json warnings: " + MsmRuntime.report().warnings());
        helper.succeed();
    }

    /** R1: once registered, a bare project key is a valid {@code SoundEvent.CODEC} value (a registry reference). */
    @GameTest
    public void soundEventCodecDecodesABareProjectKey(GameTestHelper helper) {
        RegistryOps<JsonElement> ops = RegistryOps.create(JsonOps.INSTANCE, helper.getLevel().registryAccess());
        DataResult<Holder<SoundEvent>> decoded = SoundEvent.CODEC.parse(ops, new JsonPrimitive("msm_test:chime"));
        helper.assertTrue(decoded.result().isPresent(), "bare key did not decode: " + decoded.error());
        Holder<SoundEvent> holder = decoded.getOrThrow();
        helper.assertTrue(holder.is(id("chime")), "decoded to " + holder);
        helper.assertValueEqual(holder.value().location(), id("chime"), "location");
        helper.assertTrue(SoundEvent.CODEC.parse(ops, new JsonPrimitive("msm_test:no_such_sound")).error().isPresent(),
                "an unregistered key decoded");
        helper.succeed();
    }

    /**
     * Every place that resolves a sound id takes a project key with no load error or warning: {@code play_sound}, effect
     * {@code sound}, throwable {@code sound}, consumable {@code sound}, armour {@code equip_sound} and a passthrough
     * {@code minecraft:break_sound}.
     */
    @GameTest
    public void projectKeysResolveWithoutLoadProblems(GameTestHelper helper) {
        List<String> files = List.of("chime_block.json", "chiming.json", "chime_ball.json", "chime_tonic.json", "chime_helmet.json",
                "chime_charm.json");
        for (String file : files) {
            helper.assertFalse(MsmRuntime.report().errors().stream().anyMatch(e -> e.contains(file)),
                    file + " errors: " + MsmRuntime.report().errors());
            helper.assertFalse(MsmRuntime.report().warnings().stream().anyMatch(w -> w.contains(file)),
                    file + " warnings: " + MsmRuntime.report().warnings());
        }
        helper.assertTrue(BuiltInRegistries.BLOCK.getValue(id("chime_block")) instanceof MsmBlock, "chime_block not registered");
        helper.assertTrue(MsmRuntime.report().effects().contains(id("chiming")), "chiming not registered");

        Item tonic = BuiltInRegistries.ITEM.getValue(id("chime_tonic"));
        Consumable consumable = tonic.components().get(DataComponents.CONSUMABLE);
        helper.assertTrue(consumable != null, "chime_tonic has no consumable");
        // Through the component's own Codec: Consumable.sound() is a Holder on 26.3 and an Optional on 26.4.
        RegistryOps<JsonElement> ops = RegistryOps.create(JsonOps.INSTANCE, helper.getLevel().registryAccess());
        JsonElement encoded = DataComponents.CONSUMABLE.codecOrThrow().encodeStart(ops, consumable).getOrThrow();
        helper.assertValueEqual(((JsonObject) encoded).get("sound"), new JsonPrimitive("msm_test:chime"), "consumable sound");

        Equippable equippable = BuiltInRegistries.ITEM.getValue(id("chime_helmet")).components().get(DataComponents.EQUIPPABLE);
        helper.assertTrue(equippable != null && EquipSoundCheck.plays(equippable, id("chime")), "equip_sound: " + equippable);

        Holder<SoundEvent> breakSound = BuiltInRegistries.ITEM.getValue(id("chime_charm")).components().get(DataComponents.BREAK_SOUND);
        helper.assertTrue(breakSound != null && breakSound.is(id("chime")), "passthrough break_sound: " + breakSound);
        helper.succeed();
    }

    @GameTest
    public void playSoundActionPlaysAProjectSound(GameTestHelper helper) {
        MsmBlock block = (MsmBlock) BuiltInRegistries.BLOCK.getValue(id("chime_block"));
        helper.setBlock(AT, block);
        try (Ears ears = new Ears(helper, AT.above())) {
            EventRunner.fire(block.id(), block.definition().events(), id("chime"), EventContext.forBlock(helper.getLevel(),
                    helper.absolutePos(AT), null));
            assertHeard(helper, ears, "chime", "play_sound");
        }
        helper.succeed();
    }

    @GameTest
    public void effectSoundIsAProjectSound(GameTestHelper helper) {
        Holder<MobEffect> chiming = BuiltInRegistries.MOB_EFFECT.get(id("chiming")).orElseThrow();
        try (Ears ears = new Ears(helper, AT)) {
            Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, AT);
            ears.heard();
            cow.addEffect(new MobEffectInstance(chiming, 100));
            assertHeard(helper, ears, "chime", "effect sound when added");
            cow.discard();
        }
        helper.succeed();
    }

    @GameTest
    public void throwableSoundIsAProjectSound(GameTestHelper helper) {
        Item ball = BuiltInRegistries.ITEM.getValue(id("chime_ball"));
        try (Ears ears = new Ears(helper, AT)) {
            ears.player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(ball, 4));
            ball.use(helper.getLevel(), ears.player, InteractionHand.MAIN_HAND);
            assertHeard(helper, ears, "chime", "throw sound");
        }
        helper.succeed();
    }

    /** Script {@code World.playSound} with a project key (script {@code msm/msm_test/script/sound.js}) plays it and does not throw. */
    @GameTest
    public void scriptPlaysAProjectSound(GameTestHelper helper) {
        ScriptHost host = ScriptHost.current();
        helper.assertTrue(host != null, "no ScriptHost");
        MsmBlock block = (MsmBlock) BuiltInRegistries.BLOCK.getValue(id("chime_block"));
        helper.setBlock(AT, block);
        try (Ears ears = new Ears(helper, AT.above())) {
            EventRunner.fire(block.id(), block.definition().events(), id("script_chime"), EventContext.forBlock(helper.getLevel(),
                    helper.absolutePos(AT), null));
            assertHeard(helper, ears, "chime", "World.playSound");
        }
        helper.assertTrue(host.handlerErrors().stream().noneMatch(e -> e.startsWith("script msm_test:sound")),
                "sound.js errors: " + host.handlerErrors());
        helper.succeed();
    }

    // Mob sounds (ADR 0057 D6)

    @GameTest(structure = ARENA, maxTicks = 100)
    public void mobSoundsAreTheConfiguredEvents(GameTestHelper helper) {
        if (!geckolib()) {
            helper.assertFalse(BuiltInRegistries.ENTITY_TYPE.containsKey(id("singer")), "singer registered without GeckoLib");
            helper.succeed();
            return;
        }
        Ears ears = new Ears(helper, MID.above());
        try {
            MsmEntity mob = helper.spawnWithNoFreeWill(type("singer"), MID);
            helper.assertValueEqual(mob.getAmbientSoundInterval(), 120, "ambient_interval_ticks");
            ears.heard();
            mob.playAmbientSound();
            assertHeard(helper, ears, "golem.ambient", "ambient");
            // Steps: once it stands on the floor, walk back and forth until the step distance is passed.
            helper.runAfterDelay(5, () -> {
                try {
                    ears.heard();
                    for (int i = 0; i < 8; i++) {
                        mob.move(MoverType.SELF, new Vec3(i % 2 == 0 ? 0.4 : -0.4, -0.1, 0));
                    }
                    assertHeard(helper, ears, "golem.step", "step");
                    mob.hurtServer(helper.getLevel(), helper.getLevel().damageSources().generic(), 1.0f);
                    assertHeard(helper, ears, "golem.hurt", "hurt");
                    // Vanilla plays the death sound only for a hit outside the invulnerable time: a second mob dies.
                    MsmEntity doomed = helper.spawnWithNoFreeWill(type("singer"), MID);
                    ears.heard();
                    doomed.hurtServer(helper.getLevel(), helper.getLevel().damageSources().generic(), 1000.0f);
                    assertHeard(helper, ears, "golem.death", "death");
                } finally {
                    ears.close();
                }
                helper.succeed();
            });
        } catch (RuntimeException e) {
            ears.close();
            throw e;
        }
    }

    @GameTest(structure = ARENA)
    public void unknownMobSoundWarnsAndVanillaStays(GameTestHelper helper) {
        if (!geckolib()) {
            helper.assertFalse(BuiltInRegistries.ENTITY_TYPE.containsKey(id("off_key")), "off_key registered without GeckoLib");
            helper.succeed();
            return;
        }
        List<String> warnings = MsmRuntime.report().warnings();
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("entity/off_key.json") && w.contains("msm_test:no_such_sound")
                && w.contains("vanilla sound stays")), "no warning for the unknown sound: " + warnings);
        helper.assertFalse(warnings.stream().anyMatch(w -> w.contains("entity/singer.json")), "singer warnings: " + warnings);
        try (Ears ears = new Ears(helper, MID.above())) {
            MsmEntity mob = helper.spawnWithNoFreeWill(type("off_key"), MID);
            helper.assertValueEqual(mob.getAmbientSoundInterval(), 80, "vanilla ambient interval");
            ears.heard();
            mob.playAmbientSound();
            List<Identifier> heard = ears.heard();
            helper.assertTrue(heard.isEmpty(), "a mob without an ambient sound made " + heard);
            mob.hurtServer(helper.getLevel(), helper.getLevel().damageSources().generic(), 1.0f);
            heard = ears.heard();
            helper.assertTrue(heard.contains(Identifier.withDefaultNamespace("entity.iron_golem.hurt")), "vanilla id as hurt: " + heard);
            mob.discard();
        }
        helper.succeed();
    }
}
