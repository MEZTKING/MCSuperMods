package dev.mcsupermods.runtime.client;

import dev.mcsupermods.runtime.registry.MsmEntityRegistrar;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;

/** Client entrypoint: renderers for definition entities. GeckoLib types stay behind {@link GeckolibRenderers}. */
public final class MsmRuntimeClient implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        if (FabricLoader.getInstance().isModLoaded(MsmEntityRegistrar.GECKOLIB)) {
            GeckolibRenderers.registerAll();
        }
    }
}
