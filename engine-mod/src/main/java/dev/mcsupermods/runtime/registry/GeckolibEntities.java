package dev.mcsupermods.runtime.registry;

import net.minecraft.world.entity.EntityType;

/**
 * The only door from the registrar to GeckoLib types. {@link MsmEntityRegistrar} calls it only
 * after {@code FabricLoader.isModLoaded("geckolib")}, so the JVM never resolves the geo bodies
 * ({@link MsmGeoEntity}, {@link MsmGeoAnimal}, {@link MsmGeoMonster}, and with them {@code com.geckolib.*})
 * when GeckoLib is absent.
 */
final class GeckolibEntities {
    private GeckolibEntities() {}

    static EntityType.EntityFactory<MsmEntity> factory() {
        return MsmGeoEntity::new;
    }

    /** The {@code animal} body with GeckoLib (ADR 0070 D2). */
    static EntityType.EntityFactory<MsmAnimal> animalFactory() {
        return MsmGeoAnimal::new;
    }

    /** The {@code monster} body with GeckoLib (ADR 0070 D2). */
    static EntityType.EntityFactory<MsmMonster> monsterFactory() {
        return MsmGeoMonster::new;
    }
}
