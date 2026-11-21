package dev.mcsupermods.runtime.registry;

import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.HasCustomInventoryScreen;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;

/**
 * The only door from the registrar to GeckoLib types. {@link MsmEntityRegistrar} calls it only
 * after {@code FabricLoader.isModLoaded("geckolib")}, so the JVM never resolves the geo bodies
 * ({@link MsmGeoEntity}, {@link MsmGeoAnimal}, {@link MsmGeoMonster}, their storage twins below, and with them
 * {@code com.geckolib.*}) when GeckoLib is absent.
 */
final class GeckolibEntities {
    private GeckolibEntities() {}

    /** The {@code mob} body with GeckoLib; {@code storage} picks the {@code msm:storage} twin (ADR 0098 D3, {@link StorageBodies}). */
    static EntityType.EntityFactory<MsmEntity> factory(boolean storage) {
        return storage ? StorageGeoEntity::new : MsmGeoEntity::new;
    }

    /** The {@code animal} body with GeckoLib (ADR 0070 D2). */
    static EntityType.EntityFactory<MsmAnimal> animalFactory(boolean storage) {
        return storage ? StorageGeoAnimal::new : MsmGeoAnimal::new;
    }

    /** The {@code monster} body with GeckoLib (ADR 0070 D2). */
    static EntityType.EntityFactory<MsmMonster> monsterFactory(boolean storage) {
        return storage ? StorageGeoMonster::new : MsmGeoMonster::new;
    }

    /** {@link MsmGeoEntity} with storage. */
    static final class StorageGeoEntity extends MsmGeoEntity implements HasCustomInventoryScreen {
        StorageGeoEntity(EntityType<? extends PathfinderMob> type, Level level) {
            super(type, level);
        }

        @Override
        public void openCustomInventoryScreen(Player player) {
            driver().storage().openCustomInventoryScreen(player);
        }
    }

    /** {@link MsmGeoAnimal} with storage. */
    static final class StorageGeoAnimal extends MsmGeoAnimal implements HasCustomInventoryScreen {
        StorageGeoAnimal(EntityType<? extends TamableAnimal> type, Level level) {
            super(type, level);
        }

        @Override
        public void openCustomInventoryScreen(Player player) {
            driver().storage().openCustomInventoryScreen(player);
        }
    }

    /** {@link MsmGeoMonster} with storage. */
    static final class StorageGeoMonster extends MsmGeoMonster implements HasCustomInventoryScreen {
        StorageGeoMonster(EntityType<? extends Monster> type, Level level) {
            super(type, level);
        }

        @Override
        public void openCustomInventoryScreen(Player player) {
            driver().storage().openCustomInventoryScreen(player);
        }
    }
}
