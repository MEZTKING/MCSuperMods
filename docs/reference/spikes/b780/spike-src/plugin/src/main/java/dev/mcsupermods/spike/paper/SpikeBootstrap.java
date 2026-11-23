package dev.mcsupermods.spike.paper;

import io.papermc.paper.plugin.bootstrap.BootstrapContext;
import io.papermc.paper.plugin.bootstrap.PluginBootstrap;
import io.papermc.paper.plugin.lifecycle.event.LifecycleEventManager;
import io.papermc.paper.plugin.lifecycle.event.types.LifecycleEvents;
import java.net.URL;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import net.kyori.adventure.text.logger.slf4j.ComponentLogger;

/**
 * B780 spike (throwaway). Runs before the server loads its data packs: registers the data packs that sit in this jar
 * as files (P5) and the commands a data pack function may name (P8, P9), so the function bridge's
 * {@code msm_signal_<ns>} exists when functions are parsed.
 */
public final class SpikeBootstrap implements PluginBootstrap {
    /** How often the COMMANDS lifecycle event reached this plugin (bootstrap registration); read by the plugin. */
    static final AtomicInteger COMMAND_EVENTS = new AtomicInteger();

    @Override
    public void bootstrap(BootstrapContext context) {
        String id = context.getConfiguration().getName();
        ComponentLogger log = context.getLogger();
        LifecycleEventManager<BootstrapContext> manager = context.getLifecycleManager();
        log.info("[msm_spike] {} bootstrap; source {}", id, context.getPluginSource());
        manager.registerEventHandler(LifecycleEvents.DATAPACK_DISCOVERY, event -> {
            for (String folder : List.of("msm_pack", "sample_pack")) {
                URL url = SpikeBootstrap.class.getResource("/" + folder);
                if (url == null) {
                    continue;
                }
                try {
                    var pack = event.registrar().discoverPack(url.toURI(), folder);
                    log.info("[msm_spike] {} discovered pack /{} as {}", id, folder, pack == null ? "null" : pack.getName());
                } catch (Exception e) {
                    log.error("[msm_spike] {} could not register /{}: {}", id, folder, e.toString());
                }
            }
            log.info("[msm_spike] {} packs discovered so far: {}", id, event.registrar().getDiscoveredPacks().keySet());
        });
        manager.registerEventHandler(LifecycleEvents.COMMANDS, event -> {
            int n = COMMAND_EVENTS.incrementAndGet();
            log.info("[msm_spike] {} bootstrap COMMANDS event #{} cause {}", id, n, event.cause());
            SpikeCommands.registerBootstrap(id, event.registrar(), log);
        });
    }
}
