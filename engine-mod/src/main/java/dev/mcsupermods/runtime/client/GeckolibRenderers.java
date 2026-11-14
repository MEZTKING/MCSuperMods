package dev.mcsupermods.runtime.client;

import com.geckolib.animatable.GeoEntity;
import com.geckolib.renderer.GeoEntityRenderer;
import com.geckolib.renderer.base.BoneSnapshots;
import com.geckolib.renderer.base.GeoRenderState;
import com.geckolib.renderer.base.RenderPassInfo;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.registry.MsmEntityRegistrar;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;

/** Registers a {@link MsmGeoRenderer} per geo entity type. Called only when GeckoLib is loaded. */
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
        EntityRendererRegistration.register(geoType, ctx -> renderer(ctx, model, scale));
    }

    /**
     * {@code R} is inferred as {@code EntityRenderState & GeoRenderState}: GeckoLib's renderer needs its state to be
     * both. {@code RenderPassInfo<EntityRenderState>} compiles only where Loom injects {@code GeoRenderState} into
     * {@code EntityRenderState} (the 26.3 build with GeckoLib at run time), not in the {@code -PwithoutGeckolib} and
     * 26.4 builds, so no single class is named.
     */
    private static <T extends Mob & GeoEntity, R extends EntityRenderState & GeoRenderState> MsmGeoRenderer<T, R> renderer(
            EntityRendererProvider.Context ctx, MsmGeoModel<T> model, float scale) {
        MsmGeoRenderer<T, R> renderer = new MsmGeoRenderer<>(ctx, model);
        renderer.withScale(scale);
        return renderer;
    }

    /**
     * GeckoLib's entity renderer with the runtime's per-frame facts from {@link MsmGeoModel}'s data tickets: babies
     * drawn at their age scale (GeckoLib 5.5.7 scales by the {@code scale} attribute only, plan limit M14) and the
     * unsaddled {@code saddle_bone} hidden with its children (ADR 0071 D3). Bone snapshots are made fresh each render
     * pass and this runs after the animation controllers, so an animation cannot show the hidden bone.
     */
    static final class MsmGeoRenderer<T extends Mob & GeoEntity, R extends EntityRenderState & GeoRenderState> extends GeoEntityRenderer<T, R> {
        MsmGeoRenderer(EntityRendererProvider.Context context, MsmGeoModel<T> model) {
            super(context, model);
        }

        @Override
        public void scaleModelForRender(RenderPassInfo<R> renderPassInfo, float widthScale, float heightScale) {
            float age = renderPassInfo.getOrDefaultGeckolibData(MsmGeoModel.AGE_SCALE, 1.0f);
            super.scaleModelForRender(renderPassInfo, widthScale * age, heightScale * age);
        }

        @Override
        public void adjustModelBonesForRender(RenderPassInfo<R> renderPassInfo, BoneSnapshots snapshots) {
            super.adjustModelBonesForRender(renderPassInfo, snapshots);
            String hidden = renderPassInfo.getOrDefaultGeckolibData(MsmGeoModel.HIDDEN_BONE, null);
            if (hidden != null) {
                snapshots.ifPresent(hidden, bone -> bone.skipRender(true).skipChildrenRender(true));
            }
        }
    }
}
