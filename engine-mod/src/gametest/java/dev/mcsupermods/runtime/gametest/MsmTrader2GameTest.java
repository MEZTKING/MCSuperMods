package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.goals.RestockAtWorkSiteGoal;
import dev.mcsupermods.runtime.registry.MsmMob;
import dev.mcsupermods.runtime.registry.PoiTypes;
import dev.mcsupermods.runtime.registry.mob.MobTrader;
import dev.mcsupermods.runtime.registry.mob.TraderReputation;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.GlobalPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.memory.MemoryModuleType;
import net.minecraft.world.entity.ai.village.poi.PoiType;
import net.minecraft.world.entity.npc.villager.Villager;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.MerchantMenu;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.BedBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BedPart;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.Vec3;

/**
 * Traders 2 (ADR 0107 D1 to D4 as amended after the B524 spike; B528) on {@code trader_market} (two offers of
 * {@code msm_test:tr_market/level_1}: bread for 10 emeralds with price multiplier 0.05 and cooked beef for 20 with 0.2,
 * 12 uses each; {@code reputation} with defaults and a poppy as the gift; demand on), {@code trader_stepped} (the same offers,
 * {@code price_step} 5, a hit 10, a trade 5, a small flower gift 10, 4 a day; demand off), {@code trader_worker} (restocks
 * at {@code #msm_test:tr_sites}, a fletching table) and {@code trader_idler} (restocks at a cartography table, which no
 * test places). Hits go through {@code ServerPlayer.attack}, menus through {@code Player.interactOn} and the menu's
 * {@code clicked}, gifts through {@code interactOn} with the item in hand, the paths a player's clicks take on the
 * server. The bed test runs in its own batch, the test environment {@code msm_runtime_gametest:b528_day} (the
 * Overworld clock at 1000, put back afterwards), because it turns the day into night, which other tests read.
 */
public class MsmTrader2GameTest {
    private static final String ARENA = "msm_runtime_gametest:arena";
    /** Morning on the Overworld clock, put back after the batch; a batch of its own for the bed test. */
    static final String DAY = "msm_runtime_gametest:b528_day";
    private static final BlockPos MID = new BlockPos(1, 2, 1);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    @SuppressWarnings("unchecked")
    private static <T extends PathfinderMob> EntityType<T> type(String path) {
        return (EntityType<T>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    private static MobTrader trader(PathfinderMob mob) {
        return ((MsmMob) mob).driver().trader();
    }

    private static TraderReputation reputation(GameTestHelper helper, PathfinderMob mob) {
        Optional<TraderReputation> r = trader(mob).reputation();
        helper.assertTrue(r.isPresent(), BuiltInRegistries.ENTITY_TYPE.getKey(mob.getType()) + " has no reputation");
        return r.get();
    }

    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    private static ServerPlayer player(GameTestHelper helper, BlockPos pos) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(pos)));
        return player;
    }

    private static void leave(GameTestHelper helper, ServerPlayer... players) {
        for (ServerPlayer player : players) {
            player.closeContainer();
            helper.getLevel().getServer().getPlayerList().remove(player);
        }
    }

    private static void use(ServerPlayer player, Entity mob, ItemStack held) {
        player.setItemInHand(InteractionHand.MAIN_HAND, held);
        player.interactOn(mob, InteractionHand.MAIN_HAND, Vec3.ZERO);
    }

    private static MerchantMenu open(GameTestHelper helper, ServerPlayer player, PathfinderMob mob) {
        use(player, mob, ItemStack.EMPTY);
        if (!(player.containerMenu instanceof MerchantMenu menu)) {
            throw helper.assertionException("no merchant menu opened: " + player.containerMenu.getClass().getSimpleName());
        }
        return menu;
    }

    private static MerchantOffer offer(GameTestHelper helper, MerchantOffers offers, Item result) {
        for (MerchantOffer o : offers) {
            if (o.getResult().is(result)) {
                return o;
            }
        }
        throw helper.assertionException("no offer of " + result + " in " + describe(offers));
    }

    /** The emeralds each offer costs, bread first. */
    private static List<Integer> costs(GameTestHelper helper, MerchantOffers offers) {
        return List.of(offer(helper, offers, Items.BREAD).getCostA().getCount(), offer(helper, offers, Items.COOKED_BEEF).getCostA().getCount());
    }

    private static List<String> describe(MerchantOffers offers) {
        List<String> out = new ArrayList<>();
        for (MerchantOffer o : offers) {
            out.add(o.getCostA().getCount() + " " + BuiltInRegistries.ITEM.getKey(o.getCostA().getItem()).getPath() + " -> "
                    + BuiltInRegistries.ITEM.getKey(o.getResult().getItem()).getPath() + " (special " + o.getSpecialPriceDiff()
                    + ", demand " + o.getDemand() + ", uses " + o.getUses() + "/" + o.getMaxUses() + ")");
        }
        return out;
    }

    private static void useUp(MerchantOffers offers) {
        for (MerchantOffer o : offers) {
            while (!o.isOutOfStock()) {
                o.increaseUses();
            }
        }
    }

    private static long half(ServerLevel level) {
        return Math.floorDiv(MobTrader.clockTicks(level), MobTrader.HALF_DAY);
    }

    // Reputation (D1)

    @GameTest
    public void aHitRaisesThePricesForThatPlayerOnly(GameTestHelper helper) {
        PathfinderMob mob = helper.spawnWithNoFreeWill(type("trader_market"), MID);
        TraderReputation reputation = reputation(helper, mob);
        ServerPlayer ann = player(helper, MID.east());
        ServerPlayer bob = player(helper, MID.west());
        try {
            MerchantMenu first = open(helper, ann, mob);
            helper.assertValueEqual(costs(helper, first.getOffers()), List.of(10, 20), "prices before the hit");
            ann.closeContainer();
            ann.attack(mob);
            helper.assertValueEqual(reputation.standing(ann.getUUID()), new TraderReputation.Standing(25, 0, 0), "standing after one hit");
            helper.assertValueEqual(reputation.value(ann.getUUID()), -25, "value after one hit");
            MerchantMenu menu = open(helper, ann, mob);
            // B524: special = -floor(value x multiplier): 2 on bread (x0.05), 5 on beef (x0.2), as vanilla's villager.
            helper.assertValueEqual(costs(helper, menu.getOffers()), List.of(12, 25), "prices for the player who hit: " + describe(menu.getOffers()));
            ann.closeContainer();
            helper.assertValueEqual(costs(helper, trader(mob).getOffers()), List.of(10, 20), "prices after the menu closed");
            MerchantMenu other = open(helper, bob, mob);
            helper.assertValueEqual(costs(helper, other.getOffers()), List.of(10, 20), "prices for another player");
            helper.assertValueEqual(reputation.value(bob.getUUID()), 0, "the other player's value");
        } finally {
            leave(helper, ann, bob);
        }
        helper.succeed();
    }

    @GameTest
    public void tradesAndGiftsLowerThePricesUpToTheirCaps(GameTestHelper helper) {
        PathfinderMob mob = helper.spawnWithNoFreeWill(type("trader_market"), MID);
        TraderReputation reputation = reputation(helper, mob);
        ServerPlayer ann = player(helper, MID.east());
        try {
            MerchantMenu menu = open(helper, ann, mob);
            MerchantOffers offers = menu.getOffers();
            int bread = offers.indexOf(offer(helper, offers, Items.BREAD));
            menu.setSelectionHint(bread);
            menu.getSlot(0).set(new ItemStack(Items.EMERALD, 64));
            menu.slotsChanged(menu.getSlot(0).container);
            menu.clicked(2, 0, ContainerInput.QUICK_MOVE, ann);
            helper.assertValueEqual(offers.get(bread).getUses(), 6, "bread trades from 64 emeralds: " + describe(offers));
            helper.assertValueEqual(reputation.standing(ann.getUUID()).trading(), 12, "trade part after six trades (2 each)");
            menu.getSlot(0).set(ItemStack.EMPTY);
            ann.closeContainer();
            // 12: bread -floor(0.6) = 0, beef -floor(2.4) = -2.
            helper.assertValueEqual(costs(helper, open(helper, ann, mob).getOffers()), List.of(10, 18), "prices after six trades");
            ann.closeContainer();

            use(ann, mob, new ItemStack(Items.POPPY, 2));
            helper.assertFalse(ann.containerMenu instanceof MerchantMenu, "a gift opened the menu");
            helper.assertValueEqual(ann.getMainHandItem().getCount(), 1, "the poppy was not taken");
            helper.assertValueEqual(reputation.standing(ann.getUUID()).gift(), 25, "gift part after one gift");
            use(ann, mob, ann.getMainHandItem());
            helper.assertTrue(ann.containerMenu instanceof MerchantMenu, "a gift at the cap did not open the menu");
            helper.assertValueEqual(ann.getMainHandItem().getCount(), 1, "a gift at the cap was taken");
            // 37: bread -floor(1.85) = -1, beef -floor(7.4) = -7.
            helper.assertValueEqual(costs(helper, ((MerchantMenu) ann.containerMenu).getOffers()), List.of(9, 13), "prices after the gift");
            ann.closeContainer();

            UUID someone = UUID.nameUUIDFromBytes("someone".getBytes());
            for (int i = 0; i < 20; i++) {
                reputation.trade(someone);
            }
            helper.assertValueEqual(reputation.value(someone), 25, "trading stops at its cap");
            for (int i = 0; i < 20; i++) {
                reputation.hurt(someone);
            }
            helper.assertValueEqual(reputation.standing(someone).hurt(), TraderReputation.HURT_CAP, "hits stop at their cap");
            helper.assertFalse(reputation.isGift(new ItemStack(Items.DANDELION)), "another flower is a gift");
        } finally {
            leave(helper, ann);
        }
        helper.succeed();
    }

    @GameTest
    public void theStandingIsSavedAndFadesEachDay(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        PathfinderMob mob = helper.spawnWithNoFreeWill(type("trader_market"), MID);
        TraderReputation reputation = reputation(helper, mob);
        UUID ann = UUID.nameUUIDFromBytes("Ann".getBytes());
        reputation.hurt(ann);
        reputation.hurt(ann);
        for (int i = 0; i < 3; i++) {
            reputation.trade(ann);
        }
        helper.assertTrue(reputation.gift(ann), "the gift was refused");
        helper.assertValueEqual(reputation.standing(ann), new TraderReputation.Standing(50, 6, 25), "standing before saving");

        TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, level.registryAccess());
        mob.saveWithoutId(out);
        CompoundTag tag = out.buildResult();
        helper.assertTrue(tag.contains("Reputation"), "save keys: " + tag.keySet());
        PathfinderMob copy = type("trader_market").create(level, EntitySpawnReason.LOAD);
        helper.assertTrue(copy != null, "no copy");
        copy.load(TagValueInput.create(ProblemReporter.DISCARDING, level.registryAccess(), tag));
        TraderReputation loaded = reputation(helper, copy);
        helper.assertValueEqual(loaded.standing(ann), new TraderReputation.Standing(50, 6, 25), "standing after loading");

        long day = 100;
        helper.assertFalse(loaded.decayIfDue(day * TraderReputation.DAY), "the first check faded");
        helper.assertFalse(loaded.decayIfDue(day * TraderReputation.DAY + 23999), "faded within the day");
        helper.assertTrue(loaded.decayIfDue((day + 1) * TraderReputation.DAY), "nothing faded the next day");
        helper.assertValueEqual(loaded.standing(ann), new TraderReputation.Standing(30, 4, 25), "after one day: hits -20, trades -2");
        helper.assertTrue(loaded.decayIfDue((day + 6) * TraderReputation.DAY), "nothing faded five days later");
        helper.assertValueEqual(loaded.standing(ann), new TraderReputation.Standing(0, 0, 25), "after six days the gift stays");
        helper.assertFalse(loaded.decayIfDue(day * TraderReputation.DAY), "a clock set back faded");

        PathfinderMob plain = helper.spawnWithNoFreeWill(type("trader_basic"), MID.south(2));
        helper.assertTrue(trader(plain).reputation().isEmpty(), "trader_basic has a reputation");
        TagValueOutput plainOut = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, level.registryAccess());
        plain.saveWithoutId(plainOut);
        helper.assertFalse(plainOut.buildResult().contains("Reputation"), "a trader without reputation saved one");
        helper.succeed();
    }

    @GameTest
    public void aPriceStepMovesPricesOneItemPerStep(GameTestHelper helper) {
        PathfinderMob mob = helper.spawnWithNoFreeWill(type("trader_stepped"), MID);
        TraderReputation reputation = reputation(helper, mob);
        ServerPlayer ann = player(helper, MID.east());
        try {
            ann.attack(mob);
            helper.assertValueEqual(reputation.value(ann.getUUID()), -10, "value after a hit of 10");
            // price_step 5: -floor(-10 / 5) = 2 on every offer, whatever its multiplier.
            helper.assertValueEqual(costs(helper, open(helper, ann, mob).getOffers()), List.of(12, 22), "prices after the hit");
            ann.closeContainer();
            use(ann, mob, new ItemStack(Items.DANDELION));
            helper.assertValueEqual(reputation.standing(ann.getUUID()), new TraderReputation.Standing(10, 0, 10), "a small flower is the gift");
            helper.assertValueEqual(costs(helper, open(helper, ann, mob).getOffers()), List.of(10, 20), "prices with a value of 0");
            ann.closeContainer();
            helper.assertValueEqual(TraderReputation.specialPrice(7, 0.2f, Optional.of(5)), -1, "step rounding of a positive value");
            helper.assertValueEqual(TraderReputation.specialPrice(-7, 0.2f, Optional.of(5)), 2, "step rounding of a negative value");
            helper.assertValueEqual(TraderReputation.specialPrice(6, 0.2f, Optional.empty()), -1, "vanilla rounding (B524: 6 x 0.2)");
        } finally {
            leave(helper, ann);
        }
        helper.succeed();
    }

    // Demand (D2)

    @GameTest
    public void demandRaisesPricesAfterHeavyTradingAndSettles(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        PathfinderMob mob = helper.spawnWithNoFreeWill(type("trader_market"), MID);
        PathfinderMob off = helper.spawnWithNoFreeWill(type("trader_stepped"), MID.east(2));
        MobTrader trader = trader(mob);
        MobTrader steady = trader(off);
        long half = half(level);
        MerchantOffers offers = trader.getOffers();
        useUp(offers);
        helper.assertFalse(trader.restockIfDue(level, half * MobTrader.HALF_DAY), "the first check restocked");
        helper.assertTrue(trader.restockIfDue(level, (half + 1) * MobTrader.HALF_DAY), "no restock");
        // B524: demand = 0 + 12 - 0; bread 10 + floor(10 x 12 x 0.05) = 16; beef 20 + 48, at most a stack of 64.
        helper.assertValueEqual(offer(helper, offers, Items.BREAD).getDemand(), 12, "bread demand: " + describe(offers));
        helper.assertValueEqual(costs(helper, offers), List.of(16, 64), "prices after heavy trading");
        helper.assertValueEqual(offer(helper, offers, Items.BREAD).getUses(), 0, "uses after the restock");
        for (MerchantOffer o : offers) {
            o.increaseUses();
        }
        helper.assertTrue(trader.restockIfDue(level, (half + 2) * MobTrader.HALF_DAY), "no second restock");
        // demand = 12 + 1 - 11 = 2: bread 10 + 1, beef 20 + 8.
        helper.assertValueEqual(costs(helper, offers), List.of(11, 28), "prices after a quiet half day: " + describe(offers));

        MerchantOffers steadyOffers = steady.getOffers();
        useUp(steadyOffers);
        steady.restockIfDue(level, half * MobTrader.HALF_DAY);
        helper.assertTrue(steady.restockIfDue(level, (half + 1) * MobTrader.HALF_DAY), "demand false: no restock");
        helper.assertValueEqual(offer(helper, steadyOffers, Items.BREAD).getDemand(), 0, "demand false: demand changed");
        helper.assertValueEqual(costs(helper, steadyOffers), List.of(10, 20), "demand false: prices changed");
        helper.succeed();
    }

    // Work site (D3)

    @GameTest(structure = ARENA, maxTicks = 600)
    public void aTraderWalksToItsWorkSiteAndRestocksThere(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockPos site = new BlockPos(9, 1, 9);
        helper.setBlock(site, Blocks.FLETCHING_TABLE);
        PathfinderMob mob = helper.spawn(type("trader_worker"), new BlockPos(1, 1, 1));
        MobTrader trader = trader(mob);
        MerchantOffers offers = trader.getOffers();
        useUp(offers);
        long half = half(level);
        trader.restockIfDue(level, half * MobTrader.HALF_DAY);
        helper.assertFalse(trader.restockIfDue(level, (half + 1) * MobTrader.HALF_DAY), "restocked in place");
        helper.assertTrue(trader.restockPending(), "the restock does not wait for the work site");
        helper.assertTrue(offers.stream().allMatch(MerchantOffer::isOutOfStock), "offers refilled before the walk");
        helper.succeedWhen(() -> {
            helper.assertTrue(trader.workSiteGoal() != null, "no work site goal");
            helper.assertValueEqual(trader.restocks(), 1, "restocks at the site");
            helper.assertFalse(trader.restockPending(), "still waiting");
            helper.assertTrue(offers.stream().allMatch(o -> o.getUses() == 0), "offers after the restock: " + describe(offers));
            double distance = Math.sqrt(mob.position().distanceToSqr(Vec3.atCenterOf(helper.absolutePos(site))));
            helper.assertTrue(distance <= 2.0, "restocked " + distance + " blocks from the site");
        });
    }

    @GameTest(structure = ARENA, maxTicks = 200)
    public void withoutItsWorkSiteATraderWaits(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        helper.setBlock(new BlockPos(9, 1, 9), Blocks.FLETCHING_TABLE); // another trader's site
        PathfinderMob mob = helper.spawn(type("trader_idler"), new BlockPos(5, 1, 5));
        MobTrader trader = trader(mob);
        MerchantOffers offers = trader.getOffers();
        useUp(offers);
        long half = half(level);
        trader.restockIfDue(level, half * MobTrader.HALF_DAY);
        trader.restockIfDue(level, (half + 1) * MobTrader.HALF_DAY);
        helper.assertTrue(trader.restockPending(), "not waiting for the work site");

        Predicate<BlockState> byId = RestockAtWorkSiteGoal.matcher("minecraft:cartography_table", "test");
        Predicate<BlockState> byTag = RestockAtWorkSiteGoal.matcher("#msm_test:tr_sites", "test");
        Predicate<BlockState> unknown = RestockAtWorkSiteGoal.matcher("msm_test:no_such_block", "test");
        helper.assertTrue(byId.test(Blocks.CARTOGRAPHY_TABLE.defaultBlockState()) && !byId.test(Blocks.FLETCHING_TABLE.defaultBlockState()),
                "a block id matches another block");
        helper.assertTrue(byTag.test(Blocks.FLETCHING_TABLE.defaultBlockState()) && !byTag.test(Blocks.BARREL.defaultBlockState()),
                "a block tag matches another block");
        helper.assertFalse(unknown.test(Blocks.AIR.defaultBlockState()), "an unknown block matches");
        helper.assertValueEqual(RestockAtWorkSiteGoal.nearest(level, helper.absolutePos(new BlockPos(5, 1, 5)), byTag),
                helper.absolutePos(new BlockPos(9, 1, 9)), "the nearest tagged block");
        helper.runAfterDelay(150, () -> {
            helper.assertTrue(trader.workSiteGoal() != null, "no work site goal");
            helper.assertTrue(trader.restockPending(), "stopped waiting without a site");
            helper.assertValueEqual(trader.restocks(), 0, "restocked without a site");
            helper.assertTrue(offers.stream().allMatch(MerchantOffer::isOutOfStock), "offers refilled without a site");
            helper.succeed();
        });
    }

    // Beds (D4)

    @GameTest(structure = ARENA, maxTicks = 1200, environment = DAY)
    public void aVillagerClaimsAndSleepsInAProjectBed(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        Block bed = BuiltInRegistries.BLOCK.getValue(id("furniture_bed"));
        Holder<PoiType> home = net.minecraft.world.entity.ai.village.poi.PoiTypes.forState(
                Blocks.BED.red().defaultBlockState().setValue(BedBlock.PART, BedPart.HEAD)).orElseThrow();
        for (BlockState state : bed.getStateDefinition().getPossibleStates()) {
            Optional<Holder<PoiType>> poi = net.minecraft.world.entity.ai.village.poi.PoiTypes.forState(state);
            if (state.getValue(BedBlock.PART) == BedPart.HEAD) {
                helper.assertTrue(poi.isPresent() && poi.get().is(net.minecraft.world.entity.ai.village.poi.PoiTypes.HOME),
                        "a head state is no home: " + state + " " + poi);
            } else {
                helper.assertTrue(poi.isEmpty(), "a foot state has a point of interest: " + state);
            }
        }
        helper.assertValueEqual(PoiTypes.addHome(bed), 0, "states added twice");
        BlockPos foot = new BlockPos(5, 1, 5);
        BlockPos head = foot.relative(Direction.EAST);
        BlockState footState = bed.defaultBlockState().setValue(HorizontalDirectionalBlock.FACING, Direction.EAST)
                .setValue(BedBlock.PART, BedPart.FOOT);
        helper.setBlock(foot, footState);
        helper.setBlock(head, footState.setValue(BedBlock.PART, BedPart.HEAD));
        helper.assertValueEqual(level.getPoiManager().getType(helper.absolutePos(head)), Optional.of(home), "no home recorded at the head");
        Villager villager = helper.spawn(EntityTypes.VILLAGER, new BlockPos(2, 1, 2));
        boolean[] night = {false};
        helper.onEachTick(() -> {
            Optional<GlobalPos> claimed = villager.getBrain().getMemory(MemoryModuleType.HOME);
            if (!night[0] && claimed.isPresent() && claimed.get().pos().equals(helper.absolutePos(head))) {
                night[0] = true;
                command(server, "time set 13000");
            }
        });
        helper.succeedWhen(() -> {
            helper.assertTrue(night[0], "the villager did not claim the bed");
            helper.assertTrue(villager.isSleeping(), "the villager is not sleeping");
            helper.assertValueEqual(villager.getSleepingPos(), Optional.of(helper.absolutePos(head)), "sleeping position");
            helper.assertTrue(helper.getBlockState(head).getValue(BedBlock.OCCUPIED), "the bed is not occupied");
        });
    }

    static void command(MinecraftServer server, String command) {
        server.getCommands().performPrefixedCommand(server.createCommandSourceStack().withSuppressedOutput(), command);
    }
}
