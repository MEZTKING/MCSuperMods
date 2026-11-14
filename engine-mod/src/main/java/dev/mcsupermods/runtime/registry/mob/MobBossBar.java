package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * Boss bars, filled by ADR 0071 D5 ({@code msm:boss_bar}): one {@code ServerBossEvent} per mob, its players from
 * {@code startSeenByPlayer} and {@code stopSeenByPlayer} (or by distance with {@code range}), progress, removal on
 * death and removal, persistence. Today there is no bar.
 */
public final class MobBossBar {
    private final MsmMob mob;
    private final EntityDefinition definition;

    MobBossBar(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
    }

    /** After {@code msm:on_tick}, every AI step. */
    public void customServerAiStep(ServerLevel level) {}

    public void startSeenByPlayer(ServerPlayer player) {}

    public void stopSeenByPlayer(ServerPlayer player) {}

    /** After vanilla's {@code die} and {@code msm:on_death}. */
    public void die(DamageSource source) {}

    /** After vanilla's {@code remove}. */
    public void remove(Entity.RemovalReason reason) {}

    public boolean requiresCustomPersistence(boolean vanilla) {
        return vanilla;
    }

    public void addAdditionalSaveData(ValueOutput output) {}

    public void readAdditionalSaveData(ValueInput input) {}
}
