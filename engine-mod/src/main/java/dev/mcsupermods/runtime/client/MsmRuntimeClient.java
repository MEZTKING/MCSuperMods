package dev.mcsupermods.runtime.client;

import dev.mcsupermods.runtime.registry.MsmEntityRegistrar;
import dev.mcsupermods.runtime.registry.MsmThrownItem;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.renderer.entity.ThrownItemRenderer;

/**
 * Client entrypoint: renderers for runtime entities. The thrown item ({@code msm_runtime:thrown_item}, ADR 0056 D4)
 * always gets vanilla's {@link ThrownItemRenderer}, which draws its item as a camera-facing sprite; definition entities
 * get a GeckoLib renderer only when GeckoLib is loaded ({@link GeckolibRenderers}).
 */
public final class MsmRuntimeClient implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        EntityRendererRegistration.register(MsmThrownItem.type(), ThrownItemRenderer<MsmThrownItem>::new);
        if (FabricLoader.getInstance().isModLoaded(MsmEntityRegistrar.GECKOLIB)) {
            GeckolibRenderers.registerAll();
        }
    }
}
