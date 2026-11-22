package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.goals.RestockAtWorkSiteGoal;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.loader.TraderParser;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.RandomSource;
import net.minecraft.util.Unit;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.npc.villager.VillagerData;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.MerchantMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.trading.Merchant;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;
import net.minecraft.world.item.trading.TradeSet;
import net.minecraft.world.item.trading.VillagerTrade;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.level.storage.loot.LootContext;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.parameters.LootContextParamSets;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;

/**
 * Trading (ADR 0098 D1, {@code msm:trader}) on every mob base. Every body is a {@link Merchant} through {@link MsmMob},
 * whose methods delegate here: vanilla's menu treats its merchant as an entity (a shift-click plays the trade sound at
 * it), so the module cannot be the merchant itself. A right click with an empty hand or an item nothing else used first
 * opens the menu ({@code Merchant.openTradingScreen} on the body); vanilla's menu does the paying, the result slot and
 * shift-click trading, and calls {@link #notifyTrade} for each trade. A mob without {@code msm:trader} has no offers.
 *
 * <p>Offers are drawn per level from the level's trade set with vanilla's rules ({@link TradeSet#calculateNumberOfTrades}
 * and {@link VillagerTrade#getOffer} in a {@code VILLAGER_TRADE} loot context with the origin, the mob as this entity
 * and additional costs allowed; B469), saved on the mob with their uses, the trading XP, the level and the last restock.
 * A trade uses the offer, gives the mob trading XP (with {@code levels}) and the player experience orbs (when the offer
 * rewards them), then fires {@code on_trade}; the trade sound plays when the result slot fills (at most once a second)
 * and, on a shift-click, from vanilla's menu. Enough XP raises the level at once and draws the next
 * level's offers; a level-up or restock sends the offers again to an open menu ({@code sendMerchantOffers}). Restocking
 * ({@code twice_a_day}) refills used offers once in each half of the day (clock ticks 0 to 11999 and 12000 to 23999),
 * checked every second while the AI runs and when the menu opens; {@code never} keeps them used up.
 *
 * <p>Babies, mobs with a target (angry), mobs that something rides, {@code monster} mobs at night and a mob already
 * trading with another player do not trade: the click passes on (to {@code msm:on_interact} or vanilla). Vanilla's
 * client shows the XP bar against villager thresholds, so with {@code xp_to_next} the XP sent to the screen is scaled
 * into the vanilla range of the level ({@link #getVillagerXp}); the real XP is {@link #xp()}.
 *
 * <p>Batch 2 of vanilla parity 3 (ADR 0107 D1 to D3 as amended after the B524 spike): with {@code reputation} the mob
 * remembers each player ({@link TraderReputation}): a hit lowers the standing, a trade and a gift of the gift item (a
 * plain use with it, before the menu; at the gift cap the click opens the menu instead) raise it, and every clock day it
 * fades. Each time a player opens the menu the special prices are worked out for that player, and they are reset when
 * the menu closes, so another player sees their own. With {@code demand} (the default) each restock first applies
 * vanilla's demand rule ({@code MerchantOffer.updateDemand} before {@code resetUses}), so heavily used offers cost more
 * until quieter restocks bring them down. With {@code work_site} a due restock only marks the offers as waiting
 * ({@link #restockPending}); the mob's {@link RestockAtWorkSiteGoal}, added on its first server AI step, walks to the
 * nearest such block within 16 blocks and restocks there.
 */
public final class MobTrader {
    /** Save keys (the vanilla villager's names where one exists). */
    static final String OFFERS = "Offers";
    static final String XP = "Xp";
    static final String LEVEL = "TraderLevel";
    static final String RESTOCK = "RestockHalfDay";
    static final String PENDING = "RestockPending";
    /** Clock ticks between two restock chances: two a day. */
    public static final long HALF_DAY = 12000L;
    private static final long UNKNOWN = Long.MIN_VALUE;
    /** Trade sets already warned about, by mob type and set, so a missing set logs once. */
    private static final Set<String> WARNED = ConcurrentHashMap.newKeySet();

    private final MsmMob mob;
    private final EntityDefinition definition;
    /** Null without {@code msm:trader}. */
    private final TraderParser.Trader trader;
    private Player tradingPlayer;
    private MerchantOffers offers;
    private int xp;
    private int level = 1;
    private long restockHalfDay = UNKNOWN;
    private int resends;
    private int restocks;
    private int lastTradeSound = -20;
    /** Null without {@code reputation}. */
    private final TraderReputation reputation;
    /** Whether a due restock waits for the work site ({@code work_site} only). */
    private boolean restockPending;
    private RestockAtWorkSiteGoal workSiteGoal;

    MobTrader(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
        this.trader = definition == null ? null : definition.components().trader().orElse(null);
        this.reputation = trader == null ? null : trader.reputation().map(TraderReputation::new).orElse(null);
    }

    /** Whether the mob has {@code msm:trader}. */
    public boolean enabled() {
        return trader != null;
    }

    /** The trading level, 1 to the number of levels. */
    public int traderLevel() {
        return level;
    }

    /** The trading XP counted from the start (0 without {@code levels}). */
    public int xp() {
        return xp;
    }

    /** How often the offers were sent again to an open menu (level-ups and restocks); for the GameTests. */
    public int resends() {
        return resends;
    }

    /** How often the offers were restocked; for the GameTests. */
    public int restocks() {
        return restocks;
    }

    /** The per-player memory ({@code reputation}), or empty without it. */
    public Optional<TraderReputation> reputation() {
        return Optional.ofNullable(reputation);
    }

    /** Whether a due restock waits for the mob to reach its work site ({@code work_site}). */
    public boolean restockPending() {
        return restockPending;
    }

    /** The work site goal once the first server AI step added it, or null; for the GameTests. */
    public RestockAtWorkSiteGoal workSiteGoal() {
        return workSiteGoal;
    }

    private PathfinderMob body() {
        return mob.asMob();
    }

    // Opening the menu

    /** The right-click hook of {@link MobDriver#mobInteract}; null passes the click on, as every module does. */
    InteractionResult mobInteract(Player player, InteractionHand hand) {
        if (trader == null) {
            return null;
        }
        PathfinderMob body = body();
        if (!(body.level() instanceof ServerLevel server)) {
            // The client cannot see targets, offers or the time of night; it only answers the arm swing.
            return body.isBaby() || body.isVehicle() ? null : InteractionResult.SUCCESS;
        }
        InteractionResult gift = takeGift(server, player, hand);
        if (gift != null) {
            return gift;
        }
        if (refusal(player, server.isDarkOutside()) != null) {
            return null;
        }
        long clock = clockTicks(server);
        restockIfDue(server, clock);
        decayIfDue(clock);
        if (getOffers().isEmpty()) {
            return null;
        }
        setTradingPlayer(player);
        applyPrices(player);
        mob.openTradingScreen(player, body.getDisplayName(), level);
        if (tradingPlayer == player && !(player.containerMenu instanceof MerchantMenu)) {
            tradingPlayer = null; // the menu did not open (a fake player without a connection)
        }
        return InteractionResult.SUCCESS;
    }

    /**
     * A gift of the {@code reputation} gift item: taken (one from the stack, none in creative) when the mob is alive, not
     * a baby, not angry and below the gift cap; the trade sound plays and happy particles rise. Null passes the click on
     * (it then opens the menu as any other item).
     */
    private InteractionResult takeGift(ServerLevel server, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (reputation == null || !reputation.isGift(stack)) {
            return null;
        }
        PathfinderMob body = body();
        if (!body.isAlive() || body.isBaby() || body.getTarget() != null || !reputation.gift(player.getUUID())) {
            return null;
        }
        stack.consume(1, player);
        body.playSound(getNotifyTradeSound(), 1.0f, body.getVoicePitch());
        server.sendParticles(ParticleTypes.HAPPY_VILLAGER, body.getX(), body.getY() + body.getBbHeight() + 0.3, body.getZ(), 5,
                0.3, 0.2, 0.3, 0.0);
        return InteractionResult.SUCCESS;
    }

    /** A hit by {@code player} ({@link TraderReputation}'s damage listener): the hit part of the standing grows. */
    void hurtBy(Player player) {
        if (reputation != null && body().level() instanceof ServerLevel) {
            reputation.hurt(player.getUUID());
        }
    }

    /**
     * Sets every offer's special price for {@code player}'s standing ({@code reputation}); nothing without it. Vanilla's
     * menu shows and charges the changed price; {@link #setTradingPlayer} resets it when the menu closes.
     */
    public void applyPrices(Player player) {
        if (reputation == null || offers == null || player == null) {
            return;
        }
        int value = reputation.value(player.getUUID());
        for (MerchantOffer offer : offers) {
            offer.setSpecialPriceDiff(reputation.specialPrice(value, offer));
        }
    }

    /** Fades the standings once per clock day ({@code reputation}); returns whether anything faded. */
    public boolean decayIfDue(long clockTicks) {
        return reputation != null && reputation.decayIfDue(clockTicks);
    }

    /**
     * Why the mob does not trade with {@code player} now, or null when it does (ADR 0098 D1): dead, a baby, angry (it
     * has a target), ridden, a {@code monster} at night, or trading with another player.
     */
    public String refusal(Player player, boolean night) {
        PathfinderMob body = body();
        if (!body.isAlive()) {
            return "dead";
        }
        if (body.isBaby()) {
            return "baby";
        }
        if (body.getTarget() != null) {
            return "angry";
        }
        if (body.isVehicle()) {
            return "ridden";
        }
        if (night && definition.base() == EntityDefinition.Base.MONSTER) {
            return "night";
        }
        if (tradingPlayer != null && tradingPlayer != player && stillValid(tradingPlayer)) {
            return "busy";
        }
        return null;
    }

    // Offers

    public MerchantOffers getOffers() {
        if (!(body().level() instanceof ServerLevel server)) {
            return new MerchantOffers(); // the client's menu has its own merchant
        }
        if (offers == null) {
            offers = new MerchantOffers();
            if (trader != null) {
                for (int l = 1; l <= level; l++) {
                    draw(server, l);
                }
            }
        }
        return offers;
    }

    private void draw(ServerLevel server, int forLevel) {
        if (forLevel > trader.tradeSets().size()) {
            return;
        }
        Identifier id = trader.tradeSets().get(forLevel - 1).tradeSet();
        ResourceKey<TradeSet> key = ResourceKey.create(Registries.TRADE_SET, id);
        Optional<TradeSet> set = server.registryAccess().lookupOrThrow(Registries.TRADE_SET).getOptional(key);
        if (set.isEmpty()) {
            Identifier type = BuiltInRegistries.ENTITY_TYPE.getKey(body().getType());
            if (WARNED.add(type + " " + id)) {
                MsmRuntime.LOGGER.warn("[{}] {}: msm:trader level {} names trade set {}, which is not loaded; that level has no offers",
                        MsmRuntime.MOD_ID, type, forLevel, id);
            }
            return;
        }
        drawOffers(server, body(), set.get(), offers, null);
    }

    /**
     * Adds the offers of one draw from {@code set} to {@code out}, as a villager's: the set's number of trades, picked at
     * random (without repeats unless the set allows duplicates); a trade whose {@code getOffer} gives nothing (its
     * {@code merchant_predicate} or item filter refuses) is skipped and its id added to {@code dropped} when given.
     * Returns the number added.
     */
    public static int drawOffers(ServerLevel server, Entity self, TradeSet set, MerchantOffers out, List<String> dropped) {
        LootContext context = new LootContext.Builder(new LootParams.Builder(server)
                .withParameter(LootContextParams.ORIGIN, self.position())
                .withParameter(LootContextParams.THIS_ENTITY, self)
                .withParameter(LootContextParams.ADDITIONAL_COST_COMPONENT_ALLOWED, Unit.INSTANCE)
                .create(LootContextParamSets.VILLAGER_TRADE)).create(set.randomSequence());
        int wanted = set.calculateNumberOfTrades(context);
        List<Holder<VillagerTrade>> pool = new ArrayList<>();
        set.trades().forEach(pool::add);
        RandomSource random = context.getRandom();
        int added = 0;
        while (added < wanted && !pool.isEmpty()) {
            int i = random.nextInt(pool.size());
            Holder<VillagerTrade> trade = pool.get(i);
            MerchantOffer offer = trade.value().getOffer(context);
            if (offer == null || !set.allowDuplicates()) {
                pool.remove(i);
            }
            if (offer == null) {
                if (dropped != null) {
                    dropped.add(trade.unwrapKey().map(k -> k.identifier().toString()).orElse("(inline trade)"));
                }
                continue;
            }
            out.add(offer);
            added++;
        }
        return added;
    }

    // Trading

    public void setTradingPlayer(Player player) {
        if (player == null && reputation != null && offers != null) {
            offers.forEach(MerchantOffer::resetSpecialPriceDiff); // as a villager when trading stops
        }
        tradingPlayer = player;
    }

    public Player getTradingPlayer() {
        return tradingPlayer;
    }

    public void overrideOffers(MerchantOffers offers) {}

    public void notifyTrade(MerchantOffer offer) {
        offer.increaseUses();
        PathfinderMob body = body();
        if (!(body.level() instanceof ServerLevel server) || trader == null) {
            return;
        }
        if (offer.shouldRewardExp()) {
            ExperienceOrb.award(server, body.position().add(0, 0.5, 0), 3 + body.getRandom().nextInt(4));
        }
        Player player = tradingPlayer;
        if (reputation != null && player != null) {
            reputation.trade(player.getUUID());
        }
        if (trader.levels()) {
            xp += offer.getXp();
            boolean levelled = false;
            while (level < trader.maxLevel() && xp >= threshold(level)) {
                level++;
                levelled = true;
                draw(server, level);
            }
            if (levelled) {
                applyPrices(player); // the new level's offers, at the prices of the menu's player
                resend();
            }
        }
        trader.onTrade().ifPresent(event -> EventRunner.fire(mob.definitionId(), definition.events(), event,
                EventContext.forEntity(server, body, player)));
    }

    /** Trading XP needed to leave {@code fromLevel}: the level's {@code xp_to_next}, else vanilla's threshold. */
    private int threshold(int fromLevel) {
        return trader.xpToLeave(fromLevel, VillagerData.getMaxXpPerLevel(fromLevel));
    }

    public void notifyTradeUpdated(ItemStack stack) {
        // The trade sound when the result slot fills, at most once a second (a shift-click gets the menu's own).
        PathfinderMob body = body();
        if (trader != null && !stack.isEmpty() && !body.level().isClientSide() && body.tickCount - lastTradeSound >= 20) {
            lastTradeSound = body.tickCount;
            body.playSound(getNotifyTradeSound(), 1.0f, body.getVoicePitch());
        }
    }

    /**
     * The XP the menu shows: the real XP scaled from this level's span into vanilla's span for the level (vanilla's
     * client draws the bar against villager thresholds), so the bar fills as the mob nears its own next level; a full
     * bar at the last level below 5. Equal to {@link #xp()} with vanilla's thresholds.
     */
    public int getVillagerXp() {
        if (trader == null || !trader.levels()) {
            return 0;
        }
        int vanillaMin = VillagerData.getMinXpPerLevel(level);
        int vanillaMax = VillagerData.getMaxXpPerLevel(level);
        if (level >= trader.maxLevel()) {
            return level >= VillagerData.MAX_VILLAGER_LEVEL ? xp : vanillaMax;
        }
        int min = level == 1 ? 0 : threshold(level - 1);
        int max = threshold(level);
        if (min == vanillaMin && max == vanillaMax) {
            return xp;
        }
        double part = max <= min ? 1.0 : Math.clamp((xp - min) / (double) (max - min), 0.0, 1.0);
        return vanillaMin + (int) Math.round(part * (vanillaMax - vanillaMin));
    }

    public void overrideXp(int xp) {}

    public boolean showProgressBar() {
        return trader != null && trader.levels();
    }

    public SoundEvent getNotifyTradeSound() {
        if (trader == null || trader.tradeSound().isEmpty()) {
            return SoundEvents.VILLAGER_YES;
        }
        return BuiltInRegistries.SOUND_EVENT.getOptional(trader.tradeSound().get()).orElse(SoundEvents.VILLAGER_YES);
    }

    public boolean canRestock() {
        return trader != null && trader.restock() == TraderParser.Restock.TWICE_A_DAY;
    }

    public boolean isClientSide() {
        return body().level().isClientSide();
    }

    public boolean stillValid(Player player) {
        PathfinderMob body = body();
        return tradingPlayer == player && body.isAlive() && !body.isRemoved() && body.distanceToSqr(player) <= 64.0;
    }

    /** Sends the offers again to the trading player's open menu, as villagers do after a level-up or restock. */
    private void resend() {
        if (tradingPlayer instanceof ServerPlayer player && player.containerMenu instanceof MerchantMenu menu
                && offers != null && menu.getOffers() == offers) {
            player.sendMerchantOffers(menu.containerId, offers, level, getVillagerXp(), showProgressBar(), canRestock());
            resends++;
        }
    }

    // Restocking

    /** The dimension's clock, or the Overworld's when its type names none (as {@code ScriptWorld.dayTime}, unwrapped). */
    public static long clockTicks(ServerLevel level) {
        return level.dimensionType().defaultClock().isPresent() ? level.getDefaultClockTime() : level.getOverworldClockTime();
    }

    /**
     * Refills used offers when {@code clockTicks} is in another half day than the last check ({@code twice_a_day});
     * the first check only remembers the half day. Returns whether the offers were refilled. With {@code work_site} a
     * due restock only marks the offers as waiting ({@link #restockPending}) and returns false: the work site goal
     * restocks.
     */
    public boolean restockIfDue(ServerLevel server, long clockTicks) {
        if (!canRestock()) {
            return false;
        }
        long halfDay = Math.floorDiv(clockTicks, HALF_DAY);
        if (restockHalfDay == halfDay) {
            return false;
        }
        boolean first = restockHalfDay == UNKNOWN;
        restockHalfDay = halfDay;
        if (first || offers == null || offers.stream().noneMatch(MerchantOffer::needsRestock)) {
            return false;
        }
        if (trader.workSite().isPresent()) {
            restockPending = true;
            return false;
        }
        restock();
        return true;
    }

    /** The work site goal reached the site: restocks the waiting offers. Returns whether it restocked. */
    public boolean restockAtWorkSite() {
        if (!restockPending) {
            return false;
        }
        restockPending = false;
        restock();
        return true;
    }

    /** Refills every offer, after vanilla's demand rule when {@code demand} is on (B524: demand first, then the uses). */
    private void restock() {
        for (MerchantOffer offer : offers) {
            if (trader.demand()) {
                offer.updateDemand();
            }
            offer.resetUses();
        }
        restocks++;
        resend();
    }

    /** After vanilla's {@code customServerAiStep}: a trading mob stands and looks at its customer; restocking. */
    void customServerAiStep(ServerLevel server) {
        if (trader == null) {
            return;
        }
        PathfinderMob body = body();
        if (tradingPlayer != null) {
            if (stillValid(tradingPlayer)) {
                body.getNavigation().stop();
                body.getLookControl().setLookAt(tradingPlayer, 30.0f, 30.0f);
            } else if (!(tradingPlayer.containerMenu instanceof MerchantMenu menu) || menu.getOffers() != offers) {
                tradingPlayer = null;
            }
        }
        if (workSiteGoal == null && trader.workSite().isPresent()) {
            // MobGoals runs inside the vanilla constructor; the goal joins on the first server AI step instead.
            workSiteGoal = new RestockAtWorkSiteGoal(body, this, trader.workSite().get());
            body.getGoalSelector().addGoal(MobTaming.afterFighting(definition.components()), workSiteGoal);
        }
        if (Math.floorMod(server.getGameTime() + body.getId(), 20L) == 0) {
            long clock = clockTicks(server);
            restockIfDue(server, clock);
            decayIfDue(clock);
        }
    }

    // Saving

    /** After vanilla's {@code addAdditionalSaveData}. */
    void addAdditionalSaveData(ValueOutput output) {
        if (trader == null) {
            return;
        }
        output.storeNullable(OFFERS, MerchantOffers.CODEC, offers);
        output.putInt(XP, xp);
        output.putInt(LEVEL, level);
        if (restockHalfDay != UNKNOWN) {
            output.putLong(RESTOCK, restockHalfDay);
        }
        if (restockPending) {
            output.putBoolean(PENDING, true);
        }
        if (reputation != null) {
            reputation.save(output);
        }
    }

    /** After vanilla's {@code readAdditionalSaveData}. */
    void readAdditionalSaveData(ValueInput input) {
        if (trader == null) {
            return;
        }
        offers = input.read(OFFERS, MerchantOffers.CODEC).orElse(null);
        if (offers != null) {
            offers.forEach(MerchantOffer::resetSpecialPriceDiff); // a mob saved while trading kept that player's prices
        }
        xp = Math.max(0, input.getIntOr(XP, 0));
        level = Math.clamp(input.getIntOr(LEVEL, 1), 1, trader.maxLevel());
        restockHalfDay = input.getLongOr(RESTOCK, UNKNOWN);
        restockPending = trader.workSite().isPresent() && input.getBooleanOr(PENDING, false);
        if (reputation != null) {
            reputation.load(input);
        }
    }
}
