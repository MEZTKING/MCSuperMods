package dev.mcsupermods.runtime;

import dev.mcsupermods.runtime.loader.DefinitionScanner;
import dev.mcsupermods.runtime.loader.LoadReport;
import dev.mcsupermods.runtime.registry.MsmRegistrar;
import dev.mcsupermods.runtime.scripting.ScriptBridges;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Entry point: scans {@code msm/} and the {@code sounds.json} files of every opted-in mod container and registers what it
 * finds (sound events first, ADR 0057 D1).
 */
public final class MsmRuntime implements ModInitializer {
    public static final String MOD_ID = "msm_runtime";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    private static volatile LoadReport report = LoadReport.EMPTY;

    @Override
    public void onInitialize() {
        LoadReport scanned = DefinitionScanner.scanAllMods();
        report = MsmRegistrar.registerAll(scanned);
        LOGGER.info("[{}] registered {} block(s) and {} item(s) from {} definition file(s); {} error(s), {} warning(s)",
                MOD_ID, report.blocks().size(), report.items().size(), report.filesRead(), report.errors().size(),
                report.warnings().size());
        LOGGER.info("[{}] registered {} entity type(s) and {} mob effect(s)", MOD_ID, report.entities().size(), report.effects().size());
        LOGGER.info("[{}] registered {} sound event(s)", MOD_ID, report.sounds().size());
        // Creative tabs, items, block states, functions, biomes and entity types of other mods and data packs
        // exist only once the server runs.
        ServerLifecycleEvents.SERVER_STARTED.register(server -> report = report.withWarnings(MsmRegistrar.checkAfterStart(server)));
        // Scripts (ADR 0031): loaded per server on SERVER_STARTING, after the registries are frozen.
        ScriptBridges.register();
    }

    /** What the last scan registered, plus warnings from the start-up checks; used by GameTests and diagnostics. */
    public static LoadReport report() {
        return report;
    }
}
