package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.ID_OR_TAG;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.listOfLength;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * The {@code msm:trader} component of an entity definition (ADR 0098 D1, {@code ::msm::component::Trader}): closed
 * throughout, as the other mob components, so an unknown key ({@code gossip}), a level without {@code trade_set}, a
 * level written as a bare id, no level or more than five, an {@code xp_to_next} below 1 or an unknown {@code restock} is
 * an error naming the field and the component is not applied. Pure: {@code EntityComponents} decodes it with
 * {@link Trader#CODEC}; whether the trade sets exist is only known on a running server ({@code MobTrader} warns once).
 * Since ADR 0107 D1 to D3 (B527's format) {@code reputation}, {@code demand} and {@code work_site} are fields too
 * ({@link Reputation}); B528 acts on them.
 */
public final class TraderParser {
    private TraderParser() {}

    /** {@code TraderRestock}: when used-up offers refill. */
    public enum Restock {
        /** Twice a day at the mob, with no workstation. */
        TWICE_A_DAY,
        /** Never. */
        NEVER;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<Restock> CODEC = MsmCodecs.named("restock", values(), Restock::serialName);
    }

    /**
     * {@code TradeLevel}: one trading level.
     *
     * @param tradeSet the trade set its offers are drawn from (the project's or vanilla's)
     * @param xpToNext trading XP needed for the next level, counted from the start; empty means vanilla's threshold
     */
    public record TradeLevel(Identifier tradeSet, Optional<Integer> xpToNext) {
        public static final List<String> KEYS = List.of("trade_set", "xp_to_next");

        public static final Codec<TradeLevel> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("trade_set", ID).forGetter(TradeLevel::tradeSet),
                optional("xp_to_next", intAtLeast(1)).forGetter(TradeLevel::xpToNext)).apply(i, TradeLevel::new)), KEYS);
    }

    /**
     * {@code TraderReputation} (ADR 0107 D1 as amended after the spike): a per-player value saved with the mob. Closed.
     * Defaults are vanilla's numbers as B524 measured them: a hit takes 25 ({@code hurt}, 0 to 100), a trade adds 2
     * ({@code trade}, 0 to 25; trading adds up to 25 at most), a gift adds 25 ({@code gift}, 0 to 100; gifts add up to 25
     * at most), a value below 0 recovers 20 a day ({@code decay_per_day}, 0 to 100; trading value fades by 2 a day).
     * {@code price_step} (1 to 1000) is the value that changes a price by one item; empty means 1 divided by each
     * offer's own price multiplier. The special price is minus the value divided by the step, rounded down.
     *
     * @param giftItem an item id or {@code #}-prefixed item tag; empty means no gifts
     */
    public record Reputation(int hurt, int trade, Optional<String> giftItem, int gift, int decayPerDay, Optional<Integer> priceStep) {
        public static final List<String> KEYS = List.of("hurt", "trade", "gift_item", "gift", "decay_per_day", "price_step");
        public static final int DEFAULT_HURT = 25;
        public static final int DEFAULT_TRADE = 2;
        public static final int DEFAULT_GIFT = 25;
        public static final int DEFAULT_DECAY_PER_DAY = 20;
        /** The most trading adds, and the most gifts add (vanilla's caps, B524). */
        public static final int TRADE_CAP = 25;
        public static final int GIFT_CAP = 25;
        /** How far trading value fades each day (vanilla's, B524). */
        public static final int TRADE_DECAY_PER_DAY = 2;

        public static final Codec<Reputation> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                MsmCodecs.optional("hurt", intRange(0, 100), DEFAULT_HURT).forGetter(Reputation::hurt),
                MsmCodecs.optional("trade", intRange(0, 25), DEFAULT_TRADE).forGetter(Reputation::trade),
                optional("gift_item", ID_OR_TAG).forGetter(Reputation::giftItem),
                MsmCodecs.optional("gift", intRange(0, 100), DEFAULT_GIFT).forGetter(Reputation::gift),
                MsmCodecs.optional("decay_per_day", intRange(0, 100), DEFAULT_DECAY_PER_DAY).forGetter(Reputation::decayPerDay),
                optional("price_step", intRange(1, 1000)).forGetter(Reputation::priceStep)).apply(i, Reputation::new)), KEYS);
    }

    /**
     * {@code Trader}.
     *
     * @param tradeSets  one to five levels, level 1 first
     * @param levels     whether trading gives XP and unlocks the next level (default true); without it only level 1 is used
     * @param restock    when offers refill (default twice a day)
     * @param tradeSound played at the mob after each trade; empty means {@code minecraft:entity.villager.yes}
     * @param onTrade    an event of the definition fired after each trade (self the mob, other the player)
     * @param reputation the per-player memory (ADR 0107 D1); empty means none
     * @param demand     whether vanilla's demand rule applies to each offer (ADR 0107 D2; default true)
     * @param workSite   a block id or {@code #}-prefixed block tag the mob restocks at (ADR 0107 D3); empty means in place
     */
    public record Trader(List<TradeLevel> tradeSets, boolean levels, Restock restock, Optional<Identifier> tradeSound,
            Optional<Identifier> onTrade, Optional<Reputation> reputation, boolean demand, Optional<String> workSite) {
        public static final List<String> KEYS = List.of("trade_sets", "levels", "restock", "trade_sound", "on_trade", "reputation",
                "demand", "work_site");
        /** How far the mob looks for its work site, and how near it restocks (ADR 0107 D3 as amended, B524). */
        public static final int WORK_SITE_RANGE = 16;
        public static final int WORK_SITE_REACH = 2;

        public static final Codec<Trader> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("trade_sets", listOfLength(TradeLevel.CODEC, 1, 5)).forGetter(Trader::tradeSets),
                optional("levels", Codec.BOOL, true).forGetter(Trader::levels),
                optional("restock", Restock.CODEC, Restock.TWICE_A_DAY).forGetter(Trader::restock),
                optional("trade_sound", ID).forGetter(Trader::tradeSound),
                optional("on_trade", ID).forGetter(Trader::onTrade),
                optional("reputation", Reputation.CODEC).forGetter(Trader::reputation),
                optional("demand", Codec.BOOL, true).forGetter(Trader::demand),
                optional("work_site", ID_OR_TAG).forGetter(Trader::workSite)).apply(i, Trader::new)), KEYS);

        /** The highest level the mob can reach: the number of levels, or 1 without {@code levels}. */
        public int maxLevel() {
            return levels ? tradeSets.size() : 1;
        }

        /**
         * Trading XP needed to leave {@code level} (1-based), counted from the start: the level's {@code xp_to_next}, else
         * {@code vanillaThreshold}.
         */
        public int xpToLeave(int level, int vanillaThreshold) {
            return tradeSets.get(level - 1).xpToNext().orElse(vanillaThreshold);
        }
    }
}
