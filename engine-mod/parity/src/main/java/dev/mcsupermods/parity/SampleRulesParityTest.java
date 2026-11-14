package dev.mcsupermods.parity;

import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientboundLevelParticlesPacket;
import net.minecraft.network.protocol.game.ClientboundSoundEntityPacket;
import net.minecraft.network.protocol.game.ClientboundSoundPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity over {@code fixtures/sample-rules} (namespace {@code msm_sample_rules}, ADR 0082), the two plain
 * rules only: they compile to ordinary actions, so the content jar and the ejected Java project both carry them. Black-box
 * through vanilla and Fabric API alone (ADR 0033 D5): a real player's use of the block ({@code
 * ServerPlayerGameMode.useItemOn}), the player's inventory, the sound and particle packets a real player receives
 * ({@link ParityEars}) and the mob's effects. Run with {@code --gametest-filter msm_parity_tests:sample_rules_parity_test_*}
 * on content and ejected jars; the rules that need a script are {@link SampleRulesScriptParityTest} (content jars only).
 *
 * <ul>
 *   <li>{@code chime_block_rules}, "Ring the chime" ({@code msm:on_interact}, event {@code
 *       msm_sample_rules:chime_block_rules_block_used}): each use plays {@code minecraft:block.note_block.chime} and gives
 *       the player exactly one Ruby.</li>
 *   <li>{@code sentinel_rules}, "Keep watch" ({@code msm:on_tick} every 100 ticks, event {@code
 *       msm_sample_rules:sentinel_rules_mob_every}): a bell, end rod sparkles and Glowing on the Sentinel itself, so a
 *       Sentinel glows within 100 ticks of spawning.</li>
 * </ul>
 */
public class SampleRulesParityTest {
    static final String NAMESPACE = "msm_sample_rules";
    static final BlockPos AT = new BlockPos(2, 1, 2);
    private static final String ARENA = "msm_parity_tests:arena";
    private static final BlockPos MID = new BlockPos(5, 1, 5);
    static final Identifier CHIME = Identifier.withDefaultNamespace("block.note_block.chime");
    private static final Identifier BELL = Identifier.withDefaultNamespace("block.note_block.bell");
    private static final Identifier END_ROD = Identifier.withDefaultNamespace("end_rod");

    static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NAMESPACE, path);
    }

    static Block block(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.BLOCK.containsKey(id(path)), "block " + id(path) + " is not registered");
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    static Item item(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(id(path)), "item " + id(path) + " is not registered");
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    @SuppressWarnings("unchecked")
    private static EntityType<Mob> sentinel(GameTestHelper helper) {
        helper.assertTrue(BuiltInRegistries.ENTITY_TYPE.containsKey(id("sentinel")), "entity type " + id("sentinel") + " is not registered");
        return (EntityType<Mob>) BuiltInRegistries.ENTITY_TYPE.getValue(id("sentinel"));
    }

    /** A main-hand right-click on the top face of {@code rel}, as the network handler does. */
    static InteractionResult use(GameTestHelper helper, ServerPlayer player, BlockPos rel) {
        BlockPos abs = helper.absolutePos(rel);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs), Direction.UP, abs, false);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getMainHandItem(), InteractionHand.MAIN_HAND, hit);
    }

    /** How many of {@code item} the player carries. */
    static int count(ServerPlayer player, Item item) {
        int total = 0;
        for (int slot = 0; slot < player.getInventory().getContainerSize(); slot++) {
            ItemStack stack = player.getInventory().getItem(slot);
            if (stack.is(item)) {
                total += stack.getCount();
            }
        }
        return total;
    }

    /** The two blocks, the four items and the mob are registered; the blocks are their own block items. */
    @GameTest
    public void thingsAreRegistered(GameTestHelper helper) {
        for (String path : List.of("chime_block", "lucky_block")) {
            helper.assertTrue(block(helper, path).asItem() == item(helper, path), path + ": block item");
        }
        for (String path : List.of("ruby", "rally_horn", "sentinel_spawn_egg")) {
            item(helper, path);
        }
        helper.assertValueEqual(new ItemStack(item(helper, "rally_horn")).getMaxStackSize(), 1, "rally horn stack size");
        sentinel(helper);
        helper.succeed();
    }

    /** "Ring the chime": every use of the Chime Block with an empty hand chimes at the block and gives exactly one Ruby. */
    @GameTest
    public void chimeBlockChimesAndGivesOneRubyEachUse(GameTestHelper helper) {
        helper.setBlock(AT, block(helper, "chime_block"));
        Item ruby = item(helper, "ruby");
        try (ParityEars ears = new ParityEars(helper, AT.west(), GameType.SURVIVAL, "msm-chime-user")) {
            ears.heard();
            for (int use = 1; use <= 3; use++) {
                use(helper, ears.player, AT);
                helper.assertValueEqual(count(ears.player, ruby), use, "rubies after " + use + " use(s)");
                List<Identifier> heard = ears.heard();
                helper.assertValueEqual(heard.stream().filter(CHIME::equals).count(), 1L, "chimes heard on use " + use + ": " + heard);
            }
        }
        helper.succeed();
    }

    /**
     * "Keep watch": a Sentinel with its AI running glows within one interval (100 ticks) of spawning, and a player nearby
     * hears the bell and receives end rod sparkles.
     */
    @GameTest(structure = ARENA, maxTicks = 160)
    public void sentinelGlowsWithinOneInterval(GameTestHelper helper) {
        Mob mob = helper.spawn(sentinel(helper), MID);
        helper.assertFalse(mob.hasEffect(MobEffects.GLOWING), "the Sentinel glows at once");
        ParityEars ears = ParityEars.listener(helper, MID.east(2));
        List<Identifier> heard = new ArrayList<>();
        List<ClientboundLevelParticlesPacket> rods = new ArrayList<>();
        long start = helper.getLevel().getGameTime();
        long[] firstGlow = {-1};
        helper.onEachTick(() -> {
            if (ears.player.isRemoved()) {
                return;
            }
            if (firstGlow[0] < 0 && mob.hasEffect(MobEffects.GLOWING)) {
                firstGlow[0] = helper.getLevel().getGameTime();
            }
            for (Packet<?> packet : ears.packets()) {
                switch (packet) {
                    case ClientboundSoundPacket p -> heard.add(p.getSound().value().location());
                    case ClientboundSoundEntityPacket p -> heard.add(p.getSound().value().location());
                    case ClientboundLevelParticlesPacket p when END_ROD.equals(BuiltInRegistries.PARTICLE_TYPE.getKey(p.particle().getType()))
                            && new Vec3(p.x(), p.y(), p.z()).distanceTo(mob.position()) < 4.0 -> rods.add(p);
                    default -> {}
                }
            }
        });
        helper.succeedWhen(() -> {
            helper.assertTrue(firstGlow[0] >= 0, "the Sentinel does not glow yet");
            helper.assertTrue(firstGlow[0] - start <= 101, "the Sentinel first glowed after " + (firstGlow[0] - start) + " ticks");
            MobEffectInstance glowing = mob.getEffect(MobEffects.GLOWING);
            helper.assertTrue(glowing != null && glowing.getDuration() > 0 && glowing.getDuration() <= 60,
                    "Glowing (3 s) after the first interval: " + glowing);
            helper.assertTrue(heard.contains(BELL), "no bell heard: " + heard);
            helper.assertFalse(rods.isEmpty(), "no end rod sparkles near the Sentinel");
            ears.close();
            mob.discard();
        });
    }
}
