package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
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
     * {@code Trader}.
     *
     * @param tradeSets  one to five levels, level 1 first
     * @param levels     whether trading gives XP and unlocks the next level (default true); without it only level 1 is used
     * @param restock    when offers refill (default twice a day)
     * @param tradeSound played at the mob after each trade; empty means {@code minecraft:entity.villager.yes}
     * @param onTrade    an event of the definition fired after each trade (self the mob, other the player)
     */
    public record Trader(List<TradeLevel> tradeSets, boolean levels, Restock restock, Optional<Identifier> tradeSound,
            Optional<Identifier> onTrade) {
        public static final List<String> KEYS = List.of("trade_sets", "levels", "restock", "trade_sound", "on_trade");

        public static final Codec<Trader> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("trade_sets", listOfLength(TradeLevel.CODEC, 1, 5)).forGetter(Trader::tradeSets),
                optional("levels", Codec.BOOL, true).forGetter(Trader::levels),
                optional("restock", Restock.CODEC, Restock.TWICE_A_DAY).forGetter(Trader::restock),
                optional("trade_sound", ID).forGetter(Trader::tradeSound),
                optional("on_trade", ID).forGetter(Trader::onTrade)).apply(i, Trader::new)), KEYS);

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
