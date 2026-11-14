package dev.mcsupermods.parity;

import com.google.gson.JsonObject;
import com.mojang.serialization.JsonOps;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderSet;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.RegistryOps;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.zombie.Zombie;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.block.AbstractFurnaceBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ComposterBlock;
import net.minecraft.world.level.block.entity.AbstractFurnaceBlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.GenerationStep;
import net.minecraft.world.level.levelgen.placement.PlacedFeature;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.storage.loot.parameters.LootContextParamSets;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity over the additions to vanilla content and the triggers of {@code fixtures/sample-mod} (ADRs 0060 and
 * 0061; namespace {@code msm_sample_mod}), against vanilla and Fabric API only, so the same tests run against the
 * content jar and the ejected jar. Each behaviour is observed through its vanilla effect:
 *
 * <ul>
 *   <li>{@code ruby_ore_generation}: the placed feature {@code ore_ruby_placed} is in the plains biome's generation
 *       settings at {@code underground_ores} (tag {@code #minecraft:is_overworld}), not in a nether biome, and its
 *       feature {@code ore_ruby} places ruby ore in stone.
 *   <li>{@code zombie_drops_ruby}: the live zombie table keeps its four vanilla pools, has one more that always rolls
 *       a ruby, and a killed zombie drops one; after {@code /reload} the pool is there once, not twice.
 *   <li>{@code ruby_tinder} ({@code fuel: 20 s}, {@code compost: "100%"}): it lights a furnace and smelts, and every
 *       insert raises a composter.
 *   <li>Item triggers: {@code ruby_sword} ({@code msm:on_hit}: Slowness on the entity hit, by a player and by a mob),
 *       {@code ruby_trowel} ({@code msm:on_use_on_block}: a gold block on the clicked block, 20-tick cooldown),
 *       {@code ruby_purse} ({@code msm:while_held}, either hand, every 10 ticks: one ruby), {@code ruby_crown}
 *       ({@code msm:while_worn}, every 10 ticks: Night Vision; gold helmet).
 *   <li>Block triggers: {@code ruby_cache} ({@code msm:on_break}: three rubies for the breaker, survival and creative),
 *       {@code ruby_beacon} ({@code msm:on_place}: a lapis block on top, with and without a placer),
 *       {@code ruby_bloom} ({@code msm:on_random_tick}, chance 1: red wool on top), {@code ruby_mist}
 *       ({@code msm:on_entity_inside}, cooldown 20: Weakness for the entity inside; a walk-through cross).
 * </ul>
 *
 * <p>A mock server player is not ticked by the server, so the held and worn tests call {@code ServerPlayer.doTick()}
 * once per test tick, as the network handler does for a real player. Run with
 * {@code --gametest-filter msm_parity_tests:sample_mod_*} (this class's ids start {@code sample_mod_additions_}).
 */
public class SampleModAdditionsParityTest {
    private static final String NAMESPACE = "msm_sample_mod";
    private static final BlockPos AT = new BlockPos(2, 1, 2);
    /** A test environment of its own, so the {@code /reload} runs in a batch with no other test. */
    static final String RELOAD = "msm_parity_tests:reload";
    private static final ResourceKey<LootTable> ZOMBIE =
            ResourceKey.create(Registries.LOOT_TABLE, Identifier.withDefaultNamespace("entities/zombie"));
    /** Vanilla 26.3 and 26.4 zombie tables have four pools (rotten flesh, mushroom, rare drops, music disc). */
    private static final int VANILLA_ZOMBIE_POOLS = 4;

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

    private static int count(Player player, Item item) {
        int n = 0;
        for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
            ItemStack stack = player.getInventory().getItem(i);
            if (stack.is(item)) {
                n += stack.getCount();
            }
        }
        return n;
    }

    private static ServerPlayer player(GameTestHelper helper, GameType mode) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(mode);
        return player;
    }

    // Biome addition (ADR 0060 D2)

    private static Biome biome(GameTestHelper helper, ResourceKey<Biome> key) {
        return helper.getLevel().registryAccess().lookupOrThrow(Registries.BIOME).getOrThrow(key).value();
    }

    private static boolean hasFeature(Biome biome, GenerationStep.Decoration step, ResourceKey<PlacedFeature> key) {
        List<HolderSet<PlacedFeature>> features = biome.getGenerationSettings().features();
        return step.ordinal() < features.size() && features.get(step.ordinal()).stream().anyMatch(h -> h.is(key));
    }

    @GameTest
    public void rubyOreIsInTheOverworldBiomesFeatures(GameTestHelper helper) {
        ResourceKey<PlacedFeature> key = ResourceKey.create(Registries.PLACED_FEATURE, id("ore_ruby_placed"));
        for (ResourceKey<Biome> overworld : List.of(Biomes.PLAINS, Biomes.FOREST, Biomes.DESERT)) {
            helper.assertTrue(hasFeature(biome(helper, overworld), GenerationStep.Decoration.UNDERGROUND_ORES, key),
                    overworld.identifier() + " has no " + key.identifier() + " at underground_ores");
        }
        helper.assertFalse(hasFeature(biome(helper, Biomes.PLAINS), GenerationStep.Decoration.VEGETAL_DECORATION, key),
                "plains has the ore at another step");
        for (GenerationStep.Decoration step : GenerationStep.Decoration.values()) {
            helper.assertFalse(hasFeature(biome(helper, Biomes.NETHER_WASTES), step, key), "nether_wastes has the ore");
        }
        helper.succeed();
    }

    /** The placed feature's feature, run on a block of stone, turns some of it into ruby ore. */
    @GameTest
    public void rubyOreFeaturePlacesTheOreInStone(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Holder<PlacedFeature> placed = level.registryAccess().lookupOrThrow(Registries.PLACED_FEATURE)
                .getOrThrow(ResourceKey.create(Registries.PLACED_FEATURE, id("ore_ruby_placed")));
        for (int x = 0; x < 5; x++) {
            for (int y = 1; y < 6; y++) {
                for (int z = 0; z < 5; z++) {
                    helper.setBlock(new BlockPos(x, y, z), Blocks.STONE);
                }
            }
        }
        Block ore = block(helper, "ruby_ore");
        RandomSource random = RandomSource.create(241L);
        boolean placedAny = false;
        for (int attempt = 0; attempt < 5 && !placedAny; attempt++) {
            placedAny = placed.value().feature().value().place(level, level.getChunkSource().getGenerator(), random,
                    helper.absolutePos(new BlockPos(2, 3, 2)));
        }
        int ores = 0;
        for (int x = 0; x < 5; x++) {
            for (int y = 1; y < 6; y++) {
                for (int z = 0; z < 5; z++) {
                    ores += helper.getBlockState(new BlockPos(x, y, z)).is(ore) ? 1 : 0;
                }
            }
        }
        helper.assertTrue(placedAny && ores > 0, "ore_ruby placed " + ores + " ruby ore block(s)");
        helper.succeed();
    }

    // Loot addition (ADR 0060 D3)

    private static JsonObject json(GameTestHelper helper, LootTable table) {
        return LootTable.DIRECT_CODEC.encodeStart(RegistryOps.create(JsonOps.INSTANCE, helper.getLevel().registryAccess()), table)
                .getOrThrow().getAsJsonObject();
    }

    private static LootTable zombieTable(GameTestHelper helper) {
        return helper.getLevel().getServer().reloadableRegistries().getLootTable(ZOMBIE);
    }

    /** Four vanilla pools (rotten flesh among them) and the added one last, which rolls one ruby every time. */
    private static void assertZombieTable(GameTestHelper helper, String when) {
        LootTable table = zombieTable(helper);
        JsonObject json = json(helper, table);
        helper.assertValueEqual(json.getAsJsonArray("pools").size(), VANILLA_ZOMBIE_POOLS + 1, "zombie pools " + when);
        helper.assertTrue(json.toString().contains("minecraft:rotten_flesh"), "the vanilla rotten flesh pool is gone " + when);
        Zombie zombie = helper.spawnWithNoFreeWill(EntityTypes.ZOMBIE, AT);
        LootParams params = new LootParams.Builder(helper.getLevel())
                .withParameter(LootContextParams.THIS_ENTITY, zombie)
                .withParameter(LootContextParams.ORIGIN, zombie.position())
                .withParameter(LootContextParams.DAMAGE_SOURCE, helper.getLevel().damageSources().generic())
                .create(LootContextParamSets.ENTITY);
        Item ruby = item(helper, "ruby");
        for (int roll = 0; roll < 8; roll++) {
            List<ItemStack> drops = table.getRandomItems(params);
            int rubies = drops.stream().filter(s -> s.is(ruby)).mapToInt(ItemStack::getCount).sum();
            helper.assertValueEqual(rubies, 1, "rubies in roll " + roll + " " + when + ": " + drops);
        }
        zombie.discard();
    }

    @GameTest
    public void zombieTableRollsTheRubyAndKeepsItsPools(GameTestHelper helper) {
        assertZombieTable(helper, "after start-up");
        helper.succeed();
    }

    @GameTest
    public void killedZombieDropsARuby(GameTestHelper helper) {
        Zombie zombie = helper.spawnWithNoFreeWill(EntityTypes.ZOMBIE, AT);
        zombie.setBaby(false);
        helper.kill(zombie);
        Item ruby = item(helper, "ruby");
        helper.succeedWhen(() -> {
            List<ItemEntity> drops = helper.getEntities(EntityTypes.ITEM, AT, 3.0);
            helper.assertTrue(drops.stream().anyMatch(i -> i.getItem().is(ruby)), "no ruby dropped: " + drops);
        });
    }

    /** A real {@code /reload}: the loot tables load again and the pool is added once to the new table. */
    @GameTest(environment = RELOAD, maxTicks = 600)
    public void zombieDropSurvivesReload(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        LootTable before = zombieTable(helper);
        CompletableFuture<Void> reload = server.reloadResources(server.getPackRepository().getSelectedIds());
        helper.startSequence()
                .thenWaitUntil(() -> helper.assertTrue(reload.isDone(), "the reload has not finished"))
                .thenExecute(() -> {
                    helper.assertFalse(reload.isCompletedExceptionally(), "the reload failed");
                    helper.assertTrue(zombieTable(helper) != before, "the zombie table was not loaded again");
                    assertZombieTable(helper, "after /reload");
                })
                .thenSucceed();
    }

    // Fuel and compost (ADR 0060 D4)

    @GameTest(maxTicks = 320)
    public void rubyTinderLightsAFurnaceAndSmelts(GameTestHelper helper) {
        helper.setBlock(AT, Blocks.FURNACE);
        AbstractFurnaceBlockEntity furnace = helper.getBlockEntity(AT, AbstractFurnaceBlockEntity.class);
        furnace.setItem(0, new ItemStack(Items.COBBLESTONE, 2));
        furnace.setItem(1, new ItemStack(item(helper, "ruby_tinder")));
        helper.runAfterDelay(10, () -> {
            helper.assertTrue(helper.getBlockState(AT).getValue(AbstractFurnaceBlock.LIT), "the furnace is not lit");
            helper.assertTrue(furnace.getItem(1).isEmpty(), "the tinder was not burned");
        });
        helper.succeedWhen(() -> {
            helper.assertTrue(furnace.getItem(2).is(Items.STONE), "no stone in the output slot yet: " + furnace.getItem(2));
            helper.assertTrue(helper.getBlockState(AT).getValue(AbstractFurnaceBlock.LIT), "the furnace went out early (burn time 400)");
        });
    }

    /** {@code "100%"}: every insert raises the composter, from empty to full. */
    @GameTest
    public void rubyTinderAlwaysRaisesTheComposter(GameTestHelper helper) {
        helper.setBlock(AT, Blocks.COMPOSTER);
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        Item tinder = item(helper, "ruby_tinder");
        for (int level = 0; level < ComposterBlock.MAX_LEVEL; level++) {
            BlockState state = helper.getBlockState(AT);
            helper.assertValueEqual(state.getValue(ComposterBlock.LEVEL), level, "level before insert " + (level + 1));
            BlockState after = ComposterBlock.insertItem(player, state, helper.getLevel(), new ItemStack(tinder), helper.absolutePos(AT));
            helper.assertValueEqual(after.getValue(ComposterBlock.LEVEL), level + 1, "level after insert " + (level + 1));
        }
        helper.succeed();
    }

    // Item triggers (ADR 0061 D1)

    @GameTest
    public void rubySwordHitSlowsTheTargetForPlayerAndMob(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        Mob vindicator = helper.spawnWithNoFreeWill(EntityTypes.VINDICATOR, AT);
        Mob byPlayer = helper.spawnWithNoFreeWill(EntityTypes.COW, AT.east());
        Mob byMob = helper.spawnWithNoFreeWill(EntityTypes.COW, AT.south());
        Mob control = helper.spawnWithNoFreeWill(EntityTypes.COW, AT.north());
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item(helper, "ruby_sword")));
        player.attack(byPlayer);
        helper.assertTrue(byPlayer.hasEffect(MobEffects.SLOWNESS), "the cow hit by the player is not slowed");
        vindicator.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(item(helper, "ruby_sword")));
        helper.assertTrue(vindicator.doHurtTarget(helper.getLevel(), byMob), "the vindicator's hit did not land");
        helper.assertTrue(byMob.hasEffect(MobEffects.SLOWNESS), "the cow hit by the vindicator is not slowed");
        helper.assertFalse(vindicator.hasEffect(MobEffects.SLOWNESS), "the attacker was slowed (target other)");
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.IRON_SWORD));
        player.attack(control);
        helper.assertFalse(control.hasEffect(MobEffects.SLOWNESS), "an iron sword slowed the cow");
        helper.succeed();
    }

    private static InteractionResult useOn(GameTestHelper helper, ServerPlayer player, BlockPos rel) {
        BlockPos abs = helper.absolutePos(rel);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs), Direction.UP, abs, false);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getMainHandItem(), InteractionHand.MAIN_HAND, hit);
    }

    @GameTest
    public void rubyTrowelPutsGoldOnTheClickedBlockWithCooldown(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        BlockPos second = AT.east(2);
        helper.setBlock(AT, Blocks.STONE);
        helper.setBlock(second, Blocks.STONE);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item(helper, "ruby_trowel")));
        InteractionResult first = useOn(helper, player, AT);
        helper.assertTrue(first.consumesAction(), "the click was not consumed: " + first);
        helper.assertBlockPresent(Blocks.GOLD_BLOCK, AT.above());
        helper.assertTrue(player.getCooldowns().isOnCooldown(player.getMainHandItem()), "no cooldown after the click");
        useOn(helper, player, second);
        helper.assertBlockPresent(Blocks.AIR, second.above());
        for (int n = 0; n < 21; n++) { // a mock player's cooldowns only advance when ticked
            player.getCooldowns().tick();
        }
        useOn(helper, player, second);
        helper.assertBlockPresent(Blocks.GOLD_BLOCK, second.above());
        helper.succeed();
    }

    /** Ticks the mock players for exactly {@code ticks} test ticks, as the network handler does for a real player. */
    private static void tickFor(GameTestHelper helper, int ticks, ServerPlayer... players) {
        int[] done = {0};
        helper.onEachTick(() -> {
            if (done[0]++ < ticks) {
                for (ServerPlayer p : players) {
                    p.doTick();
                }
            }
        });
    }

    /** Every 10 ticks one ruby, in either hand; over 40 ticked ticks exactly four; never from a backpack slot. */
    @GameTest(maxTicks = 80)
    public void rubyPurseGivesARubyEveryTenTicksInEitherHand(GameTestHelper helper) {
        ServerPlayer main = player(helper, GameType.SURVIVAL);
        ServerPlayer off = player(helper, GameType.SURVIVAL);
        ServerPlayer backpack = player(helper, GameType.SURVIVAL);
        Item purse = item(helper, "ruby_purse");
        Item ruby = item(helper, "ruby");
        main.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(purse));
        off.setItemInHand(InteractionHand.OFF_HAND, new ItemStack(purse));
        backpack.getInventory().setItem(20, new ItemStack(purse));
        tickFor(helper, 40, main, off, backpack);
        helper.runAfterDelay(45, () -> {
            helper.assertValueEqual(count(main, ruby), 4, "rubies from the main hand over 40 ticks");
            helper.assertValueEqual(count(off, ruby), 4, "rubies from the off hand over 40 ticks");
            helper.assertValueEqual(count(backpack, ruby), 0, "rubies from a backpack slot");
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 60)
    public void rubyCrownGivesNightVisionOnlyWhenWorn(GameTestHelper helper) {
        ServerPlayer worn = player(helper, GameType.SURVIVAL);
        ServerPlayer held = player(helper, GameType.SURVIVAL);
        Mob vindicator = helper.spawnWithNoFreeWill(EntityTypes.VINDICATOR, AT);
        Item crown = item(helper, "ruby_crown");
        worn.setItemSlot(EquipmentSlot.HEAD, new ItemStack(crown));
        held.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(crown));
        vindicator.setItemSlot(EquipmentSlot.HEAD, new ItemStack(crown));
        tickFor(helper, 25, worn, held);
        helper.runAfterDelay(25, () -> {
            helper.assertTrue(worn.hasEffect(MobEffects.NIGHT_VISION), "the player wearing the crown has no Night Vision");
            helper.assertTrue(vindicator.hasEffect(MobEffects.NIGHT_VISION), "the mob wearing the crown has no Night Vision");
            helper.assertFalse(held.hasEffect(MobEffects.NIGHT_VISION), "holding the crown gave Night Vision");
            helper.succeed();
        });
    }

    // Block triggers (ADR 0061 D2)

    @GameTest
    public void rubyCacheGivesTheBreakerRubiesInSurvivalAndCreative(GameTestHelper helper) {
        ServerPlayer survival = player(helper, GameType.SURVIVAL);
        ServerPlayer creative = player(helper, GameType.CREATIVE);
        Block cache = block(helper, "ruby_cache");
        Item ruby = item(helper, "ruby");
        BlockPos other = AT.east(2);
        helper.setBlock(AT, cache);
        helper.setBlock(other, cache);
        helper.assertTrue(survival.gameMode.destroyBlock(helper.absolutePos(AT)), "survival break failed");
        helper.assertTrue(creative.gameMode.destroyBlock(helper.absolutePos(other)), "creative break failed");
        helper.assertValueEqual(count(survival, ruby), 3, "rubies for the survival breaker");
        helper.assertValueEqual(count(creative, ruby), 3, "rubies for the creative breaker");
        helper.assertBlockNotPresent(cache, AT);
        helper.succeed();
    }

    @GameTest
    public void rubyBeaconPlacementPutsLapisOnTop(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        Block beacon = block(helper, "ruby_beacon");
        helper.setBlock(AT.below(), Blocks.STONE);
        helper.placeAt(player, new ItemStack(item(helper, "ruby_beacon")), AT.below(), Direction.UP);
        helper.assertBlockPresent(beacon, AT);
        helper.assertBlockPresent(Blocks.LAPIS_BLOCK, AT.above());

        // Without a placer (setPlacedBy with none), as a dispenser-free code path places it.
        BlockPos other = AT.east(2);
        BlockPos abs = helper.absolutePos(other);
        BlockState state = beacon.defaultBlockState();
        helper.getLevel().setBlockAndUpdate(abs, state);
        beacon.setPlacedBy(helper.getLevel(), abs, state, null, ItemStack.EMPTY);
        helper.assertBlockPresent(Blocks.LAPIS_BLOCK, other.above());

        // A plain setBlock is not a placement.
        BlockPos plain = AT.west(2);
        helper.setBlock(plain, beacon);
        helper.assertBlockPresent(Blocks.AIR, plain.above());
        helper.succeed();
    }

    @GameTest
    public void rubyBloomRandomTickPutsWoolOnTop(GameTestHelper helper) {
        Block bloom = block(helper, "ruby_bloom");
        helper.assertTrue(bloom.defaultBlockState().isRandomlyTicking(), "ruby_bloom does not tick randomly");
        helper.setBlock(AT, bloom);
        helper.assertBlockPresent(Blocks.AIR, AT.above());
        helper.randomTick(AT);
        // By id: 26.3 keeps the coloured wools in a colour collection.
        helper.assertBlockPresent(BuiltInRegistries.BLOCK.getValue(Identifier.withDefaultNamespace("red_wool")), AT.above());
        helper.assertFalse(block(helper, "ruby_cache").defaultBlockState().isRandomlyTicking(), "a block without the trigger ticks");
        helper.succeed();
    }

    /** A cow standing in the mist gets Weakness; taken away, it comes back only after the 20-tick cooldown. */
    @GameTest(maxTicks = 60)
    public void rubyMistWeakensTheEntityInsideWithCooldown(GameTestHelper helper) {
        helper.setBlock(AT.below(), Blocks.STONE);
        helper.setBlock(AT, block(helper, "ruby_mist"));
        Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, AT);
        helper.runAfterDelay(4, () -> {
            helper.assertTrue(cow.hasEffect(MobEffects.WEAKNESS), "the cow in the mist has no Weakness");
            cow.removeEffect(MobEffects.WEAKNESS);
        });
        helper.runAfterDelay(14, () -> helper.assertFalse(cow.hasEffect(MobEffects.WEAKNESS), "Weakness again within the cooldown"));
        helper.runAfterDelay(32, () -> {
            helper.assertTrue(cow.hasEffect(MobEffects.WEAKNESS), "no Weakness after the cooldown");
            helper.succeed();
        });
    }
}
