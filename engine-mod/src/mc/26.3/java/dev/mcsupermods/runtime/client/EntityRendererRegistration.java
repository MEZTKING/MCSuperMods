package dev.mcsupermods.runtime.client;

import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.EntityRenderers;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;

/**
 * Version seam (ADR 0038 D2): registers an entity renderer provider for a type. Public for {@code client.vehicle}
 * (B412's placeholder, B418's renderer).
 *
 * <p>26.3: Fabric's EntityRendererRegistry is @Deprecated in fabric-rendering-v1 27.2.0; its replacement is
 * vanilla {@code EntityRenderers.register}, private in 26.3 and made accessible by Fabric API's transitive
 * access widener (fabric-transitive-access-wideners-v1). Renderer providers are read when the client builds
 * its entity renderers, after client initialisation.
 */
public final class EntityRendererRegistration {
    private EntityRendererRegistration() {}

    public static <T extends Entity> void register(EntityType<? extends T> type, EntityRendererProvider<T> provider) {
        EntityRenderers.register(type, provider);
    }
}
