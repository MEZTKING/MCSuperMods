package dev.mcsupermods.runtime.loader;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.resources.Identifier;

/**
 * Result of a scan or a registration pass. Messages start with the file and the mod they concern.
 * {@code items} includes block items and spawn eggs; {@code entities} the entity types; {@code effects} the mob
 * effects (ADR 0055); {@code potions} the potions (ADR 0063 D4); {@code sounds} the sound events (ADR 0057 D1): after a scan the keys found in {@code sounds.json}
 * files, after registration the ones this runtime registered (keys already registered by someone else are left out);
 * {@code particles} the particle types (ADR 0080 D3); {@code biomeAdditions} and {@code lootAdditions} the addition files registered (ADR 0060 D2, D3);
 * {@code keyBinds} the key binds (ADR 0088 D3), {@code hudElements} the HUD elements (ADR 0089 D1) and {@code vehicles}
 * the vehicle types (ADR 0090 D1), each added after the registrar by {@link #withKeyBinds}, {@link #withHudElements} and
 * {@link #withVehicles}; {@code commands} the project commands (ADR 0096 D1) and {@code creativeTabs} the project creative
 * tabs (ADR 0096 D2), added by {@link #withCommands} and {@link #withCreativeTabs}; {@code fluids} the project fluids (ADR 0099 D1)
 * and {@code professions} the villager professions (ADR 0098 D2), both set by the registrar ({@link #withFluids},
 * {@link #withProfessions}); {@code villagerTypes} (ADR 0107 D5), {@code boats} (ADR 0110 D1), {@code gameRules} and {@code stats}
 * (ADR 0111 D5, D6) are set by their registration steps ({@link #withVillagerTypes}, {@link #withBoats}, {@link #withGameRules},
 * {@link #withStats}).
 */
public record LoadReport(
        int filesRead,
        List<RawDefinition> definitions,
        List<Identifier> blocks,
        List<Identifier> items,
        List<Identifier> entities,
        List<Identifier> effects,
        List<Identifier> potions,
        List<Identifier> sounds,
        List<Identifier> particles,
        List<Identifier> biomeAdditions,
        List<Identifier> lootAdditions,
        List<Identifier> keyBinds,
        List<Identifier> hudElements,
        List<Identifier> vehicles,
        List<Identifier> commands,
        List<Identifier> creativeTabs,
        List<Identifier> fluids,
        List<Identifier> professions,
        List<Identifier> villagerTypes,
        List<Identifier> boats,
        List<Identifier> gameRules,
        List<Identifier> stats,
        List<String> errors,
        List<String> warnings) {
    public static final LoadReport EMPTY = new LoadReport(0, List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
            List.of(), List.of());

    /** A report without key binds, HUD elements, vehicles, commands, creative tabs, fluids or professions (the scanner's and the registrar's). */
    public LoadReport(int filesRead, List<RawDefinition> definitions, List<Identifier> blocks, List<Identifier> items, List<Identifier> entities,
            List<Identifier> effects, List<Identifier> potions, List<Identifier> sounds, List<Identifier> particles, List<Identifier> biomeAdditions,
            List<Identifier> lootAdditions, List<String> errors, List<String> warnings) {
        this(filesRead, definitions, blocks, items, entities, effects, potions, sounds, particles, biomeAdditions, lootAdditions, List.of(), List.of(),
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), errors, warnings);
    }

    /** This report plus warnings found later (after server start-up). */
    public LoadReport withWarnings(List<String> more) {
        return new LoadReport(filesRead, definitions, blocks, items, entities, effects, potions, sounds, particles, biomeAdditions, lootAdditions, keyBinds,
                hudElements, vehicles, commands, creativeTabs, fluids, professions, villagerTypes, boats, gameRules, stats, errors, concat(warnings, more));
    }

    /** This report plus errors and warnings of a later start-up step (the vanilla block rules, ADR 0105 D4; own sounds). */
    public LoadReport withProblems(List<String> moreErrors, List<String> moreWarnings) {
        return new LoadReport(filesRead, definitions, blocks, items, entities, effects, potions, sounds, particles, biomeAdditions, lootAdditions, keyBinds,
                hudElements, vehicles, commands, creativeTabs, fluids, professions, villagerTypes, boats, gameRules, stats, concat(errors, moreErrors), concat(warnings, moreWarnings));
    }

    /** This report with the key binds registered (ADR 0088 D3) and their errors and warnings added. */
    public LoadReport withKeyBinds(List<Identifier> ids, List<String> moreErrors, List<String> moreWarnings) {
        return new LoadReport(filesRead, definitions, blocks, items, entities, effects, potions, sounds, particles, biomeAdditions, lootAdditions,
                List.copyOf(ids), hudElements, vehicles, commands, creativeTabs, fluids, professions, villagerTypes, boats, gameRules, stats, concat(errors, moreErrors), concat(warnings, moreWarnings));
    }

    /** This report with the HUD elements registered (ADR 0089 D1) and their errors and warnings added. */
    public LoadReport withHudElements(List<Identifier> ids, List<String> moreErrors, List<String> moreWarnings) {
        return new LoadReport(filesRead, definitions, blocks, items, entities, effects, potions, sounds, particles, biomeAdditions, lootAdditions, keyBinds,
                List.copyOf(ids), vehicles, commands, creativeTabs, fluids, professions, villagerTypes, boats, gameRules, stats, concat(errors, moreErrors), concat(warnings, moreWarnings));
    }

    /** This report with the vehicle types registered (ADR 0090 D1) and their errors and warnings added. */
    public LoadReport withVehicles(List<Identifier> ids, List<String> moreErrors, List<String> moreWarnings) {
        return new LoadReport(filesRead, definitions, blocks, items, entities, effects, potions, sounds, particles, biomeAdditions, lootAdditions, keyBinds,
                hudElements, List.copyOf(ids), commands, creativeTabs, fluids, professions, villagerTypes, boats, gameRules, stats, concat(errors, moreErrors), concat(warnings, moreWarnings));
    }

    /** This report with the project commands registered (ADR 0096 D1) and their errors and warnings added. */
    public LoadReport withCommands(List<Identifier> ids, List<String> moreErrors, List<String> moreWarnings) {
        return new LoadReport(filesRead, definitions, blocks, items, entities, effects, potions, sounds, particles, biomeAdditions, lootAdditions, keyBinds,
                hudElements, vehicles, List.copyOf(ids), creativeTabs, fluids, professions, villagerTypes, boats, gameRules, stats, concat(errors, moreErrors), concat(warnings, moreWarnings));
    }

    /** This report with the project creative tabs registered (ADR 0096 D2) and their errors and warnings added. */
    public LoadReport withCreativeTabs(List<Identifier> ids, List<String> moreErrors, List<String> moreWarnings) {
        return new LoadReport(filesRead, definitions, blocks, items, entities, effects, potions, sounds, particles, biomeAdditions, lootAdditions, keyBinds,
                hudElements, vehicles, commands, List.copyOf(ids), fluids, professions, villagerTypes, boats, gameRules, stats, concat(errors, moreErrors), concat(warnings, moreWarnings));
    }

    /** This report with the project fluids registered (ADR 0099 D1) and their errors and warnings added. */
    public LoadReport withFluids(List<Identifier> ids, List<String> moreErrors, List<String> moreWarnings) {
        return new LoadReport(filesRead, definitions, blocks, items, entities, effects, potions, sounds, particles, biomeAdditions, lootAdditions, keyBinds,
                hudElements, vehicles, commands, creativeTabs, List.copyOf(ids), professions, villagerTypes, boats, gameRules, stats, concat(errors, moreErrors), concat(warnings, moreWarnings));
    }

    /** This report with the villager professions registered (ADR 0098 D2) and their errors and warnings added. */
    public LoadReport withProfessions(List<Identifier> ids, List<String> moreErrors, List<String> moreWarnings) {
        return new LoadReport(filesRead, definitions, blocks, items, entities, effects, potions, sounds, particles, biomeAdditions, lootAdditions, keyBinds,
                hudElements, vehicles, commands, creativeTabs, fluids, List.copyOf(ids), villagerTypes, boats, gameRules, stats, concat(errors, moreErrors), concat(warnings, moreWarnings));
    }

    /** This report with the project villager types registered (ADR 0107 D5) and their errors and warnings added. */
    public LoadReport withVillagerTypes(List<Identifier> ids, List<String> moreErrors, List<String> moreWarnings) {
        return new LoadReport(filesRead, definitions, blocks, items, entities, effects, potions, sounds, particles, biomeAdditions, lootAdditions, keyBinds,
                hudElements, vehicles, commands, creativeTabs, fluids, professions, List.copyOf(ids), boats, gameRules, stats, concat(errors, moreErrors), concat(warnings, moreWarnings));
    }

    /** This report with the project boats registered (ADR 0110 D1) and their errors and warnings added. */
    public LoadReport withBoats(List<Identifier> ids, List<String> moreErrors, List<String> moreWarnings) {
        return new LoadReport(filesRead, definitions, blocks, items, entities, effects, potions, sounds, particles, biomeAdditions, lootAdditions, keyBinds,
                hudElements, vehicles, commands, creativeTabs, fluids, professions, villagerTypes, List.copyOf(ids), gameRules, stats, concat(errors, moreErrors), concat(warnings, moreWarnings));
    }

    /** This report with the project game rules registered (ADR 0111 D5) and their errors and warnings added. */
    public LoadReport withGameRules(List<Identifier> ids, List<String> moreErrors, List<String> moreWarnings) {
        return new LoadReport(filesRead, definitions, blocks, items, entities, effects, potions, sounds, particles, biomeAdditions, lootAdditions, keyBinds,
                hudElements, vehicles, commands, creativeTabs, fluids, professions, villagerTypes, boats, List.copyOf(ids), stats, concat(errors, moreErrors), concat(warnings, moreWarnings));
    }

    /** This report with the project statistics registered (ADR 0111 D6) and their errors and warnings added. */
    public LoadReport withStats(List<Identifier> ids, List<String> moreErrors, List<String> moreWarnings) {
        return new LoadReport(filesRead, definitions, blocks, items, entities, effects, potions, sounds, particles, biomeAdditions, lootAdditions, keyBinds,
                hudElements, vehicles, commands, creativeTabs, fluids, professions, villagerTypes, boats, gameRules, List.copyOf(ids), concat(errors, moreErrors), concat(warnings, moreWarnings));
    }

    private static List<String> concat(List<String> first, List<String> second) {
        if (second.isEmpty()) {
            return first;
        }
        List<String> all = new ArrayList<>(first);
        all.addAll(second);
        return List.copyOf(all);
    }
}
