package dev.mcsupermods.runtime.client;

import net.minecraft.client.core.registries.BuiltInClientRegistries;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.EntityRenderers;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;

/**
 * Version seam (ADR 0038 D2): registers an entity renderer provider for a type.
 *
 * <p>26.4: entity renderer providers are the built-in client registry
 * {@code BuiltInClientRegistries.ENTITY_RENDERER}, and {@code EntityRenderers.register} takes it as the first
 * argument; still private in vanilla, made accessible by fabric-transitive-access-wideners-v1 9.0.3. Fabric's
 * EntityRendererRegistry no longer exists in fabric-rendering-v1 29.1.1. Compiled, never run in CI (no
 * GeckoLib for 26.4): check that the registry is still open at client initialisation once one exists (B151).
 */
final class EntityRendererRegistration {
    private EntityRendererRegistration() {}

    static <T extends Entity> void register(EntityType<? extends T> type, EntityRendererProvider<T> provider) {
        EntityRenderers.register(BuiltInClientRegistries.ENTITY_RENDERER, type, provider);
    }
}
