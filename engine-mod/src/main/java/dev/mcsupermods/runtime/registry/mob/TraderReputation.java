package dev.mcsupermods.runtime.registry.mob;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.loader.TraderParser;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.minecraft.core.UUIDUtil;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.tags.TagKey;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * What a project trader remembers of each player (ADR 0107 D1 as amended after the B524 spike, {@code msm:trader}
 * {@code reputation}): our own per-trader, per-player standing, not vanilla's gossip, so it never spreads to other mobs
 * (limit N10). A standing has three parts, as vanilla's gossip types that B524 measured: what hits took ({@code hurt}
 * each, at most {@link #HURT_CAP}), what trades gave ({@code trade} each, at most {@link TraderParser.Reputation#TRADE_CAP})
 * and what gifts gave ({@code gift} each, at most {@link TraderParser.Reputation#GIFT_CAP}). The value is trades plus gifts
 * minus hits. Each clock day the hit part recovers {@code decay_per_day} and the trade part fades by
 * {@link TraderParser.Reputation#TRADE_DECAY_PER_DAY}; the gift part does not fade (as a cure's in vanilla). A standing at
 * zero is forgotten.
 *
 * <p>The value becomes each offer's special price when that player opens the menu ({@link #specialPrice}): minus the value
 * divided by {@code price_step}, rounded down, or, without {@code price_step}, minus the value times the offer's own
 * price multiplier (its {@code reputation_discount}), rounded down, which is vanilla's rule. Vanilla's menu then shows
 * {@code clamp(base + demand part + special, 1, stack size)}. The standings are saved with the mob under
 * {@code Reputation} and {@code ReputationDay}; removing {@code msm:trader} drops them, as it drops the levels.
 */
public final class TraderReputation {
    /** The most hits take, as vanilla's minor negative gossip (B524: maximum 200). */
    public static final int HURT_CAP = 200;
    /** Clock ticks in a day: hit and trade parts fade once a day. */
    public static final long DAY = 24000L;
    static final String SAVE = "Reputation";
    static final String SAVE_DAY = "ReputationDay";
    private static final long UNKNOWN = Long.MIN_VALUE;
    private static boolean listening;

    /** One player's standing: the three parts, each 0 or more. */
    public record Standing(int hurt, int trading, int gift) {
        static final Standing NONE = new Standing(0, 0, 0);

        /** Trades plus gifts minus hits. */
        public int value() {
            return trading + gift - hurt;
        }

        boolean empty() {
            return hurt == 0 && trading == 0 && gift == 0;
        }
    }

    private record Saved(UUID player, int hurt, int trading, int gift) {
        static final Codec<Saved> CODEC = RecordCodecBuilder.create(i -> i.group(
                UUIDUtil.CODEC.fieldOf("Player").forGetter(Saved::player),
                Codec.INT.optionalFieldOf("Hurt", 0).forGetter(Saved::hurt),
                Codec.INT.optionalFieldOf("Trading", 0).forGetter(Saved::trading),
                Codec.INT.optionalFieldOf("Gift", 0).forGetter(Saved::gift)).apply(i, Saved::new));
    }

    private static final Codec<List<Saved>> SAVED = Saved.CODEC.listOf();

    private final TraderParser.Reputation config;
    private final Optional<Identifier> giftId;
    private final Optional<TagKey<Item>> giftTag;
    private final Map<UUID, Standing> standings = new LinkedHashMap<>();
    private long day = UNKNOWN;

    TraderReputation(TraderParser.Reputation config) {
        this.config = config;
        String gift = config.giftItem().orElse(null);
        if (gift == null) {
            giftId = Optional.empty();
            giftTag = Optional.empty();
        } else if (gift.startsWith("#")) {
            giftId = Optional.empty();
            giftTag = Optional.of(TagKey.create(Registries.ITEM, Identifier.parse(gift.substring(1))));
        } else {
            giftId = Optional.of(Identifier.parse(gift));
            giftTag = Optional.empty();
        }
        listen();
    }

    /**
     * Hits by a player lower the standing of every project trader with {@code reputation}: Fabric's
     * {@code ServerLivingEntityEvents.AFTER_DAMAGE} (a hit that was not blocked; the attacker is the damage source's
     * entity, so a player's arrow counts). Registered once, when the first such trader is built, which is before it can be
     * hurt.
     */
    private static synchronized void listen() {
        if (listening) {
            return;
        }
        listening = true;
        ServerLivingEntityEvents.AFTER_DAMAGE.register((entity, source, baseDamage, damageTaken, blocked) -> {
            if (!blocked && entity instanceof MsmMob mob && source.getEntity() instanceof Player player && player != entity) {
                mob.driver().trader().hurtBy(player);
            }
        });
    }

    /** The definition's numbers. */
    public TraderParser.Reputation config() {
        return config;
    }

    /** The standing of {@code player}; all zero when the trader has none. */
    public Standing standing(UUID player) {
        return standings.getOrDefault(player, Standing.NONE);
    }

    /** The value of {@code player}: trades plus gifts minus hits. */
    public int value(UUID player) {
        return standing(player).value();
    }

    /** The players the trader remembers, for the GameTests. */
    public Map<UUID, Standing> standings() {
        return Map.copyOf(standings);
    }

    private void put(UUID player, Standing standing) {
        if (standing.empty()) {
            standings.remove(player);
        } else {
            standings.put(player, standing);
        }
    }

    /** A hit by {@code player}: the hit part grows by {@code hurt}, at most {@link #HURT_CAP}. */
    public void hurt(UUID player) {
        Standing s = standing(player);
        put(player, new Standing(Math.min(HURT_CAP, s.hurt() + config.hurt()), s.trading(), s.gift()));
    }

    /** A trade with {@code player}: the trade part grows by {@code trade}, at most the trade cap. */
    public void trade(UUID player) {
        Standing s = standing(player);
        put(player, new Standing(s.hurt(), Math.min(TraderParser.Reputation.TRADE_CAP, s.trading() + config.trade()), s.gift()));
    }

    /** Whether {@code stack} is the definition's gift item (never without {@code gift_item}). */
    public boolean isGift(ItemStack stack) {
        if (stack.isEmpty()) {
            return false;
        }
        if (giftId.isPresent()) {
            Optional<Item> item = BuiltInRegistries.ITEM.getOptional(giftId.get());
            return item.isPresent() && stack.is(item.get());
        }
        return giftTag.isPresent() && stack.is(giftTag.get());
    }

    /**
     * A gift from {@code player}: the gift part grows by {@code gift}, at most the gift cap. Returns false, changing
     * nothing, when the gift part is already at the cap or {@code gift} is 0.
     */
    public boolean gift(UUID player) {
        Standing s = standing(player);
        if (config.gift() <= 0 || s.gift() >= TraderParser.Reputation.GIFT_CAP) {
            return false;
        }
        put(player, new Standing(s.hurt(), s.trading(), Math.min(TraderParser.Reputation.GIFT_CAP, s.gift() + config.gift())));
        return true;
    }

    /**
     * Fades the standings when {@code clockTicks} is in a later clock day than the last check: per day passed, the hit
     * part recovers {@code decay_per_day} and the trade part fades by the trade decay. The first check, and a clock set
     * back, only remember the day. Returns whether anything faded.
     */
    public boolean decayIfDue(long clockTicks) {
        long now = Math.floorDiv(clockTicks, DAY);
        long last = day;
        day = now;
        if (last == UNKNOWN || now <= last || standings.isEmpty()) {
            return false;
        }
        long days = Math.min(now - last, 1000L);
        boolean changed = false;
        for (Map.Entry<UUID, Standing> e : new ArrayList<>(standings.entrySet())) {
            Standing s = e.getValue();
            int hurt = (int) Math.max(0L, s.hurt() - days * config.decayPerDay());
            int trading = (int) Math.max(0L, s.trading() - days * TraderParser.Reputation.TRADE_DECAY_PER_DAY);
            Standing faded = new Standing(hurt, trading, s.gift());
            if (!faded.equals(s)) {
                changed = true;
                put(e.getKey(), faded);
            }
        }
        return changed;
    }

    /**
     * The special price of {@code offer} for a standing of {@code value}: minus the value divided by {@code price_step},
     * rounded down, else minus the value times the offer's price multiplier, rounded down (vanilla's rule, B524).
     */
    public int specialPrice(int value, MerchantOffer offer) {
        return specialPrice(value, offer.getPriceMultiplier(), config.priceStep());
    }

    /** {@link #specialPrice(int, MerchantOffer)} for a multiplier and an optional step. */
    public static int specialPrice(int value, float priceMultiplier, Optional<Integer> priceStep) {
        if (priceStep.isPresent()) {
            return -Math.floorDiv(value, priceStep.get());
        }
        return -Mth.floor(value * priceMultiplier);
    }

    // Saving

    void save(ValueOutput output) {
        if (!standings.isEmpty()) {
            List<Saved> saved = new ArrayList<>();
            standings.forEach((player, s) -> saved.add(new Saved(player, s.hurt(), s.trading(), s.gift())));
            output.store(SAVE, SAVED, saved);
        }
        if (day != UNKNOWN) {
            output.putLong(SAVE_DAY, day);
        }
    }

    void load(ValueInput input) {
        standings.clear();
        for (Saved s : input.read(SAVE, SAVED).orElse(List.of())) {
            put(s.player(), new Standing(Math.clamp(s.hurt(), 0, HURT_CAP), Math.clamp(s.trading(), 0, TraderParser.Reputation.TRADE_CAP),
                    Math.clamp(s.gift(), 0, TraderParser.Reputation.GIFT_CAP)));
        }
        day = input.getLongOr(SAVE_DAY, UNKNOWN);
    }
}
