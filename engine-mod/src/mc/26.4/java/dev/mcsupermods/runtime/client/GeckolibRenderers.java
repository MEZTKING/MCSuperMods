package dev.mcsupermods.runtime.client;

import com.geckolib.renderer.GeoEntityRenderer;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.registry.MsmEntity;
import dev.mcsupermods.runtime.registry.MsmEntityRegistrar;
import dev.mcsupermods.runtime.registry.MsmGeoEntity;
import net.minecraft.client.core.registries.BuiltInClientRegistries;
import net.minecraft.client.renderer.entity.EntityRenderers;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.world.entity.EntityType;

/** Registers a {@link GeoEntityRenderer} per geo entity type. Called only when GeckoLib is loaded. */
final class GeckolibRenderers {
    private GeckolibRenderers() {}

    // 26.4 (B151 spike copy; B159 replaces it with a seam): entity renderer providers are a built-in client
    // registry (BuiltInClientRegistries.ENTITY_RENDERER) and EntityRenderers.register takes it as the first
    // argument; still private in vanilla, made accessible by fabric-transitive-access-wideners-v1 9.0.3.
    // Fabric's EntityRendererRegistry no longer exists in fabric-rendering-v1 29.1.1.
    @SuppressWarnings("unchecked")
    static void registerAll() {
        for (EntityType<MsmEntity> type : MsmEntityRegistrar.geoTypes()) {
            // Geo types are built with MsmGeoEntity::new (GeckolibEntities), so the cast holds.
            EntityType<MsmGeoEntity> geoType = (EntityType<MsmGeoEntity>) (EntityType<?>) type;
            EntityComponents.AnimatedModel def = MsmEntityRegistrar.definition(type).orElseThrow().components().animatedModel();
            MsmGeoModel model = new MsmGeoModel(def);
            float scale = def.scale();
            EntityRenderers.register(BuiltInClientRegistries.ENTITY_RENDERER, geoType, ctx -> new GeoEntityRenderer<MsmGeoEntity, EntityRenderState>(ctx, model).withScale(scale));
        }
        MsmRuntime.LOGGER.info("[{}] registered {} GeckoLib entity renderer(s)", MsmRuntime.MOD_ID, MsmEntityRegistrar.geoTypes().size());
    }
}
