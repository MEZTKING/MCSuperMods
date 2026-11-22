package dev.mcsupermods.runtime.gametest;

import com.mojang.authlib.GameProfile;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.registry.MsmEntity;
import dev.mcsupermods.runtime.registry.OwnSounds;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.network.protocol.game.ClientboundBundlePacket;
import net.minecraft.network.protocol.game.ClientboundSoundEntityPacket;
import net.minecraft.network.protocol.game.ClientboundSoundPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.animal.pig.Pig;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.AttachFace;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Own block sounds and own set types (ADR 0105 D1, D2; B514) on {@code msm/msm_test/block/sound_*.json} and
 * {@code set_*.json}. On 26.4 the blocks with {@code block_sounds} name the {@code block_sound_set} entries of the test
 * data pack ({@code data/msm_test/block_sound_set/}), as the lowering writes them; {@code sound_unknown} has none. Sounds
 * are observed as the packets a listening spectator receives ({@link Ears}, as in {@code MsmSoundGameTest}); uses go
 * through {@code ServerPlayerGameMode.useItemOn} with a mock player, as the network handler does.
 */
public class MsmOwnSoundsGameTest {
    private static final String ARENA = "msm_runtime_gametest:arena";
    private static final Identifier CHIME = id("chime");
    private static final Identifier ANVIL_PLACE = Identifier.withDefaultNamespace("block.anvil.place");
    private static final Identifier ANVIL_LAND = Identifier.withDefaultNamespace("block.anvil.land");

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    /** A spectator player that records the sound events of the sound packets it is sent. Remove it with {@link #close}. */
    private static final class Ears implements AutoCloseable {
        private final ServerPlayer player;
        private final EmbeddedChannel channel;
        private final MinecraftServer server;

        Ears(GameTestHelper helper, BlockPos at) {
            server = helper.getLevel().getServer();
            GameProfile profile = new GameProfile(UUID.randomUUID(), "msm-own-ears");
            CommonListenerCookie cookie = CommonListenerCookie.createInitial(profile, false);
            player = new ServerPlayer(server, helper.getLevel(), profile, cookie.clientInformation());
            Connection connection = new Connection(PacketFlow.SERVERBOUND);
            channel = new EmbeddedChannel(connection);
            server.getPlayerList().placeNewPlayer(connection, player, cookie);
            player.setGameMode(GameType.SPECTATOR);
            player.snapTo(helper.absoluteVec(Vec3.atCenterOf(at)));
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

    private static ServerPlayer player(GameTestHelper helper) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.setPos(helper.absoluteVec(new Vec3(0.5, 1, 0.5)));
        return player;
    }

    private static InteractionResult use(GameTestHelper helper, ServerPlayer player, ItemStack stack, BlockPos rel, Direction face) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        BlockPos abs = helper.absolutePos(rel);
        Vec3 hitAt = Vec3.atCenterOf(abs).add(face.getStepX() * 0.5, face.getStepY() * 0.5, face.getStepZ() * 0.5);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND),
                InteractionHand.MAIN_HAND, new BlockHitResult(hitAt, face, abs, false));
    }

    private static void assertHeard(GameTestHelper helper, List<Identifier> heard, Identifier sound, String what) {
        helper.assertTrue(heard.contains(sound), what + ": " + sound + " not heard; heard " + heard);
    }

    /** A door of {@code path} standing on stone at {@code rel}, facing south, closed. */
    private static void door(GameTestHelper helper, String path, BlockPos rel) {
        BlockState door = block(path).defaultBlockState().setValue(BlockStateProperties.HORIZONTAL_FACING, Direction.SOUTH);
        helper.setBlock(rel.below(), Blocks.STONE);
        helper.setBlock(rel, door.setValue(BlockStateProperties.DOUBLE_BLOCK_HALF, DoubleBlockHalf.LOWER));
        helper.setBlock(rel.above(), door.setValue(BlockStateProperties.DOUBLE_BLOCK_HALF, DoubleBlockHalf.UPPER));
    }

    private static boolean open(GameTestHelper helper, BlockPos rel) {
        return helper.getBlockState(rel).getValue(BlockStateProperties.OPEN);
    }

    @GameTest(structure = ARENA, maxTicks = 100)
    public void aBlockPlacesAndIsSteppedOnWithItsOwnSounds(GameTestHelper helper) {
        BlockPos mid = new BlockPos(5, 1, 5);
        Ears ears = new Ears(helper, mid.above());
        ServerPlayer player = player(helper);
        helper.setBlock(new BlockPos(2, 0, 2), Blocks.STONE);
        ears.heard();
        helper.assertTrue(use(helper, player, new ItemStack(block("sound_own").asItem()), new BlockPos(2, 0, 2), Direction.UP)
                .consumesAction(), "the block was not placed");
        helper.assertBlockPresent(block("sound_own"), new BlockPos(2, 1, 2));
        assertHeard(helper, ears.heard(), ANVIL_PLACE, "place");
        for (int x = 2; x <= 8; x++) {
            helper.setBlock(new BlockPos(x, 0, 5), block("sound_own"));
        }
        @SuppressWarnings("unchecked")
        EntityType<MsmEntity> minimal = (EntityType<MsmEntity>) BuiltInRegistries.ENTITY_TYPE.getValue(id("minimal"));
        MsmEntity walker = helper.spawnWithNoFreeWill(minimal, mid);
        // Steps: once it stands on the floor, walk back and forth until the step distance is passed (as MsmSoundGameTest).
        helper.runAfterDelay(5, () -> {
            try {
                ears.heard();
                for (int i = 0; i < 8; i++) {
                    walker.move(MoverType.SELF, new Vec3(i % 2 == 0 ? 0.4 : -0.4, -0.1, 0));
                }
                assertHeard(helper, ears.heard(), CHIME, "step on the own-sound block (a project sound event)");
            } finally {
                ears.close();
            }
            helper.succeed();
        });
    }

    /**
     * A {@code sound_type} outside the format's first 40 names (B520 follow-up): any vanilla sound type of the version
     * registers, here {@code glow_lichen}, and the block plays vanilla glow lichen's place sound.
     */
    @GameTest
    public void aBlockWithTheGlowLichenSoundTypePlacesWithGlowLichensSound(GameTestHelper helper) {
        Block lichen = block("sound_glow_lichen");
        helper.assertTrue(lichen != Blocks.AIR, "sound_glow_lichen is not registered: " + MsmRuntime.report().errors());
        helper.assertTrue(BlockSoundCheck.hasSound(lichen.defaultBlockState(), "glow_lichen"), "sound_type glow_lichen");
        Identifier expected = BlockSoundCheck.placeSound(helper.getLevel(), Blocks.GLOW_LICHEN.defaultBlockState());
        helper.assertValueEqual(BlockSoundCheck.placeSound(helper.getLevel(), lichen.defaultBlockState()), expected,
                "place sound of sound_glow_lichen");
        Ears ears = new Ears(helper, new BlockPos(1, 2, 1));
        try {
            ServerPlayer player = player(helper);
            helper.setBlock(new BlockPos(1, 0, 1), Blocks.STONE);
            ears.heard();
            helper.assertTrue(use(helper, player, new ItemStack(lichen.asItem()), new BlockPos(1, 0, 1), Direction.UP)
                    .consumesAction(), "the block was not placed");
            helper.assertBlockPresent(lichen, new BlockPos(1, 1, 1));
            assertHeard(helper, ears.heard(), expected, "place (glow lichen's sound)");
        } finally {
            ears.close();
        }
        helper.succeed();
    }

    /** A {@code sound_type} the version lacks is a load error that skips the block (and only that block). */
    @GameTest
    public void anUnknownSoundTypeIsALoadErrorThatSkipsTheBlock(GameTestHelper helper) {
        helper.assertFalse(BuiltInRegistries.BLOCK.containsKey(id("unknown_sound_type")), "unknown_sound_type was registered");
        List<String> errors = MsmRuntime.report().errors();
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("block/unknown_sound_type.json") && e.contains("\"squeaky\"")
                && e.contains("not a sound type")), "no error for unknown_sound_type: " + errors);
        helper.succeed();
    }

    @GameTest
    public void aDoorWithBlockSoundsAndAVanillaSetTypePlacesWithItsOwnSound(GameTestHelper helper) {
        Ears ears = new Ears(helper, new BlockPos(1, 2, 1));
        try {
            ServerPlayer player = player(helper);
            helper.setBlock(new BlockPos(1, 0, 1), Blocks.STONE);
            ears.heard();
            helper.assertTrue(use(helper, player, new ItemStack(block("sound_door").asItem()), new BlockPos(1, 0, 1), Direction.UP)
                    .consumesAction(), "the door was not placed");
            helper.assertBlockPresent(block("sound_door"), new BlockPos(1, 1, 1));
            assertHeard(helper, ears.heard(), ANVIL_PLACE, "place (the door's set type carries the block's own sounds)");
            helper.assertTrue(((DoorBlock) block("sound_door")).type() != BlockSetTypeCheck.wood(), "sound_door kept vanilla's wood set");
            helper.assertTrue(((DoorBlock) block("type_door")).type() == BlockSetTypeCheck.wood(), "type_door lost vanilla's wood set");
        } finally {
            ears.close();
        }
        helper.succeed();
    }

    @GameTest
    public void aDoorOpensAndClosesWithItsOwnSetTypeSounds(GameTestHelper helper) {
        Ears ears = new Ears(helper, new BlockPos(2, 2, 4));
        try {
            ServerPlayer player = player(helper);
            BlockPos at = new BlockPos(1, 1, 2);
            door(helper, "set_own_door", at);
            ears.heard();
            use(helper, player, ItemStack.EMPTY, at, Direction.SOUTH);
            helper.assertTrue(open(helper, at), "the own door did not open by hand");
            assertHeard(helper, ears.heard(), CHIME, "open");
            use(helper, player, ItemStack.EMPTY, at, Direction.SOUTH);
            helper.assertFalse(open(helper, at), "the own door did not close");
            assertHeard(helper, ears.heard(), ANVIL_LAND, "close");
            BlockPos handless = new BlockPos(3, 1, 2);
            door(helper, "set_handless_door", handless);
            use(helper, player, ItemStack.EMPTY, handless, Direction.SOUTH);
            helper.assertFalse(open(helper, handless), "a door that hands cannot open opened (can_open_by_hand: false)");
            helper.assertFalse(((DoorBlock) block("set_handless_door")).type().canOpenByWindCharge(),
                    "can_open_by_wind_charge does not default to can_open_by_hand");
        } finally {
            ears.close();
        }
        helper.succeed();
    }

    @GameTest
    public void anIronTrapdoorOfItsOwnOpensByHandAndAnUnknownSoundWarns(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        BlockPos at = new BlockPos(1, 1, 1);
        helper.setBlock(at, block("set_hand_trapdoor"));
        use(helper, player, ItemStack.EMPTY, at, Direction.UP);
        helper.assertTrue(open(helper, at), "an iron-based trapdoor with can_open_by_hand did not open by hand");
        List<String> warnings = MsmRuntime.report().warnings();
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("msm_test:set_hand_trapdoor") && w.contains("set_type: sounds: open")
                && w.contains("msm_test:no_such_sound")), "no warning for the unknown set type sound: " + warnings);
        helper.succeed();
    }

    @GameTest(maxTicks = 100)
    public void aButtonOfItsOwnClicksAndAPlateOnlyForMobsIgnoresItems(GameTestHelper helper) {
        Ears ears = new Ears(helper, new BlockPos(2, 2, 2));
        ServerPlayer player = player(helper);
        BlockPos button = new BlockPos(1, 1, 1);
        helper.setBlock(button.below(), Blocks.STONE);
        helper.setBlock(button, block("set_own_button").defaultBlockState().setValue(BlockStateProperties.ATTACH_FACE, AttachFace.FLOOR));
        ears.heard();
        use(helper, player, ItemStack.EMPTY, button, Direction.UP);
        helper.assertTrue(helper.getBlockState(button).getValue(BlockStateProperties.POWERED), "the button was not pressed");
        assertHeard(helper, ears.heard(), CHIME, "press");
        BlockPos plate = new BlockPos(3, 1, 3);
        helper.setBlock(plate.below(), Blocks.STONE);
        helper.setBlock(plate, block("set_mobs_plate"));
        Vec3 on = helper.absoluteVec(Vec3.atBottomCenterOf(plate));
        ItemEntity item = new ItemEntity(helper.getLevel(), on.x, on.y + 0.1, on.z, new ItemStack(Items.STICK));
        item.setPickUpDelay(1000);
        helper.getLevel().addFreshEntity(item);
        helper.runAfterDelay(30, () -> {
            // Stone buttons stay pressed 20 ticks; the release plays the own release sound.
            helper.assertFalse(helper.getBlockState(button).getValue(BlockStateProperties.POWERED), "the button stayed pressed");
            assertHeard(helper, ears.heard(), ANVIL_LAND, "release");
            helper.assertFalse(helper.getBlockState(plate).getValue(BlockStateProperties.POWERED),
                    "an item pressed a plate only mobs press (plate_sensitivity: mobs over a wooden base)");
            item.discard();
            Pig pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, plate);
            helper.runAfterDelay(20, () -> {
                helper.assertTrue(helper.getBlockState(plate).getValue(BlockStateProperties.POWERED), "a mob did not press the plate");
                pig.discard();
                ears.close();
                helper.succeed();
            });
        });
    }

    @GameTest
    public void unknownSoundEventsWarnAndAMissingSoundSetIsReported(GameTestHelper helper) {
        List<String> warnings = MsmRuntime.report().warnings();
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("msm_test:sound_unknown") && w.contains("block_sounds: place")
                && w.contains("msm_test:no_such_sound")), "no warning for the unknown block sound: " + warnings);
        helper.assertFalse(warnings.stream().anyMatch(w -> w.contains("msm_test:sound_own") || w.contains("msm_test:sound_door")),
                "a warning for a block with known sounds: " + warnings);
        List<String> missing = OwnSounds.missingSoundSets();
        if (OwnSounds.dataDriven()) {
            helper.assertTrue(missing.stream().anyMatch(w -> w.contains("msm_test:sound_unknown") && w.contains("block_sound_set")),
                    "no warning for the block_sound_set entry the world lacks: " + missing);
            helper.assertFalse(missing.stream().anyMatch(w -> w.contains("msm_test:sound_own") || w.contains("msm_test:sound_door")),
                    "a warning for an entry the test data pack has: " + missing);
        } else {
            helper.assertTrue(missing.isEmpty(), "26.3 has no block_sound_set registry: " + missing);
        }
        helper.succeed();
    }
}
