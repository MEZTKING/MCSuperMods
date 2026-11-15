package dev.mcsupermods.runtime.gametest.spike3;

import com.google.common.collect.Lists;
import dev.mcsupermods.runtime.registry.MsmEntity;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.Unit;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
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
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.level.storage.loot.LootContext;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.parameters.LootContextParamSets;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.resources.ResourceKey;

/**
 * B469 spike (throwaway): a runtime {@code mob} body ({@link MsmEntity}, a {@link PathfinderMob}) implementing
 * {@link Merchant} the way ADR 0098 D1's {@code MobTrader} would: offers drawn per level from a trade set with vanilla's
 * {@code TradeSet}/{@code VillagerTrade} and the loot context {@code AbstractVillager.addOffersFromTradeSet} builds, XP,
 * levels with villagers' thresholds, restock, offers saved with {@code MerchantOffers.CODEC}.
 */
public class Spike3Trader extends MsmEntity implements Merchant {
    /** The trade sets by level (index 0 = level 1); set by the test before the first {@code getOffers}. */
    public static volatile List<ResourceKey<TradeSet>> nextTradeSets = List.of(Spike3Mod.tradeSet("trader/level_1"),
            Spike3Mod.tradeSet("trader/level_2"));
    public static final List<String> EVENTS = new CopyOnWriteArrayList<>();

    public List<ResourceKey<TradeSet>> tradeSets = nextTradeSets;
    private Player tradingPlayer;
    private MerchantOffers offers;
    private int xp;
    private int level = 1;
    public final List<String> dropped = new ArrayList<>();

    public Spike3Trader(EntityType<? extends PathfinderMob> type, Level level) {
        super(type, level);
    }

    public int traderLevel() {
        return level;
    }

    @Override
    protected InteractionResult mobInteract(Player player, InteractionHand hand) {
        InteractionResult first = super.mobInteract(player, hand);
        if (first.consumesAction()) {
            return first;
        }
        if (!isAlive() || isBaby() || tradingPlayer != null) {
            return InteractionResult.PASS;
        }
        if (!level().isClientSide()) {
            EVENTS.add("mobInteract server by " + player.getName().getString() + " hand " + hand);
            if (getOffers().isEmpty()) {
                return InteractionResult.CONSUME;
            }
            setTradingPlayer(player);
            openTradingScreen(player, getDisplayName(), level);
        } else {
            EVENTS.add("mobInteract client");
        }
        return InteractionResult.SUCCESS;
    }

    // Merchant

    @Override
    public void setTradingPlayer(Player player) {
        EVENTS.add("setTradingPlayer " + (player == null ? "null" : player.getName().getString()));
        tradingPlayer = player;
    }

    @Override
    public Player getTradingPlayer() {
        return tradingPlayer;
    }

    @Override
    public MerchantOffers getOffers() {
        if (level() instanceof ServerLevel server) {
            if (offers == null) {
                offers = new MerchantOffers();
                addOffers(server, 1);
            }
            return offers;
        }
        throw new IllegalStateException("Cannot load trader offers on the client");
    }

    private void addOffers(ServerLevel server, int forLevel) {
        if (forLevel - 1 < tradeSets.size()) {
            int n = addOffersFromTradeSet(server, this, offers, tradeSets.get(forLevel - 1), dropped);
            EVENTS.add("addOffers level " + forLevel + " -> " + n);
        }
    }

    /**
     * {@code AbstractVillager.addOffersFromTradeSet} for any entity: ORIGIN, THIS_ENTITY and
     * ADDITIONAL_COST_COMPONENT_ALLOWED in {@code LootContextParamSets.VILLAGER_TRADE}, random from the set's
     * {@code random_sequence}; trades whose {@code getOffer} returns null are skipped and recorded in {@code dropped}.
     */
    public static int addOffersFromTradeSet(ServerLevel server, Entity self, MerchantOffers out, ResourceKey<TradeSet> key,
            List<String> dropped) {
        Optional<TradeSet> found = server.registryAccess().lookupOrThrow(Registries.TRADE_SET).getOptional(key);
        if (found.isEmpty()) {
            dropped.add("missing trade set " + key.identifier());
            return -1;
        }
        TradeSet set = found.get();
        LootContext ctx = new LootContext.Builder(new LootParams.Builder(server)
                .withParameter(LootContextParams.ORIGIN, self.position())
                .withParameter(LootContextParams.THIS_ENTITY, self)
                .withParameter(LootContextParams.ADDITIONAL_COST_COMPONENT_ALLOWED, Unit.INSTANCE)
                .create(LootContextParamSets.VILLAGER_TRADE)).create(set.randomSequence());
        int wanted = set.calculateNumberOfTrades(ctx);
        List<Holder<VillagerTrade>> pool = Lists.newArrayList(set.trades());
        int added = 0;
        while (added < wanted && !pool.isEmpty()) {
            int i = ctx.getRandom().nextInt(pool.size());
            Holder<VillagerTrade> trade = set.allowDuplicates() ? pool.get(i) : pool.remove(i);
            MerchantOffer offer = trade.value().getOffer(ctx);
            if (offer == null) {
                dropped.add(trade.unwrapKey().map(k -> k.identifier().toString()).orElse("?") + " -> null");
                if (set.allowDuplicates()) {
                    pool.remove(i);
                }
            } else {
                out.add(offer);
                added++;
            }
        }
        return added;
    }

    @Override
    public void overrideOffers(MerchantOffers offers) {}

    @Override
    public void notifyTrade(MerchantOffer offer) {
        offer.increaseUses();
        ambientSoundTime = -getAmbientSoundInterval();
        xp += offer.getXp();
        EVENTS.add("notifyTrade " + offer.getResult() + " uses " + offer.getUses() + "/" + offer.getMaxUses() + " xp now " + xp);
        if (offer.shouldRewardExp() && level() instanceof ServerLevel server) {
            ExperienceOrb.award(server, position().add(0, 0.5, 0), 3 + random.nextInt(4));
        }
        boolean levelled = false;
        while (level < 5 && VillagerData.canLevelUp(level) && xp >= VillagerData.getMaxXpPerLevel(level)) {
            level++;
            levelled = true;
            if (level() instanceof ServerLevel server) {
                addOffers(server, level);
            }
            EVENTS.add("levelled up to " + level);
        }
        if (levelled) {
            resend();
        }
    }

    /** Sends the offers again to the trading player's open menu (as villagers do after a level-up or restock). */
    public void resend() {
        if (tradingPlayer instanceof ServerPlayer sp && sp.containerMenu instanceof MerchantMenu menu) {
            sp.sendMerchantOffers(menu.containerId, getOffers(), level, xp, showProgressBar(), canRestock());
            EVENTS.add("resent offers level " + level + " xp " + xp);
        }
    }

    public void restock() {
        for (MerchantOffer offer : getOffers()) {
            offer.resetUses();
        }
        EVENTS.add("restocked");
        resend();
    }

    @Override
    public void notifyTradeUpdated(ItemStack stack) {
        EVENTS.add("notifyTradeUpdated " + stack);
    }

    @Override
    public int getVillagerXp() {
        return xp;
    }

    @Override
    public void overrideXp(int xp) {}

    @Override
    public boolean showProgressBar() {
        return true;
    }

    @Override
    public SoundEvent getNotifyTradeSound() {
        return SoundEvents.VILLAGER_YES;
    }

    @Override
    public boolean canRestock() {
        return true;
    }

    @Override
    public boolean isClientSide() {
        return level().isClientSide();
    }

    @Override
    public boolean stillValid(Player player) {
        return tradingPlayer == player && isAlive() && distanceToSqr(player) < 64.0;
    }

    // Saving

    @Override
    protected void addAdditionalSaveData(ValueOutput output) {
        super.addAdditionalSaveData(output);
        output.storeNullable("Offers", MerchantOffers.CODEC, offers);
        output.putInt("Xp", xp);
        output.putInt("TraderLevel", level);
    }

    @Override
    protected void readAdditionalSaveData(ValueInput input) {
        super.readAdditionalSaveData(input);
        offers = input.read("Offers", MerchantOffers.CODEC).orElse(null);
        xp = input.getIntOr("Xp", 0);
        level = input.getIntOr("TraderLevel", 1);
    }
}
