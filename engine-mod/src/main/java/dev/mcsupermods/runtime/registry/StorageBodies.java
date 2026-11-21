package dev.mcsupermods.runtime.registry;

import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.HasCustomInventoryScreen;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;

/**
 * The mob bodies of definitions with {@code msm:storage} (ADR 0098 D3): the plain bodies plus vanilla's
 * {@link HasCustomInventoryScreen}, so the rider's inventory key opens the store ({@code MobStorage}). Only these
 * bodies implement it: the client sends the inventory key to the server for any ridden {@code HasCustomInventoryScreen}
 * instead of opening the player's own inventory, so a rideable mob without storage must not be one (as
 * {@code MsmStorageVehicle}). The GeckoLib twins are in {@link GeckolibEntities}.
 */
public final class StorageBodies {
    private StorageBodies() {}

    /** {@link MsmEntity} with storage. */
    public static class StorageEntity extends MsmEntity implements HasCustomInventoryScreen {
        public StorageEntity(EntityType<? extends PathfinderMob> type, Level level) {
            super(type, level);
        }

        @Override
        public void openCustomInventoryScreen(Player player) {
            driver().storage().openCustomInventoryScreen(player);
        }
    }

    /** {@link MsmAnimal} with storage. */
    public static class StorageAnimal extends MsmAnimal implements HasCustomInventoryScreen {
        public StorageAnimal(EntityType<? extends TamableAnimal> type, Level level) {
            super(type, level);
        }

        @Override
        public void openCustomInventoryScreen(Player player) {
            driver().storage().openCustomInventoryScreen(player);
        }
    }

    /** {@link MsmMonster} with storage. */
    public static class StorageMonster extends MsmMonster implements HasCustomInventoryScreen {
        public StorageMonster(EntityType<? extends Monster> type, Level level) {
            super(type, level);
        }

        @Override
        public void openCustomInventoryScreen(Player player) {
            driver().storage().openCustomInventoryScreen(player);
        }
    }
}
