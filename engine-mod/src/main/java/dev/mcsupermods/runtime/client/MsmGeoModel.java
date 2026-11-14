package dev.mcsupermods.runtime.client;

import com.geckolib.animatable.GeoEntity;
import com.geckolib.constant.dataticket.DataTicket;
import com.geckolib.model.GeoModel;
import com.geckolib.renderer.base.GeoRenderState;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.registry.GeoControllers;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Mob;

/**
 * Resource ids for one geo entity type. GeckoLib keys loaded files by their path with
 * {@code geckolib/models/} or {@code geckolib/animations/} and the {@code .geo.json} or
 * {@code .animation.json} suffix stripped ({@code GeckoLibResources.stripPrefixAndSuffix}), so
 * {@code assets/ns/geckolib/models/entity/x.geo.json} is {@code ns:entity/x}: the definition's ids
 * are the lookup keys as they are. Textures are full paths: {@code ns:entity/x} becomes
 * {@code ns:textures/entity/x.png}. Without {@code animations} the model id is used, which names no
 * animation file, so nothing plays. One class for every geo body ({@code MsmGeoEntity}, {@code MsmGeoAnimal},
 * {@code MsmGeoMonster}; ADR 0070 D2).
 *
 * <p>Per-entity facts go into the render state as GeckoLib data tickets in {@link #addAdditionalStateData}, which
 * GeckoLib calls once per frame while extracting the render state: the variant texture ({@link #TEXTURE}; ADR 0071 D4),
 * the saddle bone to hide ({@link #HIDDEN_BONE}; D3) and the baby scale ({@link #AGE_SCALE}), read by
 * {@link #getTextureResource} and {@code GeckolibRenderers.MsmGeoRenderer}.
 */
final class MsmGeoModel<T extends Mob & GeoEntity> extends GeoModel<T> {
    /** The texture file to draw this frame (variant or default), as a full {@code textures/...png} path. */
    static final DataTicket<Identifier> TEXTURE = DataTicket.create("msm_runtime_texture", Identifier.class);
    /** The bone hidden this frame ({@code saddle_bone} while unsaddled); absent when nothing is hidden. */
    static final DataTicket<String> HIDDEN_BONE = DataTicket.create("msm_runtime_hidden_bone", String.class);
    /** {@code getAgeScale()}: {@code baby_scale} for a baby, else 1. */
    static final DataTicket<Float> AGE_SCALE = DataTicket.create("msm_runtime_age_scale", Float.class);

    private final Identifier model;
    private final Identifier animations;
    private final Identifier texture;
    /** Texture id to file path, filled on the render thread (a handful of variants per type). */
    private final Map<Identifier, Identifier> paths = new HashMap<>();

    MsmGeoModel(EntityComponents.AnimatedModel def) {
        this.model = def.model();
        this.animations = def.animations().orElse(def.model());
        this.texture = path(def.texture());
    }

    /** {@code ns:entity/x} to {@code ns:textures/entity/x.png}. */
    static Identifier path(Identifier id) {
        return id.withPath(p -> "textures/" + p + ".png");
    }

    @Override
    public Identifier getModelResource(GeoRenderState renderState) {
        return model;
    }

    @Override
    public Identifier getTextureResource(GeoRenderState renderState) {
        return renderState.getOrDefaultGeckolibData(TEXTURE, texture);
    }

    @Override
    public Identifier getAnimationResource(T animatable) {
        return animations;
    }

    @Override
    public void addAdditionalStateData(T animatable, Object relatedObject, GeoRenderState renderState) {
        super.addAdditionalStateData(animatable, relatedObject, renderState);
        if (!(animatable instanceof MsmMob mob)) {
            return;
        }
        renderState.addGeckolibData(TEXTURE, paths.computeIfAbsent(GeoControllers.texture(mob), MsmGeoModel::path));
        GeoControllers.hiddenBone(mob).ifPresent(bone -> renderState.addGeckolibData(HIDDEN_BONE, bone));
        renderState.addGeckolibData(AGE_SCALE, GeoControllers.ageScale(mob));
    }
}
