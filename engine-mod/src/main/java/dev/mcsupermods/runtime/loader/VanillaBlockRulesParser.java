package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.listOfLength;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * Parses {@code msm/<namespace>/vanilla_block_rules/<path>.json} definitions (ADR 0105 D4,
 * {@code ::msm::definition::VanillaBlockRules}): strip, flatten, till, wax, age and burn rules for vanilla blocks. Pure:
 * no registry is touched, so JUnit runs it over the conformance corpus. {@code format} is required (another value than 1
 * is an error); the struct and its entries are closed, so an unknown key is an error and nothing of the file is applied.
 * Whether the ids name blocks and items is checked when the rules are applied ({@code registry.VanillaPairs}, B514).
 */
public final class VanillaBlockRulesParser {
    /** The kind folder. */
    public static final String KIND = "vanilla_block_rules";

    private VanillaBlockRulesParser() {}

    /** A block a tool or item turns into another ({@code ::msm::definition::VanillaBlockPair}); closed. */
    public record Pair(Identifier block, Identifier into) {
        static final Codec<Pair> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("block", ID).forGetter(Pair::block),
                required("into", ID).forGetter(Pair::into)).apply(i, Pair::new)), List.of("block", "into"));
    }

    /**
     * A block a hoe tills ({@code ::msm::definition::VanillaTillPair}); closed.
     *
     * @param drops an item dropped once on top, as rooted dirt drops hanging roots; empty: none
     */
    public record TillPair(Identifier block, Identifier into, Optional<Identifier> drops) {
        static final Codec<TillPair> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("block", ID).forGetter(TillPair::block),
                required("into", ID).forGetter(TillPair::into),
                optional("drops", ID).forGetter(TillPair::drops)).apply(i, TillPair::new)), List.of("block", "into", "drops"));
    }

    /** A block that ages into {@code next} as copper does ({@code ::msm::definition::VanillaAgePair}); closed. */
    public record AgePair(Identifier block, Identifier next) {
        static final Codec<AgePair> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("block", ID).forGetter(AgePair::block),
                required("next", ID).forGetter(AgePair::next)).apply(i, AgePair::new)), List.of("block", "next"));
    }

    /**
     * A block that burns ({@code ::msm::definition::VanillaBurnRule}), with {@code msm:flammable}'s odds; closed.
     *
     * @param burnOdds how readily fire spreads to the block, 0 to 300
     * @param igniteOdds how readily the block burns away once alight, 0 to 300
     */
    public record BurnRule(Identifier block, int burnOdds, int igniteOdds) {
        static final Codec<BurnRule> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("block", ID).forGetter(BurnRule::block),
                required("burn_odds", intRange(0, 300)).forGetter(BurnRule::burnOdds),
                required("ignite_odds", intRange(0, 300)).forGetter(BurnRule::igniteOdds)).apply(i, BurnRule::new)),
                List.of("block", "burn_odds", "ignite_odds"));
    }

    /** A rules file v1; each list is empty when absent. */
    public record Rules(List<Pair> strip, List<Pair> flatten, List<TillPair> till, List<Pair> wax, List<AgePair> age,
            List<BurnRule> burn) {
        public static final List<String> KEYS = List.of("format", "strip", "flatten", "till", "wax", "age", "burn");
        /** Entries per list, as the mcdoc's {@code @ 1..256}. */
        public static final int MAX_ENTRIES = 256;

        public static final Codec<Rules> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                optional("strip", listOfLength(Pair.CODEC, 1, MAX_ENTRIES), List.of()).forGetter(Rules::strip),
                optional("flatten", listOfLength(Pair.CODEC, 1, MAX_ENTRIES), List.of()).forGetter(Rules::flatten),
                optional("till", listOfLength(TillPair.CODEC, 1, MAX_ENTRIES), List.of()).forGetter(Rules::till),
                optional("wax", listOfLength(Pair.CODEC, 1, MAX_ENTRIES), List.of()).forGetter(Rules::wax),
                optional("age", listOfLength(AgePair.CODEC, 1, MAX_ENTRIES), List.of()).forGetter(Rules::age),
                optional("burn", listOfLength(BurnRule.CODEC, 1, MAX_ENTRIES), List.of()).forGetter(Rules::burn))
                .apply(i, Rules::new)), KEYS);

        /** Whether the file gives no rule at all. */
        public boolean isEmpty() {
            return strip.isEmpty() && flatten.isEmpty() && till.isEmpty() && wax.isEmpty() && age.isEmpty() && burn.isEmpty();
        }
    }

    /**
     * The rules files among {@code definitions} that parse, by id in scan order; problems are added to {@code errors} and
     * {@code warnings}, each starting with the file it concerns.
     */
    public static Map<Identifier, Rules> parseAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        Map<Identifier, Rules> out = new LinkedHashMap<>();
        for (RawDefinition raw : definitions) {
            if (!raw.kind().equals(KIND)) {
                continue;
            }
            ParseResult<Rules> result = parse(raw.json());
            result.errors().forEach(e -> errors.add(raw.describe() + ": " + e));
            result.warnings().forEach(w -> warnings.add(raw.describe() + ": " + w));
            result.definition().ifPresent(def -> out.put(raw.id(), def));
        }
        return out;
    }

    /** Parses one rules file. */
    public static ParseResult<Rules> parse(JsonElement json) {
        if (!(json instanceof JsonObject object)) {
            return new ParseResult<>(Optional.empty(), List.of("top level must be an object"), List.of());
        }
        String formatError = CommandParser.checkFormat(object);
        if (formatError != null) {
            return new ParseResult<>(Optional.empty(), List.of(formatError), List.of());
        }
        DataResult<Rules> decoded = Rules.CODEC.parse(StrictJsonOps.INSTANCE, object);
        if (decoded.error().isPresent()) {
            return new ParseResult<>(Optional.empty(), List.of(decoded.error().get().message()), List.of());
        }
        return new ParseResult<>(Optional.of(decoded.getOrThrow()), List.of(), List.of());
    }
}
