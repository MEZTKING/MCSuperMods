package dev.mcsupermods.runtime.client;

import com.geckolib.animatable.GeoEntity;
import com.geckolib.renderer.GeoEntityRenderer;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.registry.MsmEntityRegistrar;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;

/** Registers a {@link GeoEntityRenderer} per geo entity type. Called only when GeckoLib is loaded. */
final class GeckolibRenderers {
    private GeckolibRenderers() {}

    // Registration goes through the version seam EntityRendererRegistration (src/mc/<mc>/java, ADR 0038 D2).
    static void registerAll() {
        for (EntityType<? extends Mob> type : MsmEntityRegistrar.geoTypes()) {
            register(type);
        }
        MsmRuntime.LOGGER.info("[{}] registered {} GeckoLib entity renderer(s)", MsmRuntime.MOD_ID, MsmEntityRegistrar.geoTypes().size());
    }

    /**
     * Geo types are built only from the geo bodies' factories ({@code GeckolibEntities}), each a {@code Mob} and a
     * {@link GeoEntity}, so the cast holds for every base.
     */
    @SuppressWarnings("unchecked")
    private static <T extends Mob & GeoEntity> void register(EntityType<? extends Mob> type) {
        EntityType<T> geoType = (EntityType<T>) (EntityType<?>) type;
        EntityComponents.AnimatedModel def = MsmEntityRegistrar.definition(type).orElseThrow().components().animatedModel();
        MsmGeoModel<T> model = new MsmGeoModel<>(def);
        float scale = def.scale();
        EntityRendererRegistration.register(geoType, ctx -> new GeoEntityRenderer<T, EntityRenderState>(ctx, model).withScale(scale));
    }
}
