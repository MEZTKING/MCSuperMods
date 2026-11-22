package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.GameRuleParser;
import dev.mcsupermods.runtime.loader.GameRuleParser.GameRule;
import dev.mcsupermods.runtime.loader.LoadReport;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.fabricmc.fabric.api.gamerule.v1.GameRuleBuilder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.gamerules.GameRuleCategory;

/**
 * Project game rules (ADR 0111 D5 and its amendment after B525): one vanilla game rule per {@code game_rule} definition,
 * registered at start with Fabric's {@link GameRuleBuilder} (a boolean, or a whole number with its {@code min} and
 * {@code max} as the range) in its category, under the definition's id. Vanilla then does the rest, as B525 saw: the rule is
 * set and read with {@code /gamerule <ns>:<path>} (the namespace is required; out of range is refused), saved per world in
 * {@code data/minecraft/game_rules.dat}, and named by the language keys {@code gamerule.<ns>.<path>} and
 * {@code .description} ({@link GameRule#translationKey}). An id that is already a game rule (vanilla's or another mod's) is
 * an error and is not registered.
 */
public final class MsmGameRules {
    private static volatile Map<Identifier, net.minecraft.world.level.gamerules.GameRule<?>> registered = Map.of();

    private MsmGameRules() {}

    /**
     * Parses the scanned {@code game_rule} definitions ({@link GameRuleParser#parseAll}), registers their rules and returns
     * {@code report} with the rules registered and any errors and warnings; called once from {@code MsmRuntime.onInitialize}.
     */
    public static LoadReport register(LoadReport report) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Map<Identifier, GameRule> parsed = GameRuleParser.parseAll(report.definitions(), errors, warnings);
        Map<Identifier, net.minecraft.world.level.gamerules.GameRule<?>> out = new LinkedHashMap<>();
        parsed.forEach((id, def) -> {
            if (BuiltInRegistries.GAME_RULE.containsKey(id)) {
                errors.add("game rule " + id + ": the id is already a game rule; not registered");
                return;
            }
            try {
                out.put(id, build(def).apply(id));
            } catch (RuntimeException e) {
                errors.add("game rule " + id + ": " + e.getMessage());
            }
        });
        errors.forEach(message -> MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message));
        warnings.forEach(message -> MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message));
        registered = java.util.Collections.unmodifiableMap(out);
        return report.withGameRules(List.copyOf(out.keySet()), errors, warnings);
    }

    private static java.util.function.Function<Identifier, net.minecraft.world.level.gamerules.GameRule<?>> build(GameRule def) {
        GameRuleCategory category = category(def.category());
        if (def.kind() == GameRuleParser.Kind.BOOLEAN) {
            return id -> GameRuleBuilder.forBoolean(def.booleanDefault()).category(category).buildAndRegister(id);
        }
        Integer min = def.min().orElse(Integer.MIN_VALUE);
        Integer max = def.max().orElse(Integer.MAX_VALUE);
        return id -> GameRuleBuilder.forInteger(def.integerDefault()).category(category).range(min, max).buildAndRegister(id);
    }

    /** Vanilla's category of the same name (B525). */
    static GameRuleCategory category(GameRuleParser.Category category) {
        return switch (category) {
            case PLAYER -> GameRuleCategory.PLAYER;
            case MOBS -> GameRuleCategory.MOBS;
            case SPAWNING -> GameRuleCategory.SPAWNING;
            case DROPS -> GameRuleCategory.DROPS;
            case UPDATES -> GameRuleCategory.UPDATES;
            case CHAT -> GameRuleCategory.CHAT;
            case MISC -> GameRuleCategory.MISC;
        };
    }

    /** The registered project rules, by definition id in scan order. */
    public static Map<Identifier, net.minecraft.world.level.gamerules.GameRule<?>> rules() {
        return registered;
    }
}
