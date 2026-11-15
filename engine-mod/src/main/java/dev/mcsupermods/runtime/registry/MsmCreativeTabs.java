package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.CreativeTabParser;
import dev.mcsupermods.runtime.loader.LoadReport;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * Project creative tabs (ADR 0096 D2): one tab per {@code creative_tab} definition, registered before the blocks and
 * items so that their {@code creative_tab} fields can name it. A stub until B454:
 * it reads no definition and registers nothing.
 */
public final class MsmCreativeTabs {
    private MsmCreativeTabs() {}

    /**
     * Parses the scanned {@code creative_tab} definitions, registers their tabs and returns {@code report} with the tabs
     * registered and any errors and warnings; called once from {@code MsmRuntime.onInitialize}, before the registrar.
     */
    public static LoadReport register(LoadReport report) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        List<Identifier> tabs = CreativeTabParser.parseAll(report.definitions(), errors, warnings);
        return report.withCreativeTabs(tabs, errors, warnings);
    }

    /**
     * The registered tab a {@code creative_tab} field names when it names a project tab, else empty (the id is used as
     * written, as for a vanilla or another mod's tab); called from the registrar when it adds an item to a tab.
     */
    public static Optional<Identifier> resolve(Identifier tab) {
        return Optional.empty();
    }
}
