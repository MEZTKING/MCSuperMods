package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.MsmAnimal;
import dev.mcsupermods.runtime.registry.MsmMob;
import dev.mcsupermods.runtime.registry.mob.MobTrader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.ProblemReporter;
import net.minecraft.util.Unit;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.npc.villager.Villager;
import net.minecraft.world.flag.FeatureFlags;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.MerchantMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;
import net.minecraft.world.item.trading.TradeSet;
import net.minecraft.world.item.trading.VillagerTrade;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.level.storage.loot.LootContext;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.parameters.LootContextParamSets;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Trader mobs (ADR 0098 D1, B474) on {@code trader_basic} (a {@code mob} body, two levels of {@code msm_test:tr_stall}:
 * dirt for an emerald with 2 uses and 10 XP and an emerald for apples at level 1, a diamond at level 2; a trade sound and
 * {@code on_trade}), {@code trader_flat} ({@code animal}, no levels, never restocks), {@code trader_scaled}
 * ({@code xp_to_next} 20 and 40) and {@code trader_brute} ({@code monster}). Clicks go through
 * {@code Player.interactOn} and the menu's own {@code clicked}, the paths a right click and a shift-click on the result
 * take on the server.
 */
public class MsmTraderGameTest {
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

    private static void use(ServerPlayer player, Entity mob) {
        player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        player.interactOn(mob, InteractionHand.MAIN_HAND, Vec3.ZERO);
    }

    private static MerchantMenu open(GameTestHelper helper, ServerPlayer player, PathfinderMob mob) {
        use(player, mob);
        if (!(player.containerMenu instanceof MerchantMenu menu)) {
            throw helper.assertionException("no merchant menu opened: " + player.containerMenu.getClass().getSimpleName());
        }
        return menu;
    }

    private static int index(MerchantOffers offers, net.minecraft.world.item.Item cost) {
        for (int i = 0; i < offers.size(); i++) {
            if (offers.get(i).getCostA().is(cost)) {
                return i;
            }
        }
        return -1;
    }

    /** Selects the offer paid with {@code cost}, puts {@code count} of it in the first payment slot and shift-clicks the result. */
    private static MerchantOffer shiftClickTrade(GameTestHelper helper, ServerPlayer player, MerchantMenu menu,
            net.minecraft.world.item.Item cost, int count) {
        int i = index(menu.getOffers(), cost);
        helper.assertTrue(i >= 0, "no offer paid with " + cost + " in " + describe(menu.getOffers()));
        menu.setSelectionHint(i);
        menu.getSlot(0).set(new ItemStack(cost, count));
        menu.slotsChanged(menu.getSlot(0).container);
        menu.clicked(2, 0, ContainerInput.QUICK_MOVE, player);
        return menu.getOffers().get(i);
    }

    private static List<String> describe(MerchantOffers offers) {
        List<String> out = new ArrayList<>();
        for (MerchantOffer o : offers) {
            out.add(o.getCostA().getCount() + " " + BuiltInRegistries.ITEM.getKey(o.getCostA().getItem()) + " -> "
                    + o.getResult().getCount() + " " + BuiltInRegistries.ITEM.getKey(o.getResult().getItem()) + " uses " + o.getUses()
                    + "/" + o.getMaxUses());
        }
        return out;
    }

    private static int orbsNear(GameTestHelper helper, Entity mob) {
        return helper.getLevel().getEntitiesOfClass(ExperienceOrb.class, new AABB(mob.blockPosition()).inflate(3)).size();
    }

    /** Records the events fired with {@code entity} as self; other tests run at the same time. */
    private static final class Recorder implements EventListener, AutoCloseable {
        final List<String> events = Collections.synchronizedList(new ArrayList<>());
        final List<EventContext> contexts = Collections.synchronizedList(new ArrayList<>());
        private final Object entity;

        Recorder(Object entity) {
            this.entity = entity;
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (ctx.entity() == entity) {
                events.add(event.getPath());
                contexts.add(ctx);
            }
        }

        @Override
        public void close() {
            EventRunner.removeListener(this);
        }
    }

    @GameTest
    public void usingTheMobOpensTheMerchantMenuWithLevelOneOffers(GameTestHelper helper) {
        PathfinderMob mob = helper.spawnWithNoFreeWill(type("trader_basic"), MID);
        MobTrader trader = trader(mob);
        ServerPlayer player = player(helper, MID.east());
        try {
            helper.assertTrue(trader.enabled(), "trader_basic has no msm:trader");
            MerchantMenu menu = open(helper, player, mob);
            helper.assertTrue(trader.getTradingPlayer() == player, "the trading player is not the clicker");
            helper.assertValueEqual(describe(menu.getOffers()).stream().sorted().toList(),
                    List.of("1 minecraft:dirt -> 1 minecraft:emerald uses 0/2", "1 minecraft:emerald -> 3 minecraft:apple uses 0/4"),
                    "level 1 offers");
            helper.assertValueEqual(trader.traderLevel(), 1, "level");
            helper.assertTrue(trader.showProgressBar() && trader.canRestock(), "levels and restocking default on");
            helper.assertValueEqual(BuiltInRegistries.SOUND_EVENT.getKey(trader.getNotifyTradeSound()),
                    Identifier.withDefaultNamespace("entity.wandering_trader.yes"), "trade_sound");
            helper.assertTrue(menu.stillValid(player), "the menu is not valid while the player stands by");
            player.closeContainer();
            helper.assertTrue(trader.getTradingPlayer() == null, "closing the menu left a trading player");
            player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.STICK));
            player.interactOn(mob, InteractionHand.MAIN_HAND, Vec3.ZERO);
            helper.assertTrue(player.containerMenu instanceof MerchantMenu, "an item that does nothing else did not open the menu");
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    @GameTest
    public void aShiftClickTradePaysRewardsXpLevelsUpAndFiresOnTrade(GameTestHelper helper) {
        PathfinderMob mob = helper.spawnWithNoFreeWill(type("trader_basic"), MID);
        MobTrader trader = trader(mob);
        ServerPlayer player = player(helper, MID.east());
        try (Recorder r = new Recorder(mob)) {
            MerchantMenu menu = open(helper, player, mob);
            MerchantOffer dirt = shiftClickTrade(helper, player, menu, Items.DIRT, 5);
            // Shift-click trades until the offer is used up (2 uses), as vanilla's menu does for villagers.
            helper.assertValueEqual(dirt.getUses(), 2, "uses after one shift-click: " + describe(menu.getOffers()));
            helper.assertTrue(dirt.isOutOfStock(), "the dirt offer is not used up");
            helper.assertValueEqual(player.getInventory().countItem(Items.EMERALD), 2, "emeralds paid out");
            helper.assertValueEqual(menu.getSlot(0).getItem().getCount(), 3, "dirt left in the payment slot");
            helper.assertValueEqual(trader.xp(), 20, "trading XP (10 a trade)");
            helper.assertValueEqual(trader.traderLevel(), 2, "level after 10 XP (vanilla's first threshold)");
            helper.assertTrue(describe(trader.getOffers()).contains("2 minecraft:emerald -> 1 minecraft:diamond uses 0/3"),
                    "level 2 drew no diamond offer: " + describe(trader.getOffers()));
            helper.assertValueEqual(trader.getOffers().size(), 3, "offers after level 2");
            helper.assertValueEqual(trader.resends(), 1, "offers sent again to the open menu after the level-up");
            helper.assertTrue(orbsNear(helper, mob) > 0, "no experience orbs for the player");
            helper.assertValueEqual(r.events, List.of("tr_traded", "tr_traded"), "on_trade per trade");
            helper.assertTrue(r.contexts.getFirst().player() == player, "on_trade: the player is not other");
            menu.getSlot(0).set(ItemStack.EMPTY);
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    @GameTest
    public void offersRestockTwiceADayAndNeverWhenTold(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        PathfinderMob mob = helper.spawnWithNoFreeWill(type("trader_basic"), MID);
        PathfinderMob flatMob = helper.spawnWithNoFreeWill(type("trader_flat"), MID.east(2));
        MobTrader trader = trader(mob);
        MobTrader flat = trader(flatMob);
        ServerPlayer player = player(helper, MID.south());
        try {
            MerchantMenu menu = open(helper, player, mob); // remembers this half day
            MerchantOffer dirt = shiftClickTrade(helper, player, menu, Items.DIRT, 2);
            helper.assertTrue(dirt.isOutOfStock(), "dirt not used up");
            long half = Math.floorDiv(MobTrader.clockTicks(level), MobTrader.HALF_DAY);
            int resends = trader.resends();
            helper.assertFalse(trader.restockIfDue(level, half * MobTrader.HALF_DAY + 11999), "restocked within the same half day");
            helper.assertTrue(trader.restockIfDue(level, (half + 1) * MobTrader.HALF_DAY), "no restock in the next half day");
            helper.assertValueEqual(dirt.getUses(), 0, "uses after the first restock");
            helper.assertValueEqual(trader.resends(), resends + 1, "the open menu was not sent the restocked offers");
            menu.getSlot(0).set(new ItemStack(Items.DIRT, 1));
            menu.slotsChanged(menu.getSlot(0).container);
            menu.clicked(2, 0, ContainerInput.QUICK_MOVE, player);
            helper.assertValueEqual(dirt.getUses(), 1, "a trade after the restock");
            helper.assertFalse(trader.restockIfDue(level, (half + 1) * MobTrader.HALF_DAY + 600), "a second restock in one half day");
            helper.assertTrue(trader.restockIfDue(level, (half + 2) * MobTrader.HALF_DAY), "no second restock in the day");
            helper.assertValueEqual(trader.restocks(), 2, "restocks in a day");
            helper.assertValueEqual(dirt.getUses(), 0, "uses after the second restock");
            player.closeContainer();

            helper.assertFalse(flat.canRestock(), "restock never still says it restocks");
            MerchantMenu flatMenu = open(helper, player, flatMob);
            MerchantOffer flatDirt = shiftClickTrade(helper, player, flatMenu, Items.DIRT, 2);
            helper.assertTrue(flatDirt.isOutOfStock(), "flat dirt not used up");
            for (int h = 1; h <= 4; h++) {
                helper.assertFalse(flat.restockIfDue(level, (half + h) * MobTrader.HALF_DAY), "restock never restocked");
            }
            helper.assertTrue(flatDirt.isOutOfStock(), "restock never refilled the offer");
            flatMenu.getSlot(0).set(ItemStack.EMPTY);
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    @GameTest
    public void offersXpLevelAndRestockAreSavedWithTheMob(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        PathfinderMob mob = helper.spawnWithNoFreeWill(type("trader_basic"), MID);
        ServerPlayer player = player(helper, MID.east());
        try {
            MerchantMenu menu = open(helper, player, mob);
            shiftClickTrade(helper, player, menu, Items.DIRT, 1);
            menu.getSlot(0).set(ItemStack.EMPTY);
            player.closeContainer();
            List<String> before = describe(trader(mob).getOffers());

            TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, level.registryAccess());
            mob.saveWithoutId(out);
            CompoundTag tag = out.buildResult();
            helper.assertTrue(tag.contains("Offers") && tag.contains("Xp") && tag.contains("TraderLevel") && tag.contains("RestockHalfDay"),
                    "save keys: " + tag.keySet());
            PathfinderMob copy = type("trader_basic").create(level, EntitySpawnReason.LOAD);
            helper.assertTrue(copy != null, "no copy");
            copy.load(TagValueInput.create(ProblemReporter.DISCARDING, level.registryAccess(), tag));
            MobTrader loaded = trader(copy);
            helper.assertValueEqual(loaded.traderLevel(), 2, "level after loading");
            helper.assertValueEqual(loaded.xp(), 10, "XP after loading");
            helper.assertValueEqual(describe(loaded.getOffers()), before, "offers and their uses after loading");
            long half = Math.floorDiv(MobTrader.clockTicks(level), MobTrader.HALF_DAY);
            helper.assertFalse(loaded.restockIfDue(level, half * MobTrader.HALF_DAY), "the saved half day was forgotten");
            helper.assertTrue(loaded.restockIfDue(level, (half + 1) * MobTrader.HALF_DAY), "a loaded trader does not restock");

            PathfinderMob plain = helper.spawnWithNoFreeWill(type("rd_horse"), MID.south(2));
            TagValueOutput plainOut = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, level.registryAccess());
            plain.saveWithoutId(plainOut);
            helper.assertFalse(plainOut.buildResult().contains("TraderLevel"), "a mob without msm:trader saved trader data");
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    @GameTest
    public void babiesAngryRiddenBusyAndNightMonstersDoNotTrade(GameTestHelper helper) {
        ServerPlayer player = player(helper, MID.east());
        ServerPlayer other = player(helper, MID.west());
        try {
            MsmAnimal baby = helper.spawnWithNoFreeWill(type("trader_flat"), MID.south(2));
            baby.setBaby(true);
            use(player, baby);
            helper.assertFalse(player.containerMenu instanceof MerchantMenu, "a baby traded");
            helper.assertValueEqual(trader(baby).refusal(player, false), "baby", "baby refusal");

            PathfinderMob angry = helper.spawnWithNoFreeWill(type("trader_basic"), MID.north(2));
            // A chicken: a player is no valid target on a peaceful GameTest world, so getTarget() would not keep it.
            angry.setTarget(helper.spawnWithNoFreeWill(EntityTypes.CHICKEN, MID.north(3)));
            helper.assertTrue(angry.getTarget() != null, "the target did not stick");
            use(player, angry);
            helper.assertFalse(player.containerMenu instanceof MerchantMenu, "an angry mob traded");
            helper.assertValueEqual(trader(angry).refusal(player, false), "angry", "angry refusal");
            angry.setTarget(null);

            PathfinderMob ridden = helper.spawnWithNoFreeWill(type("trader_basic"), MID.east(3));
            Entity rider = helper.spawnWithNoFreeWill(EntityTypes.CHICKEN, MID.east(3));
            helper.assertTrue(rider.startRiding(ridden, true, true), "the chicken did not mount");
            use(player, ridden);
            helper.assertFalse(player.containerMenu instanceof MerchantMenu, "a ridden mob traded");
            helper.assertValueEqual(trader(ridden).refusal(player, false), "ridden", "ridden refusal");

            PathfinderMob busy = helper.spawnWithNoFreeWill(type("trader_basic"), MID);
            open(helper, player, busy);
            use(other, busy);
            helper.assertFalse(other.containerMenu instanceof MerchantMenu, "a second player traded at once");
            helper.assertValueEqual(trader(busy).refusal(other, false), "busy", "busy refusal");
            player.closeContainer();
            helper.assertTrue(trader(busy).refusal(other, false) == null, "still busy after the first player left");

            PathfinderMob brute = helper.spawnWithNoFreeWill(type("trader_brute"), MID.west(3));
            helper.assertValueEqual(trader(brute).refusal(player, true), "night", "a monster trades at night");
            helper.assertTrue(trader(brute).refusal(player, false) == null, "a monster refuses by day");
            helper.assertTrue(trader(busy).refusal(other, true) == null, "a plain mob refuses at night");
            use(player, brute);
            helper.assertValueEqual(player.containerMenu instanceof MerchantMenu, !helper.getLevel().isDarkOutside(),
                    "a monster trades by day and not at night (dark outside: " + helper.getLevel().isDarkOutside() + ")");
        } finally {
            leave(helper, player, other);
        }
        helper.succeed();
    }

    @GameTest
    public void withoutLevelsAndWithOwnThresholds(GameTestHelper helper) {
        PathfinderMob flatMob = helper.spawnWithNoFreeWill(type("trader_flat"), MID);
        PathfinderMob scaledMob = helper.spawnWithNoFreeWill(type("trader_scaled"), MID.east(2));
        MobTrader flat = trader(flatMob);
        MobTrader scaled = trader(scaledMob);
        ServerPlayer player = player(helper, MID.south());
        try {
            MerchantMenu menu = open(helper, player, flatMob);
            helper.assertFalse(flat.showProgressBar(), "no XP bar without levels");
            shiftClickTrade(helper, player, menu, Items.DIRT, 2);
            helper.assertValueEqual(flat.traderLevel(), 1, "a trader without levels levelled up");
            helper.assertValueEqual(flat.xp(), 0, "a trader without levels counts XP");
            helper.assertValueEqual(flat.getOffers().size(), 2, "level 2's set was drawn without levels");
            helper.assertValueEqual(BuiltInRegistries.SOUND_EVENT.getKey(flat.getNotifyTradeSound()),
                    Identifier.withDefaultNamespace("entity.villager.yes"), "the default trade sound");
            menu.getSlot(0).set(ItemStack.EMPTY);
            player.closeContainer();

            MerchantMenu scaledMenu = open(helper, player, scaledMob);
            int dirt = index(scaledMenu.getOffers(), Items.DIRT);
            scaledMenu.setSelectionHint(dirt);
            scaledMenu.getSlot(0).set(new ItemStack(Items.DIRT, 1));
            scaledMenu.slotsChanged(scaledMenu.getSlot(0).container);
            scaledMenu.clicked(2, 0, ContainerInput.QUICK_MOVE, player);
            helper.assertValueEqual(scaled.xp(), 10, "XP after one trade");
            helper.assertValueEqual(scaled.traderLevel(), 1, "levelled up before xp_to_next 20");
            helper.assertValueEqual(scaled.getVillagerXp(), 5, "half way to 20 shows half of vanilla's 0..10");
            shiftClickTrade(helper, player, scaledMenu, Items.DIRT, 1);
            helper.assertValueEqual(scaled.traderLevel(), 2, "no level 2 at xp_to_next 20");
            helper.assertValueEqual(scaled.getVillagerXp(), 10, "the start of level 2 shows vanilla's 10");
            scaledMenu.getSlot(0).set(ItemStack.EMPTY);
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    @GameTest
    public void vanillaTradeSetsGiveOffers(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        PathfinderMob mob = helper.spawnWithNoFreeWill(type("trader_basic"), MID);
        for (String set : List.of("farmer/level_1", "librarian/level_1", "fletcher/level_5", "wandering_trader/common")) {
            MerchantOffers out = new MerchantOffers();
            List<String> dropped = new ArrayList<>();
            int added = MobTrader.drawOffers(level, mob, tradeSet(level, Identifier.withDefaultNamespace(set)), out, dropped);
            helper.assertTrue(added > 0 && added == out.size(), "minecraft:" + set + " gave a project trader no offers: dropped " + dropped);
        }
        helper.succeed();
    }

    private static TradeSet tradeSet(ServerLevel level, Identifier id) {
        return level.registryAccess().lookupOrThrow(Registries.TRADE_SET).getOptional(ResourceKey.create(Registries.TRADE_SET, id))
                .orElseThrow(() -> new IllegalStateException("no trade set " + id));
    }

    /**
     * The B469 spike drew no offers for a project mob from {@code minecraft:armorer/level_5} although none of the base
     * game's armourer trades is villager-only (B473's facts). The cause: Fabric's GameTest server enables every
     * experiment, and the {@code trade_rebalance} data pack replaces the tag {@code #minecraft:armorer/level_5} with
     * trades that each name villager types in a {@code merchant_predicate}. Without the experiment the set's own trades
     * give a project mob offers.
     */
    @GameTest
    public void armourerLevelFiveComesFromTheTradeRebalanceExperiment(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        PathfinderMob mob = helper.spawnWithNoFreeWill(type("trader_basic"), MID);
        Villager villager = helper.spawnWithNoFreeWill(EntityTypes.VILLAGER, MID.east(2));
        boolean rebalance = server.getWorldData().enabledFeatures().contains(FeatureFlags.TRADE_REBALANCE);
        List<String> packs = List.copyOf(server.getPackRepository().getSelectedIds());
        TradeSet armourer = tradeSet(level, Identifier.withDefaultNamespace("armorer/level_5"));
        List<String> trades = new ArrayList<>();
        armourer.trades().forEach(h -> trades.add(h.unwrapKey().map(k -> k.identifier().getPath()).orElse("?")));
        MsmRuntime.LOGGER.info("[msm_runtime] trader: trade_rebalance {} packs {} armorer/level_5 trades {}", rebalance, packs, trades);

        List<String> dropped = new ArrayList<>();
        int forMob = MobTrader.drawOffers(level, mob, armourer, new MerchantOffers(), dropped);
        int forVillager = MobTrader.drawOffers(level, villager, armourer, new MerchantOffers(), new ArrayList<>());
        String base = "armorer/5/emerald_enchanted_diamond_helmet";
        if (rebalance) {
            helper.assertTrue(packs.stream().anyMatch(p -> p.contains("trade_rebalance")), "the experiment is on but its pack is not selected: " + packs);
            helper.assertFalse(trades.contains(base), "the rebalance pack kept the base game's armourer trades: " + trades);
            helper.assertValueEqual(forMob, 0, "a project mob drew rebalanced armourer offers (dropped " + dropped + ")");
            helper.assertTrue(forVillager > 0, "a villager drew no rebalanced armourer offers");
        } else {
            helper.assertTrue(trades.contains(base), "the base game's armourer trades are missing: " + trades);
            helper.assertTrue(forMob > 0, "without the experiment a project mob drew no armourer offers (dropped " + dropped + ")");
        }
        // The base game's own level 5 trade, which the rebalance pack only takes out of the tag, gives a project mob an offer.
        Optional<Holder.Reference<VillagerTrade>> helmet = level.registryAccess().lookupOrThrow(Registries.VILLAGER_TRADE)
                .get(ResourceKey.create(Registries.VILLAGER_TRADE, Identifier.withDefaultNamespace(base)));
        helper.assertTrue(helmet.isPresent(), "no trade minecraft:" + base);
        LootContext context = new LootContext.Builder(new LootParams.Builder(level)
                .withParameter(LootContextParams.ORIGIN, mob.position())
                .withParameter(LootContextParams.THIS_ENTITY, mob)
                .withParameter(LootContextParams.ADDITIONAL_COST_COMPONENT_ALLOWED, Unit.INSTANCE)
                .create(LootContextParamSets.VILLAGER_TRADE)).create(Optional.empty());
        int offers = 0;
        for (int i = 0; i < 8; i++) {
            if (helmet.get().value().getOffer(context) != null) {
                offers++;
            }
        }
        helper.assertTrue(offers > 0, "minecraft:" + base + " gave a project mob no offer in 8 draws");
        helper.succeed();
    }
}
