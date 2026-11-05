package dev.mcsupermods.runtime;

import dev.mcsupermods.runtime.loader.DefinitionScanner;
import dev.mcsupermods.runtime.loader.LoadReport;
import dev.mcsupermods.runtime.registry.MsmRegistrar;
import net.fabricmc.api.ModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Entry point: scans {@code msm/} in every mod container and registers what it finds. */
public final class MsmRuntime implements ModInitializer {
    public static final String MOD_ID = "msm_runtime";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    private static LoadReport report = LoadReport.EMPTY;

    @Override
    public void onInitialize() {
        LoadReport scanned = DefinitionScanner.scanAllMods();
        report = MsmRegistrar.registerAll(scanned);
        LOGGER.info("[{}] registered {} block(s) and {} item(s) from {} definition file(s); {} error(s)",
                MOD_ID, report.blocks().size(), report.items().size(), report.filesRead(), report.errors().size());
    }

    /** What the last scan registered; used by GameTests and diagnostics. */
    public static LoadReport report() {
        return report;
    }
}
