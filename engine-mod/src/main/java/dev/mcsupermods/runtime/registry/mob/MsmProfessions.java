package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.loader.ProfessionParser;
import dev.mcsupermods.runtime.loader.RawDefinition;
import dev.mcsupermods.runtime.registry.PoiTypes;
import java.util.List;
import net.minecraft.resources.Identifier;

/**
 * Villager professions (ADR 0098 D2): one {@code VillagerProfession} per {@code villager_profession} definition, with
 * its job-site point of interest registered through the {@link PoiTypes} seam. A stub until B474: it reads no
 * definition and registers nothing. The registrar calls it after the blocks, which a job site names.
 */
public final class MsmProfessions {
    private MsmProfessions() {}

    /**
     * Parses the scanned {@code villager_profession} definitions and registers their professions; returns the ids
     * registered. Errors and warnings are added to the lists.
     */
    public static List<Identifier> register(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        ProfessionParser.parseAll(definitions, errors, warnings);
        PoiTypes.init();
        return List.of();
    }
}
