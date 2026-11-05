package dev.mcsupermods.runtime.client;

import com.geckolib.renderer.GeoEntityRenderer;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.registry.MsmEntity;
import dev.mcsupermods.runtime.registry.MsmEntityRegistrar;
import dev.mcsupermods.runtime.registry.MsmGeoEntity;
import net.minecraft.client.renderer.entity.EntityRenderers;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.world.entity.EntityType;

/** Registers a {@link GeoEntityRenderer} per geo entity type. Called only when GeckoLib is loaded. */
final class GeckolibRenderers {
    private GeckolibRenderers() {}

    // Fabric's EntityRendererRegistry is @Deprecated in fabric-rendering-v1 27.2.0; its replacement is
    // vanilla EntityRenderers.register, private in 26.3 and made accessible by Fabric API's transitive
    // access widener (fabric-transitive-access-wideners-v1). Renderer providers are read when the
    // client builds its entity renderers, after client initialisation.
    @SuppressWarnings("unchecked")
    static void registerAll() {
        for (EntityType<MsmEntity> type : MsmEntityRegistrar.geoTypes()) {
            // Geo types are built with MsmGeoEntity::new (GeckolibEntities), so the cast holds.
            EntityType<MsmGeoEntity> geoType = (EntityType<MsmGeoEntity>) (EntityType<?>) type;
            EntityComponents.AnimatedModel def = MsmEntityRegistrar.definition(type).orElseThrow().components().animatedModel();
            MsmGeoModel model = new MsmGeoModel(def);
            float scale = def.scale();
            EntityRenderers.register(geoType, ctx -> new GeoEntityRenderer<MsmGeoEntity, EntityRenderState>(ctx, model).withScale(scale));
        }
        MsmRuntime.LOGGER.info("[{}] registered {} GeckoLib entity renderer(s)", MsmRuntime.MOD_ID, MsmEntityRegistrar.geoTypes().size());
    }
}
