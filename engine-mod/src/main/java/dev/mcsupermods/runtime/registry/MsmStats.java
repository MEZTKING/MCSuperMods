package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.LoadReport;
import dev.mcsupermods.runtime.loader.StatParser;
import dev.mcsupermods.runtime.loader.StatParser.Stat;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.stats.StatFormatter;
import net.minecraft.stats.Stats;

/**
 * Project statistics (ADR 0111 D6 and its amendment after B525): one entry of the {@code custom_stat} registry per
 * {@code stat} definition, registered at start under the definition's id with the definition's own {@code Identifier}
 * instance as the value, then made a statistic of {@code Stats.CUSTOM} with its formatter (vanilla's {@code DEFAULT},
 * {@code DISTANCE} or {@code TIME}). {@code Stats.CUSTOM} finds a statistic by that instance (B525: another instance of an
 * equal id throws), so lookups go through the registry ({@code BuiltInRegistries.CUSTOM_STAT.getValue(id)}), as
 * {@link #stat(Identifier)} does. Vanilla then does the rest: the value is saved per player, counted by the scoreboard
 * criterion {@code minecraft.custom:<ns>.<path>} ({@link StatParser#criterion}) and named by {@code stat.<ns>.<path>}.
 * An id already in {@code custom_stat} is an error and is not registered.
 */
public final class MsmStats {
    private static volatile Map<Identifier, net.minecraft.stats.Stat<Identifier>> registered = Map.of();

    private MsmStats() {}

    /**
     * Parses the scanned {@code stat} definitions ({@link StatParser#parseAll}), registers their statistics and returns
     * {@code report} with the statistics registered and any errors and warnings; called once from
     * {@code MsmRuntime.onInitialize}.
     */
    public static LoadReport register(LoadReport report) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Map<Identifier, Stat> parsed = StatParser.parseAll(report.definitions(), errors, warnings);
        Map<Identifier, net.minecraft.stats.Stat<Identifier>> out = new LinkedHashMap<>();
        parsed.forEach((id, def) -> {
            if (BuiltInRegistries.CUSTOM_STAT.containsKey(id)) {
                errors.add("statistic " + id + ": the id is already a custom statistic; not registered");
                return;
            }
            try {
                Identifier value = Registry.register(BuiltInRegistries.CUSTOM_STAT, id, id);
                out.put(id, Stats.CUSTOM.get(value, formatter(def.formatter())));
            } catch (RuntimeException e) {
                errors.add("statistic " + id + ": " + e.getMessage());
            }
        });
        errors.forEach(message -> MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message));
        warnings.forEach(message -> MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message));
        registered = java.util.Collections.unmodifiableMap(out);
        return report.withStats(List.copyOf(out.keySet()), errors, warnings);
    }

    static StatFormatter formatter(StatParser.Formatter formatter) {
        return switch (formatter) {
            case DEFAULT -> StatFormatter.DEFAULT;
            case DISTANCE -> StatFormatter.DISTANCE;
            case TIME -> StatFormatter.TIME;
        };
    }

    /** The registered project statistic {@code id}, or null. */
    public static net.minecraft.stats.Stat<Identifier> stat(Identifier id) {
        return registered.get(id);
    }

    /** The registered project statistics, by definition id in scan order. */
    public static Map<Identifier, net.minecraft.stats.Stat<Identifier>> stats() {
        return registered;
    }
}
