package dev.mcsupermods.runtime.registry;

import net.minecraft.world.entity.EntityType;

/**
 * The only door from the registrar to GeckoLib types. {@link MsmEntityRegistrar} calls it only
 * after {@code FabricLoader.isModLoaded("geckolib")}, so the JVM never resolves
 * {@link MsmGeoEntity} (and with it {@code com.geckolib.*}) when GeckoLib is absent.
 */
final class GeckolibEntities {
    private GeckolibEntities() {}

    static EntityType.EntityFactory<MsmEntity> factory() {
        return MsmGeoEntity::new;
    }
}
