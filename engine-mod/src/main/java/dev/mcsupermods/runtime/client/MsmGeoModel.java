package dev.mcsupermods.runtime.client;

import com.geckolib.model.GeoModel;
import com.geckolib.renderer.base.GeoRenderState;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.registry.MsmGeoEntity;
import net.minecraft.resources.Identifier;

/**
 * Resource ids for one geo entity type. GeckoLib keys loaded files by their path with
 * {@code geckolib/models/} or {@code geckolib/animations/} and the {@code .geo.json} or
 * {@code .animation.json} suffix stripped ({@code GeckoLibResources.stripPrefixAndSuffix}), so
 * {@code assets/ns/geckolib/models/entity/x.geo.json} is {@code ns:entity/x}: the definition's ids
 * are the lookup keys as they are. Textures are full paths: {@code ns:entity/x} becomes
 * {@code ns:textures/entity/x.png}. Without {@code animations} the model id is used, which names no
 * animation file, so nothing plays.
 */
final class MsmGeoModel extends GeoModel<MsmGeoEntity> {
    private final Identifier model;
    private final Identifier animations;
    private final Identifier texture;

    MsmGeoModel(EntityComponents.AnimatedModel def) {
        this.model = def.model();
        this.animations = def.animations().orElse(def.model());
        this.texture = def.texture().withPath(p -> "textures/" + p + ".png");
    }

    @Override
    public Identifier getModelResource(GeoRenderState renderState) {
        return model;
    }

    @Override
    public Identifier getTextureResource(GeoRenderState renderState) {
        return texture;
    }

    @Override
    public Identifier getAnimationResource(MsmGeoEntity animatable) {
        return animations;
    }
}
