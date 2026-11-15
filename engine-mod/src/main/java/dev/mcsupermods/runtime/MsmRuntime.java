package dev.mcsupermods.runtime;

import dev.mcsupermods.runtime.controls.KeyBinds;
import dev.mcsupermods.runtime.dev.DevMode;
import dev.mcsupermods.runtime.hud.HudServer;
import dev.mcsupermods.runtime.loader.DefinitionScanner;
import dev.mcsupermods.runtime.loader.LoadReport;
import dev.mcsupermods.runtime.net.MsmNetworking;
import dev.mcsupermods.runtime.registry.BlockExtras;
import dev.mcsupermods.runtime.registry.MsmRegistrar;
import dev.mcsupermods.runtime.registry.portal.PortalIndexAttachment;
import dev.mcsupermods.runtime.registry.portal.PortalLighting;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicles;
import dev.mcsupermods.runtime.scripting.ScriptBridges;
import dev.mcsupermods.runtime.scripting.ScriptDataAttachment;
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
        // The runtime's channel (ADR 0088 D1): payload types and receivers on both sides.
        MsmNetworking.init();
        // Vehicles (ADR 0090) before key binds and HUD elements, which may name a vehicle type.
        report = MsmVehicles.register(report);
        report = KeyBinds.init(report);
        report = HudServer.init(report);
        LOGGER.info("[{}] registered {} vehicle type(s)", MOD_ID, report.vehicles().size());
        LOGGER.info("[{}] registered {} key bind(s)", MOD_ID, report.keyBinds().size());
        LOGGER.info("[{}] registered {} HUD element(s)", MOD_ID, report.hudElements().size());
        // Creative tabs, items, block states, functions, biomes and entity types of other mods and data packs
        // exist only once the server runs.
        ServerLifecycleEvents.SERVER_STARTED.register(server -> report = report.withWarnings(MsmRegistrar.checkAfterStart(server)));
        // msm:strippable (ADR 0067 D4): one UseBlockCallback for every strippable block.
        BlockExtras.register();
        // Dev mode (ADR 0084 D4): decided at SERVER_STARTING before the scripts load; never on a dedicated server.
        DevMode.register();
        // Scripts (ADR 0031): loaded per server on SERVER_STARTING, after the registries are frozen.
        ScriptBridges.register();
        // Saved script data (ADR 0062 D3): the persistent attachment msm_runtime:script_data.
        ScriptDataAttachment.register();
        // Portal links (ADR 0077 D5): the persistent level attachment msm_runtime:portals.
        PortalIndexAttachment.register();
        // Portal lighting (ADR 0077 D3): one UseBlockCallback for every portal block's igniter.
        PortalLighting.register();
    }

    /** What the last scan registered, plus warnings from the start-up checks; used by GameTests and diagnostics. */
    public static LoadReport report() {
        return report;
    }
}
