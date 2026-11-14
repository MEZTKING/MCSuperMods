package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * Variants, filled by ADR 0071 D4 ({@code msm:variants}): the pick in {@code finalizeSpawn}, {@code DATA_VARIANT},
 * saving under {@code Variant}, the texture for both renderers and inheritance for babies. Today the index stays 0
 * and nothing is saved.
 */
public final class MobVariants {
    private final MsmMob mob;
    private final EntityDefinition definition;

    MobVariants(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
    }

    /** The variant index ({@code DATA_VARIANT}). */
    public int variant() {
        return mob.asMob().getEntityData().get(mob.variantData());
    }

    /** Before {@code msm:on_spawn}. */
    public void finalizeSpawn(ServerLevelAccessor accessor, DifficultyInstance difficulty, EntitySpawnReason reason) {}

    public void onSyncedDataUpdated(EntityDataAccessor<?> accessor) {}

    public void addAdditionalSaveData(ValueOutput output) {}

    public void readAdditionalSaveData(ValueInput input) {}
}
