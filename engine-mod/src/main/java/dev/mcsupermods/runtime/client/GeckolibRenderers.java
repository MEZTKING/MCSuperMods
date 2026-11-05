package dev.mcsupermods.runtime.client;

import com.geckolib.renderer.GeoEntityRenderer;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.registry.MsmEntity;
import dev.mcsupermods.runtime.registry.MsmEntityRegistrar;
import dev.mcsupermods.runtime.registry.MsmGeoEntity;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.world.entity.EntityType;

/** Registers a {@link GeoEntityRenderer} per geo entity type. Called only when GeckoLib is loaded. */
final class GeckolibRenderers {
    private GeckolibRenderers() {}

    // EntityRendererRegistry is @Deprecated in fabric-rendering-v1 27.2.0 but works; vanilla's
    // EntityRenderers.register is private in 26.3. Replacement: verify at implementation (B113).
    @SuppressWarnings({"unchecked", "deprecation"})
    static void registerAll() {
        for (EntityType<MsmEntity> type : MsmEntityRegistrar.geoTypes()) {
            // Geo types are built with MsmGeoEntity::new (GeckolibEntities), so the cast holds.
            EntityType<MsmGeoEntity> geoType = (EntityType<MsmGeoEntity>) (EntityType<?>) type;
            MsmGeoModel model = new MsmGeoModel(MsmEntityRegistrar.definition(type).orElseThrow().animatedModel().orElseThrow());
            EntityRendererRegistry.register(geoType, ctx -> new GeoEntityRenderer<MsmGeoEntity, EntityRenderState>(ctx, model));
        }
        MsmRuntime.LOGGER.info("[{}] registered {} GeckoLib entity renderer(s)", MsmRuntime.MOD_ID, MsmEntityRegistrar.geoTypes().size());
    }
}
